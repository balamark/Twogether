import React from 'react';
import { Activity } from 'lucide-react';
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

// 今日推薦 — ONE featured action, so opening the app never asks "which of these
// six cards first?". Positive-first by default (存一點愛 leads, on purpose);
// only when the last two weeks held more conflicts than good moments does
// 說開一件事 take the spot. The other two stay one tap away as small buttons.
type TodayKey = 'love' | 'talk' | 'grow';
const TodayActions: React.FC<{
  onGoToDailyLove: () => void;
  onGoToTalk: () => void;
  onGoToGrow: () => void;
}> = ({ onGoToDailyLove, onGoToTalk, onGoToGrow }) => {
  const { data: summary } = useRelationshipSummary();
  const items: Record<TodayKey, {
    emoji: string;
    title: string;
    desc: string;
    cta: string;
    short: string;
    onClick: () => void;
    testId: string;
  }> = {
    love: {
      emoji: '❤️',
      title: tr('今天存一點愛', 'Save a little love today'),
      desc: tr('花 1 分鐘，回答一個小問題：今天你還喜歡他什麼？', 'Take 1 minute to answer one small question: what do you still love about them today?'),
      cta: tr('開始', 'Start'),
      short: tr('存一點愛', 'Save love'),
      onClick: () => { trackAction('home.today.save_love'); onGoToDailyLove(); },
      testId: 'home-today-love',
    },
    talk: {
      emoji: '💬',
      title: tr('有件事情想說', 'Something you want to say'),
      desc: tr('最近有點卡？有些話，不一定要等到吵架才說。', 'Feeling a bit stuck? Some things don\'t have to wait for a fight to be said.'),
      cta: tr('說開一件事', 'Talk it through'),
      short: tr('說開一件事', 'Talk it through'),
      onClick: () => { trackAction('home.today.talk'); onGoToTalk(); },
      testId: 'home-today-talk',
    },
    grow: {
      emoji: '🌱',
      title: tr('一起變好', 'Get better together'),
      desc: tr('看看你們這個月的回顧與 AI 觀察。', 'See this month\'s recap and what the AI noticed.'),
      cta: tr('看回顧', 'See recap'),
      short: tr('一起變好', 'Grow together'),
      onClick: () => { trackAction('home.today.grow'); onGoToGrow(); },
      testId: 'home-today-grow',
    },
  };
  const featuredKey: TodayKey =
    summary?.paired && (summary.negative14 ?? 0) > (summary.positive14 ?? 0) ? 'talk' : 'love';
  const featured = items[featuredKey];
  const rest = (['love', 'talk', 'grow'] as TodayKey[]).filter((k) => k !== featuredKey).map((k) => items[k]);

  return (
    <div className="space-y-3" data-testid="home-today-actions" data-featured={featuredKey}>
      <div className="rounded-3xl border border-petal-rose-soft bg-gradient-to-br from-petal-rose-soft/40 to-white p-5 shadow-sm" data-testid="home-today-featured">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-rose-deep mb-2">
          {tr('今日推薦', 'Today\'s pick')}
        </div>
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none shrink-0" aria-hidden>{featured.emoji}</span>
          <div className="min-w-0">
            <h3 className="font-display text-xl text-petal-ink leading-snug">{featured.title}</h3>
            <p className="font-body text-[13px] text-petal-ink-soft leading-relaxed mt-1">{featured.desc}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={featured.onClick}
          data-testid={featured.testId}
          className="mt-4 w-full rounded-full bg-petal-rose-deep px-5 py-2.5 font-body text-sm font-medium text-white hover:opacity-90 active:scale-[0.99] transition"
        >
          {featured.cta}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rest.map((it) => (
          <button
            key={it.testId}
            type="button"
            onClick={it.onClick}
            data-testid={it.testId}
            className="flex items-center justify-center gap-1.5 rounded-full border border-petal-rule bg-white px-3 py-2.5 font-body text-[13px] text-petal-ink hover:border-petal-ink transition-colors"
          >
            <span aria-hidden>{it.emoji}</span>
            {it.short}
          </button>
        ))}
      </div>
    </div>
  );
};

// 🏠 今天 — "what matters right now." One featured action, the onboarding
// checklist (new couples only), the single most-urgent nudge
// (RelationshipDashboard) and a recent-activity teaser. Stats and the AI
// pattern live in 成長, so this page stays short.
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
      <div className="flex items-center gap-2">
        <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight text-petal-ink leading-tight">
          {greeting()}
          {names && <>{tr('，', ', ')}{names}</>}
        </h2>
        <InfoHint viewId="home" />
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
      <ActivityTeaser onGoToActivity={onGoToActivity} />
    </div>
  );
};

export default HomeView;
