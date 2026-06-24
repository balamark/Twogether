import React, { useState } from 'react';
import { FOCUS_AREAS } from './therapistShared';
import { FilterChip } from './FilterChip';
import type { TherapistFocusArea } from '../services/api';

// Focus-area filter that shows a few common tags collapsed, with a "更多" toggle
// for the rest — keeps the 心理諮商 / 公開問答 header from being clogged by all 14.
const COLLAPSED_COUNT = 6;

interface FocusFilterProps {
  value: TherapistFocusArea | 'all';
  onChange: (v: TherapistFocusArea | 'all') => void;
}

export const FocusFilter: React.FC<FocusFilterProps> = ({ value, onChange }) => {
  const [expanded, setExpanded] = useState(false);

  // Always keep the active selection visible, even when it lives past the
  // collapsed cut-off.
  let visible = expanded ? FOCUS_AREAS : FOCUS_AREAS.slice(0, COLLAPSED_COUNT);
  if (!expanded && value !== 'all' && !visible.some((f) => f.id === value)) {
    const sel = FOCUS_AREAS.find((f) => f.id === value);
    if (sel) visible = [...visible, sel];
  }
  const hiddenCount = FOCUS_AREAS.length - COLLAPSED_COUNT;

  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      <FilterChip active={value === 'all'} onClick={() => onChange('all')} label="全部" emoji="✨" />
      {visible.map((f) => (
        <FilterChip
          key={f.id}
          active={value === f.id}
          onClick={() => onChange(f.id)}
          label={f.label}
          emoji={f.emoji}
        />
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          data-testid="focus-filter-toggle"
          className="px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-[13px]"
        >
          {expanded ? '收起' : `更多 ＋${hiddenCount}`}
        </button>
      )}
    </div>
  );
};

export default FocusFilter;
