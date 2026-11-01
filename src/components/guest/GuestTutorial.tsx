import React, { useEffect, useMemo, useState } from 'react';
import { X, ChevronRight, ChevronLeft, Lock } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { GUEST_FEATURES } from './guestFeatures';

// ─── 30 秒看懂：訪客試玩教學動畫 ─────────────────────────────────────────────
// A story-style, auto-advancing walkthrough of the ranked guest features. Each
// scene is a tiny animated mock (pure CSS keyframes from tailwind.config.js:
// guest-rise / guest-pop / guest-type / guest-drain / guest-progress). The
// progress bar's animationend drives the auto-advance, so pressing/hovering
// (which pauses the bar) pauses the whole tour for free. With reduced motion
// the scenes render static and advance only on tap.

const SCENE_MS = 3600;

interface Props {
  onClose: (reason: 'done' | 'skip') => void;
  /** Jump straight into a feature from the last scene. */
  onStart: () => void;
}

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

function SoftenScene() {
  return (
    <div className="flex flex-col gap-2">
      <Bubble tone="hot" className="motion-safe:animate-guest-rise">
        <span className="inline-block overflow-hidden whitespace-nowrap align-bottom motion-safe:animate-guest-type max-w-full">
          {tr('你每次都不回訊息！', 'You never text back!')}
        </span>
      </Bubble>
      <div className="rounded-xl border border-petal-rule bg-white px-3 py-2 motion-safe:animate-guest-rise" style={d(900)}>
        <div className="flex justify-between font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-1">
          <span>{tr('火藥味', 'Heat')}</span>
          <span>{tr('😠 憤怒 · 📵 被忽視', '😠 anger · 📵 ignored')}</span>
        </div>
        <div className="h-2 rounded-full bg-petal-cream-2 overflow-hidden">
          <div className="h-full w-[18%] rounded-full bg-gradient-to-r from-petal-sage to-vivid-rose motion-safe:animate-guest-drain" style={d(1200)} />
        </div>
      </div>
      <Bubble tone="soft" className="motion-safe:animate-guest-rise" style={d(2000)}>
        {tr('沒等到回覆時我會胡思亂想，晚歸可以先跟我說一聲嗎？', 'When I don\'t hear back I start worrying. Could you give me a heads-up when you\'re late?')}
      </Bubble>
    </div>
  );
}

function LoveLanguageScene() {
  return (
    <div className="space-y-2">
      <p className="font-body text-[13px] text-petal-ink motion-safe:animate-guest-rise">{tr('辛苦了一天，你更希望 TA…', 'After a long day, you\'d rather they…')}</p>
      <div className="rounded-xl border border-petal-rule bg-white px-3 py-2 font-body text-[13px] text-petal-ink-soft motion-safe:animate-guest-rise" style={d(300)}>{tr('🤝 把晚餐和家事都打理好', '🤝 Handled dinner and chores')}</div>
      <div className="rounded-xl border-2 border-pink-500 bg-petal-rose-soft/30 px-3 py-2 font-body text-[13px] text-petal-ink motion-safe:animate-guest-pop" style={d(900)}>{tr('🤗 給我一個長長的擁抱', '🤗 Gave me a long hug')}</div>
      <div className="flex justify-center pt-1">
        <span className="rounded-full bg-petal-ink text-petal-cream px-3 py-1 font-body text-xs motion-safe:animate-guest-pop" style={d(1900)}>
          {tr('你的愛的語言：⏳ 精心的相處', 'Your love language: ⏳ Quality time')}
        </span>
      </div>
    </div>
  );
}

function MoodScene() {
  const days = ['🙂', '😊', '😐', '😣', '😔', '🙂', '😊'];
  return (
    <div>
      <div className="flex justify-between gap-1">
        {days.map((e, i) => (
          <div key={i} className="flex flex-col items-center gap-1 motion-safe:animate-guest-pop" style={d(i * 220)}>
            <span className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${i === days.length - 1 ? 'bg-pink-500/20 ring-2 ring-pink-500' : 'bg-petal-cream-2'}`}>{e}</span>
            <span className="font-body text-[10px] text-petal-muted">{i === days.length - 1 ? tr('今天', 'Today') : `D-${days.length - 1 - i}`}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-xl bg-white border border-petal-rule px-3 py-2 font-body text-[13px] text-petal-ink-soft motion-safe:animate-guest-rise" style={d(1800)}>
        {tr('📈 這週 4 天心情不錯；週四壓力最大。', '📈 4 good days this week; Thursday was the most stressful.')}
      </p>
    </div>
  );
}

function MemoriesScene() {
  const items = [
    ['🍜', tr('深夜一起煮泡麵', 'Late-night noodles together'), tr('3 天前', '3 days ago')],
    ['🌊', tr('第一次一起看海', 'First time at the sea'), tr('17 天前', '17 days ago')],
    ['☕', tr('第一次約會', 'Our first date'), tr('120 天前', '120 days ago')],
  ];
  return (
    <div className="relative border-l-2 border-petal-rose-soft pl-4 space-y-2">
      {items.map(([emoji, title, when], i) => (
        <div key={i} className="relative rounded-xl bg-white border border-petal-rule px-3 py-2 motion-safe:animate-guest-rise" style={d(i * 450)}>
          <span className="absolute -left-[23px] top-3 h-2.5 w-2.5 rounded-full bg-pink-500" />
          <div className="font-body text-[13px] text-petal-ink">{emoji} {title}</div>
          <div className="font-body text-[10px] text-petal-muted">{when}</div>
        </div>
      ))}
    </div>
  );
}

function RepairScene() {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 flex-wrap motion-safe:animate-guest-rise">
        {[tr('① 先停一下', '① Pause'), tr('② 承認情緒', '② Acknowledge'), tr('③ 語氣放軟', '③ Soften')].map((s, i) => (
          <span key={i} className={`rounded-full px-2.5 py-0.5 font-body text-[11px] border ${i === 1 ? 'bg-petal-ink text-petal-cream border-petal-ink' : 'border-petal-rule text-petal-ink-soft'}`}>{s}</span>
        ))}
      </div>
      <div className="rounded-xl bg-amber-50/70 border border-amber-200 px-3 py-2 font-body text-[13px] text-petal-ink motion-safe:animate-guest-rise" style={d(500)}>
        {tr('「我看得出來你現在不開心。」', '"I can see you\'re upset right now."')}
        <span className="ml-2 inline-block motion-safe:animate-guest-pop" style={d(1400)}>⭐</span>
      </div>
      <p className="font-body text-[11px] text-petal-muted motion-safe:animate-guest-rise" style={d(1900)}>{tr('收藏起來，吵架時一鍵複製。', 'Save it; copy it in one tap mid-argument.')}</p>
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
        {tr('不用註冊。你寫的一切只存在這個瀏覽器分頁，不會上傳；關掉分頁就消失。', 'No sign-up. Everything you write stays in this browser tab, never uploaded, and disappears when you close it.')}
      </p>
      <p className="mt-2 font-body text-[11px] text-petal-muted motion-safe:animate-guest-rise" style={d(900)}>
        {tr('已經幫你放好範例資料，直接點點看。', 'We\'ve added sample data so you can just start tapping.')}
      </p>
    </div>
  );
}

const SCENES: { render: () => React.ReactNode }[] = [
  { render: SoftenScene },
  { render: LoveLanguageScene },
  { render: MoodScene },
  { render: MemoriesScene },
  { render: RepairScene },
];

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
  const feature = GUEST_FEATURES[idx];
  const next = () => (isOutro ? onClose('done') : setIdx((i) => i + 1));

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-petal-ink/40 px-4 pb-4 sm:pb-0" role="dialog" aria-modal="true" aria-label={tr('試玩教學', 'Playground tour')} data-testid="guest-tutorial">
      <div
        className="w-full max-w-sm rounded-2xl bg-petal-cream border border-petal-rule shadow-petal overflow-hidden"
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
            {isOutro ? tr('30 秒看懂 · 最後一步', '30-second tour · last step') : tr(`30 秒看懂 · 第 ${feature.rank} 名`, `30-second tour · #${feature.rank}`)}
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
          {isOutro ? <PrivacyScene /> : SCENES[idx].render()}
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
                {tr('開始玩 →', 'Start playing →')}
              </button>
            ) : (
              <button type="button" onClick={next} className="inline-flex items-center gap-1 rounded-full bg-petal-ink text-petal-cream px-4 py-1.5 font-body text-sm hover:bg-pink-700" data-testid="guest-tutorial-next">
                {tr('下一步', 'Next')} <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuestTutorial;
