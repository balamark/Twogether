import React from 'react';
import { StickyNote, Trophy } from 'lucide-react';
import EntryCard from './EntryCard';

// Two entry cards surfaced at the top of 我們 (relationship memory), pointing to
// features that used to be their own bottom-nav tabs: 我們的牆 (praise wall) and
// 愛情旅程 (milestones timeline). Both stay full-screen destinations of their own —
// this is just the way in now that the bottom nav only has 4 tabs.

interface UsEntryCardsProps {
  onGoToWall: () => void;
  onGoToJourney: () => void;
}

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
