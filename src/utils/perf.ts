// Frontend performance measurement.
//
// Two numbers answer "does the app feel slow?":
//
//   • page_ready — from the moment the user switches view (tab, menu, 上一頁)
//     to the moment that view shows its data. `source: 'cache'` means it
//     painted from the in-memory cache (src/services/queryCache.ts) with no
//     wait; 'network' means the user watched a spinner for `ms`.
//   • api timing — every axios request, with the server's own processing time
//     (the `Server-Timing: app;dur=` header from middleware/logging.js), so a
//     slow call splits into "server was slow" vs "network / cold start / queue".
//
// Reported to Cloud Logging through clientLog as `client.perf_*` events (see
// docs/PERFORMANCE.md for the queries). Locally, run `__twogetherPerf.report()`
// in the browser console for a p50/p95 table of this session.

import { clientLog } from './telemetry';

// Budgets (docs/PERFORMANCE.md). Above these an event is logged as a warning.
export const PAGE_READY_BUDGET_MS = 1000;
export const API_SLOW_MS = 1500;

type Sample = { kind: 'page' | 'api'; name: string; ms: number; serverMs?: number; source?: string; status?: number };

const MAX_SAMPLES = 300;
const samples: Sample[] = [];

function push(sample: Sample): void {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.shift();
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ── Page timing ───────────────────────────────────────────────────────────
//
// Generic for every view: after a navigation, the view is "ready" once the
// API requests it started have all finished (nothing in flight for
// SETTLE_MS). A view using useCachedQuery reports earlier and more precisely
// via markViewReady — `source: 'cache'` when it painted from memory.

const SETTLE_MS = 120;
const GIVE_UP_MS = 30_000;

type Nav = { view: string; start: number; lastEnd: number; requests: number; reported: boolean };
let nav: Nav | null = null;
let inflight = 0;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

// Every slow load is logged; fast ones are sampled to keep log volume down
// (a navigation is a log line otherwise). Counts in queries are ×5 for fast.
const FAST_SAMPLE_RATE = 0.2;

function report(view: string, ms: number, source: string): void {
  push({ kind: 'page', name: view, ms, source });
  const slow = ms > PAGE_READY_BUDGET_MS;
  if (slow || Math.random() < FAST_SAMPLE_RATE) {
    clientLog('perf_page_ready', { view, ms, source, slow }, slow ? 'warn' : 'info');
  }
}

function scheduleSettle(): void {
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    const n = nav;
    if (!n || n.reported) return;
    if (inflight > 0 && now() - n.start < GIVE_UP_MS) return; // next completion reschedules
    n.reported = true;
    report(n.view, Math.round(n.lastEnd - n.start), n.requests > 0 ? 'network' : 'idle');
  }, SETTLE_MS);
}

/** Call when the visible view changes (App.tsx does this for currentView). */
export function markNavigation(view: string): void {
  const start = now();
  nav = { view, start, lastEnd: start, requests: 0, reported: false };
  scheduleSettle();
}

/**
 * Call when a view has painted its data. Only the first report after a
 * navigation to that view counts, so background revalidations don't skew it.
 */
export function markViewReady(view: string, source: 'cache' | 'network'): void {
  if (!nav || nav.reported || nav.view !== view) return;
  nav.reported = true;
  report(view, Math.round(now() - nav.start), source);
}

// ── API timing ────────────────────────────────────────────────────────────

// Collapse ids so /events/3f2a…/messages and /events/9c1b…/messages group together.
export function endpointName(method: string | undefined, url: string | undefined): string {
  const path = (url || '').split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:n');
  return `${(method || 'get').toUpperCase()} ${path}`;
}

function parseServerTiming(header: unknown): number | undefined {
  if (typeof header !== 'string') return undefined;
  const m = header.match(/app;dur=([\d.]+)/);
  return m ? Math.round(Number(m[1])) : undefined;
}

type TimedConfig = { method?: string; url?: string; metadata?: { perfStart?: number } };

/** Request interceptor: stamp the start time on the config. */
export function startApiTimer<T extends object>(config: T): T {
  const c = config as T & TimedConfig;
  c.metadata = { ...(c.metadata || {}), perfStart: now() };
  inflight++;
  if (nav && !nav.reported) nav.requests++;
  return config;
}

/**
 * Response/error interceptor: record how long the call took. `outcome` is the
 * HTTP status, or 'TIMEOUT' / 'NETWORK_ERROR' when nothing came back.
 */
export function recordApiTiming(config: unknown, outcome: number | 'TIMEOUT' | 'NETWORK_ERROR' | 'CANCELED', serverTimingHeader?: unknown): void {
  const c = config as TimedConfig | undefined;
  const start = c?.metadata?.perfStart;
  if (!c || typeof start !== 'number') return;
  delete c.metadata!.perfStart; // count each attempt once
  inflight = Math.max(0, inflight - 1);
  const end = now();
  if (nav && !nav.reported) {
    nav.lastEnd = end;
    if (inflight === 0) scheduleSettle();
  }
  if (outcome === 'CANCELED') return;
  const ms = Math.round(end - start);
  const name = endpointName(c.method, c.url);
  const serverMs = parseServerTiming(serverTimingHeader);
  push({ kind: 'api', name, ms, serverMs, status: typeof outcome === 'number' ? outcome : undefined });
  if (outcome === 'TIMEOUT' || outcome === 'NETWORK_ERROR') {
    clientLog('perf_api_failed', { endpoint: name, ms, outcome, view: nav?.view }, 'warn');
  } else if (ms > API_SLOW_MS) {
    // serverMs small + ms large → the time went to the network, a cold
    // instance, or the request queueing behind others — not the route itself.
    clientLog('perf_api_slow', { endpoint: name, ms, serverMs, status: outcome, view: nav?.view }, 'warn');
  }
}

// ── Local report ──────────────────────────────────────────────────────────

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export function perfSummary(): Array<Record<string, string | number>> {
  const groups = new Map<string, Sample[]>();
  for (const s of samples) {
    const key = `${s.kind}:${s.name}`;
    (groups.get(key) || groups.set(key, []).get(key)!).push(s);
  }
  return [...groups.entries()].map(([key, list]) => {
    const ms = list.map((s) => s.ms).sort((a, b) => a - b);
    const server = list.map((s) => s.serverMs).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
    return {
      key,
      n: list.length,
      p50: pct(ms, 50),
      p95: pct(ms, 95),
      max: ms[ms.length - 1],
      serverP50: server.length ? pct(server, 50) : '-',
      fromCache: list.filter((s) => s.source === 'cache').length,
    };
  }).sort((a, b) => Number(b.p95) - Number(a.p95));
}

export function initPerf(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __twogetherPerf: unknown }).__twogetherPerf = {
    samples,
    summary: perfSummary,
    report: () => console.table(perfSummary()),
  };
}
