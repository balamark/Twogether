# Performance: measuring and keeping pages instant

Goal: switching tabs and pressing 上一頁 should feel instant. A page you've
already seen in this session must repaint from memory, and a page you open for
the first time should show its data within about a second.

## Budgets

| What | Budget | How it's met |
| --- | --- | --- |
| Revisit / 上一頁 to a page seen this session | ≤ 300 ms p95 (cache paint ≈ 10–50 ms) | `useCachedQuery` / `useCachedState`, short-TTL GET cache |
| First open of a page | ≤ 1 s p95 | indexed queries, parallel requests, no duplicate fetches |
| Any single API call | ≤ 1.5 s (warn), client timeout 15 s | `slow_request` / `perf_api_slow` logs point at the culprit |
| List-card image | ≤ ~50 KB | 480px WebP thumbnails; full image only in detail views |

## What's measured, and where it goes

**In the browser** (`src/utils/perf.ts`):

- `client.perf_page_ready`: time from a view change (tab, menu, 上一頁) until
  that view shows its data. `source`:
  - `cache`: painted from memory (no wait)
  - `network`: waited for requests
  - `idle`: the view made no requests
  Logged as a warning (`slow: true`) when it's over 1 s. Every slow load is
  logged; fast ones are sampled at 20%.
- `client.perf_api_slow`: a call over 1.5 s. It carries `ms` (what the user
  waited) and `serverMs` (time inside our Node process, from the
  `Server-Timing` header). **High `ms` with low `serverMs`** means the time went
  to the network, an App Engine cold start, or the request queueing on the
  single F1 instance, not to the route's code.
- `client.perf_api_failed`: a timeout or network failure (GETs retry once
  before this reaches the user).
- In the console: `__twogetherPerf.report()` prints p50/p95 per view and
  endpoint for the current tab.

**On the server**:

- `slow_request` (warning, `middleware/logging.js`): any request over 1 s, with
  the route and duration.
- `slow_query` (warning, `database/db.js`): any query over 500 ms. It includes
  `poolWaiting` and `poolTotal`, so pool exhaustion (10 connections) is visible.
- Every response carries `Server-Timing: app;dur=<ms>`.

### Cloud Logging queries

```
# Slowest page loads this week
jsonPayload.message="client.perf_page_ready" AND jsonPayload.slow=true

# Slow API calls; compare ms with serverMs
jsonPayload.message="client.perf_api_slow"

# Client timeouts / dropped connections
jsonPayload.message="client.perf_api_failed"

# Slow routes / queries on the server
jsonPayload.message="slow_request"
jsonPayload.message="slow_query"
```

## Measuring locally / before a release

`scripts/perf/measure-pages.mjs` signs in and walks every main view three
ways: a cold open, a revisit, and 上一頁 back through history. It reads the same
`page_ready` numbers production reports. It exits 1 when revisit/back p95 is
over budget or a page never becomes ready.

```
PERF_EMAIL=… PERF_PASSWORD=… node scripts/perf/measure-pages.mjs \
  --base=https://staging-dot-<project>.appspot.com --mobile --rounds=3
```

`--idle=35` waits between rounds so revisits fall outside the 30 s GET
response cache and test the page cache itself. `--mobile` adds a 4× CPU slowdown and ~4G latency, which is closer to how
most people use the app. Run it before and after a change that touches page
loading, and paste both summaries in the PR.

## Making a page instant

Every main page (首頁, 對話, 我們, 成長, 劇本, 設定, 留言牆, 親密邀請紀錄)
loads its data this way.

- **New view data**: load it with `useCachedQuery(userKey('/resource',
  …parts), fetcher)` from `src/services/queryCache.ts`. Data read by more
  than one component gets one shared hook in `src/hooks/usePageData.ts`, so
  they share a cache entry and a request (the relationship summary is read by
  首頁, 我們 and the dashboard).
- **Existing view with its own fetch + optimistic updates**: swap its
  `useState` for `useCachedState(key, initial)`. When `wasCached` is true,
  skip the spinner and run the refresh inside `refreshQuietly(...)` (see
  `WallView`).
- **Optimistic writes on cached data**: use the hook's `mutate(prev => …)`
  (see `LineNotificationSettings`).
- **Freshness**: any successful write marks every cached page stale. It
  still paints instantly, but always refreshes on the next visit. Otherwise
  data younger than 15 s isn't refetched.
- **Timing**: a refresh of data already on screen counts as background
  work, so `page_ready` reports `cache` instead of waiting on it.
- **Read-mostly endpoints shared by many components**: add them to the
  allowlist in `src/services/responseCache.ts`. Never add realtime threads,
  money, auth, AI quota or pairing state.
- **Images in lists**: use `thumbSrc()` (src/utils/script.ts) with a fallback
  to the full URL, plus `loading="lazy"` and `object-contain`.

## Known infrastructure limit

Production runs on **one F1 instance with `min_instances: 0`** (app.yaml). After
about 15 minutes idle the instance shuts down, and the next visitor waits for
a cold start: Node boot plus a DB connection, often several seconds on F1. That
is the most likely source of the "sometimes times out" reports. A photo
upload (sharp resize on a 600 MHz CPU) also slows every other request on that
one instance.

Options: `min_instances: 1` keeps one instance warm. With `max_instances: 1`
that's about 24 instance-hours a day. The free tier is 28 F-class hours a day,
**shared with the staging service**, so staging usage beyond about 4 h a day
would be billed. A larger instance class (F2) halves CPU-bound latency at
roughly 2× the hourly price.
