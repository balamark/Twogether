import { test, expect, type Page } from '@playwright/test';

// Happy-path coverage for three consequential actions that had none: entering
// 一起收尾 (which replaced the two-party 標記為解決 handshake in Batch 1 of the
// Event Resolution Framework v2), the wall card's privacy toggle, and deleting
// a logged period. destructive-action-guards.spec.ts covers what happens when
// the user backs out of the confirmation; this covers what happens when they
// don't, i.e. that the actions still actually work now that they're gated.

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

// ───────────────────────────── 一起收尾 (closure entry) ─────────────────────

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

function makeClosure(over: Record<string, unknown> = {}) {
  return {
    eventId: EVENT_ID,
    status: 'collecting',
    eventStatus: 'closing',
    startedBy: FAKE_USER.id,
    startedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    canFinalizeAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    finalizedAt: null,
    therapyNote: null,
    insight: null,
    insightAt: null,
    me: { userId: FAKE_USER.id, status: 'pending', submittedAt: null, reviewedAt: null, commitment: null },
    partner: { userId: PARTNER_ID, nickname: 'B', status: 'pending', submittedAt: null, reviewedAt: null, commitment: null },
    sharedDecision: null,
    sharedDecisionBy: null,
    sharedDecisionStatus: 'pending_review',
    sharedDecisionNote: null,
    canCancel: true,
    ...over,
  };
}

async function seedEvent(page: Page, initial: ReturnType<typeof makeEvent>) {
  const calls: Call[] = [];
  let current = initial;
  let closure = makeClosure();

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

  // One tap flips the event to 'closing' and materialises a closure row.
  await page.route(`**/api/events/${EVENT_ID}/closure/start`, async (route) => {
    calls.push({ method: route.request().method(), url: route.request().url(), body: '' });
    current = { ...current, status: 'closing' };
    closure = makeClosure();
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, created: true, closure }),
    });
  });

  await page.route(`**/api/events/${EVENT_ID}/closure`, async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, closure }),
      });
    }
    return route.fallback();
  });

  return { calls, current: () => current };
}

async function openEventDetail(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('nav-tab-communicate').click();
  await page.locator('text=接送小孩的分工').first().click();
}

test.describe('一起收尾 — closure entry (replaces the retired 標記為解決 handshake)', () => {
  test('the 一起收尾 bar is visible on an open event and starts the ceremony', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(page);
    const { calls } = await seedEvent(page, makeEvent());
    await openEventDetail(page);

    const bar = page.getByTestId('event-close-together-bar');
    await expect(bar).toBeVisible({ timeout: 10000 });
    // The legacy 標記為解決 button is gone.
    await expect(page.locator('button:has-text("標記為解決")')).toHaveCount(0);

    await page.getByTestId('event-close-together-button').click();
    await expect(page.getByTestId('close-together-modal')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('close-together-confirm').click();

    await expect
      .poll(() => calls.filter((c) => c.url.endsWith('/closure/start')).length, { timeout: 10000 })
      .toBe(1);
    // The closure panel takes over; the composer must disappear during closing.
    await expect(page.getByTestId('event-closure-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('closure-commitment-input')).toBeVisible();
  });

  test('legacy resolve_pending events show the same 一起收尾 bar (no 確認解決 button)', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(page);
    // A production row from the retired two-step handshake — treated exactly
    // like 'open' now, so the entry point is 一起收尾, not the old 確認 button.
    await seedEvent(
      page,
      makeEvent({
        status: 'resolve_pending',
        resolve_requested_by: PARTNER_ID,
        resolve_requested_at: new Date().toISOString(),
      }),
    );
    await openEventDetail(page);

    await expect(page.getByTestId('event-close-together-bar')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("確認解決")')).toHaveCount(0);
    await expect(page.locator('button:has-text("標記為解決")')).toHaveCount(0);
  });

  test('the 取消收尾 button is always visible while closing', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(page);
    // Enter the panel directly with an event already in closing state.
    await seedEvent(page, makeEvent({ status: 'closing' }));
    await openEventDetail(page);

    await expect(page.getByTestId('event-closure-panel')).toBeVisible({ timeout: 10000 });
    // The reply composer must be hidden during closing (see
    // feedback_closing_hides_composer). Check the specific testids — a broad
    // "送出" text match would false-positive on the closure composer's own
    // 送出我的約定 button, which lives INSIDE the panel.
    await expect(page.getByTestId('event-reply-input')).toHaveCount(0);
    await expect(page.getByTestId('event-ai-counselor-button')).toHaveCount(0);
    await expect(page.getByTestId('event-facilitation-start-button')).toHaveCount(0);
    // 取消收尾 is the escape hatch and must be present.
    await expect(page.getByTestId('closure-cancel-link')).toBeVisible();
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
