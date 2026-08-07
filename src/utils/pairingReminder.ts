// Snooze bookkeeping and invite selection for PairingReminderBanner. Kept out
// of the component file so the banner module only exports a component (the
// react-refresh rule), and so these can be unit-tested on their own.

import type { PairingInvitationSummary } from '../services/api';

export const SNOOZE_KEY = 'pairingReminderSnoozedUntil';
export const SNOOZE_DAYS = 7;
// Inside this many days of the invite link dying, the snooze is overridden —
// the same "a worse state re-opens the banner" rule ConflictBanner and
// RelationshipDashboard use. Letting an invite expire silently is exactly the
// failure this banner exists to prevent.
export const URGENT_DAYS = 2;

/** Whole days from now until `iso`, rounded up so "in 6.2 days" reads as 7. */
export function daysUntil(iso: string, now: number = Date.now()): number | null {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.ceil((ts - now) / (24 * 60 * 60 * 1000));
}

export function isSnoozed(now: number = Date.now()): boolean {
  try {
    const until = window.localStorage.getItem(SNOOZE_KEY);
    if (!until) return false;
    const ts = new Date(until).getTime();
    return Number.isFinite(ts) && ts > now;
  } catch {
    return false;
  }
}

export function snoozeReminder(now: number = Date.now()): void {
  try {
    const until = new Date(now + SNOOZE_DAYS * 24 * 60 * 60 * 1000);
    window.localStorage.setItem(SNOOZE_KEY, until.toISOString());
  } catch {
    // best-effort; a failed write just means it may re-show next session
  }
}

/** The newest still-usable invite, or null when there's nothing pending. */
export function pickPendingInvite(
  invitations: PairingInvitationSummary[],
  now: number = Date.now()
): PairingInvitationSummary | null {
  const pending = invitations.filter((inv) => {
    if (inv.status !== 'pending') return false;
    const left = daysUntil(inv.expiresAt, now);
    return left == null || left > 0;
  });
  return pending[0] ?? null;
}
