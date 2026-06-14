import React from 'react';

// A pill toggle used by the therapist focus-area filters (directory + 公開問答).
export const FilterChip: React.FC<{ active: boolean; onClick: () => void; label: string; emoji: string }> = ({
  active, onClick, label, emoji,
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-colors border font-body text-[13px] font-medium tracking-tight ${
      active
        ? 'bg-petal-ink text-petal-cream border-petal-ink'
        : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
    }`}
  >
    <span>{emoji}</span>
    <span>{label}</span>
  </button>
);

export default FilterChip;
