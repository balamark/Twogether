import React from 'react';
import { ChevronRight } from 'lucide-react';

// The shared "way into a feature" card used by the 對話 hub.
//
// On a 390px screen a title plus a subtitle plus a chevron leaves the title
// truncated and the subtitle unreadable — two half-legible lines instead of one
// clear one. The subtitle is therefore desktop-only: phones get the short title
// alone, which is the whole job the card has to do.

export interface EntryCardProps {
  icon: React.ElementType;
  /** Keep this short — it is the only thing shown on a phone. */
  title: string;
  /** Desktop-only supporting line. */
  subtitle?: string;
  onClick: () => void;
  testId: string;
  /** Full-width, slightly heavier treatment for the primary action. */
  emphasis?: boolean;
}

const EntryCard: React.FC<EntryCardProps> = ({
  icon: Icon,
  title,
  subtitle,
  onClick,
  testId,
  emphasis = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testId}
    className={`w-full flex items-center gap-3 rounded-2xl px-4 text-left transition-colors ${
      emphasis
        ? 'py-4 bg-petal-rose-soft/30 border border-petal-rose-soft hover:border-petal-rose-deep'
        : 'py-3.5 bg-white border border-petal-rule hover:border-petal-ink'
    }`}
  >
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 ${
        emphasis ? 'w-10 h-10 bg-petal-rose-deep text-white' : 'w-9 h-9 bg-petal-cream-2 text-petal-rose-deep'
      }`}
    >
      <Icon className={emphasis ? 'w-5 h-5' : 'w-4 h-4'} strokeWidth={1.5} />
    </span>
    <span className="min-w-0 flex-1">
      <span
        className={`block font-display text-petal-ink ${emphasis ? 'text-base' : 'text-sm'}`}
      >
        {title}
      </span>
      {subtitle && (
        <span className="hidden sm:block font-body text-[11px] text-petal-muted truncate">
          {subtitle}
        </span>
      )}
    </span>
    {/* The compact grid tiles are 2-up at 390px, where a chevron steals the
        ~28px that a 5-character title needs and forces it to wrap. They read as
        buttons from the card itself; only the full-width primary keeps the
        arrow (it has the room, and it is the one action worth pointing at). */}
    {emphasis && <ChevronRight className="w-4 h-4 text-petal-muted shrink-0" strokeWidth={1.5} />}
  </button>
);

export default EntryCard;
