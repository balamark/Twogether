import { test, expect } from '@playwright/test';

// Smoke test for the Stage 0 安全提醒 (conflict/safety banner) on the wall
// thread. Stubs auth + wall APIs (like wall-ai-counselor.spec.ts). Goal: a
// thread with mutual blaming replies surfaces the dismissible banner; dismissing
// it hides it.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';
const POST_ID = '44444444-4444-4444-4444-444444444444';

const FAKE_POST = {
  id: POST_ID,
  content: '我們需要談談最近的狀況',
  mood_tag: null,
  category: 'general',
  author_id: '99999999-9999-9999-9999-999999999999',
  author_nickname: 'B',
  reply_count: 2,
  translation_enabled: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Two blaming replies → escalation level.
const REPLIES = [
  {
    id: '55555555-5555-5555-5555-555555555551',
    post_id: POST_ID,
    content: '你總是把工作放在我們前面。',
    author_id: '99999999-9999-9999-9999-999999999999',
    author_nickname: 'B',
    is_ai: false,
    created_at: new Date().toISOString(),
  },
  {
    id: '55555555-5555-5555-5555-555555555552',
    post_id: POST_ID,
    content: '每次都是你先發脾氣，都是你害的。',
    author_id: FAKE_USER.id,
    author_nickname: 'A',
    is_ai: false,
    created_at: new Date().toISOString(),
  },
];

test.describe('Wall thread — Stage 0 安全提醒', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }));
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    }, FAKE_USER);

    await page.route('**/api/**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
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

    await page.route('**/api/wall/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'GET' && url.includes(`/wall/${POST_ID}/replies`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, replies: REPLIES, translation_enabled: false }),
        });
      }
      return route.fallback();
    });

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

  test('escalating thread shows a dismissible safety banner', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const wallNav = page.locator('button:has-text("我們的牆")').first();
    await wallNav.waitFor({ state: 'visible', timeout: 15000 });
    await wallNav.click();

    const toggle = page.getByTestId(`wall-post-thread-toggle-${POST_ID}`);
    await toggle.waitFor({ state: 'visible', timeout: 10000 });
    await toggle.click();

    // The banner surfaces on the escalating thread.
    const banner = page.getByTestId('conflict-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toHaveAttribute('data-level', 'escalation');

    // Dismissing hides it.
    await page.getByTestId('conflict-banner-dismiss').click();
    await expect(banner).toHaveCount(0);
  });
});
