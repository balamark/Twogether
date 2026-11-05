import React, { useEffect, useMemo, useState } from 'react';
import { X, ChevronRight, ChevronLeft, Lock } from 'lucide-react';
import { tr } from '../i18n/tr';

// ─── 30 秒看懂：訪客模式教學動畫 ─────────────────────────────────────────────
// Shown once per tab session when a visitor lands in 訪客模式. A story-style,
// auto-advancing walkthrough of the ONE loop the guest preview is about:
//   1. 寫下你的想法 — your own words, as raw as they are.
//   2. AI 整理成三種版本 — real AI (1 of the 5 tries).
//   3. 試玩伴侶回覆 — the sample partner answers like a real person.
//   4. 請 AI 諮商師介入 — real AI counselor (1 of the 5 tries).
// then a privacy outro. Each scene is a tiny animated mock (CSS keyframes in
// tailwind.config.js: guest-rise / guest-pop / guest-type / guest-progress).
// The progress bar's animationend drives the auto-advance, so pressing (which
// pauses the bar) pauses the tour. Reduced motion: static, tap to advance.

const SCENE_MS = 3600;

interface Props {
  onClose: (reason: 'done' | 'skip') => void;
  /** Open 說開一件事 on the compose screen (「去試試」/「開始」). */
  onStart: () => void;
}

const STEPS = [
  { emoji: '✍️', title: tr('寫下你的想法', 'Write what\'s on your mind'), hook: tr('想罵、想抱怨都可以，不會直接傳給對方。', 'Vent or complain; it isn\'t sent to them as is.') },
  { emoji: '🪄', title: tr('AI 整理成三種說法', 'AI shapes it three ways'), hook: tr('平靜、堅定、溫柔，挑一個對方聽得進去的版本送出。', 'Neutral, firm or warm: pick the one they can actually hear.') },
  { emoji: '💬', title: tr('試玩伴侶會回你', 'The sample partner replies'), hook: tr('就像真的另一半：在乎你，但也會先解釋一下。', 'Like a real partner: cares, but explains first.') },
  { emoji: '🫶', title: tr('請 AI 諮商師介入', 'Bring in the AI counselor'), hook: tr('看見你們兩個人底下的需要，給雙方好開口的下一步。', 'Sees what each of you needs underneath and gives you both an easy next step.') },
];

const d = (ms: number): React.CSSProperties => ({ animationDelay: `${ms}ms` });

const Bubble: React.FC<{ tone: 'hot' | 'soft'; children: React.ReactNode; style?: React.CSSProperties; className?: string }> = ({ tone, children, style, className = '' }) => (
  <div
    style={style}
    className={`max-w-[88%] rounded-2xl px-3 py-2 font-body text-[13px] leading-snug ${
      tone === 'hot' ? 'bg-vivid-rose-soft text-vivid-rose-ink border border-vivid-rose/30 self-end' : 'bg-petal-sage/20 text-petal-ink border border-petal-sage/40 self-start'
    } ${className}`}
  >
    {children}
  </div>
);

function WriteScene() {
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl border border-petal-rule bg-white px-3 py-2 motion-safe:animate-guest-rise">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-1">{tr('你輸入的內容（不會直接傳給對方）', 'What you write (not sent as is)')}</div>
        <span className="inline-block overflow-hidden whitespace-nowrap align-bottom motion-safe:animate-guest-type max-w-full font-body text-[13px] text-vivid-rose-ink">
          {tr('你每次都說好要早點回來，又不回訊息！', 'You always say you\'ll be early, then don\'t text!')}
        </span>
      </div>
      <div className="self-end rounded-full bg-petal-ink text-petal-cream px-3 py-1 font-body text-xs motion-safe:animate-guest-pop" style={d(1500)}>
        {tr('讓 AI 整理', 'Let AI organize it')}
      </div>
    </div>
  );
}

function VersionsScene() {
  const rows = [
    [tr('平靜', 'Neutral'), tr('昨天約七點，你八點才到，中間沒有訊息。', 'We said 7; you came at 8, no message.')],
    [tr('堅定', 'Firm'), tr('遲到又不回訊息讓我很不舒服，下次請先說。', 'Late with no text bothers me. Tell me first next time.')],
    [tr('溫柔', 'Warm'), tr('等你的時候我有點失落，下次會晚可以先說一聲嗎？', 'I felt let down waiting. Could you text if you\'ll be late?')],
  ];
  return (
    <div className="space-y-1.5">
      {rows.map(([label, text], i) => (
        <div key={label} className={`rounded-xl border px-3 py-1.5 font-body text-[12px] motion-safe:animate-guest-rise ${i === 2 ? 'border-pink-500 bg-petal-rose-soft/30 text-petal-ink' : 'border-petal-rule bg-white text-petal-ink-soft'}`} style={d(i * 350)}>
          <span className="font-medium mr-1">{label}</span>{text}
          {i === 2 && <span className="ml-1 inline-block motion-safe:animate-guest-pop" style={d(1600)}>✓</span>}
        </div>
      ))}
    </div>
  );
}

function PartnerScene() {
  return (
    <div className="flex flex-col gap-2">
      <Bubble tone="hot" className="motion-safe:animate-guest-rise">{tr('等你的時候我有點失落，下次會晚可以先說一聲嗎？', 'I felt let down waiting. Could you text if you\'ll be late?')}</Bubble>
      <div className="self-start flex items-center gap-1 rounded-2xl bg-white border border-petal-rule px-3 py-2 motion-safe:animate-guest-rise" style={d(600)}>
        {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-petal-muted motion-safe:animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
      </div>
      <Bubble tone="soft" className="motion-safe:animate-guest-rise" style={d(1700)}>
        {tr('我不是故意的，那時候被主管叫住…但我知道你等很久。', 'I didn\'t mean to, my boss caught me… but I know you waited ages.')}
      </Bubble>
    </div>
  );
}

function CounselorScene() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-full bg-gradient-to-r from-violet-500 to-vivid-rose text-white px-4 py-1.5 font-body text-xs shadow-sm motion-safe:animate-guest-pop">
        {tr('✨ 請 Luma 加入', '✨ Invite Luma')}
      </div>
      <div className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 font-body text-[12px] text-petal-ink leading-relaxed motion-safe:animate-guest-rise" style={d(900)}>
        <div className="text-[10px] text-violet-600 mb-0.5">🫶 {tr('AI 諮商師', 'AI counselor')}</div>
        {tr('你想要的是「被放在心上」，他想讓你知道「不是不在乎」。試著先接住彼此的這一句。', 'You want to feel "on their mind"; he wants you to know "it\'s not that I don\'t care". Try receiving that first.')}
      </div>
    </div>
  );
}

function PrivacyScene() {
  return (
    <div className="text-center py-2">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-petal-sage/20 motion-safe:animate-guest-pop">
        <Lock className="h-6 w-6 text-petal-sage-deeper" strokeWidth={1.5} />
      </div>
      <p className="font-body text-[13px] text-petal-ink leading-relaxed motion-safe:animate-guest-rise" style={d(400)}>
        {tr('不用註冊，送你 5 次真的 AI（整理和諮商師各算一次）。你寫的內容只存在這個瀏覽器分頁，關掉就消失；送去給 AI 的文字只拿來產生回覆，不會被保存。', 'No sign-up, and 5 real AI tries on us (organizing and the counselor each use one). What you write stays in this browser tab and is gone when you close it; text sent to the AI is only used for the reply, never stored.')}
      </p>
      <p className="mt-2 font-body text-[11px] text-petal-muted motion-safe:animate-guest-rise" style={d(900)}>
        {tr('想留下紀錄、邀請另一半？隨時按右上角「登入 / 註冊」；已經有帳號的話也從那裡登入。', 'Want to keep it and invite your partner? Tap "Sign in / Sign up" at the top right any time. Already have an account? Sign in there too.')}
      </p>
    </div>
  );
}

const SCENES: (() => React.ReactNode)[] = [WriteScene, VersionsScene, PartnerScene, CounselorScene];

const GuestTutorial: React.FC<Props> = ({ onClose, onStart }) => {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = SCENES.length + 1; // + privacy outro
  const reducedMotion = useMemo(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose('skip');
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(total - 1, i + 1));
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, total]);

  const isOutro = idx === total - 1;
  const feature = STEPS[idx];
  const next = () => (isOutro ? onClose('done') : setIdx((i) => i + 1));

  return (
    // Non-blocking bottom card: the page (and the header's sign-up button) stays
    // usable behind it, so the tour never stands between a visitor and the app.
    <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-4 pointer-events-none safe-pb" role="dialog" aria-modal="false" aria-label={tr('試玩教學', 'Guest tour')} data-testid="guest-tutorial">
      <div
        className="pointer-events-auto w-full max-w-sm rounded-2xl bg-petal-cream border border-petal-rule shadow-[0_12px_40px_-8px_rgba(42,37,32,0.35)] overflow-hidden"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {/* Story-style progress bars */}
        <div className="flex gap-1 px-4 pt-4">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full bg-petal-rule-soft overflow-hidden">
              {i < idx && <div className="h-full w-full bg-petal-ink" />}
              {i === idx && (
                <div
                  key={`p-${idx}`}
                  className={`h-full bg-petal-ink ${reducedMotion ? 'w-full' : 'w-0 animate-guest-progress'}`}
                  style={reducedMotion ? undefined : { animationDuration: `${SCENE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                  onAnimationEnd={() => { if (!isOutro) setIdx((i2) => i2 + 1); }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 pt-3">
          <span className="font-body text-[10px] font-medium uppercase tracking-[0.16em] text-petal-muted">
            {isOutro ? tr('30 秒看懂 · 最後一步', '30-second tour · last step') : tr(`30 秒看懂 · 第 ${idx + 1} 步`, `30-second tour · step ${idx + 1}`)}
          </span>
          <button type="button" onClick={() => onClose('skip')} aria-label={tr('關閉', 'Close')} className="p-1 text-petal-muted hover:text-petal-ink" data-testid="guest-tutorial-close">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-4 pt-1 pb-2">
          <h3 className="font-display text-xl text-petal-ink">
            {isOutro ? tr('你的資料，只留在這裡', 'Your data stays right here') : `${feature.emoji} ${feature.title}`}
          </h3>
          {!isOutro && <p className="mt-0.5 font-body text-xs text-petal-ink-soft leading-relaxed">{feature.hook}</p>}
        </div>

        {/* key forces the CSS animations to replay on every scene change */}
        <div key={idx} className="mx-4 mb-4 min-h-[188px] rounded-xl bg-petal-cream-2 p-3 flex flex-col justify-center" data-testid={`guest-tutorial-scene-${idx}`}>
          {isOutro ? <PrivacyScene /> : SCENES[idx]()}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-petal-rule px-4 py-3">
          <button type="button" onClick={() => onClose('skip')} className="font-body text-xs text-petal-muted hover:text-petal-ink" data-testid="guest-tutorial-later">
            {tr('稍後再說', 'Maybe later')}
          </button>
          <div className="flex items-center gap-1.5">
            {idx > 0 && (
              <button type="button" onClick={() => setIdx((i) => i - 1)} aria-label={tr('上一步', 'Back')} className="p-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:text-petal-ink">
                <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
            {isOutro ? (
              <button type="button" onClick={() => { onStart(); onClose('done'); }} className="rounded-full bg-petal-ink text-petal-cream px-4 py-1.5 font-body text-sm hover:bg-pink-700" data-testid="guest-tutorial-start">
                {tr('寫下我的一件事 →', 'Write mine →')}
              </button>
            ) : (
              <>
              <button type="button" onClick={() => { onStart(); onClose('done'); }} className="rounded-full border border-petal-ink px-3 py-1.5 font-body text-sm text-petal-ink hover:bg-petal-cream-2" data-testid="guest-tutorial-try">
                {tr('去試試', 'Try it')}
              </button>
              <button type="button" onClick={next} className="inline-flex items-center gap-1 rounded-full bg-petal-ink text-petal-cream px-4 py-1.5 font-body text-sm hover:bg-pink-700" data-testid="guest-tutorial-next">
                {tr('下一步', 'Next')} <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
              </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuestTutorial;
