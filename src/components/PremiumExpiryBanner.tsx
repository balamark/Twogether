import React, { useMemo, useState } from 'react';
import { Crown, X } from 'lucide-react';
import type { BillingStatus } from '../services/api';

// Proactive Premium-expiry reminder. Shows a gentle, dismissible banner when a
// couple's Premium is within EXPIRY_WINDOW_DAYS of lapsing, so they can renew
// BEFORE the caps silently drop back to the free tier (this was the surprise
// behind the "剩 1 次" report — a lapsed couple is served the free cap of 5).
//
// Three-part copy (docs/UX_PLAYBOOK.md gates): 狀態 (何時到期) + 影響 (到期後會
//怎樣) + CTA (立即續購). It's an `info`/`warning`, never a red error.
//
// Dismissal is remembered per expiry date, so it stops nagging for the current
// pass but re-appears near the NEXT expiry after a renewal (which moves the
// date).

const EXPIRY_WINDOW_DAYS = 7;
// Within this many days we escalate the tone (warmer → more urgent colour).
const URGENT_DAYS = 3;

interface Props {
  status: BillingStatus | null;
  onRenew: () => void;
}

const dismissKey = (expiresAt: string) => `premiumExpiryDismissed:${expiresAt}`;

function isDismissed(expiresAt: string): boolean {
  try {
    return window.localStorage.getItem(dismissKey(expiresAt)) === '1';
  } catch {
    return false;
  }
}

// Whole days from now until `expiresAt` (rounded up so "in 6.2 days" reads as 7).
function daysUntil(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

const PremiumExpiryBanner: React.FC<Props> = ({ status, onRenew }) => {
  const expiresAt = status?.tier === 'premium' ? status.expiresAt : null;
  const [dismissed, setDismissed] = useState<boolean>(() =>
    expiresAt ? isDismissed(expiresAt) : false
  );

  const daysLeft = useMemo(
    () => (expiresAt ? daysUntil(expiresAt) : null),
    [expiresAt]
  );

  if (!expiresAt || daysLeft == null) return null;
  // Only nag inside the reminder window (and never for an already-lapsed date —
  // the backend only reports unexpired entitlements, but guard anyway).
  if (daysLeft < 0 || daysLeft > EXPIRY_WINDOW_DAYS) return null;
  if (dismissed) return null;

  const urgent = daysLeft <= URGENT_DAYS;
  const wrap = urgent
    ? 'bg-rose-50 border-rose-200 text-rose-900'
    : 'bg-amber-50 border-amber-200 text-amber-900';
  const iconColor = urgent ? 'text-rose-500' : 'text-amber-500';

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(expiresAt), '1');
    } catch {
      // best-effort; a failed write just means it may re-show next session
    }
  };

  const whenLine =
    daysLeft <= 0
      ? '你的 Premium 今天到期'
      : `你的 Premium 將於 ${formatDate(expiresAt)}（約 ${daysLeft} 天後）到期`;

  return (
    <div className="max-w-6xl mx-auto mb-4">
      <div
        className={`rounded-2xl border px-4 py-3 flex items-start gap-2.5 ${wrap}`}
        role="status"
        data-testid="premium-expiry-banner"
        data-urgent={urgent ? 'true' : 'false'}
      >
        <span className="mt-0.5 shrink-0">
          <Crown className={`w-4 h-4 ${iconColor}`} strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm font-medium">{whenLine}</p>
          <p className="font-body text-[13px] leading-relaxed mt-0.5 opacity-90">
            到期後 AI 每日次數會回到免費上限（每人每天 5 次），自訂劇本與照片也會回到免費限制。續購即可延續無限額度。
          </p>
        </div>
        <button
          type="button"
          onClick={onRenew}
          data-testid="premium-expiry-renew"
          className="shrink-0 self-center px-3.5 py-1.5 rounded-full bg-petal-ink text-petal-cream font-body text-xs hover:bg-pink-700 transition-colors"
        >
          立即續購
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="稍後再說"
          data-testid="premium-expiry-dismiss"
          className="shrink-0 -mr-1 -mt-0.5 p-1 rounded hover:bg-black/5 transition-colors"
        >
          <X className="w-4 h-4 opacity-60" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};

export default PremiumExpiryBanner;
