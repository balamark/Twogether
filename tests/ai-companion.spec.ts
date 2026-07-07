import { test, expect } from '@playwright/test';

// AI 諮商師 companion personalization: the Settings picker (current companion
// + change) and the named attribution in an event thread (invite button uses
// the viewer's companion; AI messages show the companion that wrote them).
// Auth + APIs are stubbed like events-reply.spec.ts — this covers the UI
// wiring; the real save round-trip is covered in user-journey.spec.ts.

const FAKE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@x.test',
  nickname: 'A',
  selected_therapist: 'kai',
};
const FAKE_EVENT_ID = '22222222-2222-2222-2222-222222222222';

const FAKE_EVENT = {
  id: FAKE_EVENT_ID,
  couple_id: '33333333-3333-3333-3333-333333333333',
  created_by: '99999999-9999-9999-9999-999999999999',
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
  messages: [
    {
      id: '44444444-4444-4444-4444-444444444444',
      event_id: FAKE_EVENT_ID,
      sender_id: '99999999-9999-9999-9999-999999999999',
      content: '聽起來你們都很在意彼此，先聊聊各自的期待吧。',
      is_ai: true,
      ai_therapist: 'sophie',
      created_at: new Date().toISOString(),
      read_at: null,
      edited_at: null,
    },
  ],
};

test.describe('AI companion — settings picker and named threads', () => {
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
      const method = route.request().method();
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: true }),
        });
      }
      if (method === 'PUT' && route.request().url().includes('/user/ai-companion')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, selected_therapist: 'aiko' }),
        });
      }
      return route.fallback();
    });

    await page.route('**/api/events/**', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'GET' && url.endsWith(`/api/events/${FAKE_EVENT_ID}`)) {
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
      if (route.request().method() === 'GET' && /\/api\/events(\?[^/]*)?$/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, events: [FAKE_EVENT], total: 1 }),
        });
      }
      return route.fallback();
    });
  });

  test('settings shows the current companion and can change it', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Open settings from the user menu.
    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-settings').click();

    const section = page.getByTestId('settings-ai-companion');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible({ timeout: 10000 });
    // Current companion (from the seeded user) is Kai.
    await expect(section.getByText('Kai')).toBeVisible();

    // Change to Aiko.
    await page.getByTestId('settings-change-companion').click();
    await page.getByTestId('ai-companion-option-aiko').click();

    // The list collapses back to the summary row showing the new pick.
    await expect(page.getByTestId('settings-change-companion')).toBeVisible({ timeout: 10000 });
    await expect(section.getByText('Aiko')).toBeVisible();
  });

  test('event thread names the inviter button and the AI message author', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const eventsNav = page.getByTestId('nav-tab-communicate');
    await eventsNav.waitFor({ state: 'visible', timeout: 15000 });
    await eventsNav.click();

    const eventCard = page.locator('text=今晚的家事').first();
    await eventCard.waitFor({ state: 'visible', timeout: 10000 });
    await eventCard.click();

    // Invite button carries the viewer's companion name (Kai).
    await expect(page.getByTestId('event-ai-counselor-button')).toContainText('請 Kai 加入');

    // The existing AI message is attributed to the companion that wrote it
    // (Sophie), independent of the viewer's current pick.
    await expect(page.getByText('Sophie・AI 諮商師')).toBeVisible();
  });
});
