import { test, expect, request, Page, APIRequestContext } from '@playwright/test';

// 親密邀請 → 角色扮演 can pick a 創作市集 script directly, without favoriting it
// first, and the recipient's 查看劇本 still finds it. A third (unpaired) creator
// publishes the script so it is in neither partner's own library.
const USER_A = { email: 'rpm-a-e2e@twogether.app', nickname: 'RP Market A', password: 'test123456' };
const USER_B = { email: 'rpm-b-e2e@twogether.app', nickname: 'RP Market B', password: 'test123456' };
const CREATOR = { email: 'rpm-creator-e2e@twogether.app', nickname: 'RP Creator', password: 'test123456' };

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;
const LEVELS = ['normal', 'mild', 'moderate', 'explicit', 'intense'];

const SCRIPT_TITLE = `市集直選劇本 ${Date.now()}`;
let scriptId = '';

async function loginOrRegister(ctx: APIRequestContext, user: typeof USER_A): Promise<string> {
  let res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  if (!res.ok()) {
    await ctx.post(`${API}/auth/register`, { data: user });
    res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  }
  if (!res.ok()) throw new Error(`login failed for ${user.email}: ${res.status()} ${await res.text()}`);
  return (await res.json()).token;
}

async function authed(user: typeof USER_A): Promise<APIRequestContext> {
  const base = await request.newContext();
  const token = await loginOrRegister(base, user);
  await base.dispose();
  return request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

async function isComplete(ctx: APIRequestContext): Promise<boolean> {
  const res = await ctx.get(`${API}/couples`);
  if (!res.ok()) return false;
  return !!(await res.json())?.couple?.is_complete;
}

async function ensurePaired() {
  const ctxA = await authed(USER_A);
  const ctxB = await authed(USER_B);
  try {
    if (await isComplete(ctxA)) return;
    const code = (await (await ctxA.post(`${API}/couples/pairing-code`, { data: {} })).json())?.code;
    if (!code) throw new Error('no pairing code');
    const joinRes = await ctxB.post(`${API}/couples`, { data: { pairing_code: code } });
    if (!joinRes.ok() && !(await isComplete(ctxA))) {
      throw new Error(`pairing join failed: ${joinRes.status()} ${await joinRes.text()}`);
    }
  } finally {
    await ctxA.dispose();
    await ctxB.dispose();
  }
}

async function loginUI(page: Page, user: typeof USER_A) {
  await page.addInitScript(() => localStorage.setItem('pairingPromptDismissed', 'true'));
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  const loginButton = page.getByTestId('header-auth-button');
  const intimacyBtn = page.getByTestId('header-intimacy-button');
  await Promise.race([
    loginButton.waitFor({ state: 'visible', timeout: 20000 }),
    intimacyBtn.waitFor({ state: 'visible', timeout: 20000 }),
  ]).catch(() => {});
  if (await intimacyBtn.isVisible({ timeout: 1500 }).catch(() => false)) return;
  if (!(await loginButton.isVisible({ timeout: 3000 }).catch(() => false))) return;
  await loginButton.click();
  await expect(page.getByTestId('auth-modal-heading')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('auth-email-input').fill(user.email);
  await page.getByTestId('auth-password-input').fill(user.password);
  await page.getByTestId('auth-submit-button').click();
  await Promise.race([
    page.waitForResponse((r) => r.url().includes('/auth/login'), { timeout: 15000 }),
    intimacyBtn.waitFor({ timeout: 15000 }),
  ]).catch(() => {});
  if (await page.getByTestId('auth-modal-heading').isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
  }
}

test.describe('Roleplay invitation from 創作市集', () => {
  test.beforeAll(async () => {
    await ensurePaired();
    const creator = await authed(CREATOR);
    try {
      // Longer than the invitation endpoints accept (scenario 500, body 8000):
      // marketplace scripts may be, so the client must clip, not fail.
      const res = await creator.post(`${API}/custom-scripts`, {
        data: {
          title: SCRIPT_TITLE,
          category: 'romantic',
          scenario: '雨夜的書店只剩你們兩個人。'.repeat(60),
          content: '[男]: 要打烊了。\n[女]: 再一下就好。\n'.repeat(600),
          tags: ['市集', 'e2e'],
          isPublic: true,
        },
      });
      expect(res.status(), await res.text()).toBe(200);
      scriptId = (await res.json()).custom_script.id;
    } finally {
      await creator.dispose();
    }
  });

  test.afterAll(async () => {
    if (!scriptId) return;
    const creator = await authed(CREATOR);
    await creator.delete(`${API}/custom-scripts/${scriptId}`).catch(() => {});
    await creator.dispose();
  });

  test('pick an un-favorited marketplace script → AI messages → send', async ({ page }) => {
    await loginUI(page, USER_A);
    const intimacyBtn = page.getByTestId('header-intimacy-button');
    await expect(intimacyBtn).toBeVisible({ timeout: 15000 });
    await intimacyBtn.click();
    await page.getByTestId('intimacy-category-roleplay').click();

    // Not owned or favorited → not in 我的劇本.
    await expect(page.locator('[data-testid^="roleplay-script-"]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId(`roleplay-script-${scriptId}`)).toHaveCount(0);

    // 創作市集 source + search finds it.
    await page.getByTestId('roleplay-source-marketplace').click();
    await page.getByTestId('roleplay-market-search').fill(SCRIPT_TITLE);
    const card = page.getByTestId(`roleplay-market-script-${scriptId}`);
    await expect(card).toBeVisible({ timeout: 10000 });

    const genResp = page.waitForResponse(
      (r) => r.url().includes('/intimacy-requests/script-messages') && r.request().method() === 'POST',
      { timeout: 20000 },
    );
    await card.click();
    const gen = await genResp;
    expect(gen.status(), await gen.text()).toBe(200);
    expect(JSON.parse(gen.request().postData() || '{}').scriptSource).toBe('marketplace');

    for (const lvl of LEVELS) {
      await expect(page.getByTestId(`roleplay-msg-${lvl}`)).toBeVisible({ timeout: 15000 });
    }
    await page.getByTestId('roleplay-msg-mild').click();
    await expect(page.getByTestId('intimacy-message-input')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('intimacy-preview-btn').click();

    const sendResp = page.waitForResponse(
      (r) => /\/api\/intimacy-requests$/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 15000 },
    );
    await page.getByTestId('intimacy-send-btn').click();
    const sent = await sendResp;
    expect(sent.status(), await sent.text()).toBeLessThan(300);
    await expect(page.locator('text=親密邀請已發送').first()).toBeVisible({ timeout: 8000 });
  });

  test('recipient 查看劇本 opens the marketplace script they never saved', async ({ page }) => {
    const ctxA = await authed(USER_A);
    const sendRes = await ctxA.post(`${API}/intimacy-requests`, {
      data: {
        message: '今晚書店見？',
        request_type: 'intimate',
        roleplay_category: 'romantic',
        script_title: SCRIPT_TITLE,
        script_scenario: '雨夜的書店',
      },
    });
    expect(sendRes.ok(), await sendRes.text()).toBeTruthy();
    await ctxA.dispose();

    await loginUI(page, USER_B);
    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-intimacy-history').click();
    await expect(page.getByTestId('request-row-script').first()).toContainText(SCRIPT_TITLE, { timeout: 10000 });
    await page.getByTestId('intimacy-card').first().click();
    await page.getByTestId('request-view-script-button').click();

    const detail = page.getByTestId('marketplace-detail-modal');
    await expect(detail).toBeVisible({ timeout: 10000 });
    await expect(detail).toContainText(SCRIPT_TITLE);
  });
});
