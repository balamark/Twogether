// Short-lived cache + request sharing for GETs of page data.
//
// Every view remounts on tab switch / 上一頁 and refetches everything it
// shows; several components also fetch the same endpoint at once (one walk
// through the tabs fetched /relationship/summary 9 times). For the endpoints
// below, this answers a repeat GET from memory for FRESH_MS and lets
// concurrent callers share one request, with no change to the components.
//
// Safety rules:
//   • Allowlist only — data a person reads, not realtime threads, money, auth,
//     AI quota or pairing state (those must always be live).
//   • Any successful write (POST/PUT/PATCH/DELETE) clears the whole cache, so
//     you always see your own change, even when it affects another resource
//     (e.g. uploading a script also awards coins).
//   • Memory only and cleared with auth storage (see clearAuthStorage).
// A partner's change shows up within FRESH_MS at worst.

import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const FRESH_MS = 30_000;

const CACHEABLE = [
  /^\/relationship\/summary$/,
  /^\/love-moments$/,
  /^\/stats(\/|$)/,
  /^\/achievements(\/|$)/,
  /^\/activity$/,
  /^\/marketplace(\/|$)/,
  /^\/script-favorites$/,
  /^\/custom-scripts$/,
  /^\/custom-gifts$/,
  /^\/cycle-records$/,
  /^\/events\/analytics$/,
  /^\/intimacy-plans\/samples$/,
  /^\/feedback\/approved$/,
  /^\/journey(\/|$)/,
];

type Entry = { response: AxiosResponse; at: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<AxiosResponse>>();

function keyFor(config: InternalAxiosRequestConfig): string | null {
  if ((config.method || 'get').toLowerCase() !== 'get') return null;
  const path = (config.url || '').split('?')[0].replace(/^(?!\/)/, '/');
  if (!CACHEABLE.some((re) => re.test(path))) return null;
  // Locale changes the translated messages; auth distinguishes accounts.
  return [config.url, JSON.stringify(config.params ?? {}), config.headers?.['X-Locale'], config.headers?.Authorization].join('|');
}

export function clearResponseCache(): void {
  cache.clear();
  inflight.clear();
}

// Each caller gets its own data, so one component mutating a response can't
// change what another receives.
function copy(response: AxiosResponse, config: InternalAxiosRequestConfig): AxiosResponse {
  return { ...response, config, data: structuredClone(response.data) };
}

/** Wraps the real adapter; install via apiClient.defaults.adapter. */
export function cachingAdapter(base: AxiosAdapter): AxiosAdapter {
  return (config) => {
    const key = keyFor(config);
    if (!key) return base(config);

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) {
      return Promise.resolve(copy(hit.response, config));
    }
    const pending = inflight.get(key);
    if (pending) return pending.then((r) => copy(r, config));

    const p = base(config)
      .then((response) => {
        if (response.status >= 200 && response.status < 300) cache.set(key, { response: copy(response, config), at: Date.now() });
        return response;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
