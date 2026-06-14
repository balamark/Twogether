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
});
