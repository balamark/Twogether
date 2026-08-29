import React, { useEffect, useState } from 'react';
import { Sparkles, Activity, TrendingUp, ChevronRight } from 'lucide-react';
import GettingStartedCard from './GettingStartedCard';
import RelationshipDashboard from './RelationshipDashboard';
import InfoHint from './InfoHint';
import { apiService, type RelationshipSummary, type ActivityItem } from '../services/api';
import { formatDateTime } from '../utils/datetime';
import { useTimezone } from '../contexts/TimezoneContext';
import { trackAction } from '../utils/track';
import type { AuthState, Notification } from '../App';

interface HomeViewProps {
  authState: AuthState;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  hasFirstEntry: boolean;
  onPickCompanion: () => void;
  onInvitePartner: () => void;
  onAddRecord: () => void;
  onOpenEvents: () => void;
  onNudgePartner?: () => void;
  onGoToWall: () => void;
  onGoToGrow: () => void;
  onGoToActivity: () => void;
}

// Time-of-day greeting on the viewer's own device clock (deliberately NOT the
// couple's shared primary timezone — a greeting is personal, so someone reading
// this at 11pm abroad should see 晚安). A hardcoded 早安 reads as broken at night.
const greeting = (): string => {
  const h = new Date().getHours();
  if (h < 5) return '晚安';
  if (h < 11) return '早安';
  if (h < 18) return '午安';
  return '晚安';
};

// "Twogether 發現" — a static, non-fetching teaser. The real AI pattern-detection
// call (apiService.getCommunicationPattern) spends an AI credit on first
// generation when nothing is cached yet, so Home must never call it just because
// the dashboard was opened. It only ever deep-links to 成長, where the existing
// quota-gated button already lives.
const PatternTeaserCard: React.FC<{ onGoToGrow: () => void }> = ({ onGoToGrow }) => (
  <button
    type="button"
    onClick={() => { trackAction('onboarding.home.pattern_teaser'); onGoToGrow(); }}
    data-testid="home-pattern-teaser"
    className="w-full flex items-center gap-3 bg-petal-cream border border-petal-rule rounded-2xl px-4 py-3.5 text-left hover:border-petal-ink transition-colors"
  >
    <Sparkles className="w-4 h-4 text-petal-rose-deep shrink-0" strokeWidth={1.5} />
    <span className="min-w-0 flex-1">
      <span className="block font-display text-sm text-petal-ink">Twogether 發現</span>
      <span className="block font-body text-[11px] text-petal-muted">
        看看你們最近反覆卡住的溝通模式
      </span>
    </span>
    <ChevronRight className="w-4 h-4 text-petal-muted shrink-0" strokeWidth={1.5} />
  </button>
);

// 本週 stats strip — only real, already-available fields. RelationshipSummary has
// no week-over-week delta, so this deliberately does not show a fabricated trend.
const WeeklyStatsStrip: React.FC = () => {
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
  const neg = summary.negative14 ?? 0;

  return (
    <div className="bg-white border border-petal-rule rounded-2xl px-4 py-3.5" data-testid="home-weekly-stats">
      <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
        近兩週
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 font-body text-sm text-petal-ink">
        <span>正向互動 <b className="font-display italic">{pos}</b> 次</span>
        <span>衝突 <b className="font-display italic">{neg}</b> 次</span>
        {typeof summary.daysSinceIntimacy === 'number' && (
          <span>{summary.daysSinceIntimacy} 天沒有親密</span>
        )}
        {typeof summary.daysSinceAppreciation === 'number' && (
          <span>{summary.daysSinceAppreciation} 天沒說欣賞的話</span>
        )}
        {summary.checkin?.overdue && (
          <span className="text-petal-rose-deep">關係檢視待完成</span>
        )}
      </div>
    </div>
  );
};

// 最近發生了什麼 — top 3 items from the same feed ActivityView shows in full.
const ActivityTeaser: React.FC<{ onGoToActivity: () => void }> = ({ onGoToActivity }) => {
  const tz = useTimezone();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiService.getActivityFeed()
      .then((all) => { if (!cancelled) setItems(all.slice(0, 3)); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className="bg-white border border-petal-rule rounded-2xl px-4 py-3.5" data-testid="home-activity-teaser">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted">
          <Activity className="w-3.5 h-3.5" strokeWidth={1.5} /> 最近發生了什麼
        </span>
        <button
          type="button"
          onClick={() => { trackAction('onboarding.home.activity_all'); onGoToActivity(); }}
          className="font-body text-[11px] text-petal-muted hover:text-petal-ink underline underline-offset-2"
        >
          查看全部
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((a) => (
          <li key={a.id} className="flex items-baseline gap-1.5 font-body text-sm text-petal-ink">
            <span className="text-petal-muted">·</span>
            <span className="min-w-0 truncate">{a.description}</span>
            <span className="ml-auto shrink-0 font-body text-[11px] text-petal-muted">
              {formatDateTime(a.date, tz)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// 🌱 我們正在成長 — static CTA into 成長; kept non-fetching for v1 (no live count).
const GrowthTeaserCard: React.FC<{ onGoToGrow: () => void }> = ({ onGoToGrow }) => (
  <button
    type="button"
    onClick={() => { trackAction('onboarding.home.grow_teaser'); onGoToGrow(); }}
    data-testid="home-grow-teaser"
    className="w-full flex items-center gap-3 bg-petal-sage/10 border border-petal-sage/40 rounded-2xl px-4 py-3.5 text-left hover:border-petal-sage-deep transition-colors"
  >
    <TrendingUp className="w-4 h-4 text-petal-sage-deep shrink-0" strokeWidth={1.5} />
    <span className="min-w-0 flex-1">
      <span className="block font-display text-sm text-petal-ink">🌱 我們正在成長</span>
      <span className="block font-body text-[11px] text-petal-muted">看統計、里程碑與真實故事</span>
    </span>
    <ChevronRight className="w-4 h-4 text-petal-muted shrink-0" strokeWidth={1.5} />
  </button>
);

// 🏠 今天 — "what matters right now." Composes the onboarding checklist, the
// single most-urgent nudge (RelationshipDashboard), a non-fetching AI-pattern
// teaser, real weekly stats, a recent-activity teaser, and a growth teaser.
const HomeView: React.FC<HomeViewProps> = ({
  authState,
  showNotification,
  hasFirstEntry,
  onPickCompanion,
  onInvitePartner,
  onAddRecord,
  onOpenEvents,
  onNudgePartner,
  onGoToWall,
  onGoToGrow,
  onGoToActivity,
}) => {
  // Greet the couple, not just the account holder — this is a shared space.
  const me = authState.user?.nickname;
  const them = authState.partnerConnected ? authState.user?.partnerNickname : null;
  const names = me ? (them ? `${me} & ${them}` : me) : '';

  return (
    <div className="space-y-4" data-testid="home-view">
      <div className="border-b border-petal-rule pb-5 mb-1">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2">
          — 今天
        </div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.05]">
            {greeting()}
            {names && <>，{names}</>}
            <em className="not-italic font-light italic text-pink-600"> ❤️</em>
          </h2>
          <InfoHint viewId="home" />
        </div>
      </div>
      <GettingStartedCard
        companionPicked={!!authState.user?.selected_therapist}
        paired={authState.partnerConnected}
        hasFirstEntry={hasFirstEntry}
        onPickCompanion={onPickCompanion}
        onInvitePartner={onInvitePartner}
        onAddRecord={onAddRecord}
        onOpenEvents={onOpenEvents}
      />
      <RelationshipDashboard
        partnerConnected={authState.partnerConnected}
        showNotification={showNotification}
        onNudgePartner={onNudgePartner}
        onGoToWall={onGoToWall}
      />
      {/* Pattern detection reads across BOTH partners' events, so it has nothing
          to offer a solo user — showing the teaser would promise an insight and
          deliver a pairing gate. */}
      {authState.partnerConnected && <PatternTeaserCard onGoToGrow={onGoToGrow} />}
      <WeeklyStatsStrip />
      <ActivityTeaser onGoToActivity={onGoToActivity} />
      <GrowthTeaserCard onGoToGrow={onGoToGrow} />
    </div>
  );
};

export default HomeView;
