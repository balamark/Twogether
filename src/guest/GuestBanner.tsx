import React, { useEffect, useState } from 'react';
import { Eye, PlayCircle } from 'lucide-react';
import { tr } from '../i18n/tr';
import { trackAction } from '../utils/track';
import GuestTutorial from './GuestTutorial';
import { guestNickname, guestPartnerNickname } from './guestMode';

// Slim, always-visible strip while browsing in 訪客模式: says whose data this
// is (a sample couple), where it lives (this tab only), and keeps the two exits
// in reach — the 30-second tour and sign-up. It also owns the tour: auto-shown
// once per tab session on first landing (one blocking modal; 稍後再說 never
// re-fires it in the same session).

const TOUR_SEEN_KEY = 'tw_guest_tour_seen';

interface Props {
  onSignUp: () => void;
  onNavigate: (view: string) => void;
  /** Hold the auto tour while another modal (e.g. auth) is open. */
  suppressAutoTour?: boolean;
}

function tourSeen(): boolean {
  try { return sessionStorage.getItem(TOUR_SEEN_KEY) === '1'; } catch { return false; }
}

const GuestBanner: React.FC<Props> = ({ onSignUp, onNavigate, suppressAutoTour }) => {
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    if (suppressAutoTour || tourSeen()) return;
    // Let the first page paint before the tour slides in.
    const t = window.setTimeout(() => setShowTour(true), 600);
    return () => window.clearTimeout(t);
  }, [suppressAutoTour]);

  const closeTour = (reason: 'done' | 'skip') => {
    setShowTour(false);
    try { sessionStorage.setItem(TOUR_SEEN_KEY, '1'); } catch { /* ignore */ }
    trackAction(`onboarding.guest.tour_${reason}`);
  };

  return (
    <>
      <div className="max-w-6xl mx-auto mb-4" data-testid="guest-banner">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-petal-sage/50 bg-petal-sage/10 px-4 py-2.5">
          <p className="flex-1 flex items-start gap-2 font-body text-[13px] text-petal-ink leading-snug">
            <Eye className="w-4 h-4 mt-0.5 shrink-0 text-petal-sage-deeper" strokeWidth={1.5} />
            <span>
              <strong className="font-medium">{tr('試玩模式', 'Guest preview')}</strong>
              {tr(
                `：每一頁都放好了範例情侶「${guestNickname()} ❤ ${guestPartnerNickname()}」的資料，隨意點、隨意改。內容只存在這個分頁，不會上傳。`,
                `: every page is filled with a sample couple (${guestNickname()} ❤ ${guestPartnerNickname()}). Tap and change anything. It all stays in this tab and is never uploaded.`,
              )}
            </span>
          </p>
          <div className="flex items-center gap-3 shrink-0 pl-6 sm:pl-0">
            <button
              type="button"
              onClick={() => { setShowTour(true); trackAction('onboarding.guest.tour_replay'); }}
              className="inline-flex items-center gap-1 font-body text-xs text-petal-ink-soft hover:text-petal-ink underline underline-offset-2"
              data-testid="guest-replay-tour"
            >
              <PlayCircle className="w-3.5 h-3.5" /> {tr('30 秒教學', '30-sec tour')}
            </button>
            <button
              type="button"
              onClick={() => { trackAction('onboarding.guest.signup_click'); onSignUp(); }}
              className="rounded-full bg-petal-ink text-petal-cream px-3.5 py-1 font-body text-xs hover:bg-pink-700"
              data-testid="guest-banner-signup"
            >
              {tr('免費註冊保存', 'Sign up to keep it')}
            </button>
          </div>
        </div>
      </div>
      {showTour && <GuestTutorial onClose={closeTour} onNavigate={onNavigate} />}
    </>
  );
};

export default GuestBanner;
