import { test, expect } from '@playwright/test';

// Smoke test for the 關係之屋 dashboard + weekly check-in. Auth + relationship
// APIs are stubbed so it doesn't need a paired DB couple — the goal is the UI:
// the dashboard surfaces the top nudge on 記錄時光, and a check-in can be submitted.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
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
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          checkins: [
            { id: 'c1', nickname: 'A', isMine: true, trust: 4, commitment: 5, connection: 4, note: '還不錯', createdAt: new Date().toISOString() },
          ],
        }),
      })
    );
    await page.route('**/api/coins/summary', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true, paired: true,
          me: { balance: 600, available: 600 }, partner: { balance: 400 }, average: 500,
          awaiting_me: [], awaiting_partner: [], recent: [],
        }),
      })
    );
    await page.route('**/api/relationship/goodwill', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          positive: [{ kind: 'wall', label: '牆上的話', why: '正向分享', count: 1, items: [{ text: '謝謝你', who: 'A', at: new Date().toISOString() }] }],
          negative: [{ kind: 'conflict', label: '衝突事件', why: '摩擦', count: 1, items: [{ text: '家事', at: new Date().toISOString() }] }],
        }),
      })
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

    // 感情存款 shows in the house; the auto-counted 好感存款 meter is paused
    // (goodwill_meter flag off by default).
    await expect(page.getByTestId('love-bank-card')).toBeVisible();
    await expect(page.getByTestId('love-bank-average')).toContainText('500');
    // Average only; its meaning sits behind the (?).
    await expect(page.getByTestId('love-bank-card')).not.toContainText('600');
    await page.getByTestId('love-bank-hint').click();
    await expect(page.getByTestId('love-bank-hint-text')).toContainText('平均');
    await expect(page.getByTestId('goodwill-details-button')).toHaveCount(0);

    // Past check-in results are viewable.
    await page.getByTestId('relationship-history-button').click();
    await expect(page.getByTestId('checkin-history-modal')).toBeVisible();
    await expect(page.getByTestId('checkin-history-modal')).toContainText('還不錯');
  });

  test('with goodwill_meter on, the 好感存款 meter and breakdown come back', async ({ page }) => {
    await page.route('**/api/feature-flags', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, flags: { goodwill_meter: true } }) })
    );
    await page.goto('/');
    await expect(page.getByTestId('relationship-dashboard')).toBeVisible({ timeout: 15000 });

    // Goodwill breakdown modal explains the + / − items.
    await page.getByTestId('goodwill-details-button').click();
    await expect(page.getByTestId('goodwill-modal')).toBeVisible();
    await expect(page.getByTestId('goodwill-modal')).toContainText('牆上的話');
    await page.getByTestId('goodwill-modal').getByLabel('關閉').click();

    // 5:1 ratio hint toggles open.
    await page.getByTestId('goodwill-ratio-hint-toggle').click();
    await expect(page.getByTestId('goodwill-ratio-hint')).toBeVisible();
  });

  test('a partner request waiting in 感情存款 becomes the top nudge', async ({ page }) => {
    const now = new Date().toISOString();
    await page.route('**/api/coins/summary', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true, paired: true,
          me: { balance: 0, available: 0 }, partner: { balance: 0 }, average: 0,
          awaiting_me: [{ id: 'x', kind: 'request', status: 'pending', amount: 100, note: 'n', gift_icon: null, owner_id: 'p', created_by: 'p', is_mine: false, created_at: now, responded_at: null }],
          awaiting_partner: [], recent: [],
        }),
      })
    );
    // No intimacy gap / overdue check-in, so the deposit nudge is the most urgent.
    await page.route('**/api/relationship/summary', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          paired: true, partnerNickname: 'B', daysSinceIntimacy: 1, daysSinceAppreciation: 1,
          positive14: 3, negative14: 0, openConflicts: 0,
          checkin: { myLastDays: 1, coupleLastDays: 1, periodDays: 7, overdue: false },
        }),
      })
    );
    await page.goto('/');
    await expect(page.getByTestId('relationship-primary-nudge')).toContainText('感情存款', { timeout: 15000 });
  });
});
