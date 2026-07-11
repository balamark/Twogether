import { test, expect } from '@playwright/test';

// Smoke test for the per-message 情緒檢測 (emotion meter) in the event composer.
// Stubs auth + events APIs (like events-reply.spec.ts). Goal: typing a charged
// draft and tapping 情緒檢測 renders the meter panel; 採用這句 swaps the draft.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const FAKE_EVENT_ID = '22222222-2222-2222-2222-222222222222';

const FAKE_EVENT = {
  id: FAKE_EVENT_ID,
  couple_id: '33333333-3333-3333-3333-333333333333',
  created_by: '99999999-9999-9999-9999-999999999999',
  title: '今晚回不回家',
  summary: '一方擔心另一方晚歸，想確認今晚的安排。',
  emotions: ['焦慮'],
  tags: ['溝通'],
  toxicity_flags: [],
  versions: { neutral: '', firm: '', warm: '' },
  selected_version: null,
  is_private: false,
  status: 'open',
  translation_enabled: false,
  therapy_note: null,
  resolve_requested_by: null,
  resolve_requested_at: null,
  resolved_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  messages: [],
};

const ANALYSIS = {
  emotions: [
    { label: '傷心', emoji: '😢', intensity: 70 },
    { label: '焦慮', emoji: '😰', intensity: 80 },
  ],
  partnerHears: { misread: '你很爛。', real: '你是不是不要這個家了？' },
  need: '安全感',
  rewrite: '我今天很想你，不知道你今晚會不會回來？',
  toxicityFlags: [],
};

test.describe('Event composer — 情緒檢測 (emotion meter)', () => {
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

      if (method === 'POST' && url.endsWith(`/api/events/${FAKE_EVENT_ID}/messages/analyze-draft`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, analysis: ANALYSIS }),
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

  test('analyze a charged draft and adopt the rewrite', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-communicate').click();
    await page.locator('text=今晚回不回家').first().click();

    const input = page.getByTestId('event-reply-input');
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill('你到底要不要回家？你根本沒把家庭放第一。');

    // The free tone hint appears for a charged draft.
    await expect(page.getByTestId('event-draft-tone-hint')).toBeVisible();

    // Run the emotion check.
    await page.getByTestId('event-draft-analyze-button').click();

    const meter = page.getByTestId('draft-emotion-meter');
    await expect(meter).toBeVisible({ timeout: 10000 });
    await expect(meter).toContainText('傷心');
    await expect(meter).toContainText('對方可能聽成');
    await expect(meter).toContainText('安全感');

    // Adopt the rewrite → the composer text is replaced.
    await page.getByTestId('draft-emotion-meter-use').click();
    await expect(meter).toHaveCount(0);
    await expect(input).toHaveValue('我今天很想你，不知道你今晚會不會回來？');
  });
});
