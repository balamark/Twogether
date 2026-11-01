import { getLocale, tr } from '../i18n/tr';
import type { GuestDb } from './guestSeed';
import { GuestError } from './guestErrors';

// ─── 訪客模式：5 次真的 AI ───────────────────────────────────────────────────
// The guest's four core AI actions (整理成三種版本 / 送出前情緒檢查 / 改寫回覆 /
// 接住情緒) call the real LLM through the public /api/guest-ai endpoint,
// capped at GUEST_AI_LIMIT per guest. The server answers and does NOT store the
// text. Only those requests leave the tab; everything else stays on-device.
// When the server can't be reached we fall back to the on-device demo (and the
// try isn't counted); when the 5 are used up the guest gets a sign-up reason.

export const GUEST_AI_LIMIT = 5;
export type GuestAiKind = 'icebreaker' | 'draft_analysis' | 'reply_rewrite' | 'emotion_acceptance';

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
  if (cachedUsage(db).remaining <= 0) return null;
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
  if (res.status === 429 && body.error_code === 'GUEST_AI_LIMIT') {
    db.ai_usage = { tier: 'guest', limit: GUEST_AI_LIMIT, used: GUEST_AI_LIMIT, remaining: 0 };
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('guest:ai-usage', { detail: db.ai_usage }));
    return null;
  }
  if (res.status === 400) throw new GuestError(400, String(body.message || tr('內容格式不符，請調整後再試一次。', 'That input isn\'t valid. Please adjust it and try again.')), String(body.error_code || 'VALIDATION_ERROR'));
  if (!res.ok || !body.result) return null;
  if (body.usage) {
    db.ai_usage = body.usage;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('guest:ai-usage', { detail: body.usage }));
  }
  return body.result as Record<string, unknown>;
}
