import React, { useEffect, useState } from 'react';
import { Heart, Sprout, Sparkles, BookOpen, PlusCircle, ChevronRight, Eye, Gift, MessageCircleHeart, Wrench, Users } from 'lucide-react';
import InfoHint from './InfoHint';
import { apiService, type RelationshipSummary } from '../services/api';
import { trackAction } from '../utils/track';

interface UsViewProps {
  onNavigate: (view: string) => void;
}

// 愛的存款 — a felt sense of what you've built together, deliberately NOT a
// score. RelationshipSummary only exposes real counts (positive interactions,
// days since appreciation), so this shows accumulation ("這陣子留下了 N 個美好
// 瞬間"), never "Love Score 78/100" — gamifying intimacy reads as bizarre. Hidden
// entirely for solo users, who have nothing shared to total up yet.
const LoveSavings: React.FC = () => {
  const [summary, setSummary] = useState<RelationshipSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiService.getRelationshipSummary()
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!summary?.paired) return null;
  const pos = summary.positive14 ?? 0;

  return (
    <div
      className="rounded-3xl border border-petal-rose-soft bg-gradient-to-b from-white to-petal-cream px-6 py-7 text-center shadow-petal"
      data-testid="us-love-savings"
    >
      <div className="text-2xl mb-1" aria-hidden>❤️</div>
      <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
        我們正在愛
      </div>
      <div className="font-display text-5xl font-light text-petal-rose-deep leading-none mb-1">{pos}</div>
      <p className="font-display italic font-light text-sm text-petal-muted">
        這陣子一起留下的美好瞬間
      </p>
      {typeof summary.daysSinceAppreciation === 'number' && summary.daysSinceAppreciation >= 3 && (
        <p className="mt-3 font-body text-[12px] text-petal-ink-soft">
          已經 {summary.daysSinceAppreciation} 天沒說欣賞的話了，今天要不要存一點？
        </p>
      )}
    </div>
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
          — 我們
        </div>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05]">
            我們<em className="not-italic font-light italic text-pink-600"> ❤️</em>
          </h1>
          <InfoHint viewId="us" />
        </div>
        <p className="mt-3 font-display italic font-light text-base text-petal-muted">
          記得我們為什麼相愛，也一起創造新的美好。
        </p>
      </header>

      <LoveSavings />

      <div className="grid gap-4 md:grid-cols-2">
        {/* ❤️ 我們正在愛 */}
        <section
          className="flex flex-col rounded-3xl border border-petal-rose-soft bg-petal-rose-soft/25 p-5 md:p-6"
          data-testid="us-card-love"
        >
          <div className="flex items-center gap-2 mb-1">
            <Heart className="w-5 h-5 text-petal-rose-deep" strokeWidth={1.5} />
            <h2 className="font-display text-xl text-petal-ink">我們正在愛</h2>
          </div>
          <p className="font-body text-[13px] text-petal-ink-soft leading-relaxed mb-4">
            留下那些讓你覺得「還好是你」的時刻。
          </p>
          <div className="space-y-2.5 flex-1">
            <Scenario
              cue="今天想存一點愛？"
              icon={PlusCircle}
              action="今天你還喜歡他什麼"
              onClick={() => { trackAction('us.love.daily'); onNavigate('daily-love'); }}
              testId="us-scenario-daily-love"
            />
            <Scenario
              cue="有件小事想讓他知道你看見了？"
              icon={Eye}
              action="我看見你"
              onClick={() => { trackAction('us.love.see_you'); onNavigate('see-you'); }}
              testId="us-scenario-see-you"
            />
            <Scenario
              cue="有一直很欣賞、卻沒說出口的事？"
              icon={Gift}
              action="他不知道的事"
              onClick={() => { trackAction('us.love.secret'); onNavigate('secret'); }}
              testId="us-scenario-secret"
            />
            <Scenario
              cue="想重新認識他？"
              icon={Sparkles}
              action="重新認識你"
              onClick={() => { trackAction('us.love.rediscover'); onNavigate('rediscover'); }}
              testId="us-scenario-rediscover"
            />
            <Scenario
              cue="想找回以前的感覺？"
              icon={BookOpen}
              action="我們的故事"
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
            去看看我們的美好 <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </section>

        {/* 🌱 我們正在成長 */}
        <section
          className="flex flex-col rounded-3xl border border-petal-sage/40 bg-petal-sage/10 p-5 md:p-6"
          data-testid="us-card-grow"
        >
          <div className="flex items-center gap-2 mb-1">
            <Sprout className="w-5 h-5 text-petal-sage-deeper" strokeWidth={1.5} />
            <h2 className="font-display text-xl text-petal-ink">我們正在成長</h2>
          </div>
          <p className="font-body text-[13px] text-petal-ink-soft leading-relaxed mb-4">
            一起面對那些需要被理解、被修復的事。
          </p>
          <div className="space-y-2.5 flex-1">
            <Scenario
              cue="有件事一直卡著？"
              icon={MessageCircleHeart}
              action="說開一件事"
              onClick={() => { trackAction('us.grow.events'); onNavigate('events'); }}
              testId="us-scenario-events"
            />
            <Scenario
              cue="想知道對方真正的感受？"
              icon={Wrench}
              action="情緒檢查與修復"
              onClick={() => { trackAction('us.grow.conflict'); onNavigate('conflict'); }}
              testId="us-scenario-conflict"
            />
            <Scenario
              cue="想一起深入探索？"
              icon={Users}
              action="專業諮商師"
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
            一起成長 <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
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
          <span className="block font-display text-sm text-petal-ink">記錄時光</span>
          <span className="block font-body text-[11px] text-petal-muted">親密與心情的月曆，看見你們的節奏</span>
        </span>
        <ChevronRight className="w-4 h-4 text-petal-muted shrink-0" strokeWidth={1.5} />
      </button>
    </div>
  );
};

export default UsView;
