// Lightweight client action beacon (docs/UX_PLAYBOOK.md §R5). Reuses the same
// page_views pipeline as usePageTracking, but records a discrete click/exposure
// as a zero-duration entry under an `onboarding.<surface>.<action>` name. Fire
// and forget — never blocks or throws in the caller.

const SESSION_KEY = 'tw_track_session';
const TRACK_URL = '/api/track/view';

function getSessionId(): string {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Record a discrete action/exposure. `name` should follow
 * `onboarding.<surface>.<action>` (max 64 chars server-side).
 */
export function trackAction(name: string): void {
  try {
    const body = JSON.stringify({
      view: name,
      view_type: 'modal',
      session_id: getSessionId(),
      entered_at: new Date().toISOString(),
      duration_ms: 0,
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(TRACK_URL, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* tracking must never break the UI */
  }
}
