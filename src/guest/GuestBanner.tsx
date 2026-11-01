import React, { useEffect, useState } from 'react';
import { Eye, PlayCircle, Sparkles } from 'lucide-react';
import { apiService } from '../services/api';
import { GUEST_AI_LIMIT } from './guestAi';
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
  const [aiLeft, setAiLeft] = useState<number | null>(null);

  // Real-AI tries left (5 per guest). Updated live after every guest AI call.
  useEffect(() => {
    let alive = true;
    apiService.getAiUsageToday().then((u) => { if (alive && u) setAiLeft(u.remaining); }).catch(() => {});
    const onUsage = (e: Event) => {
      const u = (e as CustomEvent<{ remaining?: number }>).detail;
      if (typeof u?.remaining === 'number') setAiLeft(u.remaining);
    };
    window.addEventListener('guest:ai-usage', onUsage);
    return () => { alive = false; window.removeEventListener('guest:ai-usage', onUsage); };
  }, []);

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
                `：每一頁都放好了範例情侶「${guestNickname()} ❤ ${guestPartnerNickname()}」的資料，隨意點、隨意改。內容只存在這個分頁；只有用 AI 時，那段文字會送去給 AI 產生回覆，不會被保存。`,
                `: every page is filled with a sample couple (${guestNickname()} ❤ ${guestPartnerNickname()}). Tap and change anything. It all stays in this tab; only when you use AI is that text sent to the AI for a reply, and it isn't stored.`,
              )}
              {aiLeft !== null && (
                <span className="mt-1 flex items-center gap-1 text-[12px] text-petal-ink-soft" data-testid="guest-ai-left">
                  <Sparkles className="w-3.5 h-3.5 text-pink-600" strokeWidth={1.5} />
                  {aiLeft > 0
                    ? tr(`還有 ${aiLeft}／${GUEST_AI_LIMIT} 次真的 AI 可以試（說開一件事、送出前情緒檢查、改寫、接住情緒）`, `${aiLeft} of ${GUEST_AI_LIMIT} real AI tries left (talk it through, pre-send check, rewrite, receive feelings)`)
                    : tr(`${GUEST_AI_LIMIT} 次 AI 試用已用完，之後改用示範回應；免費註冊每天都有 AI 額度。`, `All ${GUEST_AI_LIMIT} AI tries used — demo responses from here; sign up free for a daily AI allowance.`)}
                </span>
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
