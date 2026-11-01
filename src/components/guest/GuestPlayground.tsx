import React, { useEffect, useState } from 'react';
import { Lock, PlayCircle, RotateCcw, Trash2, Sparkles } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { trackAction } from '../../utils/track';
import { useGuestStore, buildEmptyState } from './guestStore';
import { GUEST_FEATURES, type GuestFeatureId } from './guestFeatures';
import GuestTutorial from './GuestTutorial';
import { SoftenPanel, LoveLanguagePanel, MoodPanel, MemoriesPanel, RepairPanel } from './GuestFeatures';

// ─── 訪客試玩 (Guest Playground) ─────────────────────────────────────────────
// The logged-out, no-account way to actually USE Twogether instead of only
// looking at samples. Five single-player features, ranked by appeal, seeded
// with sample data on first landing, stored only in this tab's sessionStorage.
// See guestStore.ts for the privacy contract and guestFeatures.ts for ranking.

interface Props {
  onSignUp: () => void;
}

const PANELS: Record<GuestFeatureId, React.FC<React.ComponentProps<typeof SoftenPanel>>> = {
  soften: SoftenPanel,
  'love-language': LoveLanguagePanel,
  mood: MoodPanel,
  memories: MemoriesPanel,
  repair: RepairPanel,
};

const GuestPlayground: React.FC<Props> = ({ onSignUp }) => {
  const [state, update, reset] = useGuestStore();
  const [active, setActive] = useState<GuestFeatureId>('soften');
  const [showTour, setShowTour] = useState(() => !state.tutorialSeen);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => { trackAction('onboarding.guest.open'); }, []);

  const closeTour = (reason: 'done' | 'skip') => {
    setShowTour(false);
    update((s) => ({ ...s, tutorialSeen: true }));
    trackAction(`onboarding.guest.tour_${reason}`);
  };

  const choose = (id: GuestFeatureId) => {
    setActive(id);
    trackAction(`onboarding.guest.feature_${id.replace('-', '_')}`);
  };

  const clearAll = () => {
    // Empty slate (no samples) — 重置範例資料 is the way back to samples.
    update(() => buildEmptyState());
    setConfirmClear(false);
    trackAction('onboarding.guest.clear');
  };

  const Panel = PANELS[active];
  const activeMeta = GUEST_FEATURES.find((f) => f.id === active)!;

  return (
    <div className="max-w-2xl mx-auto py-4" data-testid="guest-playground">
      {showTour && <GuestTutorial onClose={closeTour} onStart={() => setActive('soften')} />}

      {/* Hero */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-petal-cream-2 text-pink-600 mb-3">
          <Sparkles className="w-5 h-5" strokeWidth={1.5} />
        </div>
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2">
          — {tr('免註冊試玩', 'Try it, no sign-up')}
        </div>
        <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-3">
          {tr('不用帳號，', 'No account, ')}<em className="not-italic font-light italic text-pink-600">{tr('先玩玩看', 'just play')}</em>
        </h2>
        <p className="font-body text-sm text-petal-ink-soft leading-relaxed max-w-md mx-auto">
          {tr('一個人也能用的 5 個功能，已經放好範例資料讓你直接點。', 'Five features that work solo, pre-filled with sample data so you can dive right in.')}
        </p>
      </div>

      {/* Privacy promise */}
      <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-petal-sage/40 bg-petal-sage/10 px-4 py-3" data-testid="guest-privacy-note">
        <Lock className="w-4 h-4 mt-0.5 shrink-0 text-petal-sage-deeper" strokeWidth={1.5} />
        <div className="flex-1">
          <p className="font-body text-sm text-petal-ink">
            {tr('你在這裡寫的一切只存在這個瀏覽器分頁，不會上傳到伺服器；關閉分頁就自動消失。', 'Everything you write here lives only in this browser tab. It\'s never uploaded, and it disappears when you close the tab.')}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" onClick={() => { setShowTour(true); trackAction('onboarding.guest.tour_replay'); }} className="inline-flex items-center gap-1 font-body text-xs text-petal-ink-soft hover:text-petal-ink underline underline-offset-2" data-testid="guest-replay-tour">
              <PlayCircle className="w-3.5 h-3.5" /> {tr('重看 30 秒教學', 'Replay the 30-second tour')}
            </button>
            <button type="button" onClick={() => { reset(); trackAction('onboarding.guest.reset'); }} className="inline-flex items-center gap-1 font-body text-xs text-petal-ink-soft hover:text-petal-ink underline underline-offset-2" data-testid="guest-reset">
              <RotateCcw className="w-3.5 h-3.5" /> {tr('重置範例資料', 'Reset sample data')}
            </button>
            {confirmClear ? (
              <span className="inline-flex items-center gap-2 font-body text-xs text-petal-ink">
                {tr('清除你寫的所有內容？', 'Erase everything you wrote?')}
                <button type="button" onClick={clearAll} className="text-vivid-rose-ink underline underline-offset-2" data-testid="guest-clear-confirm">{tr('清除', 'Erase')}</button>
                <button type="button" onClick={() => setConfirmClear(false)} className="text-petal-muted underline underline-offset-2">{tr('取消', 'Cancel')}</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} className="inline-flex items-center gap-1 font-body text-xs text-petal-ink-soft hover:text-petal-ink underline underline-offset-2" data-testid="guest-clear">
                <Trash2 className="w-3.5 h-3.5" /> {tr('清除我的資料', 'Erase my data')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ranked feature picker */}
      <div className="font-body text-[11px] font-medium uppercase tracking-[0.12em] text-petal-muted mb-2">
        {tr('一個人最好玩的 5 件事 · 依受歡迎程度', 'Top 5 things to do solo · ranked by popularity')}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-5" role="tablist">
        {GUEST_FEATURES.map((f) => {
          const on = f.id === active;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => choose(f.id)}
              className={`relative flex sm:flex-col items-center sm:items-start gap-2 sm:gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                on ? 'border-petal-ink bg-petal-ink text-petal-cream' : 'border-petal-rule bg-petal-cream hover:border-petal-ink text-petal-ink'
              }`}
              data-testid={`guest-feature-${f.id}`}
            >
              <span className={`font-body text-[10px] font-semibold ${on ? 'text-petal-rose-soft' : 'text-pink-600'}`}>#{f.rank}</span>
              <span className="text-lg leading-none">{f.emoji}</span>
              <span className="font-body text-[13px] font-medium leading-tight">{f.title}</span>
            </button>
          );
        })}
      </div>

      <p className="font-body text-sm text-petal-ink-soft mb-3">{activeMeta.hook}</p>
      {/* Remount on reset/clear so panel-local state (quiz step, last analysis) starts over. */}
      <Panel key={state.seededAt} state={state} update={update} />

      {/* Gate: why it stops here + what you can do + CTA (playbook three-part gate) */}
      <div className="mt-8 rounded-xl border border-petal-rule bg-petal-cream-2 px-5 py-4 text-center" data-testid="guest-signup-gate">
        <p className="font-display text-lg text-petal-ink mb-1">{tr('想讓另一半也看到？', 'Want your partner to see this too?')}</p>
        <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-3">
          {tr('試玩的內容只在這個分頁、只有你看得到。可以繼續玩；想跟 TA 配對、保存紀錄、讓 AI 依你們的對話給建議，就免費註冊一個帳號（試玩資料不會自動帶過去）。', 'Playground data stays in this tab, visible only to you. Keep playing as long as you like; to pair with your partner, keep your history and get AI advice on your real conversations, create a free account (playground data isn\'t carried over).')}
        </p>
        <button
          type="button"
          onClick={() => { trackAction('onboarding.guest.signup_click'); onSignUp(); }}
          className="rounded-full bg-petal-ink text-petal-cream px-6 py-2 font-body text-sm hover:bg-pink-700"
          data-testid="guest-signup"
        >
          {tr('免費註冊，邀請另一半 →', 'Sign up free & invite your partner →')}
        </button>
      </div>
    </div>
  );
};

export default GuestPlayground;
