import { test, expect } from '@playwright/test';

// 真實故事 (Relationship Wisdom Archive) UI wiring, API-stubbed like
// events-reply.spec.ts. The real publish→vote→impact round-trip is covered by
// stories-flow.spec.ts against the live backend.

const FAKE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@x.test',
  nickname: 'A',
  selected_therapist: 'luma',
};

const STORY = {
  id: '55555555-5555-4555-8555-555555555555',
  title: '車站接送吵架後的修復',
  preview: '我們交往三年，平常都約在車站碰面一起回家。',
  tags: ['行程', '誤會'],
  authorName: '匿名',
  votes: { helpful: 3, resonate: 1, repair_worked: 2 },
  commentCount: 1,
  viewCount: 12,
  createdAt: new Date().toISOString(),
};

const STORY_DETAIL = {
  id: STORY.id,
  title: STORY.title,
  sections: {
    context: '我們交往三年，平常都約在車站碰面一起回家。',
    happened: '那天他遲到四十分鐘，見面第一句話是「你怎麼又在生氣」。',
    impact: '我覺得自己被當成無理取鬧的人，非常受傷。',
    tried: '一開始我們冷戰了兩天，誰都不想先開口。',
    repair: '後來他先傳了一句：我知道讓你等很久，你當時一定很難受。',
    now: '現在我們約好遲到先講、見面先抱。',
  },
  tags: STORY.tags,
  authorName: '匿名',
  isMine: false,
  status: 'published',
  aiInsights: {
    insights: [
      { title: '先接住情緒再談事情', body: '先讓彼此的感受被看見，是修復能開始的關鍵。' },
      { title: '把指責換成具體的事', body: '換成具體發生的事與自己的感受，對方比較能聽進去。' },
      { title: '小的修復動作也算數', body: '一個先伸出的小動作，常常就是關係回暖的開始。' },
    ],
    generatedAt: new Date().toISOString(),
  },
  votes: STORY.votes,
  myVotes: [],
  comments: [
    { id: 'c1', body: '這對我很有幫助。', authorName: '匿名', isMine: false, createdAt: new Date().toISOString() },
  ],
  viewCount: 12,
  createdAt: STORY.createdAt,
};

async function seed(page: import('@playwright/test').Page, { authed = true } = {}) {
  if (authed) {
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
  }

  await page.route('**/api/**', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  );
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
  await page.route('**/api/stories/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'GET' && url.includes('/stories/mine')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          stories: [{ ...STORY, status: 'published' }],
          totals: { reads: 12, votes: 6, comments: 1 },
        }),
      });
    }
    if (method === 'GET' && url.includes(`/stories/${STORY.id}`)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, story: STORY_DETAIL }),
      });
    }
    if (method === 'POST' && url.endsWith('/vote')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          voted: true,
          counts: { helpful: 4, resonate: 1, repair_worked: 2 },
        }),
      });
    }
    return route.fallback();
  });
  await page.route('**/api/stories*', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'GET' && /\/api\/stories(\?[^/]*)?$/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, stories: [STORY], hasMore: false, featured: [STORY] }),
      });
    }
    if (method === 'POST' && /\/api\/stories$/.test(url)) {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          story: { id: STORY.id, title: STORY.title },
          aiInsights: STORY_DETAIL.aiInsights,
          aiSkipped: false,
        }),
      });
    }
    return route.fallback();
  });
}

test.describe('真實故事 — archive UI wiring', () => {
  test('nav tab opens the archive: featured shelf + list + detail with votes', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-stories').click();
    await expect(page.getByTestId('stories-view')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('story-featured')).toBeVisible();
    await expect(page.getByTestId('story-card').first()).toContainText(STORY.title);

    // Open detail: sections + AI insights + vote toggle.
    await page.getByTestId('story-card').first().click();
    await expect(page.getByTestId('story-detail')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('story-detail')).toContainText('轉捩點與修復');
    await expect(page.getByTestId('story-detail-insights')).toContainText('先接住情緒再談事情');

    await page.getByTestId('story-vote-helpful').click();
    await expect(page.getByTestId('story-vote-helpful')).toContainText('4');
  });

  test('search input sends the query to the API', async ({ page }) => {
    await seed(page);
    let searchedQ: string | null = null;
    await page.route('**/api/stories?*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('q')) searchedQ = url.searchParams.get('q');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, stories: [], hasMore: false }),
      });
    });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-stories').click();
    await page.getByTestId('story-search').fill('遲到');
    await expect.poll(() => searchedQ, { timeout: 5000 }).toBe('遲到');
    await expect(page.getByTestId('story-search-empty')).toBeVisible();
  });

  test('compose flow walks the 6 template sections and shows AI insights', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-stories').click();

    await page.getByTestId('story-compose-cta').click();
    await expect(page.getByTestId('story-compose-intro')).toBeVisible();
    await page.getByTestId('story-mode-guided').click();

    const sectionTexts = [
      '我們交往三年，平常都約在車站碰面。',
      '那天他遲到四十分鐘，還先怪我生氣。',
      '我覺得非常受傷，也很委屈難過。',
      '一開始我們冷戰了兩天，越拖越僵。',
      '他先傳了一句：我知道讓你等很久。',
      '現在我們約好遲到先講、見面先抱。',
    ];
    for (const text of sectionTexts) {
      await page.getByTestId('story-section-input').fill(text);
      await page.getByTestId('story-section-next').click();
    }

    await expect(page.getByTestId('story-compose-meta')).toBeVisible();
    await page.getByTestId('story-title-input').fill('車站接送吵架後的修復');
    await page.getByTestId('story-tags-input').fill('行程 誤會');
    await page.getByTestId('story-submit').click();

    await expect(page.getByTestId('story-compose-done')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('story-ai-insights')).toContainText('先接住情緒再談事情');
  });

  test('freeform mode: paste once, AI splits into sections, then publish', async ({ page }) => {
    await seed(page);
    await page.route('**/api/stories/structure', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          sections: {
            context: '我們交往三年，平常都約在車站碰面一起回家。',
            happened: '那天他遲到四十分鐘，還先怪我生氣。',
            impact: '我覺得非常受傷，也很委屈難過。',
            tried: '一開始我們冷戰了兩天，越拖越僵。',
            repair: '他先傳了一句：我知道讓你等很久。',
            now: '現在我們約好遲到先講、見面先抱。',
          },
        }),
      })
    );
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-stories').click();
    await page.getByTestId('story-compose-cta').click();
    await page.getByTestId('story-mode-freeform').click();

    await page.getByTestId('story-freeform-input').fill(
      '我們交往三年，那天他遲到四十分鐘還先怪我生氣，我覺得很受傷，冷戰兩天後他先道歉，現在我們約好遲到先講。'
    );
    await page.getByTestId('story-freeform-structure').click();

    // AI-split sections show up in the editable review step.
    await expect(page.getByTestId('story-compose-review')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('story-review-repair')).toContainText('我知道讓你等很久');
    await page.getByTestId('story-review-next').click();

    await expect(page.getByTestId('story-compose-meta')).toBeVisible();
    await page.getByTestId('story-title-input').fill('車站接送吵架後的修復');
    await page.getByTestId('story-submit').click();
    await expect(page.getByTestId('story-compose-done')).toBeVisible({ timeout: 10000 });
  });

  test('我的故事 shows the impact line', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-stories').click();
    await page.getByTestId('stories-tab-mine').click();

    await expect(page.getByTestId('my-stories-impact')).toContainText('已被閱讀 12 次');
    await expect(page.getByTestId('my-stories-impact')).toContainText('6 個投票');
  });

  test('公開問答 renders as a stories sub-tab', async ({ page }) => {
    await seed(page);
    await page.route('**/api/therapists/qa*', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, threads: [], hasMore: false }),
      })
    );
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-stories').click();
    await page.getByTestId('stories-tab-qa').click();
    await expect(page.getByTestId('public-qa-view')).toBeVisible({ timeout: 10000 });
  });

  test('大家怎麼做 sub-tab: vote reveals result split', async ({ page }) => {
    await seed(page);
    const POLL = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      question: '吵架後，誰該先低頭？',
      scenario: '一場沒有對錯的爭執後⋯',
      tags: ['溝通'],
      totalVotes: 0,
      myOptionId: null,
      voiceCount: 0,
      options: [
        { id: 'opt-1', label: '我會先開口', votes: 0, percent: 0 },
        { id: 'opt-2', label: '等對方先', votes: 0, percent: 0 },
      ],
    };
    await page.route('**/api/polls', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, polls: [POLL] }) })
    );
    await page.route('**/api/polls/*/vote', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          poll: { ...POLL, totalVotes: 1, myOptionId: 'opt-1', options: [
            { id: 'opt-1', label: '我會先開口', votes: 1, percent: 100 },
            { id: 'opt-2', label: '等對方先', votes: 0, percent: 0 },
          ] },
        }),
      })
    );
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-stories').click();
    await page.getByTestId('stories-tab-polls').click();
    await expect(page.getByTestId('polls-view')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('poll-card').first()).toContainText('吵架後，誰該先低頭');

    // Before voting: tappable options. After voting: result bars with %.
    await page.getByTestId('poll-option-vote').first().click();
    await expect(page.getByTestId('poll-option-result').first()).toContainText('100%', { timeout: 5000 });
  });

  test('logged-out: archive browsable, voting prompts sign-in', async ({ page }) => {
    await seed(page, { authed: false });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-stories').click();
    await expect(page.getByTestId('stories-view')).toBeVisible({ timeout: 10000 });
    // 我的故事 sub-tab is signed-in only.
    await expect(page.getByTestId('stories-tab-mine')).toHaveCount(0);

    await page.getByTestId('story-card').first().click();
    await expect(page.getByTestId('story-detail')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('story-vote-helpful').click();
    await expect(page.getByText('請先登入').first()).toBeVisible();
  });
});
