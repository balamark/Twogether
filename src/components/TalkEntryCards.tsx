import React from 'react';
import { Play, HeartHandshake, ChevronRight } from 'lucide-react';

// Two entry cards shown inside 對話 (Talk), pointing to features that used to be
// their own bottom-nav tabs: 角色扮演 (roleplay scripts) and 心理諮商 (human
// therapist directory/booking). Both stay full-screen destinations of their own —
// this is just the way in now that the bottom nav only has 4 tabs.

interface TalkEntryCardsProps {
  onGoToRoleplay: () => void;
  onGoToTherapists: () => void;
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
