import { test, expect } from '@playwright/test';

// 通知中心 deep links: tapping a notification lands ON the thing it's about,
// not just its tab.
//  1. 對方回覆了你的貼文 → the wall, with that post's thread opened and the
//     reply scrolled into view
//  2. 對方回應了你們的記錄 → 我們 › 時間軸, with that record scrolled into view
//  3. a target that no longer exists says so (info, not a silent no-op)
//
// Stubs auth + notifications + wall + love-moments (like
// wall-read-reaction-ui.spec.ts) so it needs no paired couple in the DB.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const PARTNER_ID = '22222222-2222-2222-2222-222222222222';
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';

const TARGET_POST = 'aaaaaaaa-0000-0000-0000-000000000099';
const TARGET_REPLY = 'dddddddd-0000-0000-0000-000000000099';
const TARGET_MOMENT = 'bbbbbbbb-0000-0000-0000-000000000099';
const GONE_MOMENT = 'eeeeeeee-0000-0000-0000-000000000001';

const now = () => new Date().toISOString();

// Enough posts that the target sits well below the fold on a phone.
const WALL_POSTS = Array.from({ length: 12 }, (_, i) => {
  const id = i === 10 ? TARGET_POST : `aaaaaaaa-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`;
  return {
    id,
    content: `貼文 ${i}\n${'很長的內容。'.repeat(20)}`,
    mood_tag: null,
    category: 'general',
    author_id: FAKE_USER.id,
    author_nickname: 'A',
    reply_count: id === TARGET_POST ? 8 : 0,
    media: [],
    is_private: false,
    partner_read_at: null,
    partner_reaction: null,
    my_reaction: null,
    public_status: 'private',
    public_title: null,
    created_at: now(),
    updated_at: now(),
  };
});

const REPLIES = Array.from({ length: 8 }, (_, i) => ({
  id: i === 7 ? TARGET_REPLY : `dddddddd-0000-0000-0000-00000000000${i}`,
  post_id: TARGET_POST,
  author_id: PARTNER_ID,
  author_nickname: 'B',
  content: i === 7 ? '這是目標回覆' : `回覆 ${i} ${'嗯。'.repeat(30)}`,
  is_ai: false,
  created_at: now(),
}));

const MOMENTS = Array.from({ length: 10 }, (_, i) => ({
  id: i === 8 ? TARGET_MOMENT : `cccccccc-0000-0000-0000-00000000000${i}`,
  moment_date: `2026-08-${String(20 - i).padStart(2, '0')}T20:30:00.000Z`,
  notes: null,
  description: i === 8 ? '目標記錄' : `記錄 ${i}`,
  activity_type: 'intimate',
  recorded_by: { id: FAKE_USER.id, nickname: 'A' },
  my_response: null,
  partner_response: null,
}));

const notification = (type: string, targetId: string, targetReplyId?: string) => ({
  id: `n-${type}`,
  notification_type: type,
  title: type === 'wall_reply' ? '對方回覆了你的貼文' : '對方回應了你們的記錄',
  content: '…',
  target_id: targetId,
  target_reply_id: targetReplyId ?? null,
  is_read: false,
  created_at: now(),
  priority: 1,
});

const seed = async (page: import('@playwright/test').Page, notifications: unknown[]) => {
  await page.addInitScript((user) => {
    localStorage.setItem('authToken', 'fake-jwt');
    localStorage.setItem('authUser', JSON.stringify(user));
    localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }));
    localStorage.setItem('pairingPromptDismissed', 'true');
    localStorage.setItem('wall_tutorial_seen_' + user.id, '1');
    localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 864e5).toISOString());
  }, FAKE_USER);

  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  // Catch-all first so the specific routes registered below win.
  await page.route('**/api/**', (route) => route.fulfill(json({ success: true })));
  await page.route('**/api/couples**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill(json({
          success: true,
          couple: { id: COUPLE_ID, user1_id: FAKE_USER.id, user1_nickname: 'A', user2_id: PARTNER_ID, user2_nickname: 'B' },
        }))
      : route.fallback()
  );
  await page.route('**/api/auth/**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill(json({ success: true, user: FAKE_USER, partnerConnected: true }))
      : route.fallback()
  );
  await page.route('**/api/intimacy-requests/notifications**', (route) => {
    const url = route.request().url();
    if (route.request().method() === 'GET' && /\/notifications(\?[^/]*)?$/.test(url)) {
      return route.fulfill(json({ success: true, notifications }));
    }
    if (url.includes('unread-count')) return route.fulfill(json({ success: true, count: notifications.length }));
    return route.fallback();
  });
  await page.route('**/api/wall*', (route) =>
    route.request().method() === 'GET' && /\/api\/wall(\?[^/]*)?$/.test(route.request().url())
      ? route.fulfill(json({ success: true, wall_posts: WALL_POSTS }))
      : route.fallback()
  );
  await page.route(`**/api/wall/${TARGET_POST}/replies**`, (route) =>
    route.fulfill(json({ success: true, replies: REPLIES, translation_enabled: false }))
  );
  await page.route('**/api/love-moments**', (route) =>
    route.request().method() === 'GET' && /\/api\/love-moments(\?[^/]*)?$/.test(route.request().url())
      ? route.fulfill(json({ success: true, love_moments: MOMENTS, total: MOMENTS.length, page: 1, limit: 20 }))
      : route.fallback()
  );
};

const openInbox = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('button', { name: /通知|Notifications/ }).first().click();
};

test.describe('通知中心 — 點通知直達該則內容', () => {
  test('回覆通知 opens the post thread and scrolls to the reply', async ({ page }) => {
    test.setTimeout(60000);
    await seed(page, [notification('wall_reply', TARGET_POST, TARGET_REPLY)]);
    await openInbox(page);
    await page.getByTestId('notification-item-wall_reply').click();

    await expect(page.getByTestId(`wall-thread-${TARGET_POST}`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`wall-reply-${TARGET_REPLY}`)).toBeInViewport({ timeout: 10000 });
    // Only the target's thread opens — not every post's.
    await expect(page.locator('[data-testid^="wall-thread-"]')).toHaveCount(1);
  });

  test('記錄回應通知 opens the 時間軸 and scrolls to that record', async ({ page }) => {
    test.setTimeout(60000);
    await seed(page, [notification('love_moment_response', TARGET_MOMENT)]);
    await openInbox(page);
    await page.getByTestId('notification-item-love_moment_response').click();

    const row = page.getByTestId(`timeline-record-${TARGET_MOMENT}`);
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toBeInViewport({ timeout: 10000 });
  });

  test('a deleted record says so instead of silently landing on the tab', async ({ page }) => {
    test.setTimeout(60000);
    await seed(page, [notification('love_moment_response', GONE_MOMENT)]);
    await openInbox(page);
    await page.getByTestId('notification-item-love_moment_response').click();

    await expect(page.getByText('找不到這筆記錄')).toBeVisible({ timeout: 15000 });
  });
});
