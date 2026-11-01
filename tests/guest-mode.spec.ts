import { test, expect, type Page } from '@playwright/test';

// 訪客模式 (src/guest/): a visitor with no account runs the REAL app on a
// sample couple. Every request is answered by the in-browser mock backend and
// the data lives only in this tab's sessionStorage — nothing they write may
// reach the server.

const DB_KEY = 'tw_guest_db_v1';

// API calls a guest may legitimately make: public read-only content, auth, and
// anonymous tracking. Anything else means guest data leaked to the network.
const ALLOWED = [
  /\/api\/auth\//, /\/api\/track\//, /\/api\/feature-flags$/, /\/api\/feedback\/approved$/,
  /\/api\/intimacy-plans\/samples$/, /\/api\/therapists$/, /\/api\/stories(\/[0-9a-f-]{36})?$/,
];

function watchNetwork(page: Page): string[] {
  const leaks: string[] = [];
  page.on('request', (r) => {
    const url = r.url().split('?')[0];
    if (!url.includes('/api/')) return;
    if (!ALLOWED.some((re) => re.test(url))) leaks.push(`${r.method()} ${url}`);
  });
  return leaks;
}

async function skipTour(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('tw_guest_tour_seen', '1'));
}

test.describe('guest mode', () => {
  test('lands on the real app with a seeded sample couple and a one-time tour', async ({ page }) => {
    const leaks = watchNetwork(page);
    await page.goto('/');
    await expect(page.getByTestId('guest-banner')).toBeVisible();
    await expect(page.getByTestId('guest-tutorial')).toBeVisible();
    // The tour is a non-blocking card: the sign-up door stays clickable.
    await page.getByTestId('guest-tutorial-later').click();
    await expect(page.getByTestId('guest-tutorial')).toHaveCount(0);

    expect(await page.evaluate((k) => !!sessionStorage.getItem(k), DB_KEY)).toBe(true);
    // Guest identity is never persisted beyond the tab.
    expect(await page.evaluate(() => localStorage.getItem('authState'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('authUser'))).toBeNull();

    await page.reload();
    await expect(page.getByTestId('guest-banner')).toBeVisible();
    await expect(page.getByTestId('guest-tutorial')).toHaveCount(0);
    expect(leaks).toEqual([]);
  });

  test('every main tab shows sample data', async ({ page }) => {
    await skipTour(page);
    const leaks = watchNetwork(page);
    await page.goto('/');
    await page.getByTestId('nav-tab-talk').click();
    await expect(page.getByText('說好的晚餐，他又遲到沒說')).toBeVisible();
    await page.getByTestId('nav-tab-us').click();
    await expect(page.getByTestId('guest-banner')).toBeVisible();
    await page.getByTestId('nav-tab-grow').click();
    await expect(page.getByText('你們的溝通模式').first()).toBeVisible();
    expect(leaks).toEqual([]);
  });

  test('compose → emotion check → love-language quiz, all on-device', async ({ page }) => {
    await skipTour(page);
    const leaks = watchNetwork(page);
    await page.goto('/');
    await page.getByTestId('nav-tab-talk').click();
    await page.getByRole('button', { name: /開始對話/ }).first().click();
    await page.getByTestId('compose-raw-input').fill('你每次都說好要早點回來，結果又不回訊息！');
    await page.getByRole('button', { name: /讓 AI 整理/ }).click();
    await expect(page.getByTestId('compose-event-summary')).toBeVisible();
    await page.locator('button').filter({ hasText: /送出|建立/ }).last().click();

    await page.getByTestId('event-reply-input').fill('算了，反正你從來都不在乎');
    await page.getByTestId('event-draft-analyze-button').click();
    await expect(page.getByTestId('draft-emotion-meter')).toBeVisible();

    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-love-language').click();
    await page.getByTestId('love-language-start').click();
    for (let i = 0; i < 15; i++) await page.getByTestId('love-language-quiz').locator('button').nth(1).click();
    await expect(page.getByTestId('love-language-result')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('love-language-result')).toBeVisible();
    expect(leaks).toEqual([]);
  });

  test('重置試玩資料 restores the sample couple', async ({ page }) => {
    await skipTour(page);
    await page.goto('/');
    await page.getByTestId('nav-tab-talk').click();
    await page.getByRole('button', { name: /開始對話/ }).first().click();
    await page.getByTestId('compose-raw-input').fill('測試重置用的一件事');
    await page.getByRole('button', { name: /讓 AI 整理/ }).click();
    await page.locator('button').filter({ hasText: /送出|建立/ }).last().click();
    const count = () => page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) || '{}').events.length, DB_KEY);
    await expect.poll(count).toBe(4);

    await page.getByTestId('user-menu-toggle').click();
    await page.getByText('重置試玩資料').click();
    await expect.poll(count).toBe(3);
  });
});
