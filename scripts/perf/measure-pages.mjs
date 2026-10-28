#!/usr/bin/env node
// Page-to-page response time, measured the way a user feels it.
//
// Signs in, then for each view: opens it cold, opens it again (cached
// revisit), and walks back through history with 上一頁. Timing comes from the
// app's own instrumentation (src/utils/perf.ts → window.__twogetherPerf), the
// same `page_ready` number production reports to Cloud Logging, so local runs
// and prod dashboards agree. See docs/PERFORMANCE.md.
//
// Usage:
//   PERF_EMAIL=… PERF_PASSWORD=… node scripts/perf/measure-pages.mjs [options]
//
// Options:
//   --base=<url>        app origin (default http://localhost:5174, or PERF_BASE_URL)
//   --views=a,b,c       view ids (default: main tabs + common sub-pages)
//   --rounds=<n>        repeat the whole walk n times (default 2)
//   --mobile            emulate a mid-range phone: 4× CPU slowdown + ~4G network
//   --idle=<s>          wait this long between rounds (e.g. 35, past the 30s GET cache)
//   --budget=<ms>       exit 1 if any revisit / back p95 exceeds this (default 300)
//   --out=<file>        also write raw samples as JSON
//
// Exit code 1 when a budget is exceeded, so it can gate CI or a pre-release check.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

const BASE = args.base || process.env.PERF_BASE_URL || 'http://localhost:5174';
const EMAIL = process.env.PERF_EMAIL;
const PASSWORD = process.env.PERF_PASSWORD;
const VIEWS = (args.views || 'home,talk,us,grow,intimacy-history,roleplay,wall,settings').split(',');
const ROUNDS = Number(args.rounds || 2);
const BUDGET = Number(args.budget || 300);
const READY_TIMEOUT = 30_000;

if (!EMAIL || !PASSWORD) {
  console.error('Set PERF_EMAIL and PERF_PASSWORD (a test account on the target environment).');
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext(args.mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
const page = await context.newPage();

if (args.mobile) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8,
  });
}

await page.addInitScript(() => {
  localStorage.setItem('pairingPromptDismissed', 'true');
});
await page.goto(BASE);
await page.getByTestId('header-auth-button').click();
await page.getByTestId('auth-email-input').fill(EMAIL);
await page.getByTestId('auth-password-input').fill(PASSWORD);
await page.getByTestId('auth-submit-button').click();
await page.getByTestId('user-menu-toggle').waitFor({ timeout: 30_000 });
const close = page.getByTestId('auth-modal-close-button');
if (await close.isVisible({ timeout: 1000 }).catch(() => false)) await close.click().catch(() => {});

const sampleCount = () => page.evaluate(() => window.__twogetherPerf?.samples.length ?? 0);

// Wait for the next page_ready sample for `view` recorded after index `from`.
async function waitReady(view, from) {
  const handle = await page.waitForFunction(
    ([v, i]) => window.__twogetherPerf?.samples.slice(i).find((s) => s.kind === 'page' && s.name === v) ?? null,
    [view, from],
    { timeout: READY_TIMEOUT, polling: 50 },
  );
  return handle.jsonValue();
}

// Switch view the same way the app does (useHistoryState keeps `view` in
// history.state.tw), so menu-only pages are reachable without clicking menus.
async function open(view) {
  // Already showing it (e.g. home right after sign-in) → nothing to time.
  const current = await page.evaluate(() => window.history.state?.tw?.nav?.view ?? null);
  if (current === view) return null;
  const from = await sampleCount();
  await page.evaluate((v) => {
    const cur = window.history.state?.tw;
    const entry = { nav: { view: v }, prev: cur?.nav ?? null, scrollY: 0 };
    window.history.pushState({ tw: entry }, '');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, view);
  return waitReady(view, from);
}

async function back(expectedView) {
  const from = await sampleCount();
  await page.goBack();
  return waitReady(expectedView, from);
}

const results = [];
const record = (phase, view, sample) => {
  if (!sample) return console.log(`skip    ${view.padEnd(18)} (already open)`);
  results.push({ phase, view, ms: sample.ms, source: sample.source });
  console.log(`${phase.padEnd(7)} ${view.padEnd(18)} ${String(sample.ms).padStart(6)}ms  ${sample.source}`);
};

for (let round = 1; round <= ROUNDS; round++) {
  if (round > 1 && args.idle) {
    console.log(`\n(idle ${args.idle}s)`);
    await page.waitForTimeout(Number(args.idle) * 1000);
  }
  console.log(`\n— round ${round} —`);
  for (const view of VIEWS) {
    try {
      record(round === 1 ? 'cold' : 'revisit', view, await open(view));
    } catch {
      results.push({ phase: 'timeout', view, ms: READY_TIMEOUT, source: 'timeout' });
      console.log(`timeout ${view} (no page_ready within ${READY_TIMEOUT}ms)`);
    }
  }
  // 上一頁 through what we just opened.
  for (let i = VIEWS.length - 2; i >= 0; i--) {
    try {
      record('back', VIEWS[i], await back(VIEWS[i]));
    } catch {
      results.push({ phase: 'timeout', view: VIEWS[i], ms: READY_TIMEOUT, source: 'timeout' });
      console.log(`timeout back→${VIEWS[i]}`);
    }
  }
}

await browser.close();

const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))]; };
console.log('\nphase    n    p50    p95    max');
let failed = false;
for (const phase of ['cold', 'revisit', 'back', 'timeout']) {
  const ms = results.filter((r) => r.phase === phase).map((r) => r.ms);
  if (!ms.length) continue;
  const sorted = [...ms].sort((a, b) => a - b);
  const line = `${phase.padEnd(7)} ${String(ms.length).padStart(3)} ${String(sorted[Math.floor(ms.length / 2)]).padStart(6)} ${String(p95(ms)).padStart(6)} ${String(sorted[sorted.length - 1]).padStart(6)}`;
  console.log(line);
  if ((phase === 'revisit' || phase === 'back') && p95(ms) > BUDGET) failed = true;
  if (phase === 'timeout') failed = true;
}
if (args.out) writeFileSync(args.out, JSON.stringify(results, null, 2));
if (failed) {
  console.error(`\n✗ over budget: revisit/back p95 must be ≤ ${BUDGET}ms with no timeouts`);
  process.exit(1);
}
console.log(`\n✓ revisit/back within ${BUDGET}ms`);
