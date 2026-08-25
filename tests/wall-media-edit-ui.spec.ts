import { test, expect } from '@playwright/test';

// The 編輯貼文 path had no coverage at all, which is where the dead
// 新增照片／影片 button was actually reported. Same stubbing approach as
// wall-media-ui.spec.ts: fake auth in localStorage + routed APIs, so no paired
// couple is needed in the DB.

const FAKE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@x.test',
  nickname: 'A',
  selected_therapist: 'luma',
};
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';
const POST_ID = '66666666-6666-6666-6666-666666666666';
const EXISTING_A = '/images/roleplay/reunion-love.png';
const EXISTING_B = '/images/roleplay/first-date.png';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Captured body of the last PUT/PATCH to /api/wall/<id>. */
type Captured = { contentType: string; body: string };

async function setup(page: import('@playwright/test').Page, media: string[]) {
  const captured: Captured[] = [];

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

  // Catch-all first so a fake JWT never reaches the real backend.
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
    content: '上週的小旅行',
    mood_tag: null,
    category: 'general',
    author_id: FAKE_USER.id,
    author_nickname: 'A',
    reply_count: 0,
    media,
    is_private: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await page.route('**/api/wall*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && /\/api\/wall(\?[^/]*)?$/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, wall_posts: [post] }),
      });
    }
    return route.fallback();
  });

  await page.route(`**/api/wall/${POST_ID}`, async (route) => {
    const req = route.request();
    if (req.method() === 'PUT' || req.method() === 'PATCH') {
      captured.push({
        contentType: req.headers()['content-type'] ?? '',
        body: req.postData() ?? '',
      });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, wall_post: post }),
      });
    }
    return route.fallback();
  });

  return captured;
}

/** Open the wall, then the edit composer for the seeded post. */
async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('nav-tab-us').click();
  const wallNav = page.getByTestId('us-wall-entry');
  await wallNav.waitFor({ state: 'visible', timeout: 15000 });
  await wallNav.click();
  await page.locator('[aria-label="編輯"]').first().click();
  await expect(page.locator('h2:has-text("編輯貼文")')).toBeVisible({ timeout: 10000 });
}

test.describe('Wall — editing a post with media', () => {
  test('existing media shows, and the real button adds another', async ({ page }) => {
    test.setTimeout(60000);
    const captured = await setup(page, [EXISTING_A]);
    await openEditor(page);

    // The post's existing photo is already in the grid.
    const grid = page.getByTestId('wall-composer-media-grid');
    await expect(grid).toBeVisible();
    await expect(grid.locator('img')).toHaveCount(1);

    // Clicking the visible button must open the picker. This is the assertion
    // the original bug would have failed.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('wall-composer-media-button').click(),
    ]);
    await chooser.setFiles({ name: 'extra.png', mimeType: 'image/png', buffer: PNG });
    await expect(grid.locator('img')).toHaveCount(2);

    await page.getByTestId('wall-composer-submit').click();
    await expect.poll(() => captured.length, { timeout: 10000 }).toBeGreaterThan(0);

    // Edit-with-media goes out as multipart carrying both the new file and the
    // kept-existing list.
    const sent = captured[captured.length - 1];
    expect(sent.contentType).toContain('multipart/form-data');
    expect(sent.body).toContain('existingMedia');
    expect(sent.body).toContain('extra.png');
    // The kept photo must actually survive. Without this, a regression that
    // sends `existingMedia: []` — silently wiping every existing photo on edit,
    // the worst realistic failure here — would still pass.
    expect(sent.body).toContain('reunion-love.png');
  });

  test('removing an existing photo drops it from the kept list', async ({ page }) => {
    test.setTimeout(60000);
    const captured = await setup(page, [EXISTING_A, EXISTING_B]);
    await openEditor(page);

    const grid = page.getByTestId('wall-composer-media-grid');
    await expect(grid.locator('img')).toHaveCount(2);

    await grid.locator('button[aria-label="移除"]').first().click();
    await expect(grid.locator('img')).toHaveCount(1);

    await page.getByTestId('wall-composer-submit').click();
    await expect.poll(() => captured.length, { timeout: 10000 }).toBeGreaterThan(0);

    const sent = captured[captured.length - 1];
    expect(sent.body).toContain('existingMedia');
    // The removed one must not survive into the kept list…
    expect(sent.body).not.toContain('reunion-love.png');
    // …and the other one must, or "removes everything" would pass this too.
    expect(sent.body).toContain('first-date.png');
  });

  test('at the 4-item cap the button is disabled and says why', async ({ page }) => {
    test.setTimeout(60000);
    await setup(page, [EXISTING_A, EXISTING_B, EXISTING_A, EXISTING_B]);
    await openEditor(page);

    const button = page.getByTestId('wall-composer-media-button');
    await expect(button).toBeDisabled();
    // A silent opacity-50 button reads as "broken"; the reason must be visible.
    await expect(page.locator('text=已達 4 個上限')).toBeVisible();
  });

  test('an oversize photo reports the specific size limit', async ({ page }) => {
    test.setTimeout(60000);
    await setup(page, []);
    await openEditor(page);

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('wall-composer-media-button').click(),
    ]);
    await chooser.setFiles({
      name: 'huge.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(11 * 1024 * 1024, 1),
    });

    await expect(page.locator('text=每張照片大小不能超過 10MB')).toBeVisible({ timeout: 5000 });
  });

  test('a video previews as a <video>, not an <img>', async ({ page }) => {
    test.setTimeout(60000);
    await setup(page, []);
    await openEditor(page);

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('wall-composer-media-button').click(),
    ]);
    await chooser.setFiles({
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('\x00\x00\x00\x18ftypmp42', 'binary'),
    });

    const grid = page.getByTestId('wall-composer-media-grid');
    await expect(grid.locator('video')).toHaveCount(1);
  });
});
