import { test, expect } from '@playwright/test';

// UI smoke for the wall's read indicator + one-tap 心意回應:
//  1. the author sees 已讀 / 對方還沒看到 on their own shared posts (never on a
//     private one — the partner can't see those at all)
//  2. the partner gets reaction chips, and tapping one writes it through
//  3. the author sees the partner's reaction on the card — the payoff that stops
//     已讀 from being a dead end
//  4. scrolling a partner post into view reports it as read
//
// Stubs auth + wall APIs (like wall-templates-ui.spec.ts) so it needs no paired
// couple in the DB.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const PARTNER_ID = '22222222-2222-2222-2222-222222222222';
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';

const OWN_READ = 'aaaaaaaa-0000-0000-0000-000000000001';
const OWN_UNREAD = 'aaaaaaaa-0000-0000-0000-000000000002';
const OWN_PRIVATE = 'aaaaaaaa-0000-0000-0000-000000000003';
const OWN_REACTED = 'aaaaaaaa-0000-0000-0000-000000000004';
const PARTNER_POST = 'bbbbbbbb-0000-0000-0000-000000000001';

const basePost = (id: string, authorId: string) => ({
  id,
  content: `貼文 ${id.slice(-1)}`,
  mood_tag: null,
  category: 'general',
  author_id: authorId,
  author_nickname: authorId === FAKE_USER.id ? 'A' : 'B',
  reply_count: 0,
  media: [],
  is_private: false,
  partner_read_at: null,
  partner_reaction: null,
  my_reaction: null,
  public_status: 'private',
  public_title: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const WALL_POSTS = [
  { ...basePost(OWN_READ, FAKE_USER.id), partner_read_at: new Date().toISOString() },
  basePost(OWN_UNREAD, FAKE_USER.id),
  { ...basePost(OWN_PRIVATE, FAKE_USER.id), is_private: true },
  {
    ...basePost(OWN_REACTED, FAKE_USER.id),
    partner_read_at: new Date().toISOString(),
    partner_reaction: { reaction: 'hug', created_at: new Date().toISOString() },
  },
  basePost(PARTNER_POST, PARTNER_ID),
];

test.describe('Wall — 已讀指示 + 一鍵心意回應', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }));
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem('wall_tutorial_seen_' + user.id, '1');
      localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 864e5).toISOString());
    }, FAKE_USER);

    await page.route('**/api/**', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    );

    await page.route('**/api/couples**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            couple: { id: COUPLE_ID, user1_id: FAKE_USER.id, user1_nickname: 'A', user2_id: PARTNER_ID, user2_nickname: 'B' },
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

    await page.route('**/api/wall/mood-tags**', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, tags: [] }) })
    );

    await page.route('**/api/wall*', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'GET' && /\/api\/wall(\?[^/]*)?$/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, wall_posts: WALL_POSTS }),
        });
      }
      return route.fallback();
    });
  });

  const openWall = async (page: import('@playwright/test').Page) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-us').click();
    await page.getByTestId('us-wall-entry').click();
    await expect(page.getByTestId(`wall-post-${OWN_READ}`)).toBeVisible({ timeout: 10000 });
  };

  test('own posts show 已讀 / 對方還沒看到, and private posts show neither', async ({ page }) => {
    test.setTimeout(60000);
    await openWall(page);

    await expect(page.getByTestId(`wall-read-indicator-${OWN_READ}`)).toContainText('已讀');
    await expect(page.getByTestId(`wall-read-indicator-${OWN_UNREAD}`)).toContainText('對方還沒看到');
    // A private post never reaches the partner, so a read state would be a lie.
    await expect(page.getByTestId(`wall-read-indicator-${OWN_PRIVATE}`)).toHaveCount(0);
  });

  test("the partner's reaction shows on the author's card", async ({ page }) => {
    test.setTimeout(60000);
    await openWall(page);

    await expect(page.getByTestId(`wall-partner-reaction-${OWN_REACTED}`)).toContainText('抱抱');
    // Reaction chips are for the reader — they never appear on your own post.
    await expect(page.getByTestId(`wall-reaction-hug-${OWN_REACTED}`)).toHaveCount(0);
  });

  test("tapping a chip on the partner's post writes the reaction through", async ({ page }) => {
    test.setTimeout(60000);

    let reactionBody: Record<string, unknown> | null = null;
    await page.route(`**/api/wall/${PARTNER_POST}/reaction`, async (route) => {
      reactionBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          my_reaction: 'hug',
          partner_reaction: { reaction: 'hug', created_at: new Date().toISOString() },
        }),
      });
    });

    await openWall(page);

    const chip = page.getByTestId(`wall-reaction-hug-${PARTNER_POST}`);
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');

    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => reactionBody).toEqual({ reaction: 'hug' });
  });

  test("a partner post scrolled into view is reported as read", async ({ page }) => {
    test.setTimeout(60000);

    const readCalls: string[][] = [];
    await page.route('**/api/wall/read', async (route) => {
      const body = route.request().postDataJSON() as { post_ids: string[] };
      readCalls.push(body.post_ids);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, marked: body.post_ids.length }),
      });
    });

    await openWall(page);
    await page.getByTestId(`wall-post-${PARTNER_POST}`).scrollIntoViewIfNeeded();

    // Dwell (1s) + batch flush (0.8s) before the call goes out.
    await expect.poll(() => readCalls.flat(), { timeout: 15000 }).toContain(PARTNER_POST);
    // Own posts are never reported — reading your own post means nothing.
    expect(readCalls.flat()).not.toContain(OWN_READ);
  });
});
