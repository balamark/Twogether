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
});
