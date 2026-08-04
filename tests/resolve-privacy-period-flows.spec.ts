import { test, expect, type Page } from '@playwright/test';

// Happy-path coverage for three consequential actions that had none: the
// two-party 標記為解決 handshake, the wall card's privacy toggle, and deleting a
// logged period. destructive-action-guards.spec.ts covers what happens when the
// user backs out of the confirmation; this covers what happens when they don't,
// i.e. that the actions still actually work now that they're gated.

const FAKE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@x.test',
  nickname: 'A',
  selected_therapist: 'luma',
  // CalendarView only renders period days when this is on.
  cycle_tracking_enabled: true,
};
const PARTNER_ID = '99999999-9999-9999-9999-999999999999';
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';
const EVENT_ID = '22222222-2222-2222-2222-222222222222';
const POST_ID = '66666666-6666-6666-6666-666666666666';
const CYCLE_ID = '44444444-4444-4444-4444-444444444444';

type Call = { method: string; url: string; body: string };

/** Accept the next native confirm(), capturing its message. */
function acceptConfirm(page: Page): { message: () => string } {
  let seen = '';
  page.on('dialog', async (d) => {
    seen = d.message();
    await d.accept();
  });
  return { message: () => seen };
}

async function seedAuth(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('authToken', 'fake-jwt');
    localStorage.setItem('authUser', JSON.stringify(user));
    localStorage.setItem(
      'authState',
      JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }),
    );
    localStorage.setItem('pairingPromptDismissed', 'true');
    localStorage.setItem('wall_tutorial_seen_' + user.id, '1');
    localStorage.setItem(
      'authTokenExpiresAt',
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    );
  }, FAKE_USER);

  await page.route('**/api/**', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    }),
  );

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
}

// ───────────────────────────── 標記為解決 ─────────────────────────────

function makeEvent(over: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    couple_id: COUPLE_ID,
    created_by: FAKE_USER.id,
    title: '接送小孩的分工',
    summary: '早上約好一起送小孩上學，一方未及時起床。',
    emotions: ['失望'],
    tags: ['育兒'],
    toxicity_flags: [],
    versions: {
      neutral: '關於接送的事，我心裡有失望的感覺。',
      firm: '我感到失望。',
      warm: '我感到失望，等平靜後我願意再聊聊。',
    },
    selected_version: 'neutral',
    is_private: false,
    status: 'open',
    content_edited_at: null,
    resolve_requested_by: null,
    resolve_requested_at: null,
    resolved_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    messages: [],
    ...over,
  };
}

async function seedEvent(page: Page, initial: ReturnType<typeof makeEvent>) {
  const calls: Call[] = [];
  let current = initial;

  await page.route('**/api/events*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /\/api\/events(\?[^/]*)?$/.test(req.url())) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, events: [current], total: 1 }),
      });
    }
    return route.fallback();
  });

  await page.route(`**/api/events/${EVENT_ID}`, async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, event: current }),
      });
    }
    return route.fallback();
  });

  // The two handshake endpoints advance the stored event so the subsequent
  // refresh() renders the next state, like the real backend.
  await page.route(`**/api/events/${EVENT_ID}/resolve-request`, async (route) => {
    calls.push({ method: route.request().method(), url: route.request().url(), body: '' });
    current = {
      ...current,
      status: 'resolve_pending',
      resolve_requested_by: FAKE_USER.id,
      resolve_requested_at: new Date().toISOString(),
    };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, event: current }),
    });
  });

  await page.route(`**/api/events/${EVENT_ID}/resolve-confirm`, async (route) => {
    calls.push({ method: route.request().method(), url: route.request().url(), body: '' });
    current = { ...current, status: 'resolved', resolved_at: new Date().toISOString() };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, event: current }),
    });
  });

  return { calls, current: () => current };
}

async function openEventDetail(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('nav-tab-communicate').click();
  await page.locator('text=接送小孩的分工').first().click();
}

test.describe('標記為解決 — the two-party handshake', () => {
  test('confirming the request moves the event to resolve_pending', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(page);
    const { calls } = await seedEvent(page, makeEvent());
    const dialog = acceptConfirm(page);
    await openEventDetail(page);

    const button = page.locator('button:has-text("標記為解決")');
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    // It must ask first, and say that the partner has to agree.
    expect(dialog.message()).toContain('已解決');
    await expect
      .poll(() => calls.filter((c) => c.url.endsWith('/resolve-request')).length, {
        timeout: 10000,
      })
      .toBe(1);

    // Requester's side now shows the waiting state, not a resolved event.
    // Match the full sentence: a status-feed heading uses the same prefix.
    await expect(page.locator('text=已發起解決請求，等待對方確認')).toBeVisible({ timeout: 10000 });
  });

  test('a request from the partner can be confirmed, closing the event', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(page);
    // Partner asked; we're the one who confirms — this is the one-way door.
    const { calls } = await seedEvent(
      page,
      makeEvent({
        status: 'resolve_pending',
        resolve_requested_by: PARTNER_ID,
        resolve_requested_at: new Date().toISOString(),
      }),
    );
    const dialog = acceptConfirm(page);
    await openEventDetail(page);

    const confirmButton = page
      .locator('button')
      .filter({ hasText: /確認|已解決|解決/ })
      .first();
    await expect(confirmButton).toBeVisible({ timeout: 10000 });
    await confirmButton.click();

    expect(dialog.message()).toContain('已解決');
    await expect
      .poll(() => calls.filter((c) => c.url.endsWith('/resolve-confirm')).length, {
        timeout: 10000,
      })
      .toBe(1);
  });

  test('the requester does not get a self-confirm button', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(page);
    // We asked — only the partner may confirm, or one person could close a
    // shared event alone.
    await seedEvent(
      page,
      makeEvent({
        status: 'resolve_pending',
        resolve_requested_by: FAKE_USER.id,
        resolve_requested_at: new Date().toISOString(),
      }),
    );
    await openEventDetail(page);

    await expect(page.locator('text=已發起解決請求，等待對方確認')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("標記為解決")')).toHaveCount(0);
  });
});

// ─────────────────────── wall card privacy toggle ───────────────────────

async function seedWallPost(page: Page, isPrivate: boolean) {
  const calls: Call[] = [];
  const post = {
    id: POST_ID,
    content: '一則會切換私密狀態的貼文',
    mood_tag: null,
    category: 'general',
    author_id: FAKE_USER.id,
    author_nickname: 'A',
    reply_count: 0,
    media: [],
    is_private: isPrivate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await page.route('**/api/wall*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /\/api\/wall(\?[^/]*)?$/.test(req.url())) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, wall_posts: [post] }),
      });
    }
    return route.fallback();
  });

  await page.route(`**/api/wall/${POST_ID}**`, async (route) => {
    const req = route.request();
    calls.push({ method: req.method(), url: req.url(), body: req.postData() ?? '' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, wall_post: post }),
    });
  });

  return calls;
}

async function openWall(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  const nav = page.locator('button:has-text("我們的牆")').first();
  await nav.waitFor({ state: 'visible', timeout: 15000 });
  await nav.click();
  await expect(page.getByTestId(`wall-privacy-toggle-${POST_ID}`)).toBeVisible({ timeout: 10000 });
}

test.describe('Wall card privacy toggle', () => {
  test('accepting the prompt shares a private post', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(page);
    const calls = await seedWallPost(page, true);
    const dialog = acceptConfirm(page);
    await openWall(page);

    await page.getByTestId(`wall-privacy-toggle-${POST_ID}`).click();

    expect(dialog.message()).toContain('分享');
    await expect
      .poll(() => calls.filter((c) => c.method === 'PUT' || c.method === 'PATCH').length, {
        timeout: 10000,
      })
      .toBe(1);
    expect(calls[calls.length - 1].body).toContain('is_private');
  });

  test('going public → private needs no prompt (it only ever removes access)', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(page);
    const calls = await seedWallPost(page, false);

    let asked = false;
    page.on('dialog', async (d) => {
      asked = true;
      await d.accept();
    });

    await openWall(page);
    await page.getByTestId(`wall-privacy-toggle-${POST_ID}`).click();

    await expect
      .poll(() => calls.filter((c) => c.method === 'PUT' || c.method === 'PATCH').length, {
        timeout: 10000,
      })
      .toBe(1);
    expect(asked, 'hiding a post should not need confirmation').toBe(false);
  });
});

// ───────────────────────────── period delete ─────────────────────────────

test.describe('Deleting a logged period', () => {
  // The period-day modal is itself the confirmation step, so this flow
  // deliberately has no native confirm() — assert both that it deletes and that
  // it does NOT stack a second dialog on top of the modal.
  test('the modal deletes the record without a second dialog', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(page);

    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;
    // Snake_case: this goes through transformCycleRecord on the client.
    const record = {
      id: CYCLE_ID,
      tracked_by: FAKE_USER.id,
      start_date: ymd,
      length_days: 5,
      notes: null,
      created_at: new Date().toISOString(),
    };

    const calls: Call[] = [];
    await page.route('**/api/cycle-records**', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, cycle_records: [record] }),
        });
      }
      calls.push({ method: req.method(), url: req.url(), body: req.postData() ?? '' });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    let sawDialog = false;
    page.on('dialog', async (d) => {
      sawDialog = true;
      await d.accept();
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-record').click();

    // Today is inside the seeded period, so today's heatmap cell opens the
    // period-management modal.
    const todayCell = page.getByTestId('calendar-today-cell');
    await todayCell.waitFor({ state: 'visible', timeout: 15000 });
    await todayCell.click();

    const modal = page.getByTestId('period-day-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await page.getByTestId('period-day-delete-button').click();

    await expect
      .poll(() => calls.filter((c) => c.method === 'DELETE').length, { timeout: 10000 })
      .toBe(1);
    expect(sawDialog, 'the modal is already the confirmation — no second dialog').toBe(false);
  });
});
