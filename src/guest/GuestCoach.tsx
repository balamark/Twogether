import React, { useEffect, useState } from 'react';
import { X, Sparkles, MessageCircle } from 'lucide-react';
import { tr } from '../i18n/tr';
import { trackAction } from '../utils/track';
import { guestPartnerNickname } from './guestMode';
import { GUEST_AI_LIMIT } from './guestAi';

// ─── 訪客模式：對話教練 (coach card) ─────────────────────────────────────────
// A small, non-blocking bottom card that walks the guest through the core loop
// in the REAL conversation view:
//   typing   → 「阿哲正在輸入…」
//   replied  → 阿哲回覆了 → 「請 AI 諮商師介入」 (opens the real 請 Luma 加入 flow)
//   counselor→ 諮商師加入了 → sign-up CTA (invite your real partner)
//   limit    → the 5 real-AI tries are used up (info, not an error) → sign-up
// Driven by window events from guestPartner.ts / guestRoutes.ts / guestAi.ts.

type CoachState =
  | { kind: 'typing'; eventId: string }
  | { kind: 'replied'; eventId: string }
  | { kind: 'counselor'; eventId: string }
  | { kind: 'limit' };

interface Props {
  onSignUp: () => void;
  /** Open a conversation in 說開一件事. */
  onOpenEvent: (eventId: string) => void;
}

const COUNSELOR_BUTTON = '[data-testid="event-ai-counselor-button"]';

const GuestCoach: React.FC<Props> = ({ onSignUp, onOpenEvent }) => {
  const [state, setState] = useState<CoachState | null>(null);

  useEffect(() => {
    const onPartner = (e: Event) => {
      const d = (e as CustomEvent<{ eventId: string; state: 'typing' | 'replied' }>).detail;
      if (!d?.eventId) return;
      setState({ kind: d.state, eventId: d.eventId });
      if (d.state === 'replied') trackAction('onboarding.guest.partner_replied');
    };
    const onCounselor = (e: Event) => {
      const d = (e as CustomEvent<{ eventId: string }>).detail;
      if (d?.eventId) setState({ kind: 'counselor', eventId: d.eventId });
      trackAction('onboarding.guest.counselor_posted');
    };
    const onUsage = (e: Event) => {
      const d = (e as CustomEvent<{ remaining?: number }>).detail;
      if (d?.remaining === 0) setState({ kind: 'limit' });
    };
    window.addEventListener('guest:partner', onPartner);
    window.addEventListener('guest:counselor', onCounselor);
    window.addEventListener('guest:ai-usage', onUsage);
    return () => {
      window.removeEventListener('guest:partner', onPartner);
      window.removeEventListener('guest:counselor', onCounselor);
      window.removeEventListener('guest:ai-usage', onUsage);
    };
  }, []);

  if (!state) return null;

  const inviteCounselor = (eventId: string) => {
    trackAction('onboarding.guest.coach_counselor');
    const btn = document.querySelector<HTMLButtonElement>(COUNSELOR_BUTTON);
    if (btn && !btn.disabled) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      btn.click();
      setState(null);
      return;
    }
    // Not inside that conversation right now: open it; the button is there.
    onOpenEvent(eventId);
  };

  const partner = guestPartnerNickname();
  let icon = <MessageCircle className="w-4 h-4 text-pink-600" strokeWidth={1.5} />;
  let title = '';
  let body = '';
  let action: React.ReactNode = null;

  if (state.kind === 'typing') {
    title = tr(`${partner}正在輸入…`, `${partner} is typing…`);
    body = tr('這是試玩伴侶，會像真人一樣回你。', 'This is the sample partner; they\'ll answer like a real person would.');
  } else if (state.kind === 'replied') {
    icon = <Sparkles className="w-4 h-4 text-violet-500" strokeWidth={1.5} />;
    title = tr(`${partner}回覆了`, `${partner} replied`);
    body = tr('不知道怎麼接？請 AI 諮商師看看你們兩個人的話，幫你們看見彼此真正的需要。', 'Not sure how to answer? Ask the AI counselor to read both of you and help you see what each of you really needs.');
    const eventId = state.eventId;
    action = (
      <button type="button" onClick={() => inviteCounselor(eventId)} data-testid="guest-coach-counselor"
        className="rounded-full bg-gradient-to-r from-violet-500 to-vivid-rose text-white px-4 py-1.5 font-body text-sm shadow-sm hover:opacity-95">
        {tr('請 AI 諮商師介入', 'Ask the AI counselor')}
      </button>
    );
  } else if (state.kind === 'counselor') {
    icon = <Sparkles className="w-4 h-4 text-violet-500" strokeWidth={1.5} />;
    title = tr('諮商師加入了 ✨', 'The counselor joined ✨');
    body = tr('說出口、被接住、一起看見彼此：這就是 Twogether。想和真正的另一半一起用？', 'Say it, be heard, see each other: that\'s Twogether. Want to use it with your real partner?');
    action = (
      <button type="button" onClick={() => { trackAction('onboarding.guest.coach_signup'); onSignUp(); }} data-testid="guest-coach-signup"
        className="rounded-full bg-petal-ink text-petal-cream px-4 py-1.5 font-body text-sm hover:bg-pink-700">
        {tr('免費註冊，邀請另一半', 'Sign up free & invite them')}
      </button>
    );
  } else {
    icon = <Sparkles className="w-4 h-4 text-petal-sage-deeper" strokeWidth={1.5} />;
    title = tr(`${GUEST_AI_LIMIT} 次真的 AI 已經用完`, `All ${GUEST_AI_LIMIT} real AI tries used`);
    body = tr('接下來的整理和諮商師建議會改用示範回應，還是可以繼續玩。免費註冊後每天都有 AI 額度。', 'From here, organizing and counselor advice use demo responses; you can keep playing. Sign up free for a daily AI allowance.');
    action = (
      <button type="button" onClick={() => { trackAction('onboarding.guest.limit_signup'); onSignUp(); }} data-testid="guest-coach-signup"
        className="rounded-full bg-petal-ink text-petal-cream px-4 py-1.5 font-body text-sm hover:bg-pink-700">
        {tr('免費註冊', 'Sign up free')}
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[65] flex justify-center px-4 pb-4 pointer-events-none safe-pb" role="status" aria-live="polite" data-testid="guest-coach" data-state={state.kind}>
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-petal-rule bg-petal-cream px-4 py-3 shadow-[0_12px_40px_-8px_rgba(42,37,32,0.35)]">
        <div className="flex items-start gap-2">
          <span className="mt-0.5">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="font-body text-sm font-medium text-petal-ink flex items-center gap-1.5">
              {title}
              {state.kind === 'typing' && (
                <span className="inline-flex gap-0.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full bg-petal-muted motion-safe:animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </span>
              )}
            </p>
            <p className="mt-0.5 font-body text-xs text-petal-ink-soft leading-relaxed">{body}</p>
            {action && <div className="mt-2">{action}</div>}
          </div>
          {state.kind !== 'typing' && (
            <button type="button" onClick={() => setState(null)} aria-label={tr('稍後再說', 'Maybe later')} className="p-1 -m-1 text-petal-muted hover:text-petal-ink" data-testid="guest-coach-close">
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GuestCoach;
