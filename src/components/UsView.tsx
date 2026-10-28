import React, { useEffect } from 'react';
import { Heart, Sprout, Sparkles, BookOpen, PlusCircle, ChevronRight, Eye, Gift, MessageCircleHeart, Wrench, Users } from 'lucide-react';
import InfoHint from './InfoHint';
import { useRelationshipSummary } from '../hooks/usePageData';
import { trackAction } from '../utils/track';
import { POSITIVE_INTERACTION_ACTIONS } from '../content/positiveInteractions';
import { tr } from '../i18n/tr';

interface UsViewProps {
  onNavigate: (view: string) => void;
}

// 愛的存款 — a felt sense of what you've built together. It IS a number you
// grow (每次留言／記錄美好／化解衝突都 +1，越多越好), but framed as a 存款 that
// accumulates, never a graded "Love Score 78/100" — a number that only goes up
// encourages; one that judges you 78/100 reads as bizarre for intimacy. The card
// is tappable: it explains what the count means and opens 最近動態 so you can see
// exactly which interactions earned each +1. Hidden for solo users, who have
// nothing shared to total up yet.
const LoveSavings: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { data: summary } = useRelationshipSummary();

  if (!summary?.paired) return null;
  const pos = summary.positive14 ?? 0;

  return (
    <button
      type="button"
      onClick={() => { trackAction('us.love_savings.open'); onNavigate('activity'); }}
      className="group block w-full rounded-3xl border border-petal-rose-soft bg-gradient-to-b from-white to-petal-cream px-6 py-7 text-center shadow-petal transition-colors hover:border-petal-rose-deep"
      data-testid="us-love-savings"
    >
      <div className="text-2xl mb-1" aria-hidden>❤️</div>
      <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
        {tr('我們正在愛', 'We are loving')}
      </div>
      <div className="font-display text-5xl font-light text-petal-rose-deep leading-none mb-1">{pos}</div>
      <p className="font-display italic font-light text-sm text-petal-muted">
        {tr('這陣子一起留下的美好瞬間', 'The good moments you\'ve shared lately')}
      </p>
      {/* What the number means + that growing it is the whole point. */}
      <p className="mt-3 font-body text-[12px] text-petal-ink-soft leading-relaxed">
        {tr('每一次', 'Every ')}{POSITIVE_INTERACTION_ACTIONS.map((a) => a.short).join(tr('、', ', '))}
        {tr('，都', ' adds')} <span className="font-medium text-petal-rose-deep">+1</span>{tr('。越多，你們的美好存款越厚。', '. The more, the bigger your savings of good moments.')}
      </p>
      <span className="mt-2 inline-flex items-center gap-1 font-body text-[12px] font-medium text-petal-rose-deep">
        {tr('看看是哪些互動加了分', 'See which interactions added points')}
        <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
      </span>
      {typeof summary.daysSinceAppreciation === 'number' && summary.daysSinceAppreciation >= 3 && (
        <p className="mt-3 font-body text-[12px] text-petal-ink-soft">
          {tr('已經', 'It\'s been')} {summary.daysSinceAppreciation} {tr('天沒說欣賞的話了，今天要不要存一點？', ' days without a word of appreciation. Want to save a little today?')}
        </p>
      )}
    </button>
  );
};

// One scenario row inside a big card: a felt situation ("今天想靠近彼此？") on
// top, the concrete next step as the tappable action below. Scenario-first, not
// a feature list — the user shouldn't have to translate "我想…" into "哪個功能".
const Scenario: React.FC<{
  cue: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  action: string;
  onClick: () => void;
  testId: string;
}> = ({ cue, icon: Icon, action, onClick, testId }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testId}
    className="group w-full text-left rounded-2xl bg-white/70 border border-petal-rule-soft px-4 py-3 hover:border-petal-ink transition-colors"
  >
    <div className="font-body text-[12px] text-petal-muted mb-1.5">{cue}</div>
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-petal-ink shrink-0" strokeWidth={1.5} />
      <span className="font-display text-[15px] text-petal-ink flex-1">{action}</span>
      <ChevronRight className="w-4 h-4 text-petal-muted group-hover:text-petal-ink shrink-0 transition-colors" strokeWidth={1.5} />
    </div>
  </button>
);

// 🏠→❤️/🌱 我們 — the relationship's own home. Two equal-weight cards carry the
// product's core idea: 愛 is not an add-on to problems, and 成長 is not a
// replacement for 愛 — both are part of one relationship. So the cards are the
// same size, same visual weight, side by side.
const UsView: React.FC<UsViewProps> = ({ onNavigate }) => {
  useEffect(() => { trackAction('us.hub.view'); }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6" data-testid="us-view">
      <header className="border-b border-petal-rule pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          {tr('— 我們', '— Us')}
        </div>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05]">
            {tr('我們', 'Us')}<em className="not-italic font-light italic text-pink-600"> ❤️</em>
          </h1>
          <InfoHint viewId="us" />
        </div>
        <p className="mt-3 font-display italic font-light text-base text-petal-muted">
          {tr('記得我們為什麼相愛，也一起創造新的美好。', 'Remember why you fell in love, and keep making new good moments together.')}
        </p>
      </header>

      <LoveSavings onNavigate={onNavigate} />

      <div className="grid gap-4 md:grid-cols-2">
        {/* ❤️ 我們正在愛 */}
        <section
          className="flex flex-col rounded-3xl border border-petal-rose-soft bg-petal-rose-soft/25 p-5 md:p-6"
          data-testid="us-card-love"
        >
          <div className="flex items-center gap-2 mb-1">
            <Heart className="w-5 h-5 text-petal-rose-deep" strokeWidth={1.5} />
            <h2 className="font-display text-xl text-petal-ink">{tr('我們正在愛', 'We are loving')}</h2>
          </div>
          <p className="font-body text-[13px] text-petal-ink-soft leading-relaxed mb-4">
            {tr('留下那些讓你覺得「還好是你」的時刻。', 'Keep the moments that make you think, "glad it\'s you."')}
          </p>
          <div className="space-y-2.5 flex-1">
            <Scenario
              cue={tr("今天想存一點愛？", 'Want to save a little love today?')}
              icon={PlusCircle}
              action={tr("今天你還喜歡他什麼", 'What do you still love about them today?')}
              onClick={() => { trackAction('us.love.daily'); onNavigate('daily-love'); }}
              testId="us-scenario-daily-love"
            />
            <Scenario
              cue={tr("有件小事想讓他知道你看見了？", 'A small thing you want them to know you noticed?')}
              icon={Eye}
              action={tr("我看見你", 'I see you')}
              onClick={() => { trackAction('us.love.see_you'); onNavigate('see-you'); }}
              testId="us-scenario-see-you"
            />
            <Scenario
              cue={tr("有一直很欣賞、卻沒說出口的事？", 'Something you\'ve always admired but never said?')}
              icon={Gift}
              action={tr("他不知道的事", 'Things they don\'t know')}
              onClick={() => { trackAction('us.love.secret'); onNavigate('secret'); }}
              testId="us-scenario-secret"
            />
            <Scenario
              cue={tr("想重新認識他？", 'Want to get to know them again?')}
              icon={Sparkles}
              action={tr("重新認識你", 'Rediscover you')}
              onClick={() => { trackAction('us.love.rediscover'); onNavigate('rediscover'); }}
              testId="us-scenario-rediscover"
            />
            <Scenario
              cue={tr("想找回以前的感覺？", 'Want to feel the way you used to?')}
              icon={BookOpen}
              action={tr("我們的故事", 'Our story')}
              onClick={() => { trackAction('us.love.journey'); onNavigate('journey'); }}
              testId="us-scenario-journey"
            />
          </div>
          <button
            type="button"
            onClick={() => { trackAction('us.love.wall'); onNavigate('wall'); }}
            data-testid="us-love-cta"
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full bg-petal-rose-deep px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-petal-rose transition-colors"
          >
            {tr('去看看我們的美好', 'See our good moments')} <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </section>

        {/* 🌱 我們正在成長 */}
        <section
          className="flex flex-col rounded-3xl border border-petal-sage/40 bg-petal-sage/10 p-5 md:p-6"
          data-testid="us-card-grow"
        >
          <div className="flex items-center gap-2 mb-1">
            <Sprout className="w-5 h-5 text-petal-sage-deeper" strokeWidth={1.5} />
            <h2 className="font-display text-xl text-petal-ink">{tr('我們正在成長', 'We are growing')}</h2>
          </div>
          <p className="font-body text-[13px] text-petal-ink-soft leading-relaxed mb-4">
            {tr('一起面對那些需要被理解、被修復的事。', 'Facing the things that need understanding and repair, together.')}
          </p>
          <div className="space-y-2.5 flex-1">
            <Scenario
              cue={tr("有件事一直卡著？", 'Something that keeps getting stuck?')}
              icon={MessageCircleHeart}
              action={tr("說開一件事", 'Talk it through')}
              onClick={() => { trackAction('us.grow.events'); onNavigate('events'); }}
              testId="us-scenario-events"
            />
            <Scenario
              cue={tr("想知道對方真正的感受？", 'Want to know how they really feel?')}
              icon={Wrench}
              action={tr("情緒檢查與修復", 'Emotion check & repair')}
              onClick={() => { trackAction('us.grow.conflict'); onNavigate('conflict'); }}
              testId="us-scenario-conflict"
            />
            <Scenario
              cue={tr("想一起深入探索？", 'Want to explore deeper together?')}
              icon={Users}
              action={tr("專業諮商師", 'Professional counselors')}
              onClick={() => { trackAction('us.grow.therapists'); onNavigate('therapists'); }}
              testId="us-scenario-therapists"
            />
          </div>
          <button
            type="button"
            onClick={() => { trackAction('us.grow.cta'); onNavigate('grow'); }}
            data-testid="us-grow-cta"
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full bg-petal-sage-deeper px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-petal-sage-deep transition-colors"
          >
            {tr('一起成長', 'Grow together')} <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </section>
      </div>

      {/* Quiet link to the intimacy/cycle calendar, which used to BE this tab.
          Kept reachable so nobody loses their records; just no longer the first
          thing 我們 shows. */}
      <button
        type="button"
        onClick={() => { trackAction('us.calendar'); onNavigate('calendar'); }}
        data-testid="us-calendar-entry"
        className="w-full flex items-center gap-3 rounded-2xl border border-petal-rule bg-white px-4 py-3.5 text-left hover:border-petal-ink transition-colors"
      >
        <span className="text-base" aria-hidden>🗓️</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm text-petal-ink">{tr('記錄時光', 'Calendar')}</span>
          <span className="block font-body text-[11px] text-petal-muted">{tr('親密與心情的月曆，看見你們的節奏', 'A calendar of intimacy and moods, to see your rhythm')}</span>
        </span>
        <ChevronRight className="w-4 h-4 text-petal-muted shrink-0" strokeWidth={1.5} />
      </button>

      {/* 我們的牆 — the shared wall of posts and photos. It used to be a chip in
          the 對話 switcher, but it's about keeping good moments, not talking
          something through, so it lives here as a small card under the calendar
          instead of a tab of its own. */}
      <button
        type="button"
        onClick={() => { trackAction('us.wall'); onNavigate('wall'); }}
        data-testid="us-wall-card"
        className="w-full flex items-center gap-3 rounded-2xl border border-petal-rule bg-white px-4 py-3.5 text-left hover:border-petal-ink transition-colors"
      >
        <span className="text-base" aria-hidden>📌</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm text-petal-ink">{tr('我們的牆', 'Our wall')}</span>
          <span className="block font-body text-[11px] text-petal-muted">{tr('一起貼上照片和想說的話，留住彼此的日常', 'Pin photos and notes together to keep your everyday moments')}</span>
        </span>
        <ChevronRight className="w-4 h-4 text-petal-muted shrink-0" strokeWidth={1.5} />
      </button>
    </div>
  );
};

export default UsView;
