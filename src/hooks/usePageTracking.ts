// Page-view tracking for the /admin Pages + Retention tabs.
//
// Insert-on-exit model: when the user leaves a view we POST the *previous*
// view + how long they spent on it. The currently-displayed view has no row
// yet — it's a duration in progress. A `pagehide` / `visibilitychange`
// listener uses `navigator.sendBeacon` so the final view of a tab session
// is captured even when the tab closes.
//
// Session grouping: one UUID per browser tab session (sessionStorage), so
// rows from the same tab can be joined into a path/sequence later if needed.

import { useCallback, useEffect, useRef } from 'react';

type ViewType = 'view' | 'modal';

interface TrackedView {
  view: string;
  viewType: ViewType;
  enteredAt: number; // performance.now() not Date — survives wall-clock skew
}

const SESSION_KEY = 'tw_track_session';
const TRACK_URL = '/api/track/view';

function getSessionId(): string {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    // Private mode / disabled storage: a fresh ID per call is fine — the
    // backend treats session_id as an opaque grouping key, not a primary key.
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function postExit(view: TrackedView, sessionId: string, useBeacon: boolean) {
  const durationMs = Math.max(0, Math.round(performance.now() - view.enteredAt));
  const body = JSON.stringify({
    view: view.view,
    view_type: view.viewType,
    session_id: sessionId,
    entered_at: new Date(Date.now() - durationMs).toISOString(),
    duration_ms: durationMs,
  });

  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    // sendBeacon requires a Blob with the right content-type when the server
    // expects JSON — strings get sent as text/plain otherwise.
    try {
      navigator.sendBeacon(
        TRACK_URL,
        new Blob([body], { type: 'application/json' }),
      );
      return;
    } catch {
      // fall through to fetch
    }
  }
  // keepalive: true lets the request outlive a same-tab navigation.
  fetch(TRACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Returns `track(view, viewType)` which records that the user moved off the
 * previous view (if any) and onto a new one. Call with the same `view` twice
 * in a row is a no-op. Pass `null` for `view` to record "leaving" without a
 * replacement (e.g. on logout).
 */
export function usePageTracking(enabled: boolean) {
  const sessionIdRef = useRef<string>('');
  const currentRef = useRef<TrackedView | null>(null);

  if (!sessionIdRef.current) sessionIdRef.current = getSessionId();

  const track = useCallback((view: string | null, viewType: ViewType = 'view') => {
    if (!enabled) return;

    const prev = currentRef.current;
    if (prev && prev.view === view && prev.viewType === viewType) return;

    if (prev) {
      postExit(prev, sessionIdRef.current, false);
    }

    currentRef.current = view ? { view, viewType, enteredAt: performance.now() } : null;
  }, [enabled]);

  // Final-view beacon: when the tab is being put to sleep / closed, flush
  // the currently-open view so we don't lose its duration.
  useEffect(() => {
    const flush = () => {
      const cur = currentRef.current;
      if (!cur) return;
      postExit(cur, sessionIdRef.current, true);
      // Reset so we don't double-fire if both pagehide and visibilitychange land.
      currentRef.current = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return track;
}
