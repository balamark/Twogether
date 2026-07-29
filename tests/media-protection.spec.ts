import { test, expect } from '@playwright/test';

// Wall photos are not downloadable: right-click and drag-to-save are blocked
// app-wide (src/hooks/useMediaProtection.ts + the img/video rules in
// src/index.css). Auth + wall APIs are stubbed the same way as
// wall-media-ui.spec.ts so the test doesn't need a paired couple in the DB.
//
// The most important assertion here is the last one: the protection must not
// eat the normal tap-to-enlarge interaction.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';
const POST_ID = '77777777-7777-7777-7777-777777777777';
const SAMPLE_IMAGE = '/images/roleplay/reunion-love.png';

test.describe('Media protection — wall photos cannot be saved', () => {
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

    // One existing post with a photo — no compose flow needed here.
    const post = {
      id: POST_ID,
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
    await page.route('**/api/wall*', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'GET' && /\/api\/wall(\?[^/]*)?$/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, wall_posts: [post] }),
        });
      }
      return route.fallback();
    });
  });

  test('right-click and drag are blocked, explained once, and tap-to-enlarge still works', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const wallNav = page.locator('button:has-text("我們的牆")').first();
    await wallNav.waitFor({ state: 'visible', timeout: 15000 });
    await wallNav.click();

    const media = page.getByTestId(`wall-post-media-${POST_ID}`);
    await expect(media).toBeVisible({ timeout: 10000 });
    const photo = media.locator('img').first();

    // Probe listener: registered after the app's, so it runs later in the same
    // bubble phase and sees whether the app cancelled the event. This lets a
    // *real* right-click be asserted — the native menu itself isn't observable.
    await page.evaluate(() => {
      const w = window as unknown as { __ctxPrevented?: boolean };
      w.__ctxPrevented = undefined;
      document.addEventListener('contextmenu', (e) => {
        w.__ctxPrevented = e.defaultPrevented;
      });
    });

    // Right-click: the context menu (i.e. "save image as") is cancelled.
    await photo.click({ button: 'right' });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __ctxPrevented?: boolean }).__ctxPrevented))
      .toBe(true);

    // The first blocked attempt explains itself rather than failing silently.
    const toast = page.locator('text=照片受保護');
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Drag-to-desktop is cancelled too, and it does NOT re-fire the toast —
    // the explanation is once per tab session.
    // Resolved and dispatched in the same tick: showing the toast re-renders the
    // wall, so a locator handle taken beforehand can point at a detached node.
    const dragPrevented = await page.evaluate((testId) => {
      const img = document.querySelector(`[data-testid="${testId}"] img`);
      if (!img) return null;
      const ev = new Event('dragstart', { bubbles: true, cancelable: true });
      img.dispatchEvent(ev);
      return ev.defaultPrevented;
    }, `wall-post-media-${POST_ID}`);
    expect(dragPrevented).toBe(true);
    await expect(toast).toHaveCount(1);

    // Regression guard: blocking saves must not break opening the photo.
    await photo.click();
    await expect(page.getByTestId('wall-lightbox')).toBeVisible({ timeout: 5000 });
  });
});
