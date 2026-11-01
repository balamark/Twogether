import React, { useEffect, useState } from 'react';
import { Eye, PlayCircle, RotateCcw } from 'lucide-react';
import { tr } from '../i18n/tr';
import { trackAction } from '../utils/track';
import GuestTutorial from './GuestTutorial';
import { guestNickname, guestPartnerNickname } from './guestMode';
import { GUEST_AI_LIMIT } from './guestAi';
import { resetGuestConversations } from './guestDb';
import { clearQueryCache } from '../services/queryCache';
import { clearResponseCache } from '../services/responseCache';

// Slim, always-visible strip while browsing in 訪客模式. It points the guest at
// the one thing worth trying (write your own frustration → AI organizes it →
// the sample partner replies → ask the AI counselor), says where the data lives,
// and keeps the exits in reach: the tour, 重新開始對話 and sign-up. It also owns
// the tour: auto-shown once per tab session (稍後再說 never re-fires it).

const TOUR_SEEN_KEY = 'tw_guest_tour_seen';

interface Props {
  onSignUp: () => void;
  /** Open 說開一件事 straight on the compose screen. */
  onStartConversation: () => void;
  /** Another modal (e.g. sign-in) is open: hide the tour and don't auto-start it. */
  suppressAutoTour?: boolean;
  /** Current app view: the tour auto-starts only on the landing page (home). */
  currentView: string;
}

function tourSeen(): boolean {
  try { return sessionStorage.getItem(TOUR_SEEN_KEY) === '1'; } catch { return false; }
}

const linkBtn = 'inline-flex items-center gap-1 font-body text-xs text-petal-ink-soft hover:text-petal-ink underline underline-offset-2';

const GuestBanner: React.FC<Props> = ({ onSignUp, onStartConversation, suppressAutoTour, currentView }) => {
  const [showTour, setShowTour] = useState(false);

  // Another modal (sign-in, pairing invite) took over: the tour steps aside
  // so it never covers that modal's buttons.
  useEffect(() => {
    if (suppressAutoTour) setShowTour(false);
  }, [suppressAutoTour]);

  // The tour steps aside once the visitor starts exploring: moving to another
  // view closes it, or cancels it before it opens (counts as 稍後再說, so it
  // doesn't auto-fire later this session).
  const [landingView] = useState(currentView);
  useEffect(() => {
    if (currentView === landingView) return;
    try { sessionStorage.setItem(TOUR_SEEN_KEY, '1'); } catch { /* ignore */ }
    setShowTour(false);
  }, [currentView, landingView]);

  useEffect(() => {
    // Auto-start only on a fresh landing on 今天 (a deep link or a visitor who
    // already moved on gets the tour from the banner's 30 秒教學 instead).
    if (suppressAutoTour || tourSeen() || currentView !== 'home' || currentView !== landingView) return;
    // Let the first page paint before the tour slides in.
    const t = window.setTimeout(() => setShowTour(true), 600);
    return () => window.clearTimeout(t);
  }, [suppressAutoTour, currentView, landingView]);

  const closeTour = (reason: 'done' | 'skip') => {
    setShowTour(false);
    try { sessionStorage.setItem(TOUR_SEEN_KEY, '1'); } catch { /* ignore */ }
    trackAction(`onboarding.guest.tour_${reason}`);
  };

  const restart = () => {
    resetGuestConversations();
    clearQueryCache();
    clearResponseCache();
    trackAction('onboarding.guest.restart_conversation');
    onStartConversation();
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
                `：寫下你自己的一件事，看 AI 怎麼幫你整理、試玩伴侶「${guestPartnerNickname()}」怎麼回，再請 AI 諮商師介入（送你 ${GUEST_AI_LIMIT} 次真的 AI）。你是「${guestNickname()}」，內容只存在這個分頁；用 AI 時那段文字只拿來產生回覆，不會被保存。`,
                `: write about something of your own, see how AI organizes it, how the sample partner ${guestPartnerNickname()} replies, then bring in the AI counselor (${GUEST_AI_LIMIT} real AI tries on us). You're ${guestNickname()}; it all stays in this tab, and text sent to the AI is only used for the reply, never stored.`,
              )}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 shrink-0 pl-6 sm:pl-0">
            <button type="button" onClick={() => { trackAction('onboarding.guest.start_conversation'); onStartConversation(); }}
              className="rounded-full bg-petal-ink text-petal-cream px-3.5 py-1 font-body text-xs hover:bg-pink-700" data-testid="guest-start-conversation">
              {tr('開始對話', 'Start a conversation')}
            </button>
            <button type="button" onClick={restart} className={linkBtn} data-testid="guest-restart-conversation">
              <RotateCcw className="w-3.5 h-3.5" /> {tr('重新開始對話', 'Start over')}
            </button>
            <button type="button" onClick={() => { setShowTour(true); trackAction('onboarding.guest.tour_replay'); }} className={linkBtn} data-testid="guest-replay-tour">
              <PlayCircle className="w-3.5 h-3.5" /> {tr('30 秒教學', '30-sec tour')}
            </button>
            <button type="button" onClick={() => { trackAction('onboarding.guest.signup_click'); onSignUp(); }} className={linkBtn} data-testid="guest-banner-signup">
              {tr('免費註冊保存', 'Sign up to keep it')}
            </button>
          </div>
        </div>
      </div>
      {showTour && <GuestTutorial onClose={closeTour} onStart={onStartConversation} />}
    </>
  );
};

export default GuestBanner;
