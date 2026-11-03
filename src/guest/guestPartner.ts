import { tr } from '../i18n/tr';
import type { Row } from './guestSeed';
import { loadDb, saveDb, gid } from './guestDb';
import { callGuestAi } from './guestAi';
import { analyzeSoften } from './guestSoften';
import { GUEST_USER_ID as ME, GUEST_PARTNER_ID as PARTNER, guestNickname, guestPartnerNickname } from './guestMode';

// ─── 試玩伴侶 阿哲 replies ───────────────────────────────────────────────────
// Every time the guest sends something into a conversation, the sample partner
// "types" for a moment and answers — written by the real AI (doesn't spend the
// guest's 5 tries), or an on-device line when the server is unreachable or the
// partner cap is hit. Progress is broadcast as window events:
//   guest:partner  { eventId, state: 'typing' | 'replied' }
//   event:updated  { eventId }   → EventDetail refetches the thread
// The guest is then nudged to 請 AI 諮商師介入 (GuestCoach).

const MIN_TYPING_MS = 2500;
const pending = new Set<string>();

const emit = (name: string, detail: Record<string, unknown>) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail }));
};

export const guestNames = () => ({ me: guestNickname(), partner: guestPartnerNickname() });

/** The thread as the guest-AI endpoint expects it (sender-labelled, newest last). */
export function threadForAi(e: Row) {
  const msgs = ((e.messages as Row[]) || []).slice(-12);
  return {
    eventSummary: String(e.summary || '').slice(0, 1000),
    emotions: ((e.emotions as string[]) || []).slice(0, 10),
    recentMessages: msgs.map((m) => ({ fromSelf: m.sender_id === ME, isAi: m.is_ai === true, content: String(m.content || '').slice(0, 1000) })),
    names: guestNames(),
  };
}

function scriptedReply(lastFromMe: string): string {
  const top = analyzeSoften(lastFromMe).emotions[0]?.key;
  switch (top) {
    case '被忽視':
    case '失望':
      return tr('我不是故意不回你……那時候真的在忙，手機也沒看。但我知道你等很久，對不起讓你失望了。', 'I didn\'t mean to ignore you… I was swamped and didn\'t check my phone. But I know you waited a long time. Sorry I let you down.');
    case '委屈':
    case '心累':
      return tr('我知道你最近很累，是我沒注意到。可是我也有在努力啊……我們可以一起想想怎麼分擔嗎？', 'I know you\'ve been exhausted and I didn\'t notice. But I\'m trying too… can we figure out how to share the load?');
    case '憤怒':
      return tr('你這樣說我有點難過，好像我都做不好。但我不想吵架，我想知道你真正在意的是什麼。', 'It stings when you put it that way, like I can\'t do anything right. But I don\'t want to fight. I want to know what you really care about.');
    default:
      return tr('我看到你說的了。我也不是故意的，但我知道你在意。我們好好聊聊，好嗎？', 'I saw what you wrote. I didn\'t mean it, but I know it matters to you. Can we talk it through?');
  }
}

/** Fire-and-forget: 阿哲 types, then replies into `eventId`. */
export function schedulePartnerReply(eventId: string): void {
  if (pending.has(eventId)) return;
  const e = loadDb().events as Row[] | undefined;
  const event = e?.find((x) => x.id === eventId);
  if (!event) return;
  const msgs = (event.messages as Row[]) || [];
  const last = msgs[msgs.length - 1];
  if (!last || last.sender_id !== ME) return; // only answer the guest's own words

  pending.add(eventId);
  emit('guest:partner', { eventId, state: 'typing' });
  const startedAt = Date.now();
  (async () => {
    let reply: string | null = null;
    try {
      const real = await callGuestAi(loadDb(), 'partner_reply', threadForAi(event));
      if (real && typeof real.reply === 'string' && real.reply.trim()) reply = real.reply.trim();
    } catch { /* fall back below */ }
    if (!reply) reply = scriptedReply(String(last.content || ''));
    const wait = MIN_TYPING_MS - (Date.now() - startedAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    // Re-read: the guest may have restarted the conversation meanwhile.
    const db = loadDb();
    const target = (db.events as Row[] | undefined)?.find((x) => x.id === eventId);
    pending.delete(eventId);
    if (!target) return;
    const now = new Date().toISOString();
    (target.messages as Row[]).push({ id: gid('gmsg'), event_id: eventId, sender_id: PARTNER, content: reply, is_ai: false, created_at: now, read_at: null });
    target.updated_at = now;
    db.dirty = true;
    saveDb(db);
    emit('event:updated', { eventId });
    emit('guest:partner', { eventId, state: 'replied' });
  })();
}

export function isPartnerTyping(eventId: string): boolean {
  return pending.has(eventId);
}
