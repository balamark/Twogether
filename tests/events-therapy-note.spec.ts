import { test, expect } from '@playwright/test';

// Smoke test for the post-conflict 治療摘要 (Therapy Note) on a resolved event.
// Stubs auth + the events APIs (like events-reply.spec.ts) so it doesn't depend
// on a paired couple or a live LLM. Goal: on a resolved event, tapping
// 產生治療摘要 fetches the note and renders the structured card.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const FAKE_EVENT_ID = '22222222-2222-2222-2222-222222222222';

const FAKE_EVENT = {
  id: FAKE_EVENT_ID,
  couple_id: '33333333-3333-3333-3333-333333333333',
  created_by: '99999999-9999-9999-9999-999999999999',
  title: '沒有回訊息',
  summary: '對方一整天沒有回訊息，一方感到被忽略。',
  emotions: ['焦慮'],
  tags: ['溝通'],
  toxicity_flags: [],
  versions: { neutral: '', firm: '', warm: '' },
  selected_version: null,
  is_private: false,
  status: 'resolved',
  translation_enabled: false,
  therapy_note: null,
  resolve_requested_by: null,
  resolve_requested_at: null,
  resolved_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  messages: [
    { id: 'aaaaaaaa-0000-0000-0000-000000000001', event_id: FAKE_EVENT_ID, sender_id: '99999999-9999-9999-9999-999999999999', content: '你為什麼整天都不回我訊息？', is_ai: false, created_at: new Date().toISOString(), read_at: null, edited_at: null },
    { id: 'aaaaaaaa-0000-0000-0000-000000000002', event_id: FAKE_EVENT_ID, sender_id: FAKE_USER.id, content: '我在忙工作，沒空一直看手機。', is_ai: false, created_at: new Date().toISOString(), read_at: null, edited_at: null },
  ],
};

const THERAPY_NOTE = {
  trigger: '沒有回訊息',
  needs: [
    { who: 'B', need: '安全感' },
    { who: 'A', need: '被信任' },
  ],
  cycle: ['B 追問', 'A 退縮', 'B 更急', 'A 更沉默'],
  repairs: [{ who: 'A', text: '願意說出真正擔心的是失去連結。' }],
  nextTime: '我現在不是生氣，我只是有點害怕。',
};

test.describe('Event 治療摘要 (Therapy Note)', () => {
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

      if (method === 'GET' && url.endsWith(`/api/events/${FAKE_EVENT_ID}/therapy-note`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, therapyNote: THERAPY_NOTE }),
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

  test('generate and render the therapy note on a resolved event', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-talk').click();

    const eventCard = page.locator('text=沒有回訊息').first();
    await eventCard.waitFor({ state: 'visible', timeout: 10000 });
    await eventCard.click();

    // The resolved event offers to generate a therapy note.
    const genBtn = page.getByTestId('event-therapy-note-button');
    await genBtn.waitFor({ state: 'visible', timeout: 10000 });
    await genBtn.click();

    // The structured note renders.
    const note = page.getByTestId('event-therapy-note');
    await expect(note).toBeVisible({ timeout: 10000 });
    await expect(note).toContainText('治療摘要');
    await expect(note).toContainText('沒有回訊息');
    await expect(note).toContainText('安全感');
    await expect(note).toContainText('我現在不是生氣');
  });
});
