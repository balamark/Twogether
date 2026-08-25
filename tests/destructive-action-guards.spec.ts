import { test, expect, type Page } from '@playwright/test';

// A mis-landed tap is only dangerous when it hits something irreversible. These
// assert the two defences: destructive controls are physically separated from
// the ones people reach for, and they don't fire without a confirmation.

const FAKE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@x.test',
  nickname: 'A',
  selected_therapist: 'luma',
};
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';
const POST_ID = '66666666-6666-6666-6666-666666666666';

async function setup(page: Page, opts: { isPrivate?: boolean } = {}) {
  const calls: { method: string; url: string; body: string }[] = [];

  await page.addInitScript((user) => {
    localStorage.setItem('authToken', 'fake-jwt');
    localStorage.setItem('authUser', JSON.stringify(user));
    localStorage.setItem(
      'authState',
      JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }),
    );
    localStorage.setItem('pairingPromptDismissed', 'true');
    localStorage.setItem('wall_tutorial_seen_' + user.id, '1');
    localStorage.setItem(
      'authTokenExpiresAt',
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    );
  }, FAKE_USER);

  await page.route('**/api/**', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    }),
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

  const post = {
    id: POST_ID,
    content: '一則不該被誤刪的貼文',
    mood_tag: null,
    category: 'general',
    author_id: FAKE_USER.id,
    author_nickname: 'A',
    reply_count: 0,
    media: [],
    is_private: opts.isPrivate ?? false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await page.route('**/api/wall*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /\/api\/wall(\?[^/]*)?$/.test(req.url())) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, wall_posts: [post] }),
      });
    }
    return route.fallback();
  });

  await page.route(`**/api/wall/${POST_ID}**`, async (route) => {
    const req = route.request();
    calls.push({ method: req.method(), url: req.url(), body: req.postData() ?? '' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, wall_post: post }),
    });
  });

  return calls;
}

async function openWall(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('nav-tab-us').click();
  const wallNav = page.getByTestId('us-wall-entry');
  await wallNav.waitFor({ state: 'visible', timeout: 15000 });
  await wallNav.click();
  await expect(page.locator('[aria-label="編輯"]').first()).toBeVisible({ timeout: 10000 });
}

test.describe('Destructive actions survive a slightly-off tap', () => {
  test('edit and delete are 44px and physically separated', async ({ page }) => {
    test.setTimeout(60000);
    await setup(page);
    await openWall(page);

    const edit = await page.locator('[aria-label="編輯"]').first().boundingBox();
    const del = await page.locator('[aria-label="刪除"]').first().boundingBox();
    expect(edit).not.toBeNull();
    expect(del).not.toBeNull();

    // Both comfortably tappable…
    expect(edit!.height).toBeGreaterThanOrEqual(44);
    expect(del!.height).toBeGreaterThanOrEqual(44);

    // …and not touching. These used to be ~26px icons 4px apart, so a tap meant
    // for 編輯 could land on 刪除.
    const gap = del!.x - (edit!.x + edit!.width);
    expect(gap, `only ${gap}px between 編輯 and 刪除`).toBeGreaterThanOrEqual(8);
  });

  test('dismissing the delete confirmation keeps the post', async ({ page }) => {
    test.setTimeout(60000);
    const calls = await setup(page);
    await openWall(page);

    let asked = '';
    page.on('dialog', async (d) => {
      asked = d.message();
      await d.dismiss();
    });

    await page.locator('[aria-label="刪除"]').first().click();

    expect(asked, 'delete fired without asking').toContain('刪除');
    // Give a would-be DELETE time to actually reach the route handler — reading
    // the array the instant click() returns would pass even if the guard were
    // removed.
    await expect
      .poll(() => calls.filter((c) => c.method === 'DELETE').length, { timeout: 3000 })
      .toBe(0);
    await expect(page.locator('text=一則不該被誤刪的貼文')).toBeVisible();
  });

  test('sharing a private post asks before exposing it', async ({ page }) => {
    test.setTimeout(60000);
    const calls = await setup(page, { isPrivate: true });
    await openWall(page);

    let asked = '';
    page.on('dialog', async (d) => {
      asked = d.message();
      await d.dismiss();
    });

    await page.getByTestId(`wall-privacy-toggle-${POST_ID}`).click();

    // Private → shared is a one-way disclosure and must be confirmed. Assert the
    // real message, not merely that *some* dialog appeared.
    expect(asked, 'privacy flipped without asking').toContain('分享給TA');
    await expect
      .poll(() => calls.filter((c) => c.method === 'PUT' || c.method === 'PATCH').length, {
        timeout: 3000,
      })
      .toBe(0);
  });
});
