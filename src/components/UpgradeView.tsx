import React, { useEffect, useState } from 'react';
import { Sparkles, Check, Crown, Ticket } from 'lucide-react';
import { apiService, type BillingStatus, type BillingPlan, type PaymentProvider } from '../services/api';
import PaymentMethodPicker from './PaymentMethodPicker';

type Notify = (n: { type: 'success' | 'error' | 'info' | 'warning'; title: string; message: string; duration?: number }) => void;

interface UpgradeViewProps {
  // Optional message explaining why the user landed here (e.g. a usage cap
  // they just hit). Shown as a banner above the plans.
  reason?: string | null;
  showNotification?: Notify;
  // Fired after a coupon is successfully redeemed (couple is now premium) so the
  // host can resume whatever the user was blocked from doing (e.g. re-open the
  // script upload they hit the cap on).
  onRedeemed?: (info: { days: number; expiresAt: string | null }) => void;
}

// What premium lifts. Kept in sync with lib/entitlements.js FEATURE_LIMITS.
const PREMIUM_PERKS = [
  '每日 AI 整理／改寫次數大幅提升',
  '無限建立自訂角色扮演劇本',
  '無限上傳照片',
];

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

const UpgradeView: React.FC<UpgradeViewProps> = ({ reason, showNotification, onRedeemed }) => {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [provider, setProvider] = useState<PaymentProvider>('ecpay');
  const [couponCode, setCouponCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await apiService.getBillingStatus();
        if (!cancelled) setStatus(s);
      } catch (err) {
        if (!cancelled) {
          showNotification?.({ type: 'error', title: '載入失敗', message: (err as Error)?.message || '請稍後再試', duration: 5000 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showNotification]);

  const handleUpgrade = async (plan: BillingPlan['id']) => {
    if (status && !status.hasCouple) {
      showNotification?.({ type: 'info', title: '尚未配對', message: '完成情侶配對後即可升級 Premium', duration: 5000 });
      return;
    }
    setCheckoutPlan(plan);
    try {
      // On success the browser navigates to the gateway and this view unmounts.
      await apiService.startCheckout(plan, provider);
    } catch (err) {
      setCheckoutPlan(null);
      showNotification?.({ type: 'error', title: '無法付款', message: (err as Error)?.message || '請稍後再試', duration: 6000 });
    }
  };

  const handleRedeem = async () => {
    const code = couponCode.trim();
    if (!code || redeeming) return;
    setRedeeming(true);
    try {
      const result = await apiService.redeemCoupon(code);
      setCouponCode('');
      // Refresh status so the "Premium 會員" banner appears immediately.
      try {
        const s = await apiService.getBillingStatus();
        setStatus(s);
      } catch {
        /* non-fatal: the grant succeeded regardless of this re-fetch */
      }
      showNotification?.({
        type: 'success',
        title: '優惠碼已套用',
        message: `已啟用 Premium ${result.days} 天，所有功能都解鎖了！`,
        duration: 6000,
      });
      onRedeemed?.(result);
    } catch (err) {
      // err.message carries the specific backend reason (優惠碼無效 / 已過期 /
      // 已被兌換完畢 / 你們已經使用過這組優惠碼了) — show it verbatim.
      showNotification?.({
        type: 'error',
        title: '無法套用優惠碼',
        message: (err as Error)?.message || '請確認優惠碼是否正確後再試一次',
        duration: 6000,
      });
    } finally {
      setRedeeming(false);
    }
  };

  const isPremium = status?.tier === 'premium';
  const plans = status?.plans ?? [];

  return (
    <div className="max-w-3xl mx-auto" data-testid="upgrade-view">
      <div className="text-center mb-8">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — Premium
        </div>
        <h2 className="font-display text-4xl font-light tracking-tight text-petal-ink leading-tight mb-3">
          升級 <em className="not-italic italic text-pink-600">Twogether Premium</em>
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          解除免費方案的使用上限，為你們的關係解鎖全部功能。
        </p>
      </div>

      {reason && (
        <div
          className="mb-6 rounded-md border border-pink-200 bg-pink-50 px-4 py-3 text-center"
          data-testid="upgrade-reason"
        >
          <p className="font-body text-sm text-pink-700">{reason}</p>
        </div>
      )}

      {isPremium && (
        <div
          className="mb-8 rounded-md border border-petal-rule bg-petal-cream-2 px-5 py-4 flex items-center justify-center space-x-2"
          data-testid="premium-active-banner"
        >
          <Crown className="w-4 h-4 text-pink-600" strokeWidth={1.5} />
          <span className="font-body text-sm text-petal-ink">
            目前為 Premium 會員{status?.expiresAt ? `，有效期至 ${formatDate(status.expiresAt)}` : ''}
          </span>
        </div>
      )}

      {/* Perks */}
      <div className="mb-8 rounded-md border border-petal-rule bg-petal-cream p-5">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">
          Premium 包含
        </div>
        <ul className="space-y-2">
          {PREMIUM_PERKS.map((perk) => (
            <li key={perk} className="flex items-start space-x-2">
              <Check className="w-4 h-4 mt-0.5 text-petal-sage-deep shrink-0" strokeWidth={1.75} />
              <span className="font-body text-sm text-petal-ink-soft">{perk}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Payment method */}
      <div className="mb-4">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
          付款方式
        </div>
        <PaymentMethodPicker value={provider} onChange={setProvider} disabled={checkoutPlan !== null} />
      </div>

      {/* Plans */}
      {loading ? (
        <div className="text-center py-10 font-body text-sm text-petal-muted">載入中…</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((plan) => {
            const monthly = Math.round(plan.amount / (plan.days / 30));
            const busy = checkoutPlan === plan.id;
            return (
              <div
                key={plan.id}
                className="rounded-md border border-petal-rule bg-petal-cream p-5 flex flex-col text-center"
                data-testid={`plan-${plan.id}`}
              >
                <div className="font-display text-lg font-light text-petal-ink mb-1">{plan.days} 天</div>
                <div className="font-display text-3xl font-light text-petal-ink mb-1">
                  NT${plan.amount}
                </div>
                <div className="font-body text-xs text-petal-muted mb-5">約 NT${monthly}／月</div>
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={busy || checkoutPlan !== null}
                  data-testid={`upgrade-button-${plan.id}`}
                  className={`mt-auto w-full py-2.5 rounded-md font-display italic text-base transition-colors ${
                    busy || checkoutPlan !== null
                      ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                      : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
                  }`}
                >
                  {busy ? '前往付款…' : isPremium ? '續購' : '升級'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Coupon redemption */}
      <div className="mt-8 rounded-md border border-petal-rule bg-petal-cream p-5" data-testid="coupon-section">
        <div className="flex items-center space-x-2 mb-3">
          <Ticket className="w-4 h-4 text-pink-600" strokeWidth={1.5} />
          <span className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted">
            有優惠碼？
          </span>
        </div>
        <p className="font-display italic font-light text-sm text-petal-muted mb-3">
          輸入優惠碼，立即免費啟用 Premium。
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRedeem(); }}
            placeholder="輸入優惠碼"
            data-testid="coupon-input"
            disabled={redeeming}
            autoCapitalize="characters"
            className="flex-1 px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal disabled:opacity-60"
          />
          <button
            onClick={handleRedeem}
            disabled={redeeming || couponCode.trim() === ''}
            data-testid="coupon-redeem-button"
            className={`px-5 py-2.5 rounded-md font-display italic text-sm transition-colors ${
              redeeming || couponCode.trim() === ''
                ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
            }`}
          >
            {redeeming ? '套用中…' : '套用'}
          </button>
        </div>
      </div>

      <p className="mt-6 text-center font-body text-xs text-petal-muted flex items-center justify-center space-x-1.5">
        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
        <span>支援信用卡、LINE Pay、ATM 與超商 · 由綠界 ECPay 或藍新金流安全付款 · 一次性購買，不自動續約</span>
      </p>
    </div>
  );
};

// Landing screen ECPay returns the browser to (path /billing/result). The pass
// was already granted server-to-server; here we just re-check status and report.
export const BillingResultView: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const params = new URLSearchParams(window.location.search);
  const declaredOk = params.get('status') !== 'failed';
  const [checking, setChecking] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await apiService.getBillingStatus();
        if (!cancelled) {
          setIsPremium(s.tier === 'premium');
          setExpiresAt(s.expiresAt);
        }
      } catch {
        /* fall back to the declared status from the URL */
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const success = isPremium || (declaredOk && !checking);

  return (
    <div className="min-h-screen bg-petal-cream flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center bg-petal-cream rounded-md border border-petal-rule shadow-petal p-8">
        {checking ? (
          <p className="font-body text-sm text-petal-muted py-6">確認付款結果中…</p>
        ) : success ? (
          <>
            <Crown className="w-8 h-8 text-pink-600 mx-auto mb-3" strokeWidth={1.5} />
            <h2 className="font-display text-2xl font-light text-petal-ink mb-2">付款成功</h2>
            <p className="font-body text-sm text-petal-ink-soft mb-1">感謝升級 Premium！</p>
            {expiresAt && (
              <p className="font-body text-sm text-petal-muted mb-6">
                有效期至 {formatDate(expiresAt)}
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl font-light text-petal-ink mb-2">付款未完成</h2>
            <p className="font-body text-sm text-petal-ink-soft mb-6">
              這次沒有完成付款，你可以稍後再試一次。
            </p>
          </>
        )}
        {!checking && (
          <button
            onClick={onDone}
            data-testid="billing-result-done"
            className="w-full py-3 rounded-md bg-petal-ink text-petal-cream hover:bg-pink-700 transition-colors font-display italic text-base"
          >
            返回 Twogether →
          </button>
        )}
      </div>
    </div>
  );
};

export default UpgradeView;
