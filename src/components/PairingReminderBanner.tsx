import React, { useState } from 'react';
import { Users, X } from 'lucide-react';
import PairingInviteShare from './PairingInviteShare';
import { buildPairingAcceptLink } from '../utils/pairingLink';
import { trackAction } from '../utils/track';
import { daysUntil, isSnoozed, snoozeReminder, URGENT_DAYS } from '../utils/pairingReminder';
import type { PairingInvitationSummary } from '../services/api';

// Persistent 未配對 reminder (docs/UX_PLAYBOOK.md §0: 配對 = activation; P1-4
// 邀請狀態可見性). The login-time pairing modal fires once and its 稍後再說
// writes `pairingPromptDismissed` forever, so a user who closed it had no
// standing way back other than the 記錄時光 checklist (itself dismissible).
//
// Three-part shape like every other gate: 原因 + 能做什麼 + 主 CTA. Two states,
// because nagging "去邀請" at someone who already sent an invite is the wrong
// ask — once an invite is pending we show who it went to, how long the link
// has left, and the two things that actually help (重新寄送 / 直接傳連結).
//
// Snooze rather than permanent dismiss: X hides it for SNOOZE_DAYS and then it
// comes back, since pairing is the one thing the product is for.

interface Props {
  /** Newest pending invite, or null when none has been sent (or all expired). */
  invite: PairingInvitationSummary | null;
  onInvite: () => void;
  onUseCode: () => void;
  onResend: (token: string) => Promise<void>;
  /** Rendered non-interactively for the logged-out showroom. */
  sample?: boolean;
}

const PairingReminderBanner: React.FC<Props> = ({
  invite,
  onInvite,
  onUseCode,
  onResend,
  sample = false,
}) => {
  const daysLeft = invite ? daysUntil(invite.expiresAt) : null;
  const urgent = daysLeft != null && daysLeft <= URGENT_DAYS;

  // Explicit dismissal this session. The stored snooze is checked separately on
  // every render rather than frozen at mount: `invite` arrives asynchronously,
  // so at mount `urgent` is always false and a snoozed user would never see the
  // near-expiry override fire.
  const [dismissed, setDismissed] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [resending, setResending] = useState(false);
  const [shown, setShown] = useState(false);

  const hidden = dismissed || (!sample && isSnoozed() && !urgent);

  React.useEffect(() => {
    if (sample || hidden || shown) return;
    setShown(true);
    trackAction(`onboarding.pairing_reminder.shown_${invite ? 'pending' : 'none'}`);
  }, [sample, hidden, shown, invite]);

  if (hidden) return null;

  const dismiss = () => {
    if (sample) return;
    trackAction('onboarding.pairing_reminder.snooze');
    setDismissed(true);
    snoozeReminder();
  };

  const handleInvite = () => {
    if (sample) return;
    trackAction('onboarding.pairing_reminder.invite');
    onInvite();
  };

  const handleUseCode = () => {
    if (sample) return;
    trackAction('onboarding.pairing_reminder.use_code');
    onUseCode();
  };

  const handleResend = async () => {
    if (sample || !invite?.token || resending) return;
    trackAction('onboarding.pairing_reminder.resend');
    setResending(true);
    try {
      await onResend(invite.token);
    } finally {
      setResending(false);
    }
  };

  const toggleShare = () => {
    if (sample) return;
    if (!showShare) trackAction('onboarding.pairing_reminder.share');
    setShowShare((s) => !s);
  };

  const pending = !!invite;
  const wrap = urgent
    ? 'bg-rose-50 border-rose-200 text-rose-900'
    : 'bg-petal-rose-soft/30 border-petal-rose-soft text-petal-ink';
  const iconColor = urgent ? 'text-rose-500' : 'text-petal-rose-deep';

  const title = pending
    ? `邀請已寄給 ${invite!.recipientEmail}，還在等 TA 接受`
    : '你還沒和另一半配對';

  const body = pending
    ? daysLeft != null && daysLeft <= 0
      ? '這個邀請連結今天就到期了。重新寄一次，或直接把連結傳給 TA 最快。'
      : `這個邀請連結還有 ${daysLeft} 天到期。信可能被分到垃圾郵件或促銷分頁，直接把連結傳給 TA 最快。`
    : '配對後，日曆、親密紀錄與成就會自動同步，「好好說話」和「我們的牆」也才能兩個人一起用。';

  return (
    <div className="max-w-6xl mx-auto mb-4">
      <div
        className={`rounded-2xl border px-4 py-3 flex items-start gap-2.5 ${wrap}`}
        role="status"
        data-testid="pairing-reminder-banner"
        data-state={pending ? 'pending' : 'none'}
      >
        <span className="mt-0.5 shrink-0">
          <Users className={`w-4 h-4 ${iconColor}`} strokeWidth={1.5} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-body text-sm font-medium">{title}</p>
          <p className="font-body text-[13px] leading-relaxed mt-0.5 opacity-90">{body}</p>

          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {pending ? (
              <>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={sample || resending || !invite?.token}
                  data-testid="pairing-reminder-resend"
                  className="px-3.5 py-1.5 rounded-full bg-petal-ink text-petal-cream font-body text-xs hover:bg-pink-700 transition-colors disabled:opacity-40"
                >
                  {resending ? '寄送中…' : '重新寄送'}
                </button>
                <button
                  type="button"
                  onClick={toggleShare}
                  data-testid="pairing-reminder-share"
                  className="px-3.5 py-1.5 rounded-full border border-petal-rule font-body text-xs hover:bg-petal-cream-2 transition-colors"
                >
                  {showShare ? '收起連結' : '傳連結給 TA'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleInvite}
                  data-testid="pairing-reminder-invite"
                  className="px-3.5 py-1.5 rounded-full bg-petal-ink text-petal-cream font-body text-xs hover:bg-pink-700 transition-colors"
                >
                  邀請另一半
                </button>
                <button
                  type="button"
                  onClick={handleUseCode}
                  data-testid="pairing-reminder-use-code"
                  className="px-3.5 py-1.5 rounded-full border border-petal-rule font-body text-xs hover:bg-petal-cream-2 transition-colors"
                >
                  用配對碼配對
                </button>
              </>
            )}
          </div>

          {pending && showShare && invite?.token && (
            <PairingInviteShare
              link={buildPairingAcceptLink(invite.token)}
              recipientEmail={invite.recipientEmail}
              sample={sample}
              className="mt-3"
            />
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="稍後再說"
          data-testid="pairing-reminder-dismiss"
          className="shrink-0 -mr-1 -mt-0.5 p-1 rounded hover:bg-black/5 transition-colors"
        >
          <X className="w-4 h-4 opacity-60" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};

export default PairingReminderBanner;
