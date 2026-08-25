import { test, expect } from '@playwright/test';

// UI smoke for attaching a photo to a wall post. Like wall-ai-counselor.spec.ts
// we stub auth + the wall APIs so the test doesn't need a paired couple in the
// DB. Goal: pick a file → see the preview → submit → the new card renders media.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';
const NEW_POST_ID = '77777777-7777-7777-7777-777777777777';
const SAMPLE_IMAGE = '/images/roleplay/reunion-love.png';

// 1x1 red PNG for the file picker.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test.describe('Wall — attach a photo', () => {
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

    // Wall list starts empty; POST "creates" the post so subsequent GETs (the app
    // refetches after creating) return it — mirroring the real backend.
    const createdPost = {
      id: NEW_POST_ID,
      content: '今天的約會超棒',
      mood_tag: null,
      category: 'general',
      author_id: FAKE_USER.id,
      author_nickname: 'A',
      reply_count: 0,
      media: [SAMPLE_IMAGE],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    let created = false;
    await page.route('**/api/wall*', async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      if (method === 'GET' && /\/api\/wall(\?[^/]*)?$/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, wall_posts: created ? [createdPost] : [] }),
        });
      }
      if (method === 'POST' && /\/api\/wall$/.test(url)) {
        created = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, wall_post: createdPost }),
        });
      }
      return route.fallback();
    });
  });

  test('pick a photo, preview it, submit, and see it on the card', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-us').click();
    const wallNav = page.getByTestId('us-wall-entry');
    await wallNav.waitFor({ state: 'visible', timeout: 15000 });
    await wallNav.click();

    // Open the composer.
    await page.locator('button:has-text("新貼文")').first().click();
    await page.getByTestId('wall-composer-content').fill('今天的約會超棒');

    // Drive the picker by CLICKING THE REAL BUTTON, not by calling
    // setInputFiles on the hidden input. setInputFiles bypasses the button
    // entirely, so it passes even when the button is completely dead — which is
    // exactly how a broken 新增照片／影片 shipped. waitForEvent('filechooser')
    // times out unless the click really opened the picker.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('wall-composer-media-button').click(),
    ]);
    await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('wall-composer-media-grid')).toBeVisible({ timeout: 5000 });

    // Submit and confirm the new card renders the media as an <img>.
    await page.getByTestId('wall-composer-submit').click();
    const media = page.getByTestId(`wall-post-media-${NEW_POST_ID}`);
    await expect(media).toBeVisible({ timeout: 10000 });
    await expect(media.locator('img')).toHaveAttribute('src', /reunion-love\.png$/);
  });
});
