import React from 'react';
import { Sparkles, Activity, TrendingUp, ChevronRight } from 'lucide-react';
import GettingStartedCard from './GettingStartedCard';
import RelationshipDashboard from './RelationshipDashboard';
import InfoHint from './InfoHint';
import { useRelationshipSummary, useActivityFeed } from '../hooks/usePageData';
import { formatDateTime } from '../utils/datetime';
import { useTimezone } from '../contexts/TimezoneContext';
import { trackAction } from '../utils/track';
import type { AuthState, Notification } from '../App';
import { tr } from '../i18n/tr';

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
  onGoToTalk: () => void;
  onGoToDailyLove: () => void;
  onOpenLoveBank: () => void;
}

// Time-of-day greeting on the viewer's own device clock (deliberately NOT the
// couple's shared primary timezone — a greeting is personal, so someone reading
// this at 11pm abroad should see 晚安). A hardcoded 早安 reads as broken at night.
const greeting = (): string => {
  const h = new Date().getHours();
  if (h < 5) return tr('晚安', 'Good evening');
  if (h < 11) return tr('早安', 'Good morning');
  if (h < 18) return tr('午安', 'Good afternoon');
  return tr('晚安', 'Good evening');
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
      <span className="block font-display text-sm text-petal-ink">{tr('Twogether 發現', 'Twogether noticed')}</span>
      <span className="block font-body text-[11px] text-petal-muted">
        {tr('看看你們最近反覆卡住的溝通模式', 'See the communication patterns you keep getting stuck in')}
      </span>
    </span>
    <ChevronRight className="w-4 h-4 text-petal-muted shrink-0" strokeWidth={1.5} />
  </button>
);

// 本週 stats strip — only real, already-available fields. RelationshipSummary has
// no week-over-week delta, so this deliberately does not show a fabricated trend.
const WeeklyStatsStrip: React.FC = () => {
  const { data: summary } = useRelationshipSummary();

  if (!summary?.paired) return null;
  const pos = summary.positive14 ?? 0;
  const neg = summary.negative14 ?? 0;

  return (
    <div className="bg-white border border-petal-rule rounded-2xl px-4 py-3.5" data-testid="home-weekly-stats">
      <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
        {tr('近兩週', 'Last 2 weeks')}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 font-body text-sm text-petal-ink">
        <span>{tr('正向互動', 'Positive interactions')} <b className="font-display italic">{pos}</b> {tr('次', '')}</span>
        <span>{tr('衝突', 'Conflicts')} <b className="font-display italic">{neg}</b> {tr('次', '')}</span>
        {typeof summary.daysSinceIntimacy === 'number' && (
          <span>{summary.daysSinceIntimacy} {tr('天沒有親密', ' days without intimacy')}</span>
        )}
        {typeof summary.daysSinceAppreciation === 'number' && (
          <span>{summary.daysSinceAppreciation} {tr('天沒說欣賞的話', ' days without a word of appreciation')}</span>
        )}
        {summary.checkin?.overdue && (
          <span className="text-petal-rose-deep">{tr('關係檢視待完成', 'Relationship check-in due')}</span>
        )}
      </div>
    </div>
  );
};

// 最近發生了什麼 — top 3 items from the same feed ActivityView shows in full.
const ActivityTeaser: React.FC<{ onGoToActivity: () => void }> = ({ onGoToActivity }) => {
  const tz = useTimezone();
  const { data: feed } = useActivityFeed();
  const items = feed?.slice(0, 3);

  if (!items || items.length === 0) return null;

  return (
    <div className="bg-white border border-petal-rule rounded-2xl px-4 py-3.5" data-testid="home-activity-teaser">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted">
          <Activity className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('最近發生了什麼', 'What happened recently')}
        </span>
        <button
          type="button"
          onClick={() => { trackAction('onboarding.home.activity_all'); onGoToActivity(); }}
          className="font-body text-[11px] text-petal-muted hover:text-petal-ink underline underline-offset-2"
        >
          {tr('查看全部', 'See all')}
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
      <span className="block font-display text-sm text-petal-ink">{tr('🌱 我們正在成長', '🌱 We are growing')}</span>
      <span className="block font-body text-[11px] text-petal-muted">{tr('看統計、里程碑與真實故事', 'See stats, milestones and real stories')}</span>
    </span>
    <ChevronRight className="w-4 h-4 text-petal-muted shrink-0" strokeWidth={1.5} />
  </button>
);

// 今天想做什麼 — the positive-first block that greets the couple with three
// things they CAN do today, not one more problem to process. Deliberately the
// first thing after the greeting: opening Twogether should feel like "今天我們
// 可以為這段關係做什麼？", never "啊，又有事情". 存一點愛 leads, on purpose.
const TodayActions: React.FC<{
  onGoToDailyLove: () => void;
  onGoToTalk: () => void;
  onGoToGrow: () => void;
}> = ({ onGoToDailyLove, onGoToTalk, onGoToGrow }) => {
  const items: {
    emoji: string;
    title: string;
    desc: string;
    cta: string;
    onClick: () => void;
    testId: string;
    tone: string;
  }[] = [
    {
      emoji: '❤️',
      title: tr('今天存一點愛', 'Save a little love today'),
      desc: tr('花 1 分鐘，回答一個小問題：今天你還喜歡他什麼？', 'Take 1 minute to answer one small question: what do you still love about them today?'),
      cta: tr('開始', 'Start'),
      onClick: () => { trackAction('home.today.save_love'); onGoToDailyLove(); },
      testId: 'home-today-love',
      tone: 'bg-petal-rose-soft/25 border-petal-rose-soft',
    },
    {
      emoji: '💬',
      title: tr('有件事情想說', 'Something you want to say'),
      desc: tr('有些話，不一定要等到吵架才說。', 'Some things don\'t have to wait for a fight to be said.'),
      cta: tr('說開一件事', 'Talk it through'),
      onClick: () => { trackAction('home.today.talk'); onGoToTalk(); },
      testId: 'home-today-talk',
      tone: 'bg-white border-petal-rule',
    },
    {
      emoji: '🌱',
      title: tr('一起變好', 'Get better together'),
      desc: tr('今天想一起探索一個關係主題嗎？', 'Want to explore a relationship topic together today?'),
      cta: tr('開始探索', 'Start exploring'),
      onClick: () => { trackAction('home.today.grow'); onGoToGrow(); },
      testId: 'home-today-grow',
      tone: 'bg-petal-sage/10 border-petal-sage/40',
    },
  ];

  return (
    <div className="space-y-2.5" data-testid="home-today-actions">
      <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted">
        {tr('今天想做什麼', 'What would you like to do today?')}
      </div>
      {items.map((it) => (
        <div
          key={it.testId}
          className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 ${it.tone}`}
        >
          <span className="text-lg shrink-0" aria-hidden>{it.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-sm text-petal-ink">{it.title}</span>
            <span className="block font-body text-[12px] text-petal-muted leading-relaxed">{it.desc}</span>
          </span>
          <button
            type="button"
            onClick={it.onClick}
            data-testid={it.testId}
            className="shrink-0 rounded-full bg-petal-ink px-4 py-1.5 font-body text-[13px] font-medium text-petal-cream hover:bg-petal-ink/85 transition-colors"
          >
            {it.cta}
          </button>
        </div>
      ))}
    </div>
  );
};

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
  onGoToTalk,
  onGoToDailyLove,
  onOpenLoveBank,
}) => {
  // Greet the couple, not just the account holder — this is a shared space.
  const me = authState.user?.nickname;
  const them = authState.partnerConnected ? authState.user?.partnerNickname : null;
  const names = me ? (them ? `${me} & ${them}` : me) : '';

  return (
    <div className="space-y-4" data-testid="home-view">
      <div className="border-b border-petal-rule pb-5 mb-1">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2">
          {tr('— 今天', '— Today')}
        </div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.05]">
            {greeting()}
            {names && <>{tr('，', ', ')}{names}</>}
            <em className="not-italic font-light italic text-pink-600"> ❤️</em>
          </h2>
          <InfoHint viewId="home" />
        </div>
      </div>
      <TodayActions onGoToDailyLove={onGoToDailyLove} onGoToTalk={onGoToTalk} onGoToGrow={onGoToGrow} />
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
        onOpenLoveBank={onOpenLoveBank}
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
