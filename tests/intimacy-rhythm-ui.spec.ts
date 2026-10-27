import { test, expect, type Page } from '@playwright/test';

// 親密節奏 calendar (PRD Features A/C/D) with every /api call mocked: the
// rhythm strips around the predicted ovulation day, the day card any calendar
// tap opens, and the one-tap 每日狀態 that is private until the owner shares it.

const FAKE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'rhythm@x.test',
  nickname: 'A',
  selected_therapist: 'luma',
  cycle_tracking_enabled: true,
};
const PARTNER_ID = '99999999-9999-9999-9999-999999999999';
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (base: Date, days: number) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
};

type Call = { method: string; url: string; body: string };

async function seed(page: Page, opts: { periodStart: string; partnerShared?: { date: string } }) {
  await page.addInitScript((user) => {
    localStorage.setItem('authToken', 'fake-jwt');
    localStorage.setItem('authUser', JSON.stringify(user));
    localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }));
    localStorage.setItem('pairingPromptDismissed', 'true');
    localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 86400000).toISOString());
  }, FAKE_USER);

  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }),
  );
  await page.route('**/api/couples**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        couple: { id: COUPLE_ID, user1_id: FAKE_USER.id, user1_nickname: 'A', user2_id: PARTNER_ID, user2_nickname: 'B' },
      }),
    });
  });
  await page.route('**/api/auth/**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: true }),
    });
  });
  await page.route('**/api/cycle-records**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        cycle_records: [{
          id: '44444444-4444-4444-4444-444444444444', tracked_by: FAKE_USER.id,
          start_date: opts.periodStart, length_days: 5, notes: null, created_at: new Date().toISOString(),
        }],
      }),
    });
  });

  const calls: Call[] = [];
  await page.route('**/api/day-status**', (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      const partner = opts.partnerShared
        ? [{ date: opts.partnerShared.date, mood: 'good', intimacy_intention: 'start_with_cuddles', sharing_enabled: true }]
        : [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, mine: [], partner }),
      });
    }
    calls.push({ method: req.method(), url: req.url(), body: req.postData() ?? '' });
    const date = req.url().split('/day-status/')[1]?.slice(0, 10);
    const body = JSON.parse(req.postData() || '{}');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        day_status: req.method() === 'PUT'
          ? { date, mood: body.mood ?? null, intimacy_intention: body.intimacy_intention ?? 'want_intimacy', sharing_enabled: body.sharing_enabled ?? false }
          : null,
      }),
    });
  });
  return calls;
}

async function openCalendar(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('nav-tab-us').click();
  await page.getByTestId('us-calendar-entry').click();
  await page.getByTestId('calendar-today-cell').waitFor({ state: 'visible', timeout: 15000 });
}

test.describe('親密節奏 calendar', () => {
  test('shades ±5 days around the predicted ovulation and the day card explains it', async ({ page }) => {
    test.setTimeout(60000);
    // One period 14 days before today → 28-day default → predicted ovulation
    // = start + 14 = today. Today is the darkest cell.
    const today = new Date();
    await seed(page, { periodStart: ymd(shift(today, -14)) });
    await openCalendar(page);

    const todayCell = page.getByTestId('calendar-today-cell');
    await expect(todayCell).toHaveAttribute('data-rhythm-level', '6');
    await expect(todayCell.getByTestId('rhythm-ovulation-strip')).toBeVisible();
    await expect(page.getByTestId('rhythm-legend')).toBeVisible();

    await todayCell.click();
    const card = page.getByTestId('day-rhythm-card');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('day-rhythm-phase')).toContainText('預測排卵日');
    await expect(card.getByTestId('day-rhythm-ovulation')).toHaveText(ymd(today));
    // Only one record → no reliable window yet.
    await expect(card.getByTestId('day-rhythm-window')).toHaveText('預測資料有限');
    // Not recorded ≠ no.
    await expect(card.getByTestId('day-status-mood')).toContainText('尚未記錄');
    await expect(card.getByTestId('day-status-intention')).toContainText('尚未記錄');
    await expect(card).toContainText('沒記錄不代表沒有意願');
  });

  test('records mood / intention in one tap, private until shared, and can clear', async ({ page }) => {
    test.setTimeout(60000);
    const today = new Date();
    const calls = await seed(page, { periodStart: ymd(shift(today, -40)) });
    await openCalendar(page);

    await page.getByTestId('calendar-today-cell').click();
    const card = page.getByTestId('day-rhythm-card');
    await card.getByTestId('day-status-open').click();

    await card.getByTestId('day-status-intention-want_intimacy').click();
    // Optimistic: the summary flips before/regardless of the network.
    await expect(card.getByTestId('day-status-intention')).toContainText('想要親密互動');
    await expect(card.getByTestId('day-status-visibility')).toContainText('只有你看得到');
    await expect.poll(() => calls.filter(c => c.method === 'PUT').length, { timeout: 10000 }).toBe(1);
    const first = JSON.parse(calls[0].body);
    expect(first).toEqual({ intimacy_intention: 'want_intimacy' });
    expect(calls[0].url).toContain(`/day-status/${ymd(today)}`);

    // Sharing is an explicit, separate action by the owner.
    await card.getByTestId('day-status-share-toggle').check();
    await expect.poll(() => calls.filter(c => c.method === 'PUT').length).toBe(2);
    expect(JSON.parse(calls[1].body)).toEqual({ sharing_enabled: true });
    await expect(card.getByTestId('day-status-visibility')).toContainText('已分享給');

    await card.getByTestId('day-status-clear').click();
    await expect.poll(() => calls.filter(c => c.method === 'DELETE').length).toBe(1);
    await expect(card.getByTestId('day-status-intention')).toContainText('尚未記錄');
  });

  test('future days can be viewed but not recorded; partner status shows only when shared', async ({ page }) => {
    test.setTimeout(60000);
    const today = new Date();
    const yesterday = shift(today, -1);
    await seed(page, { periodStart: ymd(shift(today, -40)), partnerShared: { date: ymd(yesterday) } });
    await openCalendar(page);

    // Tomorrow may sit in next month's grid — navigate if needed.
    const tomorrow = ymd(shift(today, 1));
    let cell = page.locator(`[data-date="${tomorrow}"]`).first();
    if ((await cell.count()) === 0) await page.getByTitle('下一個月').click();
    await cell.click();
    let card = page.getByTestId('day-rhythm-card');
    await expect(card.getByTestId('day-status-future')).toBeVisible();
    await expect(card.getByTestId('day-status-open')).toHaveCount(0);
    await expect(card.getByTestId('day-status-partner')).toHaveCount(0);
    await card.getByTestId('day-rhythm-close').click();

    cell = page.locator(`[data-date="${ymd(yesterday)}"]`).first();
    if ((await cell.count()) === 0) await page.getByTitle('上一個月').click();
    await cell.click();
    card = page.getByTestId('day-rhythm-card');
    const partner = card.getByTestId('day-status-partner');
    await expect(partner).toBeVisible();
    await expect(partner).toContainText('可以先從擁抱、牽手開始');
    await expect(partner).toContainText('不等於同意');
  });

  test('the day card still reaches the add-record form', async ({ page }) => {
    test.setTimeout(60000);
    await seed(page, { periodStart: ymd(shift(new Date(), -40)) });
    await openCalendar(page);
    await page.getByTestId('calendar-today-cell').click();
    await page.getByTestId('day-rhythm-add-record').click();
    await expect(page.getByTestId('day-rhythm-card')).toHaveCount(0);
    await expect(page.getByTestId('record-submit-button')).toBeVisible();
  });
});
