import { test, expect } from '@playwright/test';

// Smoke test for the event-reply step-bar + AI rewrite UI. We stub the auth
// state and the events APIs so the test doesn't depend on a paired test
// couple in the DB. The mock provider would normally power /preview-rewrite,
// but we stub the response here too — the goal is to verify the UI flow,
// not the LLM plumbing (that's covered by the provider unit shape).

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A' };
const FAKE_EVENT_ID = '22222222-2222-2222-2222-222222222222';

const FAKE_EVENT = {
  id: FAKE_EVENT_ID,
  couple_id: '33333333-3333-3333-3333-333333333333',
  created_by: '99999999-9999-9999-9999-999999999999', // partner — so the UI treats it as inbound
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

test.describe('Event reply — step-bar and AI rewrite', () => {
  test.beforeEach(async ({ page }) => {
    // Pre-seed auth so the app loads as an authenticated + paired user.
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem(
        'authState',
        JSON.stringify({ user, isAuthenticated: true, partnerConnected: true })
      );
      localStorage.setItem('pairingPromptDismissed', 'true');
      // Set the token expiry far in the future so the new client-side
      // proactive-expiration logic in App.tsx doesn't immediately log the
      // fake user out.
      localStorage.setItem(
        'authTokenExpiresAt',
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      );
    }, FAKE_USER);

    // Catch-all stub for any /api/** request the test doesn't explicitly
    // mock. Registered FIRST so the more-specific routes below override it
    // (Playwright matches in reverse-registration order). This prevents
    // unmocked endpoints (e.g. /api/love-moments, /api/couples) from hitting
    // the real backend with a fake JWT and returning 401 — which would
    // trigger the new global session-expiration handler in App.tsx and log
    // the test user out before the assertions run.
    await page.route('**/api/**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Stub anything that might verify auth / re-fetch user state to keep
    // the seeded localStorage authoritative.
    await page.route('**/api/auth/**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: true }),
        });
      }
      return route.continue();
    });

    // Stub the events list + detail + rewrite preview.
    await page.route('**/api/events/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === 'POST' && url.endsWith('/preview-rewrite')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            preview: {
              versions: {
                neutral: '中性版：我這邊看到家事分配的部分有點失衡，想一起看看怎麼安排。',
                firm: '堅定版：我覺得目前的家事分配讓我有點累，希望我們可以一起調整。',
                warm: '善意版：我有點累，希望我們可以一起聊聊家事的安排，也想聽你的想法。',
              },
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

      return route.continue();
    });

    await page.route('**/api/events*', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      // List endpoint — match `/api/events` or `/api/events?...` exactly (no trailing /...)
      if (method === 'GET' && /\/api\/events(\?[^/]*)?$/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            events: [FAKE_EVENT],
            total: 1,
          }),
        });
      }
      return route.continue();
    });
  });

  test('insert sample phrase and run AI rewrite', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Navigate to events view directly via the deep-link state by tapping
    // through the nav. The nav item id is 'events'. Use a generic locator.
    const eventsNav = page.locator('button:has-text("事件")').first();
    await eventsNav.waitFor({ state: 'visible', timeout: 15000 });
    await eventsNav.click();

    // Tap the (single) fake event in the history list.
    const eventCard = page.locator(`text=今晚的家事`).first();
    await eventCard.waitFor({ state: 'visible', timeout: 10000 });
    await eventCard.click();

    // Reply input should be visible now.
    const replyInput = page.getByTestId('event-reply-input');
    await replyInput.waitFor({ state: 'visible', timeout: 10000 });

    // Step-bar: open step ② (承認情緒) and insert one of its phrases.
    const stepPill = page.getByTestId('reply-step-pill-acknowledge');
    await stepPill.click();
    const firstPhrase = page.getByTestId('reply-step-phrase').first();
    await firstPhrase.waitFor({ state: 'visible', timeout: 5000 });
    await firstPhrase.click();

    // Phrase should now be in the textarea.
    await expect(replyInput).not.toHaveValue('');

    // Trigger AI rewrite.
    await page.getByTestId('event-reply-rewrite-button').click();

    // Modal renders three version cards.
    await expect(page.getByTestId('event-reply-rewrite-modal')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('event-reply-rewrite-card-neutral')).toBeVisible();
    await expect(page.getByTestId('event-reply-rewrite-card-firm')).toBeVisible();
    await expect(page.getByTestId('event-reply-rewrite-card-warm')).toBeVisible();

    // Apply the neutral version — textarea should swap to it.
    await page.getByTestId('event-reply-rewrite-apply-neutral').click();
    await expect(page.getByTestId('event-reply-rewrite-modal')).toHaveCount(0);
    await expect(replyInput).toHaveValue(/中性版：我這邊看到家事分配/);
  });
});
