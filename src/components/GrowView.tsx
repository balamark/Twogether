import React from 'react';
import { TrendingUp, BookOpen, ChevronRight } from 'lucide-react';
import { AchievementsView } from './AchievementsView';
import EventAnalytics from './EventAnalytics';
import SoloModeGate from './SoloModeGate';
import InfoHint from './InfoHint';
import type { AuthState } from '../App';
import { tr } from '../i18n/tr';

interface GrowViewProps {
  authState: AuthState;
  onInvitePartner: () => void;
  onNavigate: (view: string) => void;
}

// 真實故事 teaser — static, non-fetching (matches the other teaser cards); the
// real StoriesView is still its own full-screen destination.
const StoriesTeaserCard: React.FC<{ onGoToStories: () => void }> = ({ onGoToStories }) => (
  <button
    type="button"
    onClick={onGoToStories}
    data-testid="grow-stories-entry"
    className="w-full flex items-center gap-3 bg-white border border-petal-rule rounded-2xl px-4 py-3.5 text-left hover:border-petal-ink transition-colors"
  >
    <BookOpen className="w-4 h-4 text-petal-rose-deep shrink-0" strokeWidth={1.5} />
    <span className="min-w-0 flex-1">
      <span className="block font-display text-sm text-petal-ink">{tr('📚 真實故事', '📚 Real stories')}</span>
      <span className="block font-body text-[11px] text-petal-muted">{tr('看看其他伴侶怎麼做到的', 'See how other couples made it work')}</span>
    </span>
    <ChevronRight className="w-4 h-4 text-petal-muted shrink-0" strokeWidth={1.5} />
  </button>
);

// 🌱 成長 — stats/badges (AchievementsView), the AI-detected communication
// pattern + KPIs/charts (EventAnalytics), and a teaser into 真實故事.
const GrowView: React.FC<GrowViewProps> = ({ authState, onInvitePartner, onNavigate }) => {
  if (!authState.isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center text-petal-ink-soft">
        <h2 className="text-2xl font-serif text-petal-ink mb-2">{tr('成長', 'Grow')}</h2>
        <p>{tr('請先登入才能使用此功能。', 'Please sign in to use this feature.')}</p>
      </div>
    );
  }

  // 真實故事 is explicitly solo-friendly (you can read and publish without a
  // partner), so its entry card sits ABOVE the pairing gate — gating the only
  // way into it would make a solo-usable feature unreachable from the nav.
  const storiesCard = <StoriesTeaserCard onGoToStories={() => onNavigate('stories')} />;

  if (!authState.partnerConnected) {
    return (
      <>
        <div className="max-w-2xl mx-auto px-4 md:px-6 pt-4">{storiesCard}</div>
        <SoloModeGate
          icon={TrendingUp}
          title={tr("配對後，看見你們的成長", 'Pair up to see how you grow')}
          valueLine={tr("配對之後，這裡會累積你們的統計、AI 觀察到的溝通模式，以及一起達成的里程碑。", 'Once you\'re paired, your stats, the communication patterns AI notices, and milestones you reach together will build up here.')}
          onInvite={onInvitePartner}
          alternatives={[
            {
              label: tr('逛逛真實故事', 'Browse real stories'),
              desc: tr('看看其他伴侶怎麼把關係經營得更好。', 'See how other couples nurture their relationships.'),
              onClick: () => onNavigate('stories'),
            },
          ]}
        />
      </>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <header className="border-b border-petal-rule pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          {tr('— 成長', '— Grow')}
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
          {tr('我們正在', 'We are ')}<em className="not-italic font-light italic text-pink-600">{tr('成長', 'growing')}</em>
          <span className="align-middle ml-2"><InfoHint viewId="grow" /></span>
        </h1>
        <p className="font-display italic font-light text-base text-petal-muted">
          {tr('統計、AI 觀察到的模式，和你們一起達成的里程碑。', 'Stats, patterns the AI noticed, and milestones you reached together.')}
        </p>
      </header>

      {storiesCard}
      <EventAnalytics />
      <AchievementsView />
    </div>
  );
};

export default GrowView;
