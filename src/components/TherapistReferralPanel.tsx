import React, { useEffect, useState } from 'react';
import { Gift, Copy, Share2 } from 'lucide-react';
import { apiService, type TherapistReferral } from '../services/api';
import type { Notification } from './ErrorNotification';
import { tr } from '../i18n/tr';
import { trackAction } from '../utils/track';

// 諮商師專屬邀請碼 — counselor-side card: the therapist's own link/code to hand
// to the couples they already see, what each couple gets (a Premium month),
// and how the referrals lower the therapist's platform fee.
interface Props {
  showNotification: (n: Omit<Notification, 'id'>) => void;
}

const TherapistReferralPanel: React.FC<Props> = ({ showNotification }) => {
  const [ref, setRef] = useState<TherapistReferral | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiService.getMyTherapistReferral()
      .then((r) => { if (alive) setRef(r); })
      .catch((err: Error) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-petal-rule bg-petal-cream-2/50 p-5" data-testid="therapist-referral-panel">
        <h3 className="font-display text-lg text-petal-ink mb-1">{tr('我的專屬邀請碼', 'My invite code')}</h3>
        <p className="font-body text-sm text-petal-muted">{error}</p>
      </div>
    );
  }
  if (!ref) return null;

  const shareText = tr(
    `我們在諮商裡談到的方法，可以用 Twogether 帶回每天練習：記下發生的事、用 AI 把話說對，下次諮商前我也能先讀你們整理的摘要。用這個連結加入，配對後送你們 Premium ${ref.premiumDays} 天：${ref.link}`,
    `Bring what we practise in sessions into everyday life with Twogether: log what happens, let AI help you say it well, and I can read your summary before our next session. Join with this link and get ${ref.premiumDays} days of Premium once you pair: ${ref.link}`,
  );

  const copy = async (text: string, what: 'link' | 'message') => {
    trackAction(`growth.therapist_ref.copy_${what}`);
    try {
      await navigator.clipboard.writeText(text);
      showNotification({ type: 'success', title: tr('已複製', 'Copied'), message: what === 'link' ? tr('貼給你的個案就可以了', 'Paste it to your clients') : tr('邀請訊息已複製，可以直接貼到 LINE 或 Email', 'Invite message copied — paste it into LINE or email'), duration: 2500 });
    } catch {
      showNotification({ type: 'warning', title: tr('無法自動複製', 'Couldn\'t copy automatically'), message: tr(`請手動複製：${text}`, `Please copy it manually: ${text}`), duration: 8000 });
    }
  };

  const lineShare = () => {
    trackAction('growth.therapist_ref.share_line');
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(ref.link)}&text=${encodeURIComponent(shareText)}`, '_blank', 'noopener');
  };

  const progress = ref.discountMax > 0 ? Math.min(1, ref.feeDiscount / ref.discountMax) : 0;
  const couplesToMax = Math.max(0, Math.ceil((ref.discountMax - ref.feeDiscount) / Math.max(1, ref.discountPerCouple)));

  return (
    <div className="rounded-lg border border-petal-rule bg-petal-cream-2/50 p-5 space-y-4" data-testid="therapist-referral-panel">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Gift className="w-4 h-4 text-pink-500" strokeWidth={1.5} />
          <h3 className="font-display text-lg text-petal-ink">{tr('我的專屬邀請碼', 'My invite code')}</h3>
        </div>
        <p className="font-body text-[13px] text-petal-ink-soft leading-relaxed">
          {tr(
            `把連結給你正在諮商的伴侶：他們配對後免費得到 Premium ${ref.premiumDays} 天，也能一鍵把你設為專屬心理師——之後他們整理的諮商摘要，你在「我輔導的伴侶」就能先讀。`,
            `Give the link to couples you already see: once paired they get ${ref.premiumDays} days of Premium free and can make you their dedicated therapist in one tap — then you can read the summaries they compile under "Couples I support" before each session.`,
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-md border border-petal-rule bg-petal-cream px-3 py-1.5 font-mono text-base tracking-widest text-petal-ink" data-testid="therapist-referral-code">
          {ref.code}
        </code>
        <button type="button" onClick={() => copy(ref.link, 'link')}
          className="inline-flex items-center gap-1.5 rounded-full border border-petal-rule px-3 py-1.5 font-body text-xs text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink">
          <Copy className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('複製連結', 'Copy link')}
        </button>
        <button type="button" onClick={() => copy(shareText, 'message')}
          className="inline-flex items-center gap-1.5 rounded-full border border-petal-rule px-3 py-1.5 font-body text-xs text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink">
          <Copy className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('複製邀請訊息', 'Copy invite message')}
        </button>
        <button type="button" onClick={lineShare}
          className="inline-flex items-center gap-1.5 rounded-full bg-petal-ink text-petal-cream px-3 py-1.5 font-body text-xs hover:bg-pink-700">
          <Share2 className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('用 LINE 傳', 'Share on LINE')}
        </button>
      </div>
      <p className="font-body text-[11px] text-petal-muted">
        {tr('個案也可以在「升級」頁的優惠碼欄位輸入這組代碼。', 'Clients can also type this code into the coupon box on the Upgrade page.')}
      </p>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-petal-rule bg-petal-cream p-3">
          <div className="font-display text-2xl text-petal-ink">{ref.joined}</div>
          <div className="font-body text-[11px] text-petal-muted">{tr('透過你加入', 'Joined via you')}</div>
        </div>
        <div className="rounded-md border border-petal-rule bg-petal-cream p-3">
          <div className="font-display text-2xl text-pink-600">{ref.rewarded}</div>
          <div className="font-body text-[11px] text-petal-muted">{tr('已配對並領取', 'Paired & claimed')}</div>
        </div>
        <div className="rounded-md border border-petal-rule bg-petal-cream p-3">
          <div className="font-display text-2xl text-petal-ink">{ref.standardFeeRate}%</div>
          <div className="font-body text-[11px] text-petal-muted">{tr('目前一般平台費', 'Current standard fee')}</div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between font-body text-xs text-petal-ink-soft mb-1">
          <span>{tr(`平台費減免 ${ref.feeDiscount}%`, `Platform fee −${ref.feeDiscount} pts`)}</span>
          <span className="text-petal-muted">{tr(`上限 ${ref.discountMax}%`, `Max ${ref.discountMax} pts`)}</span>
        </div>
        <div className="h-2 rounded-full bg-petal-rule/60 overflow-hidden">
          <div className="h-full bg-pink-400" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="font-body text-[11px] text-petal-muted mt-1.5">
          {couplesToMax > 0
            ? tr(
              `每有一對伴侶透過你的連結配對並領取，視訊諮商平台費就再減 ${ref.discountPerCouple}%（最多減 ${ref.discountMax}%，平台費最低 ${ref.feeFloor}%）。再 ${couplesToMax} 對就到上限。`,
              `Each couple who pairs and claims through your link lowers your video-session platform fee by ${ref.discountPerCouple} pt (up to ${ref.discountMax} pts; the fee never goes below ${ref.feeFloor}%). ${couplesToMax} more couples to reach the max.`,
            )
            : tr(`已達減免上限，平台費最低 ${ref.feeFloor}%。謝謝你把方法帶回伴侶的日常！`, `You've reached the maximum discount (fee floor ${ref.feeFloor}%). Thank you for bringing the work into couples' everyday lives!`)}
        </p>
      </div>
    </div>
  );
};

export default TherapistReferralPanel;
