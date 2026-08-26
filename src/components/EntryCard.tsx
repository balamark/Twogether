import React from 'react';
import { ChevronRight } from 'lucide-react';

// The shared "way into a feature that is no longer its own bottom-nav tab"
// card, used by 對話 (角色扮演 / 心理諮商) and 我們 (我們的牆 / 愛情旅程).
// Each destination stays a full-screen view of its own; this is only the door.

export interface EntryCardProps {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  onClick: () => void;
  testId: string;
}

const EntryCard: React.FC<EntryCardProps> = ({ icon: Icon, title, subtitle, onClick, testId }) => (
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

export default EntryCard;
