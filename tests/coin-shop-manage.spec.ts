import { test, expect, type Page } from '@playwright/test';

// 存款 page: gift management (every gift, built-ins included, can be edited or
// removed and restored — optimistically) and the deposit flows on top of it.

const FAKE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@x.test',
  nickname: 'A',
  selected_therapist: 'luma',
};
const CUSTOM_ID = '77777777-7777-7777-7777-777777777777';

async function setup(page: Page, summary: Record<string, unknown> = { success: true, paired: false }) {
  const calls: { method: string; url: string; body: string }[] = [];

  await page.addInitScript((user) => {
    localStorage.setItem('authToken', 'fake-jwt');
    localStorage.setItem('authUser', JSON.stringify(user));
    localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: false }));
    localStorage.setItem('pairingPromptDismissed', 'true');
    localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    localStorage.setItem('tw:lastView', 'shop');
  }, FAKE_USER);

  await page.route('**/api/**', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }),
  );

  await page.route('**/api/auth/**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: false }),
      });
    }
    return route.fallback();
  });

  await page.route('**/api/coins/**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summary) });
    }
    calls.push({ method: req.method(), url: req.url(), body: req.postData() ?? '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.route('**/api/custom-gifts**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          custom_gifts: [
            { id: CUSTOM_ID, title: '我的禮品', description: '自訂', cost: 300, category: 'service', icon: '🎈', isCustom: true },
          ],
          hidden_defaults: ['shopping'],
        }),
      });
    }
    calls.push({ method: req.method(), url: req.url(), body: req.postData() ?? '' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        custom_gift: { id: '99999999-9999-9999-9999-999999999999', title: '在家晚餐', description: 'x', cost: 1800, category: 'service', icon: '🍽️', isCustom: true },
      }),
    });
  });

  return calls;
}

async function openShop(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('gift-card').first()).toBeVisible({ timeout: 15000 });
}

test.describe('Coin shop gift management', () => {
  test('removed built-ins stay hidden and can be restored', async ({ page }) => {
    test.setTimeout(60000);
    const calls = await setup(page);
    await openShop(page);

    // 6 built-ins − 1 hidden + 1 custom.
    await expect(page.getByTestId('gift-card')).toHaveCount(6);
    await expect(page.getByTestId('restore-default-gifts')).toContainText('1');

    await page.getByTestId('restore-default-gifts').click();
    await expect(page.getByTestId('gift-card')).toHaveCount(7);
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/custom-gifts/defaults/hidden'))).toBe(true);
  });

  test('removing a gift needs a confirm tap and is optimistic', async ({ page }) => {
    test.setTimeout(60000);
    const calls = await setup(page);
    await openShop(page);

    const massage = page.getByTestId('gift-card').filter({ hasText: '全身按摩' });
    await massage.getByTestId('remove-gift').click();
    // First tap only arms it.
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    await massage.getByTestId('confirm-remove-gift').click();

    await expect(page.getByTestId('gift-card').filter({ hasText: '全身按摩' })).toHaveCount(0);
    await expect.poll(() => calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/custom-gifts/defaults/massage'))).toBe(true);
  });

  test('edits a custom gift in place and a built-in as a replacement copy', async ({ page }) => {
    test.setTimeout(60000);
    const calls = await setup(page);
    await openShop(page);

    // Custom gift → PUT.
    await page.getByTestId('gift-card').filter({ hasText: '我的禮品' }).getByTestId('edit-gift').click();
    await page.locator('#gift-cost').fill('550');
    await page.getByRole('button', { name: '儲存修改' }).click();
    await expect(page.getByTestId('gift-card').filter({ hasText: '我的禮品' })).toContainText('550');
    await expect.poll(() => calls.some((c) => c.method === 'PUT' && c.url.endsWith(`/custom-gifts/${CUSTOM_ID}`))).toBe(true);

    // Built-in → POST with replaces_default, original disappears.
    await page.getByTestId('gift-card').filter({ hasText: '浪漫晚餐' }).getByTestId('edit-gift').click();
    await page.locator('#gift-title').fill('在家晚餐');
    await page.getByRole('button', { name: '儲存修改' }).click();
    await expect(page.getByTestId('gift-card').filter({ hasText: '浪漫晚餐' })).toHaveCount(0);
    await expect(page.getByTestId('gift-card').filter({ hasText: '在家晚餐' })).toHaveCount(1);
    await expect
      .poll(() => calls.find((c) => c.method === 'POST')?.body ?? '')
      .toContain('"replaces_default":"dinner"');
  });

  test('edit and remove are 44px and physically separated', async ({ page }) => {
    test.setTimeout(60000);
    await setup(page);
    await openShop(page);

    const card = page.getByTestId('gift-card').first();
    const edit = await card.getByTestId('edit-gift').boundingBox();
    const del = await card.getByTestId('remove-gift').boundingBox();
    expect(edit!.height).toBeGreaterThanOrEqual(44);
    expect(del!.height).toBeGreaterThanOrEqual(44);
    expect(del!.x - (edit!.x + edit!.width)).toBeGreaterThanOrEqual(8);
  });

  test('paired: shows both accounts + average, answers a partner request, and asks to redeem', async ({ page }) => {
    test.setTimeout(60000);
    const now = new Date().toISOString();
    const calls = await setup(page, {
      success: true,
      paired: true,
      me: { balance: 1600, available: 1600 },
      partner: { balance: 400 },
      average: 1000,
      awaiting_me: [
        { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', kind: 'request', status: 'pending', amount: 100, note: '我幫你寫了劇本', gift_icon: null, owner_id: 'p', created_by: 'p', is_mine: false, created_at: now, responded_at: null },
      ],
      awaiting_partner: [],
      recent: [],
    });
    await openShop(page);

    await expect(page.getByTestId('deposit-mine')).toContainText('1600');
    await expect(page.getByTestId('deposit-partner')).toContainText('400');
    await expect(page.getByTestId('deposit-average')).toContainText('1000');
    await expect(page.getByTestId('deposit-history-empty')).toBeVisible();

    await page.getByTestId('deposit-confirm').click();
    await expect.poll(() => calls.some((c) => c.url.endsWith('/coins/transactions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/respond') && c.body.includes('"confirm"'))).toBe(true);

    // 全身按摩 costs 1500 ≤ 1600 available → redeemable; 浪漫晚餐 (2000) is 400 short.
    const dinner = page.getByTestId('gift-card').filter({ hasText: '浪漫晚餐' }).getByTestId('redeem-gift');
    await expect(dinner).toBeDisabled();
    await expect(dinner).toContainText('存款還差 400');
    await page.getByTestId('gift-card').filter({ hasText: '全身按摩' }).getByTestId('redeem-gift').click();
    await expect.poll(() => calls.find((c) => c.url.endsWith('/coins/redemptions'))?.body ?? '').toContain('"cost":1500');

    // 感謝存款 form posts to the partner's account.
    await page.getByTestId('open-thanks-deposit').click();
    await page.locator('#deposit-note').fill('謝謝你煮晚餐');
    await page.getByTestId('submit-deposit').click();
    await expect.poll(() => calls.find((c) => c.url.endsWith('/coins/deposits'))?.body ?? '').toContain('"kind":"thanks"');
  });

  test('unpaired: three-part gate and redeem disabled', async ({ page }) => {
    test.setTimeout(60000);
    await setup(page);
    await openShop(page);
    await expect(page.getByTestId('deposit-unpaired-gate')).toContainText('邀請另一半');
    await expect(page.getByTestId('redeem-gift').first()).toBeDisabled();
    await expect(page.getByTestId('redeem-gift').first()).toContainText('配對後才能兌換');
  });
});
