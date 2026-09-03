import { test, expect, Page } from '@playwright/test';

const TEST_USER = { email: 'test-e2e@twogether.app', password: 'test123456' };

async function loginIfNeeded(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pairingPromptDismissed', 'true'));
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const loginButton = page.getByTestId('header-auth-button');
  // 今天 (home) is the default landing view now, not 我們/record — probe with
  // user-menu-toggle (present on every authenticated view) instead of a
  // testid that only exists after navigating to 我們.
  const userMenu = page.getByTestId('user-menu-toggle');
  await Promise.race([
    loginButton.waitFor({ state: 'visible', timeout: 20000 }),
    userMenu.waitFor({ state: 'visible', timeout: 20000 }),
  ]).catch(() => {});

  if (await userMenu.isVisible({ timeout: 1500 }).catch(() => false)) return;
  if (!(await loginButton.isVisible({ timeout: 3000 }).catch(() => false))) return;

  await loginButton.click();
  await expect(page.getByTestId('auth-modal-heading')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('auth-email-input').fill(TEST_USER.email);
  await page.getByTestId('auth-password-input').fill(TEST_USER.password);
  await page.getByTestId('auth-submit-button').click();
  await Promise.race([
    page.waitForResponse((r) => r.url().includes('/auth/login'), { timeout: 15000 }),
    userMenu.waitFor({ timeout: 15000 }),
  ]).catch(() => {});
  if (await page.getByTestId('auth-modal-heading').isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
  }
}

test.describe('Calendar month view — adjacent-month days', () => {
  test('grid fills leading/trailing cells with real days (no blank padding)', async ({ page }) => {
    await loginIfNeeded(page);
    await page.getByTestId('nav-tab-us').click();
    await page.getByTestId('us-calendar-entry').click();

    const grid = page.getByTestId('calendar-grid');
    await expect(grid).toBeVisible({ timeout: 10000 });

    // Every cell is a real, clickable day button — the old invisible padding
    // cells (which hid e.g. 6/30 when 7/1 is a Wednesday) are gone.
    const cells = grid.locator('button');
    const count = await cells.count();
    expect(count).toBeGreaterThanOrEqual(28); // ≥ 4 full weeks
    expect(count % 7).toBe(0);                // always whole weeks
    await expect(grid.locator('.invisible')).toHaveCount(0);

    // Every day cell shows a day number (adjacent-month days included).
    const firstDayText = (await cells.first().innerText()).trim();
    expect(firstDayText).toMatch(/\d+/);
  });
});
