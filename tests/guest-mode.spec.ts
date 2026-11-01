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
  /\/api\/intimacy-plans\/samples$/, /\/api\/guest-ai\//, /\/api\/therapists$/, /\/api\/stories(\/[0-9a-f-]{36})?$/,
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

  test('compose → emotion check → quiz still work when the AI server is unreachable (on-device fallback)', async ({ page }) => {
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

  test('5 real AI tries: real result, live counter, then demo fallback', async ({ page }) => {
    await skipTour(page);
    let calls = 0;
    await page.route('**/api/guest-ai/quota**', (route) =>
      route.fulfill({ json: { success: true, usage: { tier: 'guest', limit: 5, used: calls, remaining: 5 - calls } } }));
    await page.route('**/api/guest-ai/draft_analysis', async (route) => {
      const body = route.request().postDataJSON();
      // The thread context travels with the call; the guest id is anonymous.
      expect(body.guest_id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
      expect(Array.isArray(body.recentMessages)).toBe(true);
      if (calls >= 5) return route.fulfill({ status: 429, json: { success: false, error_code: 'GUEST_AI_LIMIT', message: 'used up' } });
      calls += 1;
      return route.fulfill({ json: { success: true, result: {
        emotions: [{ label: '真AI情緒', emoji: '🤖', intensity: 77 }],
        partnerHears: { misread: 'm', real: 'r' }, need: 'n', rewrite: '這是真的 AI 改寫', toxicityFlags: [],
      }, usage: { tier: 'guest', limit: 5, used: calls, remaining: 5 - calls } } });
    });

    await page.goto('/');
    await expect(page.getByTestId('guest-ai-left')).toContainText('5／5');
    await page.getByTestId('nav-tab-talk').click();
    await page.getByText('說好的晚餐，他又遲到沒說').click();
    for (let i = 1; i <= 6; i++) {
      await page.getByTestId('event-reply-input').fill(`算了，反正你從來都不在乎 ${i}`);
      await page.getByTestId('event-draft-analyze-button').click();
      const meter = page.getByTestId('draft-emotion-meter');
      await expect(meter).toBeVisible();
      if (i <= 5) await expect(meter).toContainText('真AI情緒');
      else await expect(meter).not.toContainText('真AI情緒'); // demo fallback, flow not blocked
      await page.getByTestId('draft-emotion-meter-close').click();
    }
    await page.getByTestId('nav-tab-home').click();
    await expect(page.getByTestId('guest-ai-left')).toContainText('已用完');
  });
});
