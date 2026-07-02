import { test, expect, type Page } from '@playwright/test';

// E2E for the /admin dashboard (Basic-Auth gated, served by the Express backend
// on :8080). The dashboard's interactivity lives in one inline <script>, so a
// single syntax error there silently kills ALL of it (tabs stop switching, data
// never loads) — which is exactly the "Invalid or unexpected token" regression
// this suite guards against. We assert: (1) no uncaught page errors, (2) every
// tab switches, (3) the Q&A pool + reviews tabs actually function.

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'test-admin-pw';

// Basic-Auth for every request in this file.
test.use({ httpCredentials: { username: 'admin', password: ADMIN_PW } });

// Collect uncaught errors from the page. A broken inline <script> (e.g. an
// unescaped newline inside a JS string) surfaces here as a 'pageerror'.
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test.describe('Admin dashboard', () => {
  // Guards the reported "更新失敗: toggle 500" — the feature_flags table was
  // missing because a duplicate migration version silently skipped it.
  test('feature flags: list + toggle show_weekly_average works', async ({ page }) => {
    const listRes = await page.request.get(`${BACKEND_BASE}/api/admin/feature-flags`);
    expect(listRes.ok(), await listRes.text()).toBeTruthy();
    const list = await listRes.json();
    const flag = (list.flags || []).find((f: { key: string }) => f.key === 'show_weekly_average');
    expect(flag, 'show_weekly_average flag is listed').toBeTruthy();

    // Toggle ON — this is the call that returned 500 when the table was absent.
    const onRes = await page.request.post(
      `${BACKEND_BASE}/api/admin/feature-flags/show_weekly_average`,
      { data: { enabled: true } },
    );
    expect(onRes.status(), await onRes.text()).toBe(200);
    expect((await onRes.json()).enabled).toBe(true);

    // Toggle back OFF to leave a clean state.
    const offRes = await page.request.post(
      `${BACKEND_BASE}/api/admin/feature-flags/show_weekly_average`,
      { data: { enabled: false } },
    );
    expect(offRes.status()).toBe(200);
    expect((await offRes.json()).enabled).toBe(false);
  });

  test('loads with no script errors and every tab switches', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto(`${BACKEND_BASE}/admin`);
    await page.waitForLoadState('domcontentloaded');

    // Default panel is the funnel.
    await expect(page.locator('#panel-funnel')).toHaveClass(/active/);

    // Each tab activates its panel — proves the inline script parsed and the
    // delegated click handler is live.
    for (const panel of ['pages', 'retention', 'therapists', 'reviews', 'pool']) {
      await page.locator(`.tab[data-panel="${panel}"]`).click();
      await expect(page.locator(`#panel-${panel}`)).toHaveClass(/active/);
    }

    expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('Q&A revenue pool: create then compute shows shares', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto(`${BACKEND_BASE}/admin`);
    await page.locator('.tab[data-panel="pool"]').click();
    await expect(page.locator('#panel-pool')).toHaveClass(/active/);

    const month = new Date().toISOString().slice(0, 7); // YYYY-MM (month input format)
    await page.fill('#poolMonth', month);
    await page.fill('#poolAmount', '1000');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/qa/pools') && r.request().method() === 'POST', { timeout: 15000 }),
      page.click('#poolCreate'),
    ]);

    // The new pool appears in the table (idempotent: re-runs update the row).
    await expect(page.locator('#poolsTable')).toContainText(month, { timeout: 10000 });

    // Compute the split → the per-therapist shares detail becomes visible.
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/compute') && r.request().method() === 'POST', { timeout: 15000 }),
      page.locator('#poolsTable button[data-pool="compute"]').first().click(),
    ]);
    await expect(page.locator('#poolDetail')).toBeVisible({ timeout: 10000 });

    expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('reviews moderation tab loads its table', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto(`${BACKEND_BASE}/admin`);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/therapists/reviews'), { timeout: 15000 }),
      page.locator('.tab[data-panel="reviews"]').click(),
    ]);
    await expect(page.locator('#reviewsTable')).toBeVisible();
    expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('AI usage tab loads its aggregates', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto(`${BACKEND_BASE}/admin`);
    // The AI usage tab is the last tab; on narrow viewports the wrapped tab row
    // can overlap, so force the click (it still fires the lazy-load handler).
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/admin/ai-usage') && r.request().method() === 'GET',
        { timeout: 15000 }
      ),
      page.locator('.tab[data-panel="ai-usage"]').click({ force: true }),
    ]);
    await expect(page.locator('#panel-ai-usage')).toHaveClass(/active/);
    // The summary cards and per-scenario table render (even with zero rows).
    await expect(page.locator('#aiUsageCards .card').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#aiUsageKindTable')).toBeVisible();
    expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('can delete an account from the recent-users table', async ({ page, request }) => {
    // Register a throwaway account via the API so it appears in the funnel table.
    const email = `admindel-${Date.now()}@example.com`;
    const reg = await request.post(`${BACKEND_BASE}/api/auth/register`, {
      data: { email, nickname: 'AdminDelMe', password: 'test123456' },
    });
    expect(reg.ok()).toBeTruthy();

    await page.goto(`${BACKEND_BASE}/admin`);
    const sel = `#usersTable button[data-del-user][data-email="${email}"]`;
    await expect(page.locator(sel)).toBeVisible({ timeout: 15000 });

    // The delete button confirms via window.confirm — accept it.
    page.once('dialog', (d) => d.accept());
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/admin/users/') && r.request().method() === 'DELETE'),
      page.locator(sel).click(),
    ]);
    expect(resp.status()).toBe(200);

    // Row is gone after the table reloads.
    await expect(page.locator(sel)).toHaveCount(0, { timeout: 10000 });
  });
});
