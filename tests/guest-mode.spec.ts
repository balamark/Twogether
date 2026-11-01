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

  test('core loop: write → real AI versions → sample partner replies → AI counselor joins', async ({ page }) => {
    await skipTour(page);
    const leaks = watchNetwork(page);
    let used = 0;
    const usage = () => ({ tier: 'guest', limit: 5, used, remaining: 5 - used });
    const seen: Record<string, number> = {};
    await page.route('**/api/guest-ai/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/quota')) return route.fulfill({ json: { success: true, usage: usage() } });
      const kind = url.split('/').pop() as string;
      seen[kind] = (seen[kind] || 0) + 1;
      const body = route.request().postDataJSON();
      expect(body.guest_id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
      if (kind === 'icebreaker') {
        used += 1;
        return route.fulfill({ json: { success: true, usage: usage(), result: {
          title: '真AI標題', summary: '真AI摘要', detail: '', emotions: ['失望'], tags: ['溝通'], toxicityFlags: [],
          versions: { neutral: '真AI平靜版', firm: '真AI堅定版', warm: '真AI溫柔版' } } } });
      }
      if (kind === 'partner_reply') {
        // The partner answers the guest's own words.
        expect(body.recentMessages.at(-1).fromSelf).toBe(true);
        return route.fulfill({ json: { success: true, usage: usage(), result: { reply: '真AI阿哲：我不是故意的，但我懂你等很久。' } } });
      }
      used += 1;
      expect(body.names).toEqual({ me: '小安', partner: '阿哲' });
      return route.fulfill({ json: { success: true, usage: usage(), result: { comment: '真AI諮商師：你們都在乎彼此。', toxicityFlags: [] } } });
    });

    await page.goto('/');
    await page.getByTestId('guest-start-conversation').click();
    await page.getByTestId('compose-raw-input').fill('你每次都說好要早點回來，結果又不回訊息！');
    await page.getByRole('button', { name: /讓 AI 整理/ }).click();
    await expect(page.getByText('真AI溫柔版')).toBeVisible();
    await page.locator('button').filter({ hasText: /送出|建立/ }).last().click();

    await expect(page.getByTestId('guest-coach')).toHaveAttribute('data-state', 'typing');
    await expect(page.getByTestId('guest-coach')).toHaveAttribute('data-state', 'replied', { timeout: 10000 });
    await expect(page.getByText('真AI阿哲：我不是故意的')).toBeVisible();

    await page.getByTestId('guest-coach-counselor').click();
    await page.getByTestId('event-sophie-help-advice').click();
    await expect(page.getByTestId('event-ai-counselor-modal')).toContainText('真AI諮商師');
    await page.getByTestId('event-ai-counselor-post').click();
    await expect(page.getByTestId('guest-coach')).toHaveAttribute('data-state', 'counselor');
    await expect(page.getByText('真AI諮商師：你們都在乎彼此。')).toBeVisible();
    expect(seen).toEqual({ icebreaker: 1, partner_reply: 1, event_counselor: 1 });

    // 重新開始對話 brings back the sample conversations only.
    await page.getByTestId('guest-restart-conversation').click();
    await expect.poll(() => page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) || '{}').events.length, DB_KEY)).toBe(3);
    expect(leaks).toEqual([]);
  });

  test('when the 5 tries are used up the flow continues on the demo and the coach says why', async ({ page }) => {
    await skipTour(page);
    await page.route('**/api/guest-ai/**', (route) =>
      route.fulfill({ status: 429, json: { success: false, error_code: 'GUEST_AI_LIMIT', message: 'used up' } }));
    await page.goto('/');
    await page.getByTestId('guest-start-conversation').click();
    await page.getByTestId('compose-raw-input').fill('你每次都不回訊息！');
    await page.getByRole('button', { name: /讓 AI 整理/ }).click();
    // On-device versions still appear: no dead end.
    await expect(page.getByTestId('compose-event-summary')).toBeVisible();
    await expect(page.getByTestId('guest-coach')).toHaveAttribute('data-state', 'limit');
    await expect(page.getByTestId('guest-coach-signup')).toBeVisible();
  });
});
