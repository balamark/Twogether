import React from 'react';
import { Play, HeartHandshake } from 'lucide-react';
import EntryCard from './EntryCard';

// Two entry cards shown inside 對話 (Talk), pointing to features that used to be
// their own bottom-nav tabs: 角色扮演 (roleplay scripts) and 心理諮商 (human
// therapist directory/booking). Both stay full-screen destinations of their own —
// this is just the way in now that the bottom nav only has 4 tabs.

interface TalkEntryCardsProps {
  onGoToRoleplay: () => void;
  onGoToTherapists: () => void;
}

const TalkEntryCards: React.FC<TalkEntryCardsProps> = ({ onGoToRoleplay, onGoToTherapists }) => (
  <div className="max-w-4xl mx-auto px-4 md:px-6 pt-3 flex flex-wrap gap-2.5" data-testid="talk-entry-cards">
    <EntryCard
      icon={Play}
      title="角色扮演練習"
      subtitle="想換個方式靠近彼此？"
      onClick={onGoToRoleplay}
      testId="talk-roleplay-entry"
    />
    <EntryCard
      icon={HeartHandshake}
      title="找專業諮商師"
      subtitle="真人心理師，一對一預約"
      onClick={onGoToTherapists}
      testId="talk-therapists-entry"
    />
  </div>
);

export default TalkEntryCards;
