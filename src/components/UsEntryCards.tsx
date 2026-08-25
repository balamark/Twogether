import React from 'react';
import { StickyNote, Trophy, ChevronRight } from 'lucide-react';

// Two entry cards surfaced at the top of 我們 (relationship memory), pointing to
// features that used to be their own bottom-nav tabs: 我們的牆 (praise wall) and
// 愛情旅程 (milestones timeline). Both stay full-screen destinations of their own —
// this is just the way in now that the bottom nav only has 4 tabs.

interface UsEntryCardsProps {
  onGoToWall: () => void;
  onGoToJourney: () => void;
}

const EntryCard: React.FC<{
  icon: React.ElementType;
  title: string;
  subtitle: string;
  onClick: () => void;
  testId: string;
}> = ({ icon: Icon, title, subtitle, onClick, testId }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testId}
    className="flex-1 min-w-[160px] flex items-center gap-3 bg-white border border-petal-rule rounded-2xl px-4 py-3.5 text-left hover:border-petal-ink transition-colors"
  >
    <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-petal-cream-2 text-petal-rose-deep shrink-0">
      <Icon className="w-4 h-4" strokeWidth={1.5} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-display text-sm text-petal-ink">{title}</span>
      <span className="block font-body text-[11px] text-petal-muted truncate">{subtitle}</span>
    </span>
    <ChevronRight className="w-4 h-4 text-petal-muted shrink-0" strokeWidth={1.5} />
  </button>
);

const UsEntryCards: React.FC<UsEntryCardsProps> = ({ onGoToWall, onGoToJourney }) => (
  <div className="flex flex-wrap gap-2.5">
    <EntryCard
      icon={StickyNote}
      title="我們的牆"
      subtitle="留下悄悄話、稱讚 TA"
      onClick={onGoToWall}
      testId="us-wall-entry"
    />
    <EntryCard
      icon={Trophy}
      title="愛情旅程"
      subtitle="重要里程碑的時間軸"
      onClick={onGoToJourney}
      testId="us-journey-entry"
    />
  </div>
);

export default UsEntryCards;
