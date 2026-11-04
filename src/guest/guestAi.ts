import { getLocale, tr } from '../i18n/tr';
import type { GuestDb } from './guestSeed';
import { GuestError } from './guestErrors';

// ─── 訪客模式：5 次真的 AI ───────────────────────────────────────────────────
// The guest's core loop runs on the real LLM through the public /api/guest-ai
// endpoint: 整理成三種版本 (icebreaker) and 請 AI 諮商師介入 (event_counselor)
// spend the GUEST_AI_LIMIT tries; the sample partner's replies (partner_reply)
// don't count but have their own server cap. The server answers and does NOT
// store the text. Only those requests leave the tab; everything else stays
// on-device.
// When the server can't be reached we fall back to the on-device demo (and the
// try isn't counted); when the 5 are used up the guest gets a sign-up reason.

export const GUEST_AI_LIMIT = 5;
export type GuestAiKind = 'icebreaker' | 'event_counselor' | 'partner_reply';
const COUNTED: GuestAiKind[] = ['icebreaker', 'event_counselor'];

const ID_KEY = 'tw_guest_ai_id';

// An anonymous random id (no content) so the 5 tries survive a reload/new tab.
export function guestAiId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return `g-${Date.now().toString(36)}-anon`;
  }
}

export interface GuestAiUsage { tier: string; limit: number; used: number; remaining: number }

export function cachedUsage(db: GuestDb): GuestAiUsage {
  const u = db.ai_usage as GuestAiUsage | undefined;
  return u ?? { tier: 'guest', limit: GUEST_AI_LIMIT, used: 0, remaining: GUEST_AI_LIMIT };
}

function headers() {
  return { 'Content-Type': 'application/json', 'X-Locale': getLocale() };
}

/** Refresh the remaining count from the server (best effort). */
export async function fetchGuestAiUsage(db: GuestDb): Promise<GuestAiUsage> {
  try {
    const r = await fetch(`/api/guest-ai/quota?guest_id=${encodeURIComponent(guestAiId())}`, { headers: headers() });
    if (r.ok) {
      const body = await r.json();
      if (body?.usage) db.ai_usage = body.usage;
    }
  } catch { /* offline — keep the cached count */ }
  return cachedUsage(db);
}

/**
 * Run one real AI call. Returns the model's result, or null — meaning "use
 * the on-device demo" — when the 5 tries are used up (the banner says so and
 * offers sign-up) or the server can't be reached (no try spent). Never a dead
 * end: a guest can always finish the flow.
 */
export async function callGuestAi(db: GuestDb, kind: GuestAiKind, input: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const counted = COUNTED.includes(kind);
  if (counted && cachedUsage(db).remaining <= 0) return null;
  let res: Response;
  try {
    res = await fetch(`/api/guest-ai/${kind}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ guest_id: guestAiId(), ...input }),
    });
  } catch {
    return null;
  }
  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch { /* non-JSON (proxy error) */ }
  // Partner replies have their own cap; past it the on-device reply takes over.
  if (res.status === 429 && body.error_code === 'GUEST_PARTNER_LIMIT') return null;
  if (res.status === 429 && body.error_code === 'GUEST_AI_LIMIT') {
    db.ai_usage = { tier: 'guest', limit: GUEST_AI_LIMIT, used: GUEST_AI_LIMIT, remaining: 0 };
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('guest:ai-usage', { detail: db.ai_usage }));
    return null;
  }
  if (res.status === 400) throw new GuestError(400, String(body.message || tr('內容格式不符，請調整後再試一次。', 'That input isn\'t valid. Please adjust it and try again.')), String(body.error_code || 'VALIDATION_ERROR'));
  if (!res.ok || !body.result) return null;
  if (body.usage && counted) {
    db.ai_usage = body.usage;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('guest:ai-usage', { detail: body.usage }));
  }
  return body.result as Record<string, unknown>;
}

// ─── 訪客模式：3 次真的語音輸入 ─────────────────────────────────────────────
// A guest's 🎤 clip goes to the public /api/guest-ai/voice (≤60s, transcript
// returned and never stored). Unlike the AI tries there's no on-device demo to
// fall back to — a made-up transcript would be confusing — so failures throw
// with the server's error_code + message and the button shows them inline.
export async function transcribeGuestVoice(
  audio: Blob,
  durationMs: number,
  signal?: AbortSignal,
): Promise<{ text: string; usage?: { tier: string; limit: number; used: number; remaining: number } }> {
  const fd = new FormData();
  fd.append('guest_id', guestAiId());
  fd.append('duration_ms', String(Math.round(durationMs)));
  // Same naming as api.ts voiceFileName (not imported: api.ts imports the guest layer).
  const t = audio.type;
  fd.append('audio', audio, /mp4|m4a|aac/.test(t) ? 'clip.m4a' : /ogg/.test(t) ? 'clip.ogg' : /wav/.test(t) ? 'clip.wav' : 'clip.webm');
  let res: Response;
  try {
    res = await fetch('/api/guest-ai/voice', { method: 'POST', headers: { 'X-Locale': getLocale() }, body: fd, signal });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new GuestError(0, tr('網路好像斷了，錄音沒有送出。請檢查連線後再試，或改用打字。', 'The network seems to be down, so the recording wasn\'t sent. Check your connection and try again, or type instead.'), 'NETWORK_ERROR');
  }
  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch { /* non-JSON (proxy error) */ }
  if (!res.ok || body.success === false) {
    throw new GuestError(
      res.status,
      String(body.message || tr('語音轉文字沒有成功，請再錄一次，或改用打字。', 'Voice-to-text didn\'t work. Please record again or type instead.')),
      String(body.error_code || 'VOICE_FAILED'),
    );
  }
  return { text: String(body.text || ''), usage: body.usage as { tier: string; limit: number; used: number; remaining: number } | undefined };
}
