// 諮商師專屬邀請碼 — remembers the code from a therapist's `?tref=` link until
// the visitor has an account and claims it. Stored in localStorage because the
// sign-up / pairing detour often spans tabs and days; it's attribution only
// (the therapist's public code), never the visitor's identity.

const KEY = 'tw_therapist_ref';
const TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const CODE_RE = /^T[A-Z0-9]{6}$/;

interface Stored { code: string; at: number }

export function normalizeTherapistRef(raw: string | null | undefined): string | null {
  const code = String(raw || '').trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export function readTherapistRef(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.code || Date.now() - parsed.at > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return normalizeTherapistRef(parsed.code);
  } catch {
    return null;
  }
}

export function saveTherapistRef(code: string): void {
  try {
    // First link wins — a later link from a different therapist doesn't
    // silently re-attribute someone who is mid-sign-up.
    if (readTherapistRef()) return;
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() } satisfies Stored));
  } catch { /* storage disabled — the card just won't survive a reload */ }
}

export function clearTherapistRef(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Reads `?tref=` once, stores it, and strips it from the address bar. */
export function captureTherapistRefFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = normalizeTherapistRef(params.get('tref'));
    if (!params.has('tref')) return null;
    params.delete('tref');
    const rest = params.toString();
    window.history.replaceState(window.history.state, document.title, window.location.pathname + (rest ? `?${rest}` : ''));
    if (code) saveTherapistRef(code);
    return code;
  } catch {
    return null;
  }
}
