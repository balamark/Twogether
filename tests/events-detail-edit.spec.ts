import { test, expect } from '@playwright/test';

// Post-send editing on the event detail page: the creator edits title/summary,
// each side edits their own messages, edited content shows an 「已編輯」 marker,
// and resolved events / partner / AI messages offer no edit affordance.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A' };
const PARTNER_ID = '99999999-9999-9999-9999-999999999999';
const EVENT_ID = '22222222-2222-2222-2222-222222222222';

const MY_MESSAGE = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  event_id: EVENT_ID,
  sender_id: FAKE_USER.id,
  content: '我先把這件事放在這裡。',
  is_ai: false,
  created_at: new Date().toISOString(),
  read_at: null,
  edited_at: null,
};

const PARTNER_MESSAGE = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  event_id: EVENT_ID,
  sender_id: PARTNER_ID,
  content: '我看到了，等等聊。',
  is_ai: false,
  created_at: new Date().toISOString(),
  read_at: null,
  edited_at: null,
};

const FAKE_EVENT = {
  id: EVENT_ID,
  couple_id: '33333333-3333-3333-3333-333333333333',
  created_by: FAKE_USER.id, // we are the creator → header is editable
  title: '接送小孩的分工',
  summary: '早上約好一起送小孩上學，一方未及時起床。',
  emotions: ['失望'],
  tags: ['育兒'],
  toxicity_flags: [],
  versions: { neutral: '', firm: '', warm: '' },
  selected_version: 'neutral',
  is_private: false,
  status: 'open',
  content_edited_at: null,
  resolve_requested_by: null,
  resolve_requested_at: null,
  resolved_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  messages: [MY_MESSAGE, PARTNER_MESSAGE],
};

async function seedAuthAndBaseRoutes(page: import('@playwright/test').Page, event: typeof FAKE_EVENT) {
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

  await page.route('**/api/**', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  );

  await page.route('**/api/couples**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          couple: {
            id: event.couple_id,
            user1_id: FAKE_USER.id,
            user1_nickname: FAKE_USER.nickname,
            user2_id: PARTNER_ID,
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

  await page.route('**/api/events*', async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'GET' && /\/api\/events(\?[^/]*)?$/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, events: [event], total: 1 }),
      });
    }
    return route.fallback();
  });

  await page.route(`**/api/events/${EVENT_ID}`, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, event }),
      });
    }
    return route.fallback();
  });
}

async function openDetail(page: import('@playwright/test').Page, title: string) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('button:has-text("事件")').first().click();
  await page.locator(`text=${title}`).first().click();
}

test.describe('Event detail — post-send editing', () => {
  test('creator edits title and summary; 已編輯 marker appears', async ({ page }) => {
    await seedAuthAndBaseRoutes(page, FAKE_EVENT);

    const NEW_TITLE = '接送小孩的溝通';
    const NEW_SUMMARY = '早上約好一起送小孩上學，溝通過程出現不一致。';
    await page.route(`**/api/events/${EVENT_ID}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            event: {
              ...FAKE_EVENT,
              title: body.title,
              summary: body.summary,
              content_edited_at: new Date().toISOString(),
            },
          }),
        });
      }
      return route.fallback();
    });

    await openDetail(page, FAKE_EVENT.title);

    await page.getByTestId('event-header-edit').click();
    await page.getByTestId('event-title-input').fill(NEW_TITLE);
    await page.getByTestId('event-summary-input').fill(NEW_SUMMARY);
    await page.getByTestId('event-header-save').click();

    await expect(page.locator(`text=${NEW_SUMMARY}`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('header').filter({ hasText: NEW_TITLE })).toContainText('已編輯');
  });

  test('edit own message; pencil absent on partner message', async ({ page }) => {
    await seedAuthAndBaseRoutes(page, FAKE_EVENT);

    const NEW_CONTENT = '我改過的訊息內容。';
    await page.route(`**/api/events/${EVENT_ID}/messages/${MY_MESSAGE.id}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: { ...MY_MESSAGE, content: NEW_CONTENT, edited_at: new Date().toISOString() },
          }),
        });
      }
      return route.fallback();
    });

    await openDetail(page, FAKE_EVENT.title);

    // Own message has a pencil; the partner's does not.
    await expect(page.getByTestId(`event-message-edit-${MY_MESSAGE.id}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`event-message-edit-${PARTNER_MESSAGE.id}`)).toHaveCount(0);

    await page.getByTestId(`event-message-edit-${MY_MESSAGE.id}`).click();
    await page.getByTestId('event-message-edit-input').fill(NEW_CONTENT);
    await page.getByTestId('event-message-edit-save').click();

    await expect(page.locator(`text=${NEW_CONTENT}`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=・已編輯').first()).toBeVisible();
  });

  test('resolved event offers no edit affordances', async ({ page }) => {
    const resolvedEvent = { ...FAKE_EVENT, status: 'resolved', resolved_at: new Date().toISOString() };
    await seedAuthAndBaseRoutes(page, resolvedEvent);

    await openDetail(page, FAKE_EVENT.title);

    // Wait for the thread to render, then assert no pencils anywhere.
    await expect(page.locator(`text=${MY_MESSAGE.content}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('event-header-edit')).toHaveCount(0);
    await expect(page.getByTestId(`event-message-edit-${MY_MESSAGE.id}`)).toHaveCount(0);
  });
});
