import { test, expect } from '@playwright/test';

// Smoke test for 引導模式 (Therapist Mode) in the event thread. Stubs auth +
// events + facilitation endpoints (DB-free). Goal: 開始引導 renders a therapist
// card with a quick-reply chip, tapping the chip prefills the composer, and the
// 今日練習 scoreboard shows.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const EVENT_ID = '22222222-2222-2222-2222-222222222222';

const BASE_EVENT = {
  id: EVENT_ID,
  couple_id: '33333333-3333-3333-3333-333333333333',
  created_by: FAKE_USER.id,
  title: '今晚回不回家',
  summary: '一方擔心另一方晚歸。',
  emotions: ['焦慮'],
  tags: ['溝通'],
  toxicity_flags: [],
  versions: { neutral: '', firm: '', warm: '' },
  selected_version: null,
  is_private: false,
  status: 'open',
  translation_enabled: false,
  therapy_note: null,
  resolve_requested_by: null,
  resolve_requested_at: null,
  resolved_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  messages: [] as unknown[],
};

const AI_TURN = {
  id: 'aaaa1111-1111-1111-1111-111111111111',
  event_id: EVENT_ID,
  sender_id: FAKE_USER.id,
  content: '我們一次只做一小步。先不要解釋，只重複你聽到的。',
  is_ai: true,
  ai_therapist: 'luma',
  facilitation: {
    card: 'mirror',
    cardMeta: { id: 'mirror', label: '鏡映', emoji: '🪞', color: 'sage' },
    target: 'A',
    targetUserId: FAKE_USER.id,
    instruction: '用「我聽到你說的是…」開頭，說出你聽到的。',
    quickReplies: ['我聽到你說的是…'],
    evaluation: null,
    evaluatedCardMeta: null,
    sessionDone: false,
  },
  created_at: new Date().toISOString(),
  read_at: null,
  edited_at: null,
};

const SESSION = {
  status: 'active',
  activeCardMeta: { id: 'mirror', label: '鏡映', emoji: '🪞', color: 'sage' },
  turnOwner: FAKE_USER.id,
  completedCardsMeta: [{ id: 'emotion_label', label: '情緒標記', emoji: '🎯', color: 'amber' }],
  skillScore: 100,
};

test.describe('Event thread — 引導模式 (Therapist Mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }));
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 86400000).toISOString());
    }, FAKE_USER);

    let sessionStarted = false;

    await page.route('**/api/**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.route('**/api/couples**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, couple: { id: BASE_EVENT.couple_id, user1_id: FAKE_USER.id, user1_nickname: 'A', user2_id: '88888888-8888-8888-8888-888888888888', user2_nickname: 'B' } }),
        });
      }
      return route.fallback();
    });

    await page.route('**/api/auth/**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: true }) });
      }
      return route.fallback();
    });

    await page.route('**/api/events/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === 'POST' && url.endsWith(`/facilitation/start`)) {
        sessionStarted = true;
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, session: SESSION, message: AI_TURN }) });
      }
      if (method === 'GET' && url.endsWith(`/facilitation`)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, session: sessionStarted ? SESSION : null }) });
      }
      if (method === 'GET' && url.endsWith(`/api/events/${EVENT_ID}`)) {
        const ev = { ...BASE_EVENT, messages: sessionStarted ? [AI_TURN] : [] };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, event: ev }) });
      }
      return route.fallback();
    });

    await page.route('**/api/events*', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'GET' && /\/api\/events(\?[^/]*)?$/.test(url)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, events: [BASE_EVENT], total: 1 }) });
      }
      return route.fallback();
    });
  });

  test('start a facilitated session, see the card + scoreboard, use a quick reply', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-talk').click();
    await page.locator('text=今晚回不回家').first().click();

    // 引導練習不再有獨立按鈕 —— 改由「請 Sophie 加入」的選單發牌。先打開選單，
    // 再選「帶一張練習卡」。
    await page.getByTestId('event-ai-counselor-button').click();
    const startBtn = page.getByTestId('event-facilitation-start-button');
    await startBtn.waitFor({ state: 'visible', timeout: 10000 });
    await startBtn.click();

    // 引導不再是對話裡的一張卡片，而是自己的全螢幕專注層 —— 按下「開始引導」
    // 就直接帶進去（使用者剛主動觸發，不算打擾）。
    const layer = page.getByTestId('guide-session-view');
    await expect(layer).toBeVisible({ timeout: 10000 });

    // Therapist card renders with the mirror exercise.
    const card = page.getByTestId('therapist-turn-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('鏡映');
    await expect(card).toContainText('我聽到你說的是');

    // Scoreboard tray + turn hint — both live inside the focus layer now.
    await expect(layer.getByTestId('session-progress')).toContainText('今日練習');
    await expect(layer.getByTestId('facilitation-turn-hint')).toBeVisible();

    // Quick-reply chip prefills the focus layer's own composer.
    await page.getByTestId('therapist-quick-reply').first().click();
    await expect(page.getByTestId('guide-reply-input')).toHaveValue('我聽到你說的是…');
  });

  test('leaving the guide layer keeps the practice reachable from the timeline', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-talk').click();
    await page.locator('text=今晚回不回家').first().click();

    // 引導練習不再有獨立按鈕 —— 改由「請 Sophie 加入」的選單發牌。先打開選單，
    // 再選「帶一張練習卡」。
    await page.getByTestId('event-ai-counselor-button').click();
    const startBtn = page.getByTestId('event-facilitation-start-button');
    await startBtn.waitFor({ state: 'visible', timeout: 10000 });
    await startBtn.click();

    const layer = page.getByTestId('guide-session-view');
    await expect(layer).toBeVisible({ timeout: 10000 });

    // 「回到對話」只關掉圖層，練習還在進行中。
    await page.getByTestId('guide-session-back').click();
    await expect(layer).toBeHidden();

    // 時間軸上留下一條全寬的引導標記，點了回到練習。
    const marker = page.getByTestId('guide-timeline-marker').first();
    await expect(marker).toBeVisible();
    await expect(marker).toContainText('引導練習');
    await marker.click();
    await expect(layer).toBeVisible();

    // 對話那一側也留了一顆入口。
    await page.getByTestId('guide-session-back').click();
    await expect(page.getByTestId('guide-session-open')).toBeVisible();
  });
});
