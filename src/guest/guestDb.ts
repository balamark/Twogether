import { buildSeed, type GuestDb } from './guestSeed';
import { getLocale } from '../i18n/tr';

// Session-only storage for the guest mock backend. sessionStorage when
// available (survives reloads within the tab, gone when the tab closes); an
// in-memory copy keeps private-mode browsers working.

export const GUEST_DB_KEY = 'tw_guest_db_v1';
let memory: GuestDb | null = null;

export function loadDb(): GuestDb {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(GUEST_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GuestDb;
      // Untouched sample data follows the language switch (it reloads the
      // page); once the guest has changed something, keep their session.
      const sameLocale = parsed?.locale === getLocale() || parsed?.dirty === true;
      if (parsed && parsed.version === buildSeed.VERSION && sameLocale) {
        memory = parsed;
        return parsed;
      }
    }
  } catch { /* blocked or corrupt — reseed */ }
  memory = buildSeed();
  saveDb(memory);
  return memory;
}

export function saveDb(db: GuestDb): void {
  memory = db;
  try { sessionStorage.setItem(GUEST_DB_KEY, JSON.stringify(db)); } catch { /* quota / private mode */ }
}

/** Seed on landing (idempotent). Returns true when a fresh sample set was created. */
export function ensureGuestDb(): boolean {
  let existed = false;
  try { existed = !!sessionStorage.getItem(GUEST_DB_KEY); } catch { existed = !!memory; }
  loadDb();
  return !existed;
}

/** Back to a fresh sample couple (試玩：重置範例資料). */
export function resetGuestDb(): void {
  memory = buildSeed();
  saveDb(memory);
}

/** Erase the guest session entirely (used on sign-in). */
export function wipeGuestDb(): void {
  memory = null;
  try { sessionStorage.removeItem(GUEST_DB_KEY); } catch { /* ignore */ }
}

let seq = 0;
export function gid(prefix = 'g'): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}
