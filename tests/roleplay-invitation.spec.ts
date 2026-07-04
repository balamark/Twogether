import { test, expect, request, Page, APIRequestContext } from '@playwright/test';

// Dedicated paired couple for this feature — kept separate from the shared
// test-e2e user so we don't flip that user's "paired" state for other specs.
// `couples` is truncated by global-teardown between runs, so we (re)pair in
// beforeAll; `users` persist, so login-or-register is idempotent.
const USER_A = { email: 'rp-a-e2e@twogether.app', nickname: 'Roleplay A', password: 'test123456' };
const USER_B = { email: 'rp-b-e2e@twogether.app', nickname: 'Roleplay B', password: 'test123456' };

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

const LEVELS = ['normal', 'mild', 'moderate', 'explicit', 'intense'];

async function loginOrRegister(ctx: APIRequestContext, user: typeof USER_A): Promise<string> {
  let res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  if (!res.ok()) {
    await ctx.post(`${API}/auth/register`, { data: user });
    res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  }
  if (!res.ok()) throw new Error(`login failed for ${user.email}: ${res.status()} ${await res.text()}`);
  return (await res.json()).token;
}

async function isComplete(ctx: APIRequestContext): Promise<boolean> {
  const res = await ctx.get(`${API}/couples`);
  if (!res.ok()) return false;
  const body = await res.json();
  return !!body?.couple?.is_complete;
}

// Pair A and B via the real pairing-code flow so A sees a connected partner.
async function ensurePaired() {
  const base = await request.newContext();
  const tokenA = await loginOrRegister(base, USER_A);
  const tokenB = await loginOrRegister(base, USER_B);
  await base.dispose();

  const ctxA = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenA}` } });
  const ctxB = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenB}` } });
  try {
    // Sender is male — the AI invitation should speak from the male role.
    await ctxA.put(`${API}/auth/user/gender`, { data: { gender: 'male' } });

    if (await isComplete(ctxA)) return;

    const codeRes = await ctxA.post(`${API}/couples/pairing-code`, { data: {} });
    const code = (await codeRes.json())?.code;
    if (!code) throw new Error(`no pairing code: ${codeRes.status()}`);

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

  // Close the auth modal if it lingered over the header.
  if (await page.getByTestId('auth-modal-heading').isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
  }
}

test.describe('Roleplay AI invitation flow', () => {
  test.beforeAll(async () => {
    await ensurePaired();
  });

  test('pick a script → AI generates 5 escalating messages → feedback → edit → send', async ({ page }) => {
    await loginUI(page, USER_A);

    // The 親密邀請 header button only renders for a connected couple.
    const intimacyBtn = page.getByTestId('header-intimacy-button');
    await expect(intimacyBtn).toBeVisible({ timeout: 15000 });
    await intimacyBtn.click();

    // Step 1: choose the roleplay branch.
    await page.getByTestId('intimacy-category-roleplay').click();

    // Step 2: pick the first owned script (built-in defaults always present).
    const firstScript = page.locator('[data-testid^="roleplay-script-"]').first();
    await expect(firstScript).toBeVisible({ timeout: 8000 });

    const genResp = page
      .waitForResponse(
        (r) => r.url().includes('/intimacy-requests/script-messages') && r.request().method() === 'POST',
        { timeout: 20000 }
      )
      .catch(() => null);
    await firstScript.click();
    await genResp;

    // Step 3: exactly the 5 escalating levels, low → high.
    for (const lvl of LEVELS) {
      await expect(page.getByTestId(`roleplay-msg-${lvl}`)).toBeVisible({ timeout: 15000 });
    }

    // Regression guard (issue: male sender got messages voiced as the script's
    // female protagonist): the sender's gender (male, set in beforeAll) must
    // flow DB → route → LLM provider. The test server uses the mock provider,
    // which embeds a deterministic「（男性視角）」marker in the summary — if
    // this fails, senderGender stopped reaching the generator.
    await expect(page.getByTestId('roleplay-ai-summary')).toContainText('男性視角', { timeout: 10000 });

    // Thumb up records feedback and shows the acknowledgement.
    const fbResp = page
      .waitForResponse((r) => r.url().includes('/script-messages/feedback'), { timeout: 10000 })
      .catch(() => null);
    await page.getByTestId('roleplay-thumbup-normal').click();
    await fbResp;
    await expect(page.locator('text=已回饋，謝謝！').first()).toBeVisible({ timeout: 5000 });

    // Select a message → lands on the editable customize step, pre-filled.
    await page.getByTestId('roleplay-msg-explicit').click();
    const input = page.getByTestId('intimacy-message-input');
    await expect(input).toBeVisible({ timeout: 5000 });
    const prefilled = (await input.inputValue()).trim();
    expect(prefilled.length).toBeGreaterThan(0);

    // Freely edit the AI message, then preview + send.
    await input.fill(prefilled + ' 今晚見。');
    await page.getByTestId('intimacy-preview-btn').click();

    const sendResp = page
      .waitForResponse(
        (r) =>
          /\/api\/intimacy-requests$/.test(r.url()) && r.request().method() === 'POST',
        { timeout: 15000 }
      )
      .catch(() => null);
    await page.getByTestId('intimacy-send-btn').click();
    await sendResp;

    await expect(page.locator('text=親密邀請已發送').first()).toBeVisible({ timeout: 8000 });
  });
});
