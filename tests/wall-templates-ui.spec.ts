import { test, expect } from '@playwright/test';

// UI smoke for the wall starter templates:
//  1. an empty wall shows several *short* example cards (not one long one)
//  2. the composer's 「從範本開始」 panel auto-expands the first time, and stays
//     collapsed on later opens once the user has dismissed it / used a template
//
// Stubs auth + wall APIs (like wall-privacy-mood-ui.spec.ts) so it needs no
// paired couple in the DB.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';

test.describe('Wall — starter templates', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }));
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem('wall_tutorial_seen_' + user.id, '1');
      localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 864e5).toISOString());
    }, FAKE_USER);

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

    await page.route('**/api/wall/mood-tags**', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, tags: [] }) })
    );

    // Empty wall for the whole spec.
    await page.route('**/api/wall*', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'GET' && /\/api\/wall(\?[^/]*)?$/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, wall_posts: [] }),
        });
      }
      return route.fallback();
    });
  });

  test('empty wall shows a few short examples; one of them pre-fills the composer', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('button:has-text("我們的牆")').first().click();

    // toHaveCount retries — the wall re-renders while it loads, and a bare
    // count() can land on the in-between frame.
    const demos = page.locator('[data-testid^="wall-demo-use-template-"]');
    await expect(demos).toHaveCount(3, { timeout: 10000 });

    await demos.first().click();
    // Template applied → composer opens with content already filled in.
    await expect(page.getByTestId('wall-composer-content')).not.toHaveValue('');
  });

  test('templates panel auto-expands once, then stays collapsed after dismissal', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('button:has-text("我們的牆")').first().click();

    await page.locator('button:has-text("新貼文")').first().click();
    const toggle = page.getByTestId('wall-composer-templates-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Dismiss ("下次別自動展開") and reopen — still collapsed, one line only.
    await page.getByTestId('wall-composer-templates-dismiss').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await page.locator('button[aria-label="關閉"]').first().click();
    await page.locator('button:has-text("新貼文")').first().click();
    await expect(page.getByTestId('wall-composer-templates-toggle')).toHaveAttribute('aria-expanded', 'false');

    // Still reachable — expanding again re-arms the auto-expand.
    await page.getByTestId('wall-composer-templates-toggle').click();
    await expect(page.getByTestId('wall-composer-templates-toggle')).toHaveAttribute('aria-expanded', 'true');
  });
});
