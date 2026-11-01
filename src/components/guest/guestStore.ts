import { useCallback, useEffect, useState } from 'react';
import { tr } from '../../i18n/tr';
import type { LoveLanguageCode, LoveLanguageScores } from '../../data/loveLanguage';

// ─── 訪客試玩 (Guest Playground) store ───────────────────────────────────────
// Everything a logged-out visitor does in the playground lives ONLY in this
// browser tab's sessionStorage: nothing is sent to the server, nothing is
// shared across tabs/devices, and closing the tab wipes it. That's the privacy
// promise we show in the UI — keep it true (no API calls with this data).
//
// On first landing we seed sample data (flagged `sample: true`, rendered with
// the shared 範例 tag) so every feature has something to play with from the
// first second instead of an empty screen.

export const GUEST_STORAGE_KEY = 'tw_guest_playground_v1';

export type GuestMood = 'great' | 'good' | 'okay' | 'low' | 'stressed';

export interface GuestSoftenEntry {
  id: string;
  original: string;
  createdAt: string;
  sample?: boolean;
}

export interface GuestMoodEntry {
  /** YYYY-MM-DD (local) — one entry per day. */
  date: string;
  mood: GuestMood;
  note?: string;
  sample?: boolean;
}

export interface GuestMemory {
  id: string;
  date: string;
  emoji: string;
  title: string;
  note?: string;
  sample?: boolean;
}

export interface GuestLoveLanguage {
  result: LoveLanguageCode;
  scores: LoveLanguageScores;
  sample?: boolean;
}

export interface GuestState {
  version: 1;
  seededAt: string;
  softens: GuestSoftenEntry[];
  moods: GuestMoodEntry[];
  memories: GuestMemory[];
  loveLanguage: GuestLoveLanguage | null;
  /** Saved 和好小抄 phrases (`stepKey:index`). */
  favoritePhrases: string[];
  tutorialSeen: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
export function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Fresh sample data, dated relative to "now" so the mood strip always looks alive. */
export function buildSeedState(): GuestState {
  // Mood pattern for the last 13 days (today is left empty on purpose so the
  // visitor's first tap is "log today").
  const pattern: GuestMood[] = ['good', 'great', 'okay', 'stressed', 'low', 'good', 'great', 'good', 'okay', 'great', 'good', 'stressed', 'good'];
  const moods: GuestMoodEntry[] = pattern.map((mood, i) => ({
    date: localDate(daysAgo(13 - i)),
    mood,
    sample: true,
    ...(mood === 'stressed' ? { note: tr('加班到很晚，回家只想安靜一下', 'Worked late, just wanted quiet at home') } : {}),
    ...(mood === 'great' && i === 6 ? { note: tr('一起去河堤散步，聊了好久', 'Long walk by the river, talked for ages') } : {}),
  }));

  return {
    version: 1,
    seededAt: new Date().toISOString(),
    softens: [
      {
        id: newId(),
        original: tr('你每次都這樣，說好要早點回來又不回訊息！', 'You always do this. You said you\'d be home early and didn\'t even text back!'),
        createdAt: daysAgo(2).toISOString(),
        sample: true,
      },
      {
        id: newId(),
        original: tr('算了，反正我說什麼你都不在乎。', 'Forget it. You don\'t care what I say anyway.'),
        createdAt: daysAgo(5).toISOString(),
        sample: true,
      },
    ],
    moods,
    memories: [
      { id: newId(), date: localDate(daysAgo(3)), emoji: '🍜', title: tr('深夜一起煮泡麵', 'Late-night instant noodles together'), note: tr('加了兩顆蛋，說是「豪華版」。', 'Two eggs in — the "deluxe edition".'), sample: true },
      { id: newId(), date: localDate(daysAgo(17)), emoji: '🌊', title: tr('第一次一起看海', 'First time at the sea together'), note: tr('風很大，但誰都不想先說要走。', 'So windy, but neither wanted to be first to leave.'), sample: true },
      { id: newId(), date: localDate(daysAgo(46)), emoji: '🎬', title: tr('看完電影在門口聊到打烊', 'Talked outside the cinema until closing'), sample: true },
      { id: newId(), date: localDate(daysAgo(120)), emoji: '☕', title: tr('第一次約會', 'Our first date'), note: tr('他把拿鐵打翻在自己身上，我笑到停不下來。', 'They spilled the latte on themselves; I couldn\'t stop laughing.'), sample: true },
    ],
    loveLanguage: {
      result: 'time',
      scores: { words: 4, time: 9, gifts: 2, service: 6, touch: 9 },
      sample: true,
    },
    favoritePhrases: ['pause:0', 'acknowledge:1'],
    tutorialSeen: false,
  };
}

/** An empty playground (after 清除我的資料): no samples, tour already seen. */
export function buildEmptyState(): GuestState {
  return { version: 1, seededAt: new Date().toISOString(), softens: [], moods: [], memories: [], loveLanguage: null, favoritePhrases: [], tutorialSeen: true };
}

// In-memory fallback for private modes where sessionStorage throws.
let memoryState: GuestState | null = null;

function isValid(s: unknown): s is GuestState {
  return !!s && typeof s === 'object' && (s as GuestState).version === 1 && Array.isArray((s as GuestState).moods);
}

export function loadGuestState(): GuestState | null {
  try {
    const raw = sessionStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValid(parsed)) return parsed;
    }
  } catch { /* storage blocked or corrupt — fall through */ }
  return memoryState;
}

export function saveGuestState(state: GuestState): void {
  memoryState = state;
  try {
    sessionStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
  } catch { /* private mode — memory copy keeps the session working */ }
}

/**
 * Seed the playground with sample data the first time a logged-out visitor
 * lands. Idempotent: an existing session is never overwritten. Returns true
 * when it seeded.
 */
export function ensureGuestSeed(): boolean {
  if (loadGuestState()) return false;
  saveGuestState(buildSeedState());
  return true;
}

/** Wipe everything (the "清除我的資料" button). */
export function clearGuestState(): void {
  memoryState = null;
  try { sessionStorage.removeItem(GUEST_STORAGE_KEY); } catch { /* ignore */ }
}

const listeners = new Set<(s: GuestState) => void>();

/** React binding: current state + an updater that persists and broadcasts. */
export function useGuestStore(): [GuestState, (fn: (s: GuestState) => GuestState) => void, () => void] {
  const [state, setState] = useState<GuestState>(() => {
    ensureGuestSeed();
    return loadGuestState() ?? buildSeedState();
  });

  useEffect(() => {
    listeners.add(setState);
    return () => { listeners.delete(setState); };
  }, []);

  const update = useCallback((fn: (s: GuestState) => GuestState) => {
    const next = fn(loadGuestState() ?? buildSeedState());
    saveGuestState(next);
    listeners.forEach((l) => l(next));
  }, []);

  const reset = useCallback(() => {
    const keepTutorial = loadGuestState()?.tutorialSeen ?? true;
    const next = { ...buildSeedState(), tutorialSeen: keepTutorial };
    saveGuestState(next);
    listeners.forEach((l) => l(next));
  }, []);

  return [state, update, reset];
}
