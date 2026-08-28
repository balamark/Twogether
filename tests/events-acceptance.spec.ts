import { test, expect } from '@playwright/test';

// Smoke test for the "如何接住TA的情緒" (emotion acceptance) layer in the event
// thread. We stub auth + the events APIs (including the new /preview-acceptance
// endpoint) so the test verifies the UI flow, not the LLM plumbing.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const FAKE_EVENT_ID = '22222222-2222-2222-2222-222222222222';

const FAKE_EVENT = {
  id: FAKE_EVENT_ID,
  couple_id: '33333333-3333-3333-3333-333333333333',
  created_by: '99999999-9999-9999-9999-999999999999', // partner — inbound event
  title: '今晚的家事',
  summary: '對方覺得家事分配不公，希望聊聊。',
  emotions: ['委屈'],
  tags: ['家務'],
  toxicity_flags: [],
  versions: { neutral: '', firm: '', warm: '' },
  selected_version: null,
  is_private: false,
  status: 'open',
  resolve_requested_by: null,
  resolve_requested_at: null,
  resolved_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  messages: [],
};

test.describe('Event — 接住情緒 (emotion acceptance)', () => {
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
              id: FAKE_EVENT.couple_id,
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

    await page.route('**/api/events/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === 'POST' && url.endsWith('/preview-acceptance')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            preview: {
              empathy: '對方現在可能正感受到「委屈」。先讓對方覺得這份情緒被接住，比急著解釋更重要。',
              acceptances: [
                { label: '單純承接', text: '你受委屈了，我有看見你的付出。' },
                { label: '溫柔安撫', text: '你先別急，我在這裡，我們慢慢來。' },
                { label: '表達同在', text: '謝謝你願意告訴我，我想更懂你的為難。' },
              ],
              toxicityFlags: [],
            },
          }),
        });
      }

      if (method === 'GET' && url.endsWith(`/api/events/${FAKE_EVENT_ID}`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, event: FAKE_EVENT }),
        });
      }

      return route.fallback();
    });

    await page.route('**/api/events*', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'GET' && /\/api\/events(\?[^/]*)?$/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, events: [FAKE_EVENT], total: 1 }),
        });
      }
      return route.fallback();
    });
  });

  test('open acceptance suggestions and insert one into the reply', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-talk').click();
    await page.getByTestId('talk-events-entry').click();
    await page.locator('text=今晚的家事').first().click();

    const replyInput = page.getByTestId('event-reply-input');
    await replyInput.waitFor({ state: 'visible', timeout: 10000 });

    // Open the 接住情緒 suggestions.
    await page.getByTestId('event-acceptance-button').click();
    await expect(page.getByTestId('event-acceptance-modal')).toBeVisible({ timeout: 10000 });

    // Empathy note + three acceptance cards render.
    await expect(page.locator('text=先讓對方覺得這份情緒被接住')).toBeVisible();
    await expect(page.getByTestId('event-acceptance-card-0')).toBeVisible();
    await expect(page.getByTestId('event-acceptance-card-1')).toBeVisible();
    await expect(page.getByTestId('event-acceptance-card-2')).toBeVisible();

    // Insert the first one → modal closes and textarea holds the text.
    await page.getByTestId('event-acceptance-insert-0').click();
    await expect(page.getByTestId('event-acceptance-modal')).toHaveCount(0);
    await expect(replyInput).toHaveValue(/你受委屈了/);
  });
});
