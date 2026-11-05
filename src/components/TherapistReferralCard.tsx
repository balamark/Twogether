import React, { useCallback, useEffect, useState } from 'react';
import { Gift, X } from 'lucide-react';
import { apiService, type TherapistReferralPreview } from '../services/api';
import type { Notification } from './ErrorNotification';
import { tr } from '../i18n/tr';
import { trackAction } from '../utils/track';
import { captureTherapistRefFromUrl, clearTherapistRef, readTherapistRef } from '../utils/therapistRef';

// 諮商師專屬邀請碼 — the couple-side card for someone who arrived through their
// therapist's `?tref=` link. Inline and non-blocking (never a modal): a guest
// sees who invited them + a sign-up CTA; a signed-in user claims the Premium
// month and may add the therapist as 專屬心理師 in the same tap.

const DISMISS_KEY = 'tw_therapist_ref_dismissed';

interface Props {
  isAuthenticated: boolean;
  isGuest: boolean;
  partnerConnected: boolean;
  onSignUp: () => void;
  onClaimed: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}

const TherapistReferralCard: React.FC<Props> = ({
  isAuthenticated, isGuest, partnerConnected, onSignUp, onClaimed, showNotification,
}) => {
  const [code, setCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<TherapistReferralPreview | null>(null);
  const [makeDedicated, setMakeDedicated] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  // Read ?tref= once (it also survives sign-up via localStorage).
  useEffect(() => {
    const fromUrl = captureTherapistRefFromUrl();
    if (fromUrl) trackAction('growth.therapist_ref.landing');
    setCode(fromUrl || readTherapistRef());
  }, []);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    apiService.previewTherapistReferral(code)
      .then((p) => {
        if (!alive) return;
        setPreview(p);
        trackAction(isAuthenticated && !isGuest ? 'growth.therapist_ref.card_view_user' : 'growth.therapist_ref.card_view_guest');
      })
      .catch((err: Error & { error_code?: string }) => {
        if (!alive) return;
        if (err?.error_code === 'THERAPIST_REF_INVALID') {
          clearTherapistRef();
          setCode(null);
          showNotification({
            type: 'warning',
            title: tr('邀請碼無法使用', 'Invite code not usable'),
            message: err.message || tr('這組諮商師邀請碼無效或已停用，請和你的諮商師確認代碼', 'This counselor invite code is invalid or no longer active. Please double-check it with your counselor.'),
            duration: 6000,
          });
        }
        // Network hiccup: keep the code and try again on the next load.
      });
    return () => { alive = false; };
    // The preview doesn't depend on auth; re-fetching on login is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, showNotification]);

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    trackAction('growth.therapist_ref.later');
  };

  const claim = useCallback(async () => {
    if (!code || claiming) return;
    setClaiming(true);
    trackAction('growth.therapist_ref.claim_click');
    try {
      const result = await apiService.claimTherapistReferral(code, partnerConnected && makeDedicated);
      // The server now remembers the referral (and grants the month at pairing
      // if needed), so the local copy is no longer needed in any outcome.
      clearTherapistRef();
      setCode(null);
      const name = result.therapist?.displayName || preview?.therapist.displayName || '';
      if (result.status === 'rewarded') {
        showNotification({
          type: 'success',
          title: tr(`Premium ${result.days} 天已啟用`, `${result.days} days of Premium are on`),
          message: result.dedicatedSet
            ? tr(`這是 ${name} 送你們的。${name} 也已成為你們的專屬心理師，之後整理的諮商摘要對方可以先讀。`, `A gift from ${name}, who is now your dedicated therapist and can read the summaries you compile ahead of each session.`)
            : tr(`這是 ${name} 送你們的。`, `A gift from ${name}.`),
          duration: 7000,
        });
        onClaimed();
      } else {
        showNotification({
          type: 'info',
          title: result.status === 'pending_pair'
            ? tr('邀請已記下', 'Invite saved')
            : tr('這份禮物已經領過了', 'Already claimed'),
          message: result.message,
          duration: 7000,
        });
        if (result.dedicatedSet) onClaimed();
      }
    } catch (err) {
      showNotification({
        type: 'error',
        title: tr('領取失敗', 'Couldn\'t claim'),
        message: err instanceof Error ? err.message : tr('請稍後再試；邀請碼會保留，下次打開 App 會自動再試', 'Please try again — your code is kept and we\'ll retry next time you open the app'),
        duration: 6000,
      });
    } finally {
      setClaiming(false);
    }
  }, [code, claiming, partnerConnected, makeDedicated, preview, showNotification, onClaimed]);

  if (!code || !preview || dismissed) return null;
  const name = preview.therapist.displayName;
  const days = preview.premiumDays;
  const signedIn = isAuthenticated && !isGuest;

  return (
    <div className="max-w-6xl mx-auto mb-4" data-testid="therapist-referral-card">
      <div className="relative rounded-md border border-pink-200 bg-pink-50/60 px-4 py-3">
        <button type="button" onClick={dismiss} aria-label={tr('稍後再說', 'Later')}
          className="absolute top-2 right-2 p-1 text-petal-muted hover:text-petal-ink">
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <div className="flex items-start gap-3 pr-6">
          {preview.therapist.photoUrl ? (
            <img src={preview.therapist.photoUrl} alt="" className="w-10 h-10 rounded-full object-contain bg-petal-cream-2 shrink-0" />
          ) : (
            <Gift className="w-6 h-6 mt-0.5 text-pink-600 shrink-0" strokeWidth={1.5} />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-body text-[13px] text-petal-ink leading-snug">
              <strong className="font-medium">
                {tr(`${name} 送你們 Premium ${days} 天`, `${name} is giving you ${days} days of Premium`)}
              </strong>
              {tr(
                '：在諮商之間記下發生的事、用 AI 把話說對，再把整理好的諮商摘要帶進下一次諮商。',
                ': log what happens between sessions, let AI help you say it well, and bring a tidy summary into your next session.',
              )}
            </p>

            {signedIn ? (
              <>
                {partnerConnected ? (
                  <label className="mt-2 flex items-start gap-2 font-body text-xs text-petal-ink-soft cursor-pointer">
                    <input type="checkbox" checked={makeDedicated} onChange={(e) => setMakeDedicated(e.target.checked)}
                      className="mt-0.5" data-testid="therapist-referral-dedicated" />
                    <span>
                      {tr(
                        `同時把 ${name} 設為專屬心理師（可以讀你們的牆、好好說話與諮商摘要，不能留言；隨時可在「心理諮商」解除）`,
                        `Also make ${name} your dedicated therapist (can read your wall, conversations and summaries, can't comment; remove anytime under Counseling)`,
                      )}
                    </span>
                  </label>
                ) : (
                  <p className="mt-2 font-body text-xs text-petal-muted">
                    {tr(
                      `還沒和另一半配對：先領取，配對成功後 Premium 會自動送到；之後也能在「心理諮商」把 ${name} 設為專屬心理師。`,
                      `Not paired yet: claim now and the Premium arrives automatically once you pair. You can add ${name} as your dedicated therapist under Counseling later.`,
                    )}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={claim} disabled={claiming} data-testid="therapist-referral-claim"
                    className="rounded-full bg-petal-ink text-petal-cream px-4 py-1.5 font-body text-xs hover:bg-pink-700 disabled:opacity-50">
                    {claiming ? tr('領取中…', 'Claiming…') : tr(`領取 Premium ${days} 天`, `Claim ${days} days of Premium`)}
                  </button>
                  <button type="button" onClick={dismiss} className="font-body text-xs text-petal-muted hover:text-petal-ink">
                    {tr('稍後再說', 'Later')}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                <button type="button" data-testid="therapist-referral-signup"
                  onClick={() => { trackAction('growth.therapist_ref.signup_click'); onSignUp(); }}
                  className="rounded-full bg-petal-ink text-petal-cream px-4 py-1.5 font-body text-xs hover:bg-pink-700">
                  {tr('免費註冊領取', 'Sign up free to claim')}
                </button>
                <span className="font-body text-[11px] text-petal-muted">
                  {tr('先逛逛也可以，邀請碼會幫你保留。', 'Feel free to look around first — we\'ll keep your code.')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TherapistReferralCard;
