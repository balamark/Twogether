import { test, expect, request, Page, APIRequestContext } from '@playwright/test';

// Dedicated paired couple for this feature — kept separate from the shared
// test-e2e user so we don't flip that user's "paired" state for other specs.
// `couples` is truncated by global-teardown between runs, so we (re)pair in
// beforeAll; `users` persist, so login-or-register is idempotent.
const USER_A = { email: 'rc-a-e2e@twogether.app', nickname: 'Reconcile A', password: 'test123456' };
const USER_B = { email: 'rc-b-e2e@twogether.app', nickname: 'Reconcile B', password: 'test123456' };

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

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

  if (await page.getByTestId('auth-modal-heading').isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
  }
}

test.describe('Reconciliation opener flow', () => {
  test.beforeAll(async () => {
    await ensurePaired();
  });

  test('真心和解 → pick intensity → AI generates 3 openers → pick → edit → send', async ({ page }) => {
    await loginUI(page, USER_A);

    // The 親密邀請 header button only renders for a connected couple.
    const intimacyBtn = page.getByTestId('header-intimacy-button');
    await expect(intimacyBtn).toBeVisible({ timeout: 15000 });
    await intimacyBtn.click();

    // Step 1: choose the reconciliation branch.
    await page.getByTestId('intimacy-category-reconciliation').click();

    // Step 2: the reconcile step. Event selection is optional — skip it and
    // pick the lightest intensity ("先釋出善意").
    await expect(page.getByTestId('reconcile-intensity-goodwill')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('reconcile-intensity-goodwill').click();

    // Generate → three openers come back. We don't assert on the natural-language
    // text (test server may use the real LLM, non-deterministic); we assert the
    // three selectable opener cards render.
    const genResp = page
      .waitForResponse(
        (r) => r.url().includes('/intimacy-requests/reconciliation-openers') && r.request().method() === 'POST',
        { timeout: 20000 }
      )
      .catch(() => null);
    await page.getByTestId('reconcile-generate').click();
    await genResp;

    for (const i of [0, 1, 2]) {
      await expect(page.getByTestId(`reconcile-opener-${i}`)).toBeVisible({ timeout: 15000 });
    }

    // Select an opener → lands on the editable customize step, pre-filled.
    await page.getByTestId('reconcile-opener-0').click();
    const input = page.getByTestId('intimacy-message-input');
    await expect(input).toBeVisible({ timeout: 5000 });
    const prefilled = (await input.inputValue()).trim();
    expect(prefilled.length).toBeGreaterThan(0);

    // Freely edit, then preview + send.
    await input.fill(prefilled + ' 想跟你說聲嗨。');
    await page.getByTestId('intimacy-preview-btn').click();

    const sendResp = page
      .waitForResponse(
        (r) => /\/api\/intimacy-requests$/.test(r.url()) && r.request().method() === 'POST',
        { timeout: 15000 }
      )
      .catch(() => null);
    await page.getByTestId('intimacy-send-btn').click();
    await sendResp;

    await expect(page.locator('text=親密邀請已發送').first()).toBeVisible({ timeout: 8000 });
  });
});
