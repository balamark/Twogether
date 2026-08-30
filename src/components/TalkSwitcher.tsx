import React, { useEffect, useRef } from 'react';

// The persistent switcher for the 對話 family. 對話 lands straight on 說開一件事
// (its core); this thin sticky row is how you reach — and hop between — the
// other destinations without going back. It replaced a card-hub landing page
// (a whole screen of "我們要談什麼" you had to click past) and, before that, a
// two-item sub-tab row: one compact, horizontally-scrolling strip now carries
// all five and is the only chrome the section adds.
//
// Sticky at top-0; ConflictView's own section nav sits at top-[52px] and stacks
// *below* this row (see the comment there). The active chip is auto-centred so
// on a 390px screen the current destination is always the one you can see.

const DESTINATIONS: { key: string; label: string; testId: string }[] = [
  { key: 'events', label: '說開一件事', testId: 'talk-events-entry' },
  { key: 'conflict', label: '情緒檢查', testId: 'talk-conflict-entry' },
  { key: 'roleplay', label: '角色扮演', testId: 'talk-roleplay-entry' },
  { key: 'wall', label: '我們的牆', testId: 'talk-wall-entry' },
  { key: 'therapists', label: '專業諮商師', testId: 'talk-therapists-entry' },
];

interface TalkSwitcherProps {
  /** The destination currently on screen — one of DESTINATIONS' keys. */
  current: string;
  onNavigate: (view: string) => void;
}

const TalkSwitcher: React.FC<TalkSwitcherProps> = ({ current, onNavigate }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const c = scrollRef.current;
    const a = activeRef.current;
    if (!c || !a) return;
    // Centre the active chip by moving only the strip's own scrollLeft — never
    // scrollIntoView, which would also yank the page vertically.
    c.scrollLeft = a.offsetLeft - (c.clientWidth - a.clientWidth) / 2;
  }, [current]);

  return (
    <div
      className="sticky top-0 z-30 bg-petal-cream/95 backdrop-blur-sm border-b border-petal-rule"
      data-testid="talk-switcher"
    >
      <div
        ref={scrollRef}
        className="no-scrollbar max-w-4xl mx-auto px-4 md:px-6 py-2 flex gap-2 overflow-x-auto"
        role="tablist"
        aria-label="對話"
      >
        {DESTINATIONS.map((d) => {
          const active = d.key === current;
          return (
            <button
              key={d.key}
              ref={active ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={d.testId}
              onClick={() => { if (!active) onNavigate(d.key); }}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? 'bg-petal-ink text-petal-cream border-petal-ink'
                  : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TalkSwitcher;
