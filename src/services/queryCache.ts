// In-memory stale-while-revalidate cache for page data.
//
// Every view remounts when the user switches tab or presses 上一頁, and each
// remount used to refetch from scratch behind a spinner — so going back to a
// page you just saw felt as slow as opening it cold, and on a cold/busy server
// it could time out. With this cache a revisit paints the last data instantly
// and refreshes it quietly in the background.
//
// Memory only, on purpose: this data is private (intimacy history, threads),
// so nothing is written to disk, a reload starts clean, and clearQueryCache()
// runs whenever auth storage is cleared (logout / session expiry) so one
// account can never see another's cache. Keys should still include the user id.

import { useCallback, useEffect, useRef, useState } from 'react';
import { markViewReady } from '../utils/perf';

type Entry = { data: unknown; at: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

// Bounded so a long session can't grow it forever (Map keeps insertion order,
// so the first key is the least recently written).
const MAX_ENTRIES = 50;

function notify(key: string): void {
  listeners.get(key)?.forEach((fn) => fn());
}

export function getCached<T>(key: string): { data: T; at: number } | undefined {
  return store.get(key) as { data: T; at: number } | undefined;
}

export function setCached<T>(key: string, data: T): void {
  store.delete(key);
  store.set(key, { data, at: Date.now() });
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
  notify(key);
}

/**
 * Mark every entry whose key starts with `prefix` stale: it still paints
 * instantly on the next visit, but always refetches. Keys start with the API
 * resource they read (e.g. `/intimacy-requests|<userId>`), so the axios
 * interceptor calls this after any successful write to that resource — a
 * page never shows data from before your own change.
 */
export function invalidateQueries(prefix: string): void {
  for (const [key, entry] of store) {
    if (key.startsWith(prefix)) entry.at = 0;
  }
}

/** `/intimacy-requests/abc/respond` → `/intimacy-requests` */
export function resourceOf(url: string | undefined): string | null {
  const m = (url || '').match(/^\/?([^/?#]+)/);
  return m ? `/${m[1]}` : null;
}

export function clearQueryCache(): void {
  store.clear();
  inflight.clear();
}

/** Fetch through the cache; concurrent callers for one key share one request. */
export function fetchQuery<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const p = fetcher()
    .then((data) => {
      setCached(key, data);
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export interface CachedQueryOptions {
  /** View name for page_ready timing (src/utils/perf.ts). */
  view?: string;
  /** Cached data younger than this is shown without refetching. Default 15s. */
  staleMs?: number;
}

export interface CachedQuery<T> {
  data: T | undefined;
  /** Only true when there is nothing to show yet — never during a background refresh. */
  loading: boolean;
  /** A background refresh is running over data that's already shown. */
  refreshing: boolean;
  /** Set when a load failed and there's no data to show. */
  error: Error | null;
  refetch: () => Promise<void>;
  /** Optimistic local update (also written to the cache). */
  mutate: (updater: (prev: T | undefined) => T) => void;
}

/**
 * Stale-while-revalidate: returns cached data immediately when present and
 * revalidates in the background once it's older than `staleMs`. Pass a null
 * key to disable (e.g. signed out).
 */
export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  { view, staleMs = 15_000 }: CachedQueryOptions = {},
): CachedQuery<T> {
  const initial = key ? getCached<T>(key) : undefined;
  const [data, setData] = useState<T | undefined>(initial?.data);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    if (!key) return;
    const hasData = store.has(key);
    setRefreshing(hasData);
    if (!hasData) setError(null); // a retry shows the spinner again
    try {
      const fresh = await fetchQuery(key, () => fetcherRef.current());
      setData(fresh);
      setError(null);
      if (view && !hasData) markViewReady(view, 'network');
    } catch (e) {
      // With data on screen, a failed background refresh keeps the old data
      // rather than replacing the page with an error.
      if (!store.has(key)) setError(e as Error);
    } finally {
      setRefreshing(false);
    }
  }, [key, view]);

  useEffect(() => {
    if (!key) {
      setData(undefined);
      setError(null);
      return;
    }
    const cached = getCached<T>(key);
    setData(cached?.data);
    setError(null);
    if (cached && view) markViewReady(view, 'cache');
    if (!cached || Date.now() - cached.at > staleMs) void load();

    // Stay in sync when another component writes the same key.
    const onChange = () => {
      const latest = getCached<T>(key);
      if (latest) setData(latest.data);
    };
    const set = listeners.get(key) ?? new Set();
    set.add(onChange);
    listeners.set(key, set);
    return () => {
      set.delete(onChange);
    };
  }, [key, load, staleMs, view]);

  const mutate = useCallback((updater: (prev: T | undefined) => T) => {
    if (!key) return;
    setCached(key, updater(getCached<T>(key)?.data));
  }, [key]);

  return {
    data,
    loading: data === undefined && !error,
    refreshing,
    error,
    refetch: load,
    mutate,
  };
}

/**
 * Drop-in for `useState` on a view's loaded data, for views that already
 * manage their own fetching and optimistic updates (e.g. the wall). The state
 * starts from the cache and every change is written back, so a revisit paints
 * the last state instantly. `wasCached` tells the view to skip its spinner and
 * refresh quietly instead. Pass a null key to behave like plain useState.
 */
export function useCachedState<T>(
  key: string | null,
  initial: T,
  view?: string,
): [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const [wasCached] = useState(() => !!key && store.has(key));
  const [state, setState] = useState<T>(() => (key && store.has(key) ? (store.get(key)!.data as T) : initial));
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (wasCached && view) markViewReady(view, 'cache');
    // Only on mount: later visits remount the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((prev) => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      // Only explicit sets are cached — never `initial` — so an empty first
      // render can't be mistaken for loaded data on the next visit.
      if (keyRef.current) setCached(keyRef.current, value);
      return value;
    });
  }, []);

  return [state, set, wasCached];
}
