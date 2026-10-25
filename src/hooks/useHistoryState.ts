// Browser back/forward support for our state-driven navigation.
//
// The app has no URL router: tabs, detail pages and compose flows are plain
// React state, so the browser's 上一頁 used to leave the site instead of going
// back to the list the user was reading. `useHistoryState` is a drop-in for
// `useState` on *navigation* state (not filters or form fields):
//
// - Every change pushes a history entry; browser back/forward restores it.
// - Several setters called in the same tick (e.g. switch sub-tab + reset its
//   detail) collapse into one entry.
// - If the new state equals the entry *below* the current one, we call
//   `history.back()` instead of pushing — so the in-app 返回 buttons behave
//   exactly like the browser button and don't grow the stack.
// - Each entry remembers its scroll position; going back scrolls to where the
//   user was (retrying while async lists load). New pages start at the top.
//
// All hooks share one `nav` map in `history.state.tw`. A `root` hook (the
// top-level tab) clears every other key when it changes, so opening a tab
// fresh never resurrects a stale detail page from an earlier visit.
//
// Values must be structured-cloneable (plain JSON-ish data).

import { useCallback, useEffect, useRef, useState } from 'react';

type Nav = Record<string, unknown>;

interface TwEntry {
  nav: Nav;
  prev: Nav | null; // nav of the entry below — lets a setter detect "this is a back"
  scrollY: number;
}

interface Options {
  // Top-level key: changing it drops all other keys from the new entry.
  root?: boolean;
  // Scroll to the top when this change pushes a new page (default true).
  // Use false for overlays/modals that sit on top of the current scroll.
  scrollTop?: boolean;
}

interface SetOptions {
  // Rewrite the current entry instead of pushing (redirects / guards).
  replace?: boolean;
}

const hasWindow = typeof window !== 'undefined';

function readEntry(): TwEntry {
  const tw = hasWindow ? (window.history.state as { tw?: TwEntry } | null)?.tw : undefined;
  return tw && typeof tw === 'object' && tw.nav
    ? tw
    : { nav: {}, prev: null, scrollY: 0 };
}

function writeEntry(entry: TwEntry, mode: 'replace' | 'push') {
  // Keep whatever else lives in history.state (other libraries, ours only owns `tw`).
  const base = mode === 'replace' && window.history.state && typeof window.history.state === 'object'
    ? window.history.state
    : {};
  const state = { ...base, tw: entry };
  try {
    if (mode === 'push') window.history.pushState(state, '');
    else window.history.replaceState(state, '');
  } catch { /* history quota / sandboxed frame — navigation still works in-app */ }
}

function stable(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}

// Each hook's mount-time value, so a nav map that never recorded a key (e.g.
// the entry below was pushed before that view mounted) still compares equal
// when the value is just the default.
const defaults = new Map<string, string>();

function sameNav(a: Nav | null, b: Nav | null): boolean {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = k in a ? stable(a[k]) : (defaults.get(k) ?? 'null');
    const vb = k in b ? stable(b[k]) : (defaults.get(k) ?? 'null');
    if (va !== vb) return false;
  }
  return true;
}

// ---- scroll bookkeeping -------------------------------------------------

// While a modal holds useScrollLock the body is position:fixed and scrollY
// reads 0 — never record that as the page's position.
const scrollLocked = () => hasWindow && document.body.style.position === 'fixed';

function saveScroll(y = window.scrollY) {
  if (scrollLocked()) return;
  const entry = readEntry();
  if (entry.scrollY === y) return;
  writeEntry({ ...entry, scrollY: y }, 'replace');
}

let cancelRestore: (() => void) | null = null;

function restoreScroll(y: number) {
  cancelRestore?.();
  let stopped = false;
  const started = performance.now();
  const stop = () => {
    stopped = true;
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', stop);
    if (cancelRestore === stop) cancelRestore = null;
  };
  cancelRestore = stop;
  // The user taking over the scroll wins over our restore.
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('keydown', stop);
  const tick = () => {
    if (stopped) return;
    if (!scrollLocked()) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(y, Math.max(0, max)));
      if (max >= y) return stop();
    }
    // Lists load async after a back; keep trying until they're tall enough.
    if (performance.now() - started > 2500) return stop();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

let installed = false;
let scrollTimer: ReturnType<typeof setTimeout> | null = null;
function install() {
  if (installed || !hasWindow) return;
  installed = true;
  try { window.history.scrollRestoration = 'manual'; } catch { /* old browsers */ }
  const existing = (window.history.state as { tw?: TwEntry } | null)?.tw;
  if (!existing) {
    writeEntry({ nav: {}, prev: null, scrollY: window.scrollY }, 'replace');
  } else if (existing.scrollY > 0) {
    // Reload: views come back from history.state, so bring the scroll back too.
    restoreScroll(existing.scrollY);
  }
  window.addEventListener('scroll', () => {
    // Debounced: browsers throttle replaceState if called on every frame.
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => saveScroll(), 150);
  }, { passive: true });
  let lastNav = readEntry().nav;
  window.addEventListener('popstate', () => {
    const entry = readEntry();
    // Only restore scroll when the page itself changed (not e.g. a no-op pop).
    if (!sameNav(entry.nav, lastNav)) restoreScroll(entry.scrollY || 0);
    lastNav = entry.nav;
    listeners.forEach((fn) => fn(entry.nav));
  });
  // Track nav changes we make ourselves so popstate can compare against them.
  afterCommit = (nav) => { lastNav = nav; };
}

const listeners = new Set<(nav: Nav) => void>();
let afterCommit: (nav: Nav) => void = () => {};

// ---- batched commits ----------------------------------------------------

const pending = new Map<string, unknown>();
let pendingRoot: string | null = null;
let pendingReplace = false;
let pendingScrollTop = false;
// Scroll position at the moment of the first setter call in a batch. React
// may commit (hiding the list, shrinking the page, clamping scrollY) before
// our microtask flush runs, so reading scrollY in flush would be too late.
let pendingFromY: number | null = null;
let scheduled = false;

function flush() {
  scheduled = false;
  if (pending.size === 0) return;
  const current = readEntry();
  // A root change (a different top-level tab) keeps only the keys set in this
  // same batch; re-selecting the current tab is not a change.
  const rootChanged = pendingRoot !== null
    && stable(pending.get(pendingRoot)) !== stable(current.nav[pendingRoot]);
  const base: Nav = rootChanged ? {} : { ...current.nav };
  pending.forEach((v, k) => { base[k] = v; });
  const target = base;
  const replace = pendingReplace;
  const scrollTop = pendingScrollTop;
  pending.clear();
  const fromY = pendingFromY;
  pendingRoot = null;
  pendingReplace = pendingScrollTop = false;
  pendingFromY = null;

  if (sameNav(target, current.nav)) return;
  if (replace) {
    writeEntry({ ...current, nav: target }, 'replace');
    afterCommit(target);
    return;
  }
  if (sameNav(target, current.prev)) {
    // Going back to the page underneath: reuse it (and its scroll position).
    window.history.back();
    return;
  }
  if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
  writeEntry({ ...readEntry(), scrollY: fromY ?? current.scrollY }, 'replace');
  writeEntry({ nav: target, prev: current.nav, scrollY: 0 }, 'push');
  afterCommit(target);
  if (scrollTop) {
    cancelRestore?.();
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }
}

function schedule(key: string, value: unknown, opts: Options, setOpts?: SetOptions) {
  if (pending.size === 0) pendingFromY = scrollLocked() ? null : window.scrollY;
  pending.set(key, value);
  if (opts.root) pendingRoot = key;
  if (setOpts?.replace) pendingReplace = true;
  if (opts.scrollTop !== false) pendingScrollTop = true;
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
}

export type HistorySetter<T> = (next: T | ((prev: T) => T), opts?: SetOptions) => void;

export function useHistoryState<T>(
  key: string,
  initial: T | (() => T),
  options: Options = {},
): [T, HistorySetter<T>] {
  install();
  // The fresh-visit value (what a nav map without this key means).
  const initialRef = useRef<{ v: T } | null>(null);
  if (initialRef.current === null) {
    initialRef.current = { v: typeof initial === 'function' ? (initial as () => T)() : initial };
    if (!defaults.has(key)) defaults.set(key, stable(initialRef.current.v));
  }
  const [value, setValue] = useState<T>(() => {
    const nav = readEntry().nav;
    return key in nav ? (nav[key] as T) : initialRef.current!.v;
  });
  const valueRef = useRef(value);
  valueRef.current = value;
  const optsRef = useRef(options);
  optsRef.current = options;

  // Record our starting value in the current entry so "is this a back?"
  // comparisons see a complete nav map.
  useEffect(() => {
    if (!hasWindow) return;
    const entry = readEntry();
    if (!(key in entry.nav)) {
      const nav = { ...entry.nav, [key]: valueRef.current };
      writeEntry({ ...entry, nav }, 'replace');
      afterCommit(nav);
    }
  }, [key]);

  useEffect(() => {
    const onPop = (nav: Nav) => {
      const next = (key in nav ? nav[key] : initialRef.current!.v) as T;
      valueRef.current = next;
      setValue(next);
    };
    listeners.add(onPop);
    return () => { listeners.delete(onPop); };
  }, [key]);

  const set = useCallback<HistorySetter<T>>((next, setOpts) => {
    const resolved = typeof next === 'function' ? (next as (p: T) => T)(valueRef.current) : next;
    valueRef.current = resolved;
    setValue(resolved);
    if (hasWindow) schedule(key, resolved, optsRef.current, setOpts);
  }, [key]);

  return [value, set];
}
