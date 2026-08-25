import { test, expect } from '@playwright/test';

// Smoke test for the wall thread "請 AI 諮商師" mediator flow. Like
// events-reply.spec.ts we stub auth + the wall APIs so the test doesn't depend
// on a paired couple in the DB. The goal is to verify the UI flow: invite AI →
// preview → post → the comment renders as an "AI 諮商師" reply.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';
const POST_ID = '44444444-4444-4444-4444-444444444444';

const FAKE_POST = {
  id: POST_ID,
  content: '自從你回來 每天都沒有好臉色看',
  mood_tag: null,
  category: 'general',
  author_id: '99999999-9999-9999-9999-999999999999', // partner authored it
  author_nickname: 'B',
  reply_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const FAKE_REPLY = {
  id: '55555555-5555-5555-5555-555555555555',
  post_id: POST_ID,
  content: '可能你把家裡弄太亂了',
  author_id: FAKE_USER.id,
  author_nickname: 'A',
  is_ai: false,
  created_at: new Date().toISOString(),
};

const AI_COMMENT =
  '我感覺到 B 最近的辛苦，也聽見 A 對家裡狀態的在意。「把家裡弄太亂」這句可能讓對方覺得被責怪。也許可以這樣說：「我希望我們一起想辦法整理」會更靠近彼此。';

test.describe('Wall thread — AI 諮商師 mediator', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem(
        'authState',
        JSON.stringify({ user, isAuthenticated: true, partnerConnected: true })
      );
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem(
        'authTokenExpiresAt',
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      );
    }, FAKE_USER);

    // Catch-all so unmocked endpoints don't hit the real backend with a fake
    // JWT (which would log the test user out). Registered first; specific
    // routes below override it.
    await page.route('**/api/**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

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

    // Wall AI comment preview + post (more specific than the list route below).
    await page.route('**/api/wall/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === 'POST' && url.endsWith(`/wall/${POST_ID}/ai-comment/preview`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, comment: AI_COMMENT }),
        });
      }

      if (method === 'POST' && url.endsWith(`/wall/${POST_ID}/ai-comment`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            reply: {
              id: '66666666-6666-6666-6666-666666666666',
              post_id: POST_ID,
              content: AI_COMMENT,
              author_id: FAKE_USER.id,
              author_nickname: 'A',
              is_ai: true,
              created_at: new Date().toISOString(),
            },
          }),
        });
      }

      if (method === 'GET' && url.includes(`/wall/${POST_ID}/replies`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, replies: [FAKE_REPLY] }),
        });
      }

      return route.fallback();
    });

    // Wall posts list.
    await page.route('**/api/wall*', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'GET' && /\/api\/wall(\?[^/]*)?$/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, wall_posts: [FAKE_POST] }),
        });
      }
      return route.fallback();
    });
  });

  test('invite AI counselor, preview, and post into thread', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Navigate to the wall view.
    await page.getByTestId('nav-tab-us').click();
    const wallNav = page.getByTestId('us-wall-entry');
    await wallNav.waitFor({ state: 'visible', timeout: 15000 });
    await wallNav.click();

    // Expand the post's thread.
    const toggle = page.getByTestId(`wall-post-thread-toggle-${POST_ID}`);
    await toggle.waitFor({ state: 'visible', timeout: 10000 });
    await toggle.click();

    // The existing reply should render.
    await expect(page.getByText('可能你把家裡弄太亂了')).toBeVisible({ timeout: 10000 });

    // Invite the AI counselor.
    await page.getByTestId(`wall-ai-comment-btn-${POST_ID}`).click();

    // Preview box appears with the generated comment.
    const preview = page.getByTestId(`wall-ai-preview-${POST_ID}`);
    await expect(preview).toBeVisible({ timeout: 10000 });
    await expect(preview).toContainText('把家裡弄太亂');

    // Post it to the thread.
    await page.getByTestId(`wall-ai-post-${POST_ID}`).click();

    // The preview closes and the AI reply renders, labeled AI 諮商師.
    await expect(preview).toHaveCount(0);
    await expect(page.getByText('AI 諮商師').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('我希望我們一起想辦法整理')).toBeVisible();
  });
});
