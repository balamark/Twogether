import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, MessageCircleHeart, Drama, HeartHandshake } from 'lucide-react';
import { tr } from '../i18n/tr';

// The 對話 family switcher. 對話 (bottom tab bar) lands straight on 說開一件事;
// this sticky title row names where you are and folds the sibling destinations
// into one dropdown, so the 對話 section adds a single line of chrome instead of
// a second row of capsule chips stacked on top of each view's own tabs.
//
// Tapping the 對話 tab again while already in the section opens the same menu
// (App bumps `openSignal`), so the bottom bar stays the one-thumb way in.

const DESTINATIONS: { key: string; label: string; hint: string; testId: string; Icon: typeof Check }[] = [
  { key: 'events', label: tr('說開一件事', 'Talk it through'), hint: tr('把卡住的事好好說開', 'Work through what\'s stuck, together'), testId: 'talk-events-entry', Icon: MessageCircleHeart },
  { key: 'roleplay', label: tr('角色扮演', 'Role play'), hint: tr('劇本、創作市集與情趣遊戲', 'Scripts, creator marketplace and games'), testId: 'talk-roleplay-entry', Icon: Drama },
  { key: 'therapists', label: tr('專業諮商師', 'Counselors'), hint: tr('找真人諮商師陪你們談', 'Talk it over with a real counselor'), testId: 'talk-therapists-entry', Icon: HeartHandshake },
];

interface TalkSwitcherProps {
  /** The destination currently on screen — one of DESTINATIONS' keys. */
  current: string;
  onNavigate: (view: string) => void;
  /** Bumped by App when the active 對話 tab is tapped again: opens the menu. */
  openSignal?: number;
}

const TalkSwitcher: React.FC<TalkSwitcherProps> = ({ current, onNavigate, openSignal = 0 }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = DESTINATIONS.find((d) => d.key === current) ?? DESTINATIONS[0];

  // Only a *new* signal opens the menu — not the value we mounted with, or
  // every later visit to a 對話 page would pop it open.
  const seenSignal = useRef(openSignal);
  useEffect(() => {
    if (openSignal !== seenSignal.current) {
      seenSignal.current = openSignal;
      setOpen(true);
    }
  }, [openSignal]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="sticky top-0 z-30 bg-petal-cream/95 backdrop-blur-sm border-b border-petal-rule mb-6"
      data-testid="talk-switcher"
    >
      <div className="relative max-w-4xl mx-auto px-1 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          data-testid="talk-switcher-toggle"
          className="inline-flex items-center gap-2 px-3 py-1.5 -ml-1 rounded-full hover:bg-petal-cream-2 transition-colors"
        >
          <span className="font-body text-xs text-petal-muted">{tr('對話', 'Talk')}</span>
          <span className="text-petal-rule" aria-hidden>/</span>
          <span className="font-display text-base font-medium tracking-tight text-petal-ink">{active.label}</span>
          <ChevronDown
            className={`w-4 h-4 text-petal-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}
            strokeWidth={1.5}
          />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={tr('對話', 'Talk')}
            data-testid="talk-switcher-menu"
            className="absolute left-0 top-full mt-1 w-[min(20rem,calc(100vw-2rem))] bg-petal-cream border border-petal-rule rounded-md shadow-petal p-1.5 z-40"
          >
            {DESTINATIONS.map((d) => {
              const selected = d.key === current;
              return (
                <button
                  key={d.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={d.testId}
                  onClick={() => {
                    setOpen(false);
                    if (!selected) onNavigate(d.key);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors ${
                    selected ? 'bg-petal-cream-2' : 'hover:bg-petal-cream-2'
                  }`}
                >
                  <d.Icon className="w-4 h-4 text-petal-rose-deep shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-body text-sm font-medium text-petal-ink">{d.label}</span>
                    <span className="block font-body text-xs text-petal-muted truncate">{d.hint}</span>
                  </span>
                  {selected && <Check className="w-4 h-4 text-petal-ink shrink-0" strokeWidth={1.75} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TalkSwitcher;
