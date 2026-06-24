import { test, expect } from '@playwright/test';

// Smoke test for the 關係之屋 dashboard + weekly check-in. Auth + relationship
// APIs are stubbed so it doesn't need a paired DB couple — the goal is the UI:
// the dashboard surfaces the top nudge on 記錄時光, and a check-in can be submitted.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';

test.describe('關係之屋 dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }));
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 864e5).toISOString());
    }, FAKE_USER);

    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    );
    // Keep partnerConnected true on mount.
    await page.route('**/api/couples**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              couple: { id: COUPLE_ID, user1_id: FAKE_USER.id, user1_nickname: 'A', user2_id: '888', user2_nickname: 'B' },
            }),
          })
        : route.fallback()
    );
    await page.route('**/api/auth/**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: true }) })
        : route.fallback()
    );
    // Signals: a long intimacy gap (top nudge) + overdue check-in.
    await page.route('**/api/relationship/summary', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          paired: true,
          partnerNickname: 'B',
          daysSinceIntimacy: 20,
          daysSinceAppreciation: 12,
          positive14: 1,
          negative14: 1,
          openConflicts: 1,
          checkin: { myLastDays: null, coupleLastDays: null, periodDays: 7, overdue: true },
        }),
      })
    );
    await page.route('**/api/relationship/checkins', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checkins: [] }) })
    );
  });

  test('dashboard surfaces a nudge and a check-in can be submitted', async ({ page }) => {
    let posted: { trust?: number } = {};
    await page.route('**/api/relationship/checkin', (route) => {
      if (route.request().method() === 'POST') {
        posted = route.request().postDataJSON();
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'ok' }) });
      }
      return route.fallback();
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // The dashboard renders on the default 記錄時光 view with the top nudge.
    await expect(page.getByTestId('relationship-dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('relationship-primary-nudge')).toContainText('20 天');

    // Open the check-in, score the three pillars, submit.
    await page.getByTestId('relationship-checkin-button').click();
    await expect(page.getByTestId('relationship-checkin-modal')).toBeVisible();
    await page.getByTestId('checkin-trust-4').click();
    await page.getByTestId('checkin-commitment-5').click();
    await page.getByTestId('checkin-connection-3').click();
    await page.getByTestId('checkin-submit').click();

    await expect(page.getByTestId('relationship-checkin-modal')).toHaveCount(0, { timeout: 10000 });
    expect(posted.trust, 'a check-in was POSTed').toBe(4);
  });
});
