import { test, expect } from '@playwright/test';

// Premium upgrade flow. Like events-reply.spec.ts, we seed auth via localStorage
// and stub the APIs so the test doesn't depend on a real paired couple or a live
// ECPay account. Goal: verify the paywall UI + that "升級" kicks off a checkout
// without actually navigating to ECPay.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';

const BILLING_STATUS_FREE = {
  success: true,
  tier: 'free',
  expires_at: null,
  has_couple: true,
  plans: [
    { id: 'pass_30', days: 30, amount: 90, label: 'Twogether Premium 30 天' },
    { id: 'pass_90', days: 90, amount: 240, label: 'Twogether Premium 90 天' },
    { id: 'pass_365', days: 365, amount: 790, label: 'Twogether Premium 365 天' },
  ],
};

// One paid order and the electronic receipt issued for it (lib/receipts.js).
const RECEIPT_NO = 'TG-20260801-A1B2C3';

const ORDERS_RESPONSE = {
  success: true,
  orders: [
    {
      order_no: 'TGTEST0001',
      source: 'premium',
      item_label: 'Twogether Premium 90 天',
      amount: 240,
      status: 'paid',
      provider: 'newebpay',
      payment_method: 'CREDIT',
      created_at: '2026-08-01T02:12:00.000Z',
      paid_at: '2026-08-01T02:13:00.000Z',
      receipt_no: RECEIPT_NO,
      receipt_issued_at: '2026-08-01T02:13:00.000Z',
      invoice_no: null,
    },
  ],
};

const RECEIPT_RESPONSE = {
  success: true,
  receipt: {
    receipt_no: RECEIPT_NO,
    source: 'premium',
    item_label: 'Twogether Premium 90 天',
    amount: 240,
    currency: 'TWD',
    provider: 'newebpay',
    trade_no: '26080100112233',
    invoice_no: null,
    buyer_email: 'a@x.test',
    buyer_name: 'A',
    buyer_title: '測試股份有限公司',
    buyer_tax_id: '12345678',
    issued_at: '2026-08-01T02:13:00.000Z',
    seller_name: 'Twogether（個人賣家）',
    seller_tax_id: null,
    seller_contact: 'support@twogether.fun',
  },
};

test.describe('Premium upgrade flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem(
        'authState',
        JSON.stringify({ user, isAuthenticated: true, partnerConnected: true })
      );
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 86_400_000).toISOString());
    }, FAKE_USER);

    // Catch-all first so specific routes below win (reverse-registration order).
    await page.route('**/api/**', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    );

    await page.route('**/api/couples**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            couple: { id: COUPLE_ID, user1_id: FAKE_USER.id, user1_nickname: 'A', user2_id: '888', user2_nickname: 'B' },
          }),
        });
      }
      return route.fallback();
    });

    await page.route('**/api/auth/**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: true }),
        });
      }
      return route.fallback();
    });

    await page.route('**/api/billing/status**', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BILLING_STATUS_FREE) })
    );

    await page.route('**/api/billing/orders**', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ORDERS_RESPONSE) })
    );

    await page.route('**/api/billing/receipts/**', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RECEIPT_RESPONSE) })
    );
  });

  test('opens upgrade view from the user menu and lists plans', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-upgrade').click();

    await expect(page.getByTestId('upgrade-view')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('plan-pass_30')).toBeVisible();
    await expect(page.getByTestId('plan-pass_90')).toBeVisible();
    await expect(page.getByTestId('plan-pass_365')).toBeVisible();
    await expect(page.getByTestId('plan-pass_30').getByText('NT$90', { exact: true })).toBeVisible();
  });

  test('clicking 升級 starts a checkout and posts to ECPay', async ({ page }) => {
    // Intercept the checkout call and assert it fires; return a fake ECPay form.
    let checkoutPlan: string | null = null;
    await page.route('**/api/billing/checkout**', async (route) => {
      checkoutPlan = JSON.parse(route.request().postData() || '{}').plan;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          action_url: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
          params: { MerchantID: '2000132', MerchantTradeNo: 'TGTEST', CheckMacValue: 'ABC' },
        }),
      });
    });

    // Stop the browser from actually navigating to ECPay — abort the form POST.
    let ecpaySubmitted = false;
    await page.route('https://payment-stage.ecpay.com.tw/**', async (route) => {
      ecpaySubmitted = true;
      return route.abort();
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-upgrade').click();
    await expect(page.getByTestId('upgrade-view')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('upgrade-button-pass_90').click();

    await expect.poll(() => checkoutPlan, { timeout: 5000 }).toBe('pass_90');
    await expect.poll(() => ecpaySubmitted, { timeout: 5000 }).toBe(true);
  });

  test('optional 抬頭／統編 ride along with the checkout, and a bad 統編 blocks it', async ({ page }) => {
    // Heaviest test in the file: a full page load plus two checkout attempts.
    // Against a cold Vite dev build that outgrows the config's 60s default.
    test.setTimeout(90_000);
    let checkoutBody: Record<string, unknown> | null = null;
    await page.route('**/api/billing/checkout**', async (route) => {
      checkoutBody = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          action_url: 'https://ccore.newebpay.com/MPG/mpg_gateway',
          params: { MerchantID: 'MS1839358868', TradeInfo: 'abc', TradeSha: 'DEF', Version: '2.0' },
        }),
      });
    });
    await page.route('https://ccore.newebpay.com/**', async (route) => route.abort());

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-upgrade').click();
    await expect(page.getByTestId('upgrade-view')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('receipt-details-toggle').click();
    await page.getByTestId('receipt-title-input').fill('測試股份有限公司');
    // The input strips non-digits, so a short 統編 is the reachable bad case.
    await page.getByTestId('receipt-tax-id-input').fill('123');
    // These are controlled inputs: assert the value has round-tripped through
    // React state before clicking, otherwise the click can read stale state and
    // start a checkout that should have been blocked.
    await expect(page.getByTestId('receipt-title-input')).toHaveValue('測試股份有限公司');
    await expect(page.getByTestId('receipt-tax-id-input')).toHaveValue('123');
    await page.getByTestId('upgrade-button-pass_30').click();

    // Blocked client-side with a specific reason — no checkout call at all.
    await expect(page.getByText('統一編號需為 8 位數字', { exact: false })).toBeVisible({ timeout: 5000 });
    expect(checkoutBody).toBeNull();

    await page.getByTestId('receipt-tax-id-input').fill('12345678');
    await expect(page.getByTestId('receipt-tax-id-input')).toHaveValue('12345678');
    await page.getByTestId('upgrade-button-pass_30').click();

    await expect.poll(() => checkoutBody, { timeout: 5000 }).toMatchObject({
      plan: 'pass_30',
      receipt_title: '測試股份有限公司',
      receipt_tax_id: '12345678',
    });
  });

  test('purchase history lists the receipt and opens the printable document', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-upgrade').click();
    await expect(page.getByTestId('upgrade-view')).toBeVisible({ timeout: 5000 });

    const history = page.getByTestId('purchase-receipts');
    await expect(history).toBeVisible();
    await expect(history.getByText('Twogether Premium 90 天')).toBeVisible();

    await page.getByTestId('receipt-open-TGTEST0001').click();

    const doc = page.getByTestId('receipt-document');
    await expect(doc).toBeVisible({ timeout: 5000 });
    await expect(doc.getByText(RECEIPT_NO)).toBeVisible();
    await expect(doc.getByText('NT$ 240')).toBeVisible();
    await expect(doc.getByText('測試股份有限公司')).toBeVisible();
    await expect(doc.getByText('12345678')).toBeVisible();
    // Individual seller: the document must say why there's no 統一發票.
    await expect(doc.getByText('尚未辦理稅籍登記', { exact: false })).toBeVisible();

    // Print isolation is driven by this body class (see index.css).
    await expect(page.locator('body.printing-receipt')).toHaveCount(1);
    await page.getByTestId('receipt-close-button').click();
    await expect(page.getByTestId('receipt-modal')).toHaveCount(0);
    await expect(page.locator('body.printing-receipt')).toHaveCount(0);
  });
});
