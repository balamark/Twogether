import { tr } from '../i18n/tr';
import type { GuestDb, Row } from './guestSeed';
import { iso, ymd } from './guestSeed';
import { gid } from './guestDb';
import { analyzeSoften } from './guestSoften';
import { getEmotionAcceptance } from '../data/emotionAcceptance';
import {
  GUEST_USER_ID as ME,
  GUEST_PARTNER_ID as PARTNER,
  GUEST_COUPLE_ID as COUPLE,
  guestNickname,
  guestPartnerNickname,
} from './guestMode';
import { GuestError, blocked } from './guestErrors';
import { callGuestAi, fetchGuestAiUsage } from './guestAi';
import { schedulePartnerReply, threadForAi } from './guestPartner';

// ─── Guest mock backend: the routes ─────────────────────────────────────────
// Each handler mimics the real server's JSON for that endpoint (same keys the
// apiService methods parse), reading/writing the session-only guest DB. AI
// endpoints answer from on-device heuristics (guestSoften.ts) — no LLM, no
// quota, nothing leaves the tab. Endpoints that move money, email real people
// or reach a real counselor answer with GUEST_MODE so the UI shows a specific,
// actionable reason (sign up) instead of a generic failure.
// Anything not listed falls back to an empty success in guestApi.ts.

export interface GuestCtx {
  db: GuestDb;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
  path: string;
  method: string;
}

export interface GuestRoute {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'any';
  re: RegExp;
  handler: (ctx: GuestCtx) => unknown | Promise<unknown>;
}

const t = <T = Row>(db: GuestDb, name: string): T[] => {
  if (!Array.isArray(db[name])) db[name] = [];
  return db[name] as T[];
};
const now = () => new Date().toISOString();
const days = (isoStr: string) => Math.floor((Date.now() - Date.parse(isoStr)) / 86400000);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

// Path helper: '/events/:id/messages' → RegExp with named groups.
const P = (pattern: string) =>
  new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}/?$`);

const ok = (extra: Row = {}) => ({ success: true, ...extra });

// ── derived views ────────────────────────────────────────────────────────────
function eventView(e: Row, withMessages = true): Row {
  const messages = (e.messages as Row[]) || [];
  const unread = messages.filter((m) => m.sender_id === PARTNER && !m.read_at).length;
  const last = messages[messages.length - 1];
  return {
    ...e,
    unread_count: unread,
    last_message_preview: last ? str(last.content).slice(0, 60) : null,
    messages: withMessages ? messages : undefined,
  };
}

// Window events fire after the response is handed back, so listeners that
// refetch see the saved state.
function emitLater(name: string, detail: Record<string, unknown>) {
  if (typeof window !== 'undefined') setTimeout(() => window.dispatchEvent(new CustomEvent(name, { detail })), 0);
}

function findEvent(db: GuestDb, id: string): Row {
  const e = t(db, 'events').find((x) => x.id === id);
  if (!e) throw new GuestError(404, tr('找不到這段對話，可能已被刪除。回到列表重新整理看看。', 'This conversation wasn\'t found; it may have been deleted. Go back to the list and refresh.'), 'NOT_FOUND');
  return e;
}

function lastMomentDays(db: GuestDb): number | null {
  const ms = t(db, 'love_moments');
  if (!ms.length) return null;
  return Math.min(...ms.map((m) => days(str(m.moment_date))));
}

function balanceOf(db: GuestDb, who: string): number {
  return ((db.balances as Record<string, number>) || {})[who] ?? 0;
}

function depositRows(db: GuestDb): Row[] {
  return t(db, 'deposits').map((d): Row => ({ ...d, is_mine: d.owner_id === ME }))
    .sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)));
}

function activityFeed(db: GuestDb): Row[] {
  const items: Row[] = [];
  const nick = (id: unknown) => (id === ME ? guestNickname() : guestPartnerNickname());
  t(db, 'love_moments').forEach((m) => items.push({
    id: `a-${m.id}`, type: 'love_moment', actorNickname: (m.recorded_by as Row)?.nickname ?? null,
    isSelf: (m.recorded_by as Row)?.id === ME, description: tr('記錄了一段美好時光', 'recorded a moment together'), date: m.created_at,
  }));
  t(db, 'wall').forEach((w) => items.push({
    id: `a-${w.id}`, type: 'wall_post', actorNickname: nick(w.author_id), isSelf: w.author_id === ME,
    description: tr('在我們的牆留言', 'posted on our wall'), date: w.created_at,
  }));
  t(db, 'events').forEach((e) => items.push({
    id: `a-${e.id}`, type: 'event', actorNickname: nick(e.created_by), isSelf: e.created_by === ME,
    description: e.status === 'resolved' ? tr(`一起化解了「${e.title}」`, `resolved "${e.title}" together`) : tr(`想說開「${e.title}」`, `wants to talk through "${e.title}"`),
    date: e.status === 'resolved' ? e.resolved_at : e.created_at,
  }));
  return items.sort((a, b) => str(b.date).localeCompare(str(a.date))).slice(0, 30);
}

const ACHIEVEMENTS = (db: GuestDb) => {
  const moments = t(db, 'love_moments').length;
  const resolved = t(db, 'events').filter((e) => e.status === 'resolved').length;
  const wall = t(db, 'wall').length;
  const list = [
    { id: 'first_moment', icon: '💕', title: tr('第一個回憶', 'First memory'), description: tr('記錄第一段美好時光', 'Record your first moment'), category: 'moments', progress: Math.min(moments, 1), max_progress: 1 },
    { id: 'ten_moments', icon: '📸', title: tr('回憶收藏家', 'Memory collector'), description: tr('累積 10 段美好時光', 'Collect 10 moments'), category: 'moments', progress: Math.min(moments, 10), max_progress: 10 },
    { id: 'first_repair', icon: '🤝', title: tr('第一次說開', 'First repair'), description: tr('一起化解一次衝突', 'Resolve a conflict together'), category: 'communication', progress: Math.min(resolved, 1), max_progress: 1 },
    { id: 'wall_5', icon: '💌', title: tr('牆上的情書', 'Love notes'), description: tr('在我們的牆留 5 則訊息', 'Leave 5 notes on our wall'), category: 'wall', progress: Math.min(wall, 5), max_progress: 5 },
  ].map((a) => ({ ...a, is_unlocked: a.progress >= a.max_progress, unlocked_at: a.progress >= a.max_progress ? iso(9) : undefined }));
  return list;
};

function monthlyData(db: GuestDb) {
  const map = new Map<string, number>();
  t(db, 'love_moments').forEach((m) => {
    const k = str(m.moment_date).slice(0, 7);
    map.set(k, (map.get(k) || 0) + 1);
  });
  return [...map.entries()].sort().map(([month, count]) => ({ month, count }));
}

const PARTNER_COMMITMENT = () => tr('下次會晚就先傳訊息，不讓你空等。', 'Next time I\'m running late, I\'ll text first so you\'re not left waiting.');

function closureView(_db: GuestDb, e: Row): Row {
  const c = (e.closure || {}) as Row;
  const finalized = c.status === 'finalized';
  const commitment = (owner: string, text: string, id: string) => ({ id, ownerId: owner, text, status: 'active', reviewStatus: 'agreed' });
  return {
    eventId: e.id,
    status: finalized ? 'finalized' : 'collecting',
    eventStatus: e.status,
    startedBy: ME,
    startedAt: c.started_at || now(),
    deadlineAt: iso(-2),
    finalizedAt: c.finalized_at || null,
    therapyNote: null,
    insight: finalized ? tr('你們都先承認了對方的感受，再談具體做法——這是讓同一件事不再重演的關鍵。', 'You each acknowledged the other\'s feelings before agreeing on what to do — the key to this not repeating.') : null,
    insightAt: finalized ? c.finalized_at : null,
    me: { userId: ME, nickname: guestNickname(), status: c.skipped ? 'skipped' : c.me ? 'submitted' : 'pending', submittedAt: c.me ? c.finalized_at : null, commitment: c.me ? commitment(ME, str(c.me), 'gcm-me') : null },
    partner: { userId: PARTNER, nickname: guestPartnerNickname(), status: 'submitted', submittedAt: iso(0, 9), commitment: commitment(PARTNER, PARTNER_COMMITMENT(), 'gcm-p') },
    sharedDecision: (c.decision as string) || null,
    sharedDecisionBy: c.decision ? ME : null,
    sharedDecisionStatus: c.decision ? 'agreed' : 'none',
    sharedDecisionNote: null,
    canCancel: !finalized,
  };
}

// ── AI stand-ins (on-device, deterministic) ─────────────────────────────────
function softenPreview(text: string) {
  const r = analyzeSoften(text);
  return {
    title: text.trim().slice(0, 18) || tr('想說開的一件事', 'Something to talk through'),
    summary: text.trim().slice(0, 120),
    detail: '',
    emotions: r.emotions.map((e) => e.key),
    tags: [tr('溝通', 'Communication')],
    toxicityFlags: r.heat > 70 ? [tr('絕對化用語', 'Absolute words')] : [],
    versions: {
      neutral: tr(`我想跟你聊一件事：${text.trim()}`, `There's something I'd like to talk about: ${text.trim()}`),
      firm: tr(`這件事對我很重要。${r.need ? `我需要的是${r.need}。` : ''}`, `This matters to me. ${r.need ? `What I need is: ${r.need}.` : ''}`),
      warm: r.rewrite,
    },
  };
}

const AI_NOTE = tr('（試玩模式：這是在你的裝置上產生的示範回應；註冊後由 AI 依你們的真實對話回應。）', '(Guest preview: a demo response generated on your device. After signing up, AI responds to your real conversation.)');

export const ROUTES: GuestRoute[] = [
  // ── account / couple ──────────────────────────────────────────────────────
  { method: 'get', re: P('/couples'), handler: ({ db }) => ok({ couple: db.couple }) },
  { method: 'get', re: P('/pairing-requests/my-invitations'), handler: () => ok({ invitations: [] }) },
  { method: 'get', re: P('/therapists/me'), handler: () => { throw new GuestError(404, 'not a therapist'); } },
  { method: 'get', re: P('/billing/status'), handler: () => ({ tier: 'free', expires_at: null, has_couple: true, plans: [
    { id: 'monthly', name: tr('月方案', 'Monthly'), price: 199, days: 30 },
    { id: 'yearly', name: tr('年方案', 'Yearly'), price: 1690, days: 365 },
  ] }) },
  { method: 'get', re: P('/billing/orders'), handler: () => ok({ orders: [] }) },
  { method: 'post', re: /^\/billing\//, handler: () => blocked() },
  // 5 real AI tries for guests (guestAi.ts); the「剩 N 次」hint reads this.
  { method: 'get', re: P('/ai-usage/today'), handler: async ({ db }) => ok({ usage: await fetchGuestAiUsage(db) }) },
  { method: 'get', re: P('/line/status'), handler: () => ok({ linked: false }) },
  { method: 'any', re: /^\/(line|email)\//, handler: () => blocked() },
  { method: 'post', re: /^\/(couples|pairing-requests)\//, handler: () => blocked() },
  { method: 'put', re: P('/couples/nicknames'), handler: ({ db, body }) => {
    const c = db.couple as Row;
    c.user1_nickname = str(body.nickname) || c.user1_nickname;
    return ok({ couple: c });
  } },
  { method: 'any', re: /^\/users\/(me|profile|password|account)/, handler: ({ method }) => (method === 'get' ? ok({}) : blocked()) },
  { method: 'get', re: P('/intimacy-requests/notifications/unread-count'), handler: () => ok({ unread_count: 1 }) },

  // ── 記錄時光 love moments + cycle + day status ─────────────────────────────
  { method: 'get', re: P('/love-moments'), handler: ({ db }) => ok({ love_moments: [...t(db, 'love_moments')].sort((a, b) => str(b.moment_date).localeCompare(str(a.moment_date))) }) },
  { method: 'post', re: P('/love-moments'), handler: ({ db, body }) => {
    const row: Row = {
      id: gid('gm'), moment_date: str(body.moment_date) || now(), created_at: now(), notes: body.notes ?? '',
      description: body.description ?? '', duration: body.duration ?? '', location: body.location ?? '',
      roleplay_script: body.roleplay_script ?? '', activity_type: body.activity_type ?? 'intimate', coins_earned: 10,
      recorded_by: { id: ME, nickname: guestNickname() }, my_response: null, partner_response: null,
    };
    t(db, 'love_moments').push(row);
    return ok({ message: tr('已記錄', 'Saved'), love_moment: row });
  } },
  { method: 'put', re: P('/love-moments/:id'), handler: ({ db, params, body }) => {
    const m = t(db, 'love_moments').find((x) => x.id === params.id);
    if (m) Object.assign(m, body);
    return ok({ love_moment: m });
  } },
  { method: 'delete', re: P('/love-moments/:id'), handler: ({ db, params }) => {
    db.love_moments = t(db, 'love_moments').filter((x) => x.id !== params.id);
    return ok();
  } },
  { method: 'post', re: P('/love-moments/appreciation-questions'), handler: () => ok({
    questions: [
      tr('今天 TA 做的哪件小事讓你覺得被照顧？', 'What small thing did they do today that made you feel cared for?'),
      tr('你最近一次因為 TA 笑出來是什麼時候？', 'When did they last make you laugh?'),
      tr('TA 有什麼習慣，是你一直沒說出口的喜歡？', 'Which of their habits do you love but never said so?'),
      tr('如果用一個詞形容這週的 TA，會是什麼？', 'If you described them this week in one word, what would it be?'),
    ],
    added: [],
  }) },
  { method: 'get', re: P('/cycle-records'), handler: ({ db }) => ok({ cycle_records: t(db, 'cycle_records') }) },
  { method: 'post', re: P('/cycle-records'), handler: ({ db, body }) => {
    const row = { id: gid('gc'), tracked_by: ME, start_date: body.start_date, length_days: body.length_days ?? 5, notes: body.notes ?? '', created_at: now() };
    t(db, 'cycle_records').push(row);
    return ok({ cycle_record: row });
  } },
  { method: 'delete', re: P('/cycle-records/:id'), handler: ({ db, params }) => {
    db.cycle_records = t(db, 'cycle_records').filter((x) => x.id !== params.id);
    return ok();
  } },
  { method: 'get', re: P('/day-status'), handler: ({ db, query }) => {
    const from = query.get('from') || '0000';
    const to = query.get('to') || '9999';
    const rows = t(db, 'day_status').filter((r) => str(r.date) >= from && str(r.date) <= to);
    return ok({ mine: rows.filter((r) => r.user_id === ME), partner: rows.filter((r) => r.user_id === PARTNER) });
  } },
  { method: 'put', re: P('/day-status/:date'), handler: ({ db, params, body }) => {
    const rows = t(db, 'day_status');
    let row = rows.find((r) => r.user_id === ME && r.date === params.date);
    if (!row) { row = { user_id: ME, date: params.date, mood: null, intimacy_intention: null, sharing_enabled: true }; rows.push(row); }
    Object.assign(row, body);
    return ok({ day_status: row });
  } },
  { method: 'delete', re: P('/day-status/:date'), handler: ({ db, params }) => {
    db.day_status = t(db, 'day_status').filter((r) => !(r.user_id === ME && r.date === params.date));
    return ok();
  } },

  // ── 今天 home / relationship ───────────────────────────────────────────────
  { method: 'get', re: P('/relationship/summary'), handler: ({ db }) => ({
    paired: true,
    partnerNickname: guestPartnerNickname(),
    daysSinceIntimacy: lastMomentDays(db),
    daysSinceAppreciation: 0,
    positive14: t(db, 'wall').length + t(db, 'love_moments').filter((m) => days(str(m.moment_date)) <= 14).length,
    negative14: t(db, 'events').filter((e) => days(str(e.created_at)) <= 14).length,
    openConflicts: t(db, 'events').filter((e) => e.status !== 'resolved').length,
    checkin: { myLastDays: 20, coupleLastDays: 6, periodDays: 14, overdue: true },
  }) },
  { method: 'get', re: P('/relationship/checkins'), handler: ({ db }) => ok({ checkins: t(db, 'checkins') }) },
  { method: 'post', re: P('/relationship/checkin'), handler: ({ db, body }) => {
    t(db, 'checkins').unshift({ id: gid('gk'), nickname: guestNickname(), isMine: true, trust: body.trust, commitment: body.commitment, connection: body.connection, note: body.note ?? null, createdAt: now() });
    return ok();
  } },
  { method: 'get', re: P('/relationship/goodwill'), handler: ({ db }) => ok({
    positive: [
      { kind: 'wall_post', label: tr('牆上的貼心留言', 'Kind notes on the wall'), why: tr('被看見的小事會累積信任', 'Little things that are seen build trust'), count: t(db, 'wall').length,
        items: t(db, 'wall').slice(0, 3).map((w) => ({ text: str(w.content).slice(0, 40), who: w.author_nickname, at: w.created_at })) },
      { kind: 'love_moment', label: tr('一起的美好時光', 'Moments together'), why: tr('共同經驗是關係的存款', 'Shared experiences are deposits in the relationship'), count: t(db, 'love_moments').length,
        items: t(db, 'love_moments').slice(0, 3).map((m) => ({ text: str(m.notes || m.description || tr('美好時光', 'A moment')).slice(0, 40), who: (m.recorded_by as Row)?.nickname, at: m.created_at })) },
    ],
    negative: [
      { kind: 'event', label: tr('還沒說開的事', 'Things not yet talked through'), why: tr('未處理的委屈會悄悄扣分', 'Unaddressed hurts quietly cost points'), count: t(db, 'events').filter((e) => e.status !== 'resolved').length,
        items: t(db, 'events').filter((e) => e.status !== 'resolved').map((e) => ({ text: e.title, at: e.created_at, resolved: false })) },
    ],
  }) },
  { method: 'get', re: P('/activity'), handler: ({ db }) => ok({ activities: activityFeed(db) }) },
  { method: 'get', re: P('/deep-dive/active'), handler: () => ok({ journey: null }) },
  { method: 'get', re: P('/deep-dive/inbox'), handler: () => ok({ journeys: [] }) },

  // ── 金幣 / 感情存款 ─────────────────────────────────────────────────────────
  { method: 'get', re: P('/coins/balance'), handler: ({ db }) => ok({ balance: balanceOf(db, ME), available: balanceOf(db, ME), paired: true }) },
  { method: 'get', re: P('/coins/summary'), handler: ({ db }) => {
    const rows = depositRows(db);
    return {
      paired: true,
      me: { balance: balanceOf(db, ME), available: balanceOf(db, ME) },
      partner: { balance: balanceOf(db, PARTNER) },
      average: Math.round((balanceOf(db, ME) + balanceOf(db, PARTNER)) / 2),
      awaiting_me: rows.filter((r) => r.status === 'pending' && r.created_by === PARTNER),
      awaiting_partner: rows.filter((r) => r.status === 'pending' && r.created_by === ME),
      recent: rows.filter((r) => r.status !== 'pending').slice(0, 10),
    };
  } },
  { method: 'post', re: /^\/coins\/(deposits|redemptions)$/, handler: ({ db, body, path }) => {
    const kind = path.endsWith('redemptions') ? 'redeem' : body.kind === 'request' ? 'request' : 'thanks';
    const amount = Number(kind === 'redeem' ? body.cost : body.amount) || 0;
    if (kind === 'redeem' && amount > balanceOf(db, ME)) {
      throw new GuestError(400, tr(`存款不足：這個禮物要 ${amount}，你目前有 ${balanceOf(db, ME)}。多記錄美好時光或請 TA 存入就能累積。`, `Not enough saved: this gift costs ${amount} and you have ${balanceOf(db, ME)}. Log moments or ask your partner for a deposit to save up.`), 'INSUFFICIENT_BALANCE');
    }
    const note = kind === 'redeem' ? tr(`想兌換：${str(body.gift_title)}`, `Redeem: ${str(body.gift_title)}`) : str(body.note);
    const row: Row = {
      id: gid('gd'), kind, status: kind === 'thanks' ? 'confirmed' : 'pending', amount, note, gift_icon: body.gift_icon ?? null,
      category: null, owner_id: kind === 'thanks' ? PARTNER : ME, created_by: ME, created_at: now(), responded_at: kind === 'thanks' ? now() : null,
    };
    if (kind === 'thanks') (db.balances as Record<string, number>)[PARTNER] = balanceOf(db, PARTNER) + amount;
    t(db, 'deposits').unshift(row);
    return ok({ transaction: { ...row, is_mine: row.owner_id === ME } });
  } },
  { method: 'post', re: P('/coins/transactions/:id/:action'), handler: ({ db, params, body }) => {
    const row = t(db, 'deposits').find((d) => d.id === params.id);
    if (row) {
      row.status = params.action === 'cancel' ? 'cancelled' : body.decision === 'decline' ? 'declined' : 'confirmed';
      row.responded_at = now();
      if (row.status === 'confirmed' && row.kind === 'redeem') {
        const b = db.balances as Record<string, number>;
        b[str(row.owner_id)] = Math.max(0, balanceOf(db, str(row.owner_id)) - Number(row.amount));
      }
    }
    return ok({ transaction: row ? { ...row, is_mine: row.owner_id === ME } : null });
  } },
  { method: 'put', re: P('/coins/rates'), handler: ({ body }) => ok({ rates: body.rates || {} }) },
  { method: 'get', re: P('/coins/rates'), handler: () => ok({ rates: {} }) },
  { method: 'get', re: P('/custom-gifts'), handler: ({ db }) => ok({ custom_gifts: t(db, 'custom_gifts'), hidden_defaults: [] }) },

  // ── 說開一件事 events ───────────────────────────────────────────────────────
  { method: 'get', re: P('/events/analytics'), handler: ({ db }) => {
    const ev = t(db, 'events');
    const emo = new Map<string, number>();
    ev.forEach((e) => ((e.emotions as string[]) || []).forEach((x) => emo.set(x, (emo.get(x) || 0) + 1)));
    const tags = new Map<string, number>();
    ev.forEach((e) => ((e.tags as string[]) || []).forEach((x) => tags.set(x, (tags.get(x) || 0) + 1)));
    return ok({ analytics: {
      counts: { last7: ev.filter((e) => days(str(e.created_at)) <= 7).length, last30: ev.length },
      resolution_rate: ev.length ? Math.round((ev.filter((e) => e.status === 'resolved').length / ev.length) * 100) : 0,
      avg_resolution_hours: 72,
      tag_distribution: [...tags.entries()].map(([tag, count]) => ({ tag, count })),
      emotion_distribution: [...emo.entries()].map(([emotion, count]) => ({ emotion, count })),
      daily_trend: Array.from({ length: 14 }).map((_, i) => ({ date: ymd(13 - i), count: ev.filter((e) => str(e.created_at).slice(0, 10) === ymd(13 - i)).length })),
      hotspot_hours: [{ hour: 21, count: 2 }, { hour: 22, count: 1 }],
    } });
  } },
  { method: 'get', re: P('/events/communication-pattern'), handler: () => ok({
    pattern: {
      recurringCycle: [
        tr(`${guestNickname()} 期待落空 → 先沉默`, `${guestNickname()}'s expectation falls through → goes quiet`),
        tr(`${guestPartnerNickname()} 察覺不對 → 急著解釋原因`, `${guestPartnerNickname()} senses it → rushes to explain`),
        tr(`${guestNickname()} 覺得沒被聽見 → 委屈加深`, `${guestNickname()} feels unheard → hurt deepens`),
      ],
      signals: [tr('「算了」「隨便」出現時', 'When "forget it" / "whatever" shows up'), tr('晚上九點後的訊息', 'Messages after 9pm')],
      exitTip: tr('先承認對方的失落，再說明原因：「你等很久一定很失望，對不起。」', 'Acknowledge the disappointment before explaining: "You must have been so let down waiting. I\'m sorry."'),
    },
    eventCount: 3,
    cached: true,
  }) },
  { method: 'get', re: P('/events/therapy-summary/history'), handler: () => ok({ summaries: [] }) },
  { method: 'get', re: P('/events/therapy-topics/history'), handler: () => ok({ topics: [] }) },
  { method: 'get', re: P('/events/therapy-topics/library'), handler: () => ok({ topics: [] }) },
  { method: 'get', re: P('/events'), handler: ({ db, query }) => {
    let ev = [...t(db, 'events')];
    const status = query.get('status');
    if (status && status !== 'all') ev = ev.filter((e) => e.status === status);
    ev.sort((a, b) => str(b.updated_at).localeCompare(str(a.updated_at)));
    return ok({ events: ev.map((e) => eventView(e, false)), total: ev.length });
  } },
  { method: 'post', re: P('/events/icebreaker'), handler: async ({ db, body }) => {
    const real = await callGuestAi(db, 'icebreaker', { rawText: str(body.rawText) });
    return ok({ preview: real ?? softenPreview(str(body.rawText)) });
  } },
  { method: 'post', re: P('/events'), handler: ({ db, body }) => {
    const id = gid('ge');
    const versions = { neutral: str(body.ai_neutral), firm: str(body.ai_firm), warm: str(body.ai_warm) };
    const selected = (body.selected_version as string) || 'warm';
    const opening = str(body.opening_message) || versions[selected as keyof typeof versions] || str(body.summary);
    const e: Row = {
      id, couple_id: COUPLE, created_by: ME, title: body.title, summary: body.summary, detail: body.detail ?? null,
      emotions: body.emotions || [], tags: body.tags || [], toxicity_flags: body.toxicity_flags || [], versions,
      selected_version: selected, status: 'open', is_private: !!body.is_private, public_status: 'private',
      created_at: now(), updated_at: now(), translation_enabled: false, guest_created: true,
      messages: opening ? [{ id: gid('gmsg'), event_id: id, sender_id: ME, content: opening, is_ai: false, created_at: now(), read_at: null }] : [],
    };
    t(db, 'events').unshift(e);
    // 阿哲 answers the guest's opener (after the save below completes).
    if (opening && !e.is_private) setTimeout(() => schedulePartnerReply(id), 0);
    return ok({ event: eventView(e) });
  } },
  { method: 'get', re: P('/events/:id'), handler: ({ db, params }) => ok({ event: eventView(findEvent(db, params.id)) }) },
  { method: 'patch', re: P('/events/:id'), handler: ({ db, params, body }) => {
    const e = findEvent(db, params.id);
    Object.assign(e, body, { updated_at: now() });
    return ok({ event: eventView(e) });
  } },
  { method: 'delete', re: P('/events/:id'), handler: ({ db, params }) => {
    db.events = t(db, 'events').filter((e) => e.id !== params.id);
    return ok();
  } },
  { method: 'post', re: P('/events/:id/messages'), handler: ({ db, params, body }) => {
    const e = findEvent(db, params.id);
    const m = { id: gid('gmsg'), event_id: e.id, sender_id: ME, content: str(body.content), is_ai: false, created_at: now(), read_at: null };
    (e.messages as Row[]).push(m);
    e.updated_at = now();
    if (!e.is_private) setTimeout(() => schedulePartnerReply(str(e.id)), 0);
    return ok({ message: m });
  } },
  { method: 'patch', re: P('/events/:id/messages/:mid'), handler: ({ db, params, body }) => {
    const e = findEvent(db, params.id);
    const m = (e.messages as Row[]).find((x) => x.id === params.mid);
    if (m) Object.assign(m, { content: str(body.content), edited_at: now() });
    return ok({ message: m });
  } },
  { method: 'put', re: P('/events/:id/messages/:mid/read'), handler: ({ db, params }) => {
    const e = findEvent(db, params.id);
    const m = (e.messages as Row[]).find((x) => x.id === params.mid);
    if (m) m.read_at = now();
    return ok();
  } },
  { method: 'post', re: P('/events/:id/messages/analyze-draft'), handler: ({ body }) => {
    const r = analyzeSoften(str(body.draft));
    return ok({ analysis: {
      emotions: r.emotions.map((e) => ({ label: e.label, emoji: e.emoji, intensity: e.intensity })),
      partnerHears: { misread: r.partnerHears, real: tr(`其實你想說的是：我需要${r.need}。`, `What you really mean: I need ${r.need.toLowerCase()}.`) },
      need: r.need,
      rewrite: r.rewrite,
      toxicityFlags: r.heat > 70 ? [tr('絕對化用語', 'Absolute words')] : [],
    } });
  } },
  { method: 'post', re: P('/events/:id/messages/preview-rewrite'), handler: ({ body }) => {
    const p = softenPreview(str(body.rawReply));
    return ok({ preview: { versions: p.versions, toxicityFlags: p.toxicityFlags } });
  } },
  { method: 'post', re: P('/events/:id/messages/preview-acceptance'), handler: ({ db, params }) => {
    const e = findEvent(db, params.id);
    const g = getEmotionAcceptance(((e.emotions as string[]) || [])[0] || '');
    return ok({ preview: { empathy: g.meaning, acceptances: g.sampleLines.map((text, i) => ({ label: [tr('承認', 'Acknowledge'), tr('理解', 'Understand'), tr('陪伴', 'Be there')][i] || '', text })), toxicityFlags: [] } });
  } },
  // 請 AI 諮商師介入: the real counselor (spends 1 of the 5 tries); on-device
  // demo comment once they're used up or the server is unreachable.
  { method: 'post', re: P('/events/:id/ai-comment/preview'), handler: async ({ db, params }) => {
    const e = findEvent(db, params.id);
    const real = await callGuestAi(db, 'event_counselor', threadForAi(e));
    if (real && typeof real.comment === 'string' && real.comment.trim()) return ok({ comment: real.comment });
    const g = getEmotionAcceptance(((e.emotions as string[]) || [])[0] || '');
    return ok({ comment: `${g.meaning}\n\n${g.howToReceive}\n\n${AI_NOTE}` });
  } },
  { method: 'post', re: P('/events/:id/ai-comment'), handler: ({ db, params, body }) => {
    const e = findEvent(db, params.id);
    const m = { id: gid('gmsg'), event_id: e.id, sender_id: '', content: str(body.content), is_ai: true, ai_therapist: 'luma', created_at: now(), read_at: now() };
    (e.messages as Row[]).push(m);
    emitLater('guest:counselor', { eventId: e.id });
    return ok({ message: m });
  } },
  { method: 'patch', re: P('/events/:id/translation'), handler: ({ db, params, body }) => {
    const e = findEvent(db, params.id);
    e.translation_enabled = body.enabled === true;
    return ok({ translation_enabled: e.translation_enabled });
  } },
  { method: 'get', re: P('/events/:id/translations'), handler: ({ db, params }) => {
    const e = findEvent(db, params.id);
    const translations: Record<string, unknown> = {};
    (e.messages as Row[]).filter((m) => !m.is_ai).forEach((m) => {
      const r = analyzeSoften(str(m.content));
      translations[str(m.id)] = { emotions: r.emotions.map((x) => ({ label: x.label, intensity: x.intensity })), need: r.need, rewrite: r.rewrite };
    });
    const n = Object.keys(translations).length;
    return ok({ translations, requested: n, translated: n });
  } },
  { method: 'get', re: P('/events/:id/therapy-note'), handler: () => ok({ therapyNote: {
    trigger: tr('家事分配不均，累積的疲憊沒有被看見。', 'An uneven chore split; built-up tiredness went unseen.'),
    needs: [{ who: guestPartnerNickname(), need: tr('付出被看見', 'To have effort seen') }, { who: guestNickname(), need: tr('被溫和地提醒，而不是被指責', 'Gentle reminders, not blame') }],
    cycle: [tr('默默多做', 'Quietly does more'), tr('累積委屈', 'Resentment builds'), tr('一次爆發', 'One big outburst')],
    repairs: [{ who: guestNickname(), text: tr('先說謝謝，再提分工', 'Said thanks first, then proposed a split') }],
    nextTime: tr('一週後一起回頭看看分工順不順。', 'Check in on the split in a week.'),
  } }) },
  { method: 'post', re: P('/events/:id/resolve'), handler: ({ db, params }) => {
    const e = findEvent(db, params.id);
    Object.assign(e, { status: 'resolved', resolved_at: now(), updated_at: now() });
    return ok({ event: eventView(e) });
  } },
  { method: 'post', re: P('/events/:id/reopen'), handler: ({ db, params }) => {
    const e = findEvent(db, params.id);
    Object.assign(e, { status: 'open', resolved_at: null, updated_at: now() });
    return ok({ event: eventView(e) });
  } },
  // 標記解決 (closure): the sample partner has already written their commitment,
  // so the guest's submit completes it and the event resolves for real.
  { method: 'get', re: P('/events/:id/closure'), handler: ({ db, params }) => ok({ closure: closureView(db, findEvent(db, params.id)) }) },
  { method: 'post', re: P('/events/:id/closure/start'), handler: ({ db, params }) => {
    const e = findEvent(db, params.id);
    if (!e.closure) e.closure = { started_at: now(), me: null, decision: null, status: 'collecting' };
    return ok({ closure: closureView(db, e) });
  } },
  { method: 'post', re: P('/events/:id/closure/assist'), handler: ({ body }) => ok({ options: body.field === 'decision'
    ? [tr('下次會晚超過 15 分鐘，就先傳訊息', 'If running 15+ minutes late, text first'), tr('每週日晚上一起排下週行程', 'Plan the week together every Sunday night')]
    : [tr('我會先說出我的感受，而不是沉默', 'I\'ll say how I feel instead of going quiet'), tr('我會先問你發生什麼事，再表達失落', 'I\'ll ask what happened before sharing my disappointment')] }) },
  { method: 'post', re: P('/events/:id/closure/submit'), handler: ({ db, params, body }) => {
    const e = findEvent(db, params.id);
    const c = (e.closure || { started_at: now() }) as Row;
    Object.assign(c, { me: str(body.commitment), decision: body.sharedDecision ?? null, status: 'finalized', finalized_at: now() });
    e.closure = c;
    Object.assign(e, { status: 'resolved', resolved_at: now(), updated_at: now() });
    return ok({ closure: closureView(db, e) });
  } },
  { method: 'post', re: P('/events/:id/closure/skip'), handler: ({ db, params }) => {
    const e = findEvent(db, params.id);
    e.closure = { ...((e.closure as Row) || {}), me: null, skipped: true, status: 'finalized', finalized_at: now() };
    Object.assign(e, { status: 'resolved', resolved_at: now(), updated_at: now() });
    return ok({ closure: closureView(db, e) });
  } },
  { method: 'post', re: /^\/events\/[^/]+\/closure\/(cancel|abandon)$/, handler: ({ db, path }) => {
    const e = findEvent(db, path.split('/')[2]);
    delete e.closure;
    return ok();
  } },
  { method: 'post', re: /^\/events\/[^/]+\/closure\/(finalize|insight)$/, handler: ({ db, path }) => ok({ closure: closureView(db, findEvent(db, path.split('/')[2])) }) },
  { method: 'get', re: P('/events/:id/facilitation'), handler: () => ok({ session: null }) },
  { method: 'post', re: /^\/events\/[^/]+\/facilitation\//, handler: () => {
    throw new GuestError(403, tr('試玩模式開放「給建議」：請諮商師看看你們的對話。帶你們一起做練習卡要真的兩個人，免費註冊、邀請另一半後就能用。', 'The preview includes "Give advice": the counselor reads your conversation. Practice cards need two real people; sign up free and invite your partner to use them.'), 'GUEST_MODE');
  } },
  { method: 'any', re: /^\/events\/[^/]+\/(publish|share)/, handler: () => blocked() },

  // Sophie 衝突即時介入: deliver straight into the thread (no hold in the preview).
  { method: 'get', re: P('/conflict/active'), handler: () => ok({ intervention: null }) },
  { method: 'post', re: P('/conflict/messages'), handler: ({ db, body }) => {
    const id = str(body.event_id);
    if (id) {
      const e = findEvent(db, id);
      (e.messages as Row[]).push({ id: gid('gmsg'), event_id: id, sender_id: ME, content: str(body.content), is_ai: false, created_at: now(), read_at: null });
      e.updated_at = now();
      if (!e.is_private) setTimeout(() => schedulePartnerReply(id), 0);
    }
    return ok({ delivered: true, held: false, level: 0 });
  } },

  // ── 我們的牆 wall ──────────────────────────────────────────────────────────
  { method: 'get', re: P('/wall'), handler: ({ db }) => ok({ wall_posts: [...t(db, 'wall')].sort((a, b) => str(b.created_at).localeCompare(str(a.created_at))) }) },
  { method: 'get', re: P('/wall/mood-tags'), handler: () => ok({ tags: [] }) },
  { method: 'post', re: P('/wall/read'), handler: ({ body }) => ok({ marked: ((body.post_ids as unknown[]) || []).length }) },
  { method: 'post', re: P('/wall'), handler: ({ db, body }) => {
    const files = (body.__files as File[]) || [];
    const media = files.map((f) => (typeof URL !== 'undefined' ? URL.createObjectURL(f) : ''));
    const row: Row = {
      id: gid('gw'), content: str(body.content), mood_tag: body.mood_tag ?? null, category: body.category ?? 'general',
      author_id: ME, author_nickname: guestNickname(), reply_count: 0, media,
      is_private: body.is_private === true || body.is_private === 'true', partner_read_at: null, partner_reaction: null,
      my_reaction: null, public_status: 'private', public_title: null, created_at: now(), updated_at: now(),
    };
    t(db, 'wall').unshift(row);
    return ok({ wall_post: row });
  } },
  { method: 'put', re: P('/wall/:id/reaction'), handler: ({ db, params, body }) => {
    const w = t(db, 'wall').find((x) => x.id === params.id);
    if (w) w.my_reaction = body.reaction ?? null;
    return ok({ my_reaction: w?.my_reaction ?? null, partner_reaction: w?.partner_reaction ?? null });
  } },
  { method: 'put', re: P('/wall/:id'), handler: ({ db, params, body }) => {
    const w = t(db, 'wall').find((x) => x.id === params.id);
    if (w) Object.assign(w, body, { updated_at: now() });
    return ok({ wall_post: w });
  } },
  { method: 'delete', re: P('/wall/:id'), handler: ({ db, params }) => {
    db.wall = t(db, 'wall').filter((x) => x.id !== params.id);
    return ok();
  } },
  { method: 'get', re: P('/wall/:id/replies'), handler: ({ db, params }) => ok({ replies: t(db, 'wall_replies').filter((r) => r.post_id === params.id) }) },
  { method: 'post', re: P('/wall/:id/replies'), handler: ({ db, params, body }) => {
    const r = { id: gid('gwr'), post_id: params.id, content: str(body.content), author_id: ME, author_nickname: guestNickname(), created_at: now() };
    t(db, 'wall_replies').push(r);
    const w = t(db, 'wall').find((x) => x.id === params.id);
    if (w) w.reply_count = Number(w.reply_count || 0) + 1;
    return ok({ reply: r });
  } },
  { method: 'any', re: /^\/wall\/[^/]+\/(publish|ai)/, handler: () => blocked() },

  // ── 成長 grow ──────────────────────────────────────────────────────────────
  { method: 'get', re: P('/achievements'), handler: ({ db }) => {
    const list = ACHIEVEMENTS(db);
    const unlocked = list.filter((a) => a.is_unlocked);
    return ok({ achievements: list, stats: { total_achievements: list.length, unlocked_achievements: unlocked.length, completion_percentage: Math.round((unlocked.length / list.length) * 100), recent_achievements: unlocked } });
  } },
  { method: 'get', re: P('/stats'), handler: ({ db }) => {
    const ms = t(db, 'love_moments');
    return {
      total_moments: ms.length, average_per_month: Math.round((ms.length / 2) * 10) / 10, average_per_week: Math.round((ms.length / 8.5) * 10) / 10,
      current_streak: 2, longest_streak: 4, monthly_data: monthlyData(db),
      total_coins_earned: ms.length * 10, current_balance: balanceOf(db, ME),
    };
  } },

  // ── 愛的語言 assessments ──────────────────────────────────────────────────
  { method: 'get', re: P('/assessments'), handler: ({ db }) => ok({ assessments: t(db, 'assessments').filter((a) => a.user_id === ME).map((a) => ({ type: a.type, result: a.result, scores: a.scores, updatedAt: a.updated_at })) }) },
  { method: 'get', re: P('/assessments/partner'), handler: ({ db }) => ok({ partner: { nickname: guestPartnerNickname() }, assessments: t(db, 'assessments').filter((a) => a.user_id === PARTNER).map((a) => ({ type: a.type, result: a.result, updatedAt: a.updated_at })) }) },
  { method: 'put', re: P('/assessments/:type'), handler: ({ db, params, body }) => {
    const rows = t(db, 'assessments');
    let a = rows.find((x) => x.user_id === ME && x.type === params.type);
    if (!a) { a = { user_id: ME, type: params.type }; rows.push(a); }
    Object.assign(a, { result: body.result, scores: body.scores, updated_at: now() });
    return ok({ assessment: { type: a.type, result: a.result, scores: a.scores, updatedAt: a.updated_at } });
  } },
  { method: 'get', re: P('/assessments/love-wishes'), handler: ({ db }) => ok({
    mine: t(db, 'love_wishes').filter((w) => w.user_id === ME).map(({ id, content }) => ({ id, content })),
    partner: t(db, 'love_wishes').filter((w) => w.user_id === PARTNER).map(({ id, content }) => ({ id, content })),
  }) },
  { method: 'post', re: P('/assessments/love-wishes'), handler: ({ db, body }) => {
    const w = { id: gid('glw'), user_id: ME, content: str(body.content) };
    t(db, 'love_wishes').push(w);
    return ok({ wish: { id: w.id, content: w.content } });
  } },
  { method: 'delete', re: P('/assessments/love-wishes/:id'), handler: ({ db, params }) => {
    db.love_wishes = t(db, 'love_wishes').filter((w) => w.id !== params.id);
    return ok();
  } },

  // ── 愛情旅程 journey ───────────────────────────────────────────────────────
  { method: 'get', re: P('/journey'), handler: ({ db }) => ok({ added: t(db, 'journey'), enrich: db.journey_enrich || {} }) },
  { method: 'post', re: P('/journey'), handler: ({ db, body }) => {
    const m = { id: gid('gj'), ...body };
    t(db, 'journey').push(m);
    return ok({ milestone: m });
  } },
  { method: 'put', re: P('/journey/enrich/:ref'), handler: ({ db, params, body }) => {
    const enrich = (db.journey_enrich || {}) as Record<string, unknown>;
    enrich[decodeURIComponent(params.ref)] = body;
    db.journey_enrich = enrich;
    return ok({ enrich: body });
  } },
  { method: 'put', re: P('/journey/:id'), handler: ({ db, params, body }) => {
    const m = t(db, 'journey').find((x) => x.id === params.id);
    if (m) Object.assign(m, body);
    return ok({ milestone: m });
  } },
  { method: 'delete', re: P('/journey/:id'), handler: ({ db, params }) => {
    db.journey = t(db, 'journey').filter((x) => x.id !== params.id);
    return ok();
  } },

  // ── 角色扮演 roleplay ──────────────────────────────────────────────────────
  { method: 'get', re: P('/custom-scripts'), handler: ({ db }) => ok({ custom_scripts: t(db, 'custom_scripts') }) },
  { method: 'get', re: P('/script-favorites'), handler: ({ db }) => ok({ favorites: t<string>(db, 'script_favorites') }) },
  { method: 'post', re: P('/script-favorites'), handler: ({ db, body }) => {
    const favs = t<string>(db, 'script_favorites');
    const id = str(body.scriptId);
    if (id && !favs.includes(id)) favs.push(id);
    return ok();
  } },
  { method: 'delete', re: P('/script-favorites/:id'), handler: ({ db, params }) => {
    db.script_favorites = t<string>(db, 'script_favorites').filter((x) => x !== params.id);
    return ok();
  } },
  { method: 'get', re: P('/marketplace/scripts'), handler: () => ok({ scripts: [] }) },
  { method: 'get', re: P('/marketplace/my-favorites'), handler: () => ok({ scripts: [] }) },

  // ── 親密邀請 intimacy requests ─────────────────────────────────────────────
  { method: 'get', re: P('/intimacy-requests'), handler: ({ db }) => ok({ requests: t(db, 'intimacy_requests'), intimacy_requests: t(db, 'intimacy_requests') }) },
  { method: 'get', re: P('/intimacy-requests/stats'), handler: ({ db }) => ok({ stats: { total: t(db, 'intimacy_requests').length, accepted: 1, declined: 0, pending: 0 } }) },
  { method: 'post', re: P('/intimacy-requests/nudge-suggestions'), handler: () => ok({ suggestions: [
    { tone: 'gentle', text: tr('最近好像都好忙，今晚一起早點休息、抱一下好嗎？', 'We\'ve been so busy lately — early night and a cuddle tonight?') },
    { tone: 'playful', text: tr('有人好像很久沒被我抱抱了，要不要來領取？', 'Someone hasn\'t been hugged in a while. Come claim it?') },
  ] }) },
  { method: 'post', re: P('/intimacy-requests'), handler: ({ db, body }) => {
    const r = { id: gid('gir'), requester_id: ME, recipient_id: PARTNER, request_type: body.requestType ?? body.request_type ?? 'intimate', message_content: body.messageContent ?? body.message_content ?? '', status: 'pending', created_at: now(), requester_nickname: guestNickname(), recipient_nickname: guestPartnerNickname() };
    t(db, 'intimacy_requests').unshift(r);
    return ok({ request: r, intimacy_request: r });
  } },

  // ── misc pages ─────────────────────────────────────────────────────────────
  { method: 'get', re: P('/marriage-checkups'), handler: () => ok({ checkups: [] }) },
  { method: 'get', re: P('/feedback/mine'), handler: ({ db }) => ok({ feedback: t(db, 'feedback_mine') }) },
  { method: 'post', re: P('/feedback'), handler: () => blocked() },
  { method: 'get', re: P('/therapists/dedicated'), handler: () => ok({ dedicated: null }) },
  { method: 'any', re: /^\/(therapists|dedicated-space)\/.+/, handler: ({ method }) => (method === 'get' ? ok({}) : blocked()) },
  { method: 'post', re: /^\/photos/, handler: () => blocked() },
];

// Public, read-only content the real server serves to anyone (no token):
// show the real thing in guest mode too.
export const PUBLIC_GETS: RegExp[] = [
  /^\/feedback\/approved$/,
  /^\/intimacy-plans\/samples$/,
  /^\/therapists$/,
  /^\/stories$/,
  /^\/stories\/[0-9a-f-]{36}$/,
  // A pairing-invite lookup is public: the invitee hasn't signed up yet.
  /^\/pairing-requests\/invitation\/[^/]+$/,
];

export { iso as _iso };
