import { test, expect } from '@playwright/test';

// UI smoke for the upload progress ring on a wall post with media. Mirrors
// wall-media-ui.spec.ts's stubbing setup. Goal: after submitting a post with
// a photo, the composer shows a live progress ring (not a stuck disabled
// button) while the upload is in flight, and clicking the ring cancels the
// request cleanly — closing the ring, keeping the draft, and not blowing up
// the composer with a red error.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test.describe('Wall — upload progress ring', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem(
        'authState',
        JSON.stringify({ user, isAuthenticated: true, partnerConnected: true })
      );
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem('wall_tutorial_seen_' + user.id, '1');
      localStorage.setItem(
        'authTokenExpiresAt',
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      );
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
            couple: {
              id: COUPLE_ID,
              user1_id: FAKE_USER.id,
              user1_nickname: FAKE_USER.nickname,
              user2_id: '88888888-8888-8888-8888-888888888888',
              user2_nickname: 'B',
            },
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

    await page.route('**/api/wall*', async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      if (method === 'GET' && /\/api\/wall(\?[^/]*)?$/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, wall_posts: [] }),
        });
      }
      if (method === 'POST' && /\/api\/wall$/.test(url)) {
        // Hang long enough for the test to observe the in-flight progress ring
        // before deciding whether to let it resolve or cancel it client-side.
        await new Promise((r) => setTimeout(r, 5000));
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            wall_post: {
              id: '77777777-7777-7777-7777-777777777777',
              content: '今天的約會超棒',
              mood_tag: null,
              category: 'general',
              author_id: FAKE_USER.id,
              author_nickname: 'A',
              reply_count: 0,
              media: ['/images/roleplay/reunion-love.png'],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        });
      }
      return route.fallback();
    });
  });

  test('shows a cancelable progress ring instead of a stuck button', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-us').click();
    const wallNav = page.getByTestId('us-wall-entry');
    await wallNav.waitFor({ state: 'visible', timeout: 15000 });
    await wallNav.click();

    await page.locator('button:has-text("新貼文")').first().click();
    await page.getByTestId('wall-composer-content').fill('今天的約會超棒');

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('wall-composer-media-button').click(),
    ]);
    await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('wall-composer-media-grid')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('wall-composer-submit').click();

    // The stuck-button bug this fixes: instead of a disabled "送出中…" button
    // with zero feedback, a progress ring (with a cancel affordance) appears.
    const ring = page.getByTestId('wall-composer-upload-progress');
    await expect(ring).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('wall-composer-submit')).toHaveCount(0);

    // Cancel mid-upload: the ring disappears, the ordinary footer comes back,
    // the draft (text + media) is untouched, and there's no red error text.
    await page.getByTestId('wall-composer-upload-cancel').click();
    await expect(ring).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByTestId('wall-composer-submit')).toBeVisible();
    await expect(page.getByTestId('wall-composer-content')).toHaveValue('今天的約會超棒');
    await expect(page.getByTestId('wall-composer-media-grid')).toBeVisible();
  });
});
