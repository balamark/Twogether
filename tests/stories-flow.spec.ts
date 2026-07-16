import { test, expect, request } from '@playwright/test';

// Real-backend round trip for 真實故事: A publishes via the UI (mock LLM gives
// deterministic insights), B reads it (view count), votes and comments, then
// A sees the impact stats. Serial: later tests build on earlier state.

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

const RUN = Date.now();
const USER_A = { email: `story-flow-a-${RUN}@example.com`, nickname: '故事甲', password: 'test123456' };
const USER_B = { email: `story-flow-b-${RUN}@example.com`, nickname: '故事乙', password: 'test123456' };
const STORY_TITLE = `車站修復記 ${RUN}`;

async function register(user: typeof USER_A): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/auth/register`, { data: user });
  const token = (await res.json()).token as string;
  await ctx.dispose();
  return token;
}

async function loginUI(page: import('@playwright/test').Page, user: typeof USER_A) {
  await page.addInitScript(() => localStorage.setItem('pairingPromptDismissed', 'true'));
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  const loginButton = page.getByTestId('header-auth-button');
  await expect(loginButton).toBeVisible({ timeout: 20000 });
  await loginButton.click();
  await page.getByTestId('auth-email-input').fill(user.email);
  await page.getByTestId('auth-password-input').fill(user.password);
  await page.getByTestId('auth-submit-button').click();
  await expect(page.getByTestId('user-menu-toggle')).toBeVisible({ timeout: 15000 });
}

let storyId = '';

test.describe.serial('真實故事 — real publish/vote/impact round trip', () => {
  test.beforeAll(async () => {
    await register(USER_A);
    await register(USER_B);
  });

  test('A publishes a story through the guided template', async ({ page }) => {
    await loginUI(page, USER_A);
    await page.getByTestId('nav-tab-stories').click();

    // Empty archive on a fresh run shows the empty-state CTA instead of the
    // list CTA; either opens the compose flow. .or() waits for whichever
    // renders once loading finishes.
    await page
      .getByTestId('story-empty-compose')
      .or(page.getByTestId('story-compose-cta'))
      .first()
      .click();
    // Compose now opens a chooser (guided story vs shared article) first.
    await page.getByTestId('compose-choose-story').click();
    await page.getByTestId('story-mode-guided').click();

    const texts = [
      '我們交往三年，平常都約在車站碰面一起回家。',
      '那天他遲到四十分鐘，見面第一句是你怎麼又在生氣。',
      '我覺得被當成無理取鬧的人，非常受傷也很委屈。',
      '我們冷戰了兩天，誰都不想先開口，越拖越僵。',
      '他先傳了一句：我知道讓你等很久，你一定很難受。',
      '現在我們約好遲到先講、見面先抱，先接住情緒。',
    ];
    for (const t of texts) {
      await page.getByTestId('story-section-input').fill(t);
      await page.getByTestId('story-section-next').click();
    }
    await page.getByTestId('story-title-input').fill(STORY_TITLE);
    await page.getByTestId('story-tags-input').fill('行程 誤會');
    await page.getByTestId('story-submit').click();

    // Mock provider returns deterministic insights.
    await expect(page.getByTestId('story-compose-done')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('story-ai-insights')).toContainText('先接住情緒再談事情');

    await page.getByTestId('story-view-published').click();
    await expect(page.getByTestId('story-detail')).toContainText(STORY_TITLE);

    // Resolve the id via the public list API for later tests.
    const ctx = await request.newContext();
    const list = await (await ctx.get(`${API}/stories?q=${encodeURIComponent(String(RUN))}`)).json();
    storyId = list.stories[0]?.id;
    await ctx.dispose();
    expect(storyId).toBeTruthy();
  });

  test('B reads, votes all three types, and comments', async ({ page }) => {
    await loginUI(page, USER_B);
    await page.getByTestId('nav-tab-stories').click();
    await page.getByTestId('story-search').fill(String(RUN));
    await expect(page.getByTestId('story-card').first()).toContainText(STORY_TITLE, { timeout: 10000 });
    await page.getByTestId('story-card').first().click();
    await expect(page.getByTestId('story-detail')).toBeVisible({ timeout: 10000 });

    for (const type of ['helpful', 'resonate', 'repair_worked'] as const) {
      await page.getByTestId(`story-vote-${type}`).click();
      await expect(page.getByTestId(`story-vote-${type}`)).toContainText('1', { timeout: 5000 });
    }

    await page.getByTestId('story-comment-input').fill('謝謝分享，我們也常這樣，先接住情緒真的有用。');
    await page.getByTestId('story-comment-send').click();
    await expect(page.getByTestId('story-detail')).toContainText('先接住情緒真的有用', { timeout: 10000 });
  });

  test("A sees impact stats and the comment notification", async ({ page }) => {
    await loginUI(page, USER_A);
    await page.getByTestId('nav-tab-stories').click();
    await page.getByTestId('stories-tab-mine').click();

    const impact = page.getByTestId('my-stories-impact');
    await expect(impact).toBeVisible({ timeout: 10000 });
    await expect(impact).toContainText('已被閱讀 1 次');
    await expect(impact).toContainText('3 個投票');
    await expect(impact).toContainText('1 則留言');

    // The story-comment notification reached A (API check keeps this stable).
    const ctx = await request.newContext();
    const login = await (await ctx.post(`${API}/auth/login`, {
      data: { email: USER_A.email, password: USER_A.password },
    })).json();
    const notifs = await (await ctx.get(`${API}/intimacy-requests/notifications`, {
      headers: { Authorization: `Bearer ${login.token}` },
    })).json();
    await ctx.dispose();
    const hasStoryComment = (notifs.notifications || []).some(
      (n: { notification_type?: string }) => n.notification_type === 'story_comment'
    );
    expect(hasStoryComment).toBe(true);
  });
});
