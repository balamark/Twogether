import { test, expect, type Page } from '@playwright/test';

// 語音輸入 (🎤 用說的): record → transcribe → text lands in the box for the
// user to edit. Chromium's fake audio device stands in for the microphone, and
// the transcription endpoint is mocked so the spec is deterministic and free.

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['microphone'],
});

async function openCompose(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('tw_guest_tour_seen', '1'));
  await page.goto('/');
  await page.getByTestId('nav-tab-talk').click();
  await page.getByRole('button', { name: /開始對話/ }).first().click();
  await expect(page.getByTestId('compose-raw-input')).toBeVisible();
}

async function recordClip(page: Page) {
  await page.getByTestId('compose-raw-voice-start').click();
  await expect(page.getByTestId('compose-raw-voice-stop')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByTestId('compose-raw-voice-stop').click();
}

test.describe('voice input (guest)', () => {
  test('a recorded clip is transcribed and inserted at the cursor, editable before sending', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/guest-ai/voice', async (route) => {
      calls += 1;
      const req = route.request();
      expect(req.method()).toBe('POST');
      expect(req.headers()['content-type']).toContain('multipart/form-data');
      const body = req.postDataBuffer()?.toString('latin1') || '';
      expect(body).toContain('name="guest_id"');
      expect(body).toContain('name="duration_ms"');
      expect(body).toContain('name="audio"');
      await route.fulfill({ json: { success: true, text: '他每次都 late，我真的很 upset', usage: { tier: 'guest', limit: 3, used: 1, remaining: 2 } } });
    });
    await openCompose(page);
    await page.getByTestId('compose-raw-input').fill('早上的事：');

    await recordClip(page);

    await expect(page.getByTestId('compose-raw-input')).toHaveValue('早上的事：他每次都 late，我真的很 upset');
    await expect(page.getByTestId('compose-raw-voice-note')).toContainText('語音試用剩 2 次');
    expect(calls).toBe(1);
    // The transcript only fills the box; sending is still the user's call.
    await expect(page.getByRole('button', { name: /讓 AI 整理/ })).toBeEnabled();
  });

  test('used-up guest tries explain why, keep typing possible, and offer sign-up', async ({ page }) => {
    await page.route('**/api/guest-ai/voice', (route) =>
      route.fulfill({ status: 429, json: { success: false, error_code: 'GUEST_VOICE_LIMIT', message: '試玩的 3 次語音輸入已經用完了。可以繼續打字；免費註冊後每天都有語音額度' } }));
    await openCompose(page);
    await recordClip(page);
    const err = page.getByTestId('compose-raw-voice-error');
    await expect(err).toContainText('3 次語音輸入已經用完');
    await expect(page.getByTestId('compose-raw-input')).toHaveValue('');
    await err.getByRole('button', { name: '免費註冊' }).click();
    await expect(page.getByRole('dialog').or(page.locator('[data-testid="auth-modal"]')).first()).toBeVisible();
  });

  test('cancel while recording sends nothing', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/guest-ai/voice', (route) => { calls += 1; return route.fulfill({ json: { success: true, text: 'x' } }); });
    await openCompose(page);
    await page.getByTestId('compose-raw-voice-start').click();
    await expect(page.getByTestId('compose-raw-voice-stop')).toBeVisible();
    await page.getByTestId('compose-raw-voice-cancel').click();
    await expect(page.getByTestId('compose-raw-voice-start')).toBeVisible();
    await page.waitForTimeout(500);
    expect(calls).toBe(0);
  });
});

test.describe('voice input (signed in)', () => {
  const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }));
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 86400000).toISOString());
    }, USER);
    await page.route('**/api/**', (route) => route.fulfill({ json: { success: true } }));
    await page.route('**/api/couples**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: { success: true, couple: { id: '33333333-3333-3333-3333-333333333333', user1_id: USER.id, user1_nickname: 'A', user2_id: '88888888-8888-8888-8888-888888888888', user2_nickname: 'B' } } })
        : route.fallback());
    await page.route('**/api/auth/**', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ json: { success: true, user: USER, partnerConnected: true } }) : route.fallback());
    await page.route('**/api/events*', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ json: { success: true, events: [], total: 0 } }) : route.fallback());
  });

  async function openComposeSignedIn(page: Page) {
    await page.goto('/');
    await page.getByTestId('nav-tab-talk').click();
    await page.locator('button:has-text("開始對話")').first().click();
    await expect(page.getByTestId('compose-raw-input')).toBeVisible();
  }

  test('posts to /api/voice/transcribe with the account token and shows minutes left', async ({ page }) => {
    let auth = '';
    await page.route('**/api/voice/transcribe', (route) => {
      auth = route.request().headers()['authorization'] || '';
      return route.fulfill({ json: { success: true, text: '我想好好跟你聊聊 weekend 的安排', usage: { tier: 'free', limitSeconds: 600, usedSeconds: 62, remainingSeconds: 538 } } });
    });
    await openComposeSignedIn(page);
    await recordClip(page);
    await expect(page.getByTestId('compose-raw-input')).toHaveValue('我想好好跟你聊聊 weekend 的安排');
    await expect(page.getByTestId('compose-raw-voice-note')).toContainText('今日語音剩 8 分鐘');
    expect(auth).toBe('Bearer fake-jwt');
  });

  test('a used-up free allowance is an inline gate, not a redirect that loses the draft', async ({ page }) => {
    await page.route('**/api/voice/transcribe', (route) =>
      route.fulfill({ status: 429, json: { success: false, error_code: 'VOICE_DAILY_LIMIT_REACHED', message: '今天的 10 分鐘免費語音輸入已用完。可以繼續打字，明天會重置；升級 Premium 即可不限分鐘', tier: 'free' } }));
    await openComposeSignedIn(page);
    await page.getByTestId('compose-raw-input').fill('先打的草稿');
    await recordClip(page);
    const err = page.getByTestId('compose-raw-voice-error');
    await expect(err).toContainText('10 分鐘免費語音輸入已用完');
    await expect(err.getByRole('button', { name: '升級 Premium' })).toBeVisible();
    // Still on the compose screen with the draft intact.
    await expect(page.getByTestId('compose-raw-input')).toHaveValue('先打的草稿');
  });
});
