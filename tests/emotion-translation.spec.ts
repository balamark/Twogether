import { test, expect } from '@playwright/test';

// Smoke test for the 情緒翻譯 (emotion/need translation) shared lens on the wall
// thread. Stubs auth + the wall APIs (like wall-ai-counselor.spec.ts) so the
// test doesn't depend on a paired couple or a live LLM. Goal: toggling the lens
// on fetches translations and renders the "可能真正想表達的是" card under a
// human reply; toggling off hides it.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';
const POST_ID = '44444444-4444-4444-4444-444444444444';
const REPLY_ID = '55555555-5555-5555-5555-555555555555';

const FAKE_POST = {
  id: POST_ID,
  content: '自從你回來 每天都沒有好臉色看',
  mood_tag: null,
  category: 'general',
  author_id: '99999999-9999-9999-9999-999999999999',
  author_nickname: 'B',
  reply_count: 1,
  translation_enabled: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const FAKE_REPLY = {
  id: REPLY_ID,
  post_id: POST_ID,
  content: '你根本沒有把家庭放第一。',
  author_id: FAKE_USER.id,
  author_nickname: 'A',
  is_ai: false,
  created_at: new Date().toISOString(),
};

const TRANSLATION = {
  emotions: [{ label: '孤單', intensity: 70 }],
  need: '安全感',
  rewrite: '我最近很沒有安全感，希望家庭能被放在更重要的位置。',
};

// What GET /wall/:id/translations answers. Tests override this to exercise the
// empty and partial batches that the model produces when it runs out of output
// tokens on a thread of long comments.
let translationsBody: Record<string, unknown>;

test.describe('Wall thread — 情緒翻譯 lens', () => {
  test.beforeEach(async ({ page }) => {
    translationsBody = {
      success: true,
      translations: { [REPLY_ID]: TRANSLATION },
      requested: 1,
      translated: 1,
      partial: false,
    };
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
          body: JSON.stringify({ success: true, replies: [FAKE_REPLY], translation_enabled: false }),
        });
      }

      if (method === 'PATCH' && url.endsWith(`/wall/${POST_ID}/translation`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, translation_enabled: true }),
        });
      }

      if (method === 'GET' && url.endsWith(`/wall/${POST_ID}/translations`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(translationsBody),
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

  test('toggle 情緒翻譯 on to reveal the need behind a message', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const wallNav = page.locator('button:has-text("我們的牆")').first();
    await wallNav.waitFor({ state: 'visible', timeout: 15000 });
    await wallNav.click();

    const toggle = page.getByTestId(`wall-post-thread-toggle-${POST_ID}`);
    await toggle.waitFor({ state: 'visible', timeout: 10000 });
    await toggle.click();

    // The human reply renders; no translation card yet.
    await expect(page.getByText('你根本沒有把家庭放第一。')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('message-translation')).toHaveCount(0);

    // Flip the shared lens on.
    await page.getByTestId(`wall-translation-toggle-${POST_ID}`).click();

    // The translation card appears with the underlying need.
    const card = page.getByTestId('message-translation');
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText('可能真正想表達的是');
    await expect(card).toContainText('我最近很沒有安全感');
    await expect(card).toContainText('需要安全感');
    // A complete batch says nothing extra.
    await expect(page.getByTestId(`wall-translation-notice-${POST_ID}`)).toHaveCount(0);
  });

  // The reported bug: on a thread of long comments the model was cut off mid
  // tool_use, the server answered 200 with an empty map, and the UI rendered
  // nothing at all — no card, no error, no explanation.
  test('an empty batch explains itself and offers a retry', async ({ page }) => {
    translationsBody = {
      success: true,
      translations: {},
      requested: 3,
      translated: 0,
      partial: true,
      error_code: 'TRANSLATION_EMPTY',
      message: '這串對話比較長，AI 這次沒能完成情緒翻譯（沒有扣用今日額度）。請按「重試」，通常再試一次就會成功。',
    };

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const wallNav = page.locator('button:has-text("我們的牆")').first();
    await wallNav.waitFor({ state: 'visible', timeout: 15000 });
    await wallNav.click();

    const toggle = page.getByTestId(`wall-post-thread-toggle-${POST_ID}`);
    await toggle.waitFor({ state: 'visible', timeout: 10000 });
    await toggle.click();
    await expect(page.getByText('你根本沒有把家庭放第一。')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`wall-translation-toggle-${POST_ID}`).click();

    const notice = page.getByTestId(`wall-translation-notice-${POST_ID}`);
    await expect(notice).toBeVisible({ timeout: 10000 });
    await expect(notice).toContainText('沒能完成情緒翻譯');
    await expect(notice.getByRole('button', { name: '重試' })).toBeVisible();
    // No card, but never silence.
    await expect(page.getByTestId('message-translation')).toHaveCount(0);
  });

  test('a partial batch still renders what came back, plus a notice', async ({ page }) => {
    translationsBody = {
      success: true,
      translations: { [REPLY_ID]: TRANSLATION },
      requested: 3,
      translated: 1,
      partial: true,
      error_code: 'TRANSLATION_PARTIAL',
      message: '已完成 1 / 3 則，較長的留言這次沒翻完。按「重試」可補齊其餘幾則。',
    };

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const wallNav = page.locator('button:has-text("我們的牆")').first();
    await wallNav.waitFor({ state: 'visible', timeout: 15000 });
    await wallNav.click();

    const toggle = page.getByTestId(`wall-post-thread-toggle-${POST_ID}`);
    await toggle.waitFor({ state: 'visible', timeout: 10000 });
    await toggle.click();
    await expect(page.getByText('你根本沒有把家庭放第一。')).toBeVisible({ timeout: 10000 });

    await page.getByTestId(`wall-translation-toggle-${POST_ID}`).click();

    await expect(page.getByTestId('message-translation')).toBeVisible({ timeout: 10000 });
    const notice = page.getByTestId(`wall-translation-notice-${POST_ID}`);
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('已完成 1 / 3 則');
  });
});
