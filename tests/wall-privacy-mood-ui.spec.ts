import { test, expect } from '@playwright/test';

// UI smoke for the wall privacy toggle + custom mood tag. Stubs auth + wall APIs
// (like wall-ai-counselor.spec.ts) so it needs no paired couple in the DB.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';
const NEW_POST_ID = '77777777-7777-7777-7777-777777777777';
const CUSTOM_MOOD = '加班中';

test.describe('Wall — privacy toggle + custom mood', () => {
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

    // Remembered custom mood tags.
    await page.route('**/api/wall/mood-tags**', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, tags: [] }) })
    );

    let created = false;
    const createdPost = {
      id: NEW_POST_ID,
      content: '今天很努力',
      mood_tag: CUSTOM_MOOD,
      category: 'general',
      author_id: FAKE_USER.id,
      author_nickname: 'A',
      reply_count: 0,
      media: [] as string[],
      is_private: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
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
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, wall_post: createdPost }) });
      }
      return route.fallback();
    });
  });

  test('set a post private with a custom mood, then see the badge + tag on the card', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-us').click();
    await page.getByTestId('us-wall-entry').click();
    await page.locator('button:has-text("新貼文")').first().click();

    await page.getByTestId('wall-composer-content').fill('今天很努力');

    // Add a custom mood tag.
    await page.getByTestId('wall-composer-custom-mood-add').click();
    const input = page.getByTestId('wall-composer-custom-mood-input');
    await input.fill(CUSTOM_MOOD);
    await input.press('Enter');

    // Turn on privacy.
    await page.getByTestId('wall-composer-private-toggle').click();

    // Submit and verify the card shows the private badge; the 匿名公開 button is hidden.
    await page.getByTestId('wall-composer-submit').click();
    await expect(page.getByTestId(`wall-post-private-badge-${NEW_POST_ID}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`wall-share-${NEW_POST_ID}`)).toHaveCount(0);
    await expect(page.getByText(`· ${CUSTOM_MOOD}`)).toBeVisible();
  });
});
