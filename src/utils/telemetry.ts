// Lightweight client → server diagnostics.
//
// Posts structured events to `/api/track/client-log`, which pipes them into
// Cloud Logging as `client.<event>` entries. This makes frontend issues
// diagnosable with `gcloud logging read` (with evidence) instead of relying on
// a user's screen recording. Standalone (no axios import) so low-level code
// like the ErrorBoundary can use it without a require cycle.
//
// Every event carries the last `X-Request-Id` returned by the API
// (`setLastRequestId` is called from the axios interceptors), so a client
// failure links to the exact backend execution trace.

const CLIENT_LOG_URL = '/api/track/client-log';

type LogLevel = 'info' | 'warn' | 'error';

let lastRequestId: string | null = null;

export function setLastRequestId(id: string | null | undefined): void {
  if (id) lastRequestId = id;
}

export function getLastRequestId(): string | null {
  return lastRequestId;
}

/**
 * Fire-and-forget structured client event. Never throws and never blocks the
 * UI — failures to log are swallowed by design.
 */
export function clientLog(
  event: string,
  data?: Record<string, unknown>,
  level: LogLevel = 'info',
): void {
  try {
    const body = JSON.stringify({
      event,
      level,
      requestId: lastRequestId,
      data: data ?? {},
    });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(
          CLIENT_LOG_URL,
          new Blob([body], { type: 'application/json' }),
        );
        return;
      } catch {
        // fall through to fetch
      }
    }
    fetch(CLIENT_LOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Telemetry must never break the app.
  }
}

/**
 * Register global handlers so uncaught errors and unhandled promise rejections
 * are reported without a per-call-site `try/catch`. Call once at startup.
 */
export function initTelemetry(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e: ErrorEvent) => {
    clientLog(
      'window_error',
      {
        message: e.message,
        source: e.filename,
        line: e.lineno,
        col: e.colno,
        stack: e.error?.stack,
      },
      'error',
    );
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    clientLog(
      'unhandled_rejection',
      {
        message: reason?.message ?? String(reason),
        stack: reason?.stack,
      },
      'error',
    );
  });
}
