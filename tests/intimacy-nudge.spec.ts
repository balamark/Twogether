import { test, expect, request, Page, APIRequestContext } from '@playwright/test';

// E2E for the AI「溫柔提醒」quick button on the 已經幾天沒有親密了 card:
// generate three neutral nudge options → pick one → deliver to the partner.
// Dedicated paired couple (kept separate from the shared test-e2e user so we
// don't flip its paired state). `couples`/`love_moments` are truncated by
// global-teardown between runs; `users` persist, so login-or-register is
// idempotent and we (re)pair + (re)seed a record in beforeAll.
const USER_A = { email: 'nudge-a-e2e@twogether.app', nickname: 'Nudge A', password: 'test123456' };
const USER_B = { email: 'nudge-b-e2e@twogether.app', nickname: 'Nudge B', password: 'test123456' };

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

// Pair A and B via the real pairing-code flow, then seed one intimacy record for
// A so the stats card (and the「溫柔提醒」button, which needs records) renders.
async function ensurePairedWithRecord() {
  const base = await request.newContext();
  const tokenA = await loginOrRegister(base, USER_A);
  const tokenB = await loginOrRegister(base, USER_B);
  await base.dispose();

  const ctxA = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenA}` } });
  const ctxB = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenB}` } });
  try {
    if (!(await isComplete(ctxA))) {
      const codeRes = await ctxA.post(`${API}/couples/pairing-code`, { data: {} });
      const code = (await codeRes.json())?.code;
      if (!code) throw new Error(`no pairing code: ${codeRes.status()}`);
      const joinRes = await ctxB.post(`${API}/couples`, { data: { pairing_code: code } });
      if (!joinRes.ok() && !(await isComplete(ctxA))) {
        throw new Error(`pairing join failed: ${joinRes.status()} ${await joinRes.text()}`);
      }
    }

    // Seed a record dated a few days back so daysSinceLast is a known, non-zero gap.
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    await ctxA.post(`${API}/love-moments`, { data: { moment_date: fiveDaysAgo, description: 'nudge seed' } });
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
  const recordButton = page.getByTestId('add-record-button');

  await Promise.race([
    loginButton.waitFor({ state: 'visible', timeout: 20000 }),
    recordButton.waitFor({ state: 'visible', timeout: 20000 }),
  ]).catch(() => {});

  if (await recordButton.isVisible({ timeout: 1500 }).catch(() => false)) return;
  if (!(await loginButton.isVisible({ timeout: 3000 }).catch(() => false))) return;

  await loginButton.click();
  await expect(page.getByTestId('auth-modal-heading')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('auth-email-input').fill(user.email);
  await page.getByTestId('auth-password-input').fill(user.password);
  await page.getByTestId('auth-submit-button').click();

  await Promise.race([
    page.waitForResponse((r) => r.url().includes('/auth/login'), { timeout: 15000 }),
    recordButton.waitFor({ timeout: 15000 }),
  ]).catch(() => {});

  if (await page.getByTestId('auth-modal-heading').isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
  }
  await recordButton.waitFor({ state: 'visible', timeout: 20000 });
}

test.describe('AI 溫柔提醒 nudge flow', () => {
  test.beforeAll(async () => {
    await ensurePairedWithRecord();
  });

  test('quick button → AI generates 3 neutral nudges → pick → send to partner', async ({ page }) => {
    // window.confirm on send — auto-accept so the delivery goes through.
    page.on('dialog', (dialog) => dialog.accept());

    await loginUI(page, USER_A);

    // The stats card lives on the home/record view; scroll it into view.
    const openBtn = page.getByTestId('intimacy-nudge-open');
    await openBtn.scrollIntoViewIfNeeded().catch(() => {});
    await expect(openBtn).toBeVisible({ timeout: 15000 });

    // Open → AI generates three options. We don't assert on the natural-language
    // text (test server may use the real LLM, non-deterministic); we assert the
    // panel and three send buttons render.
    const genResp = page
      .waitForResponse(
        (r) => r.url().includes('/intimacy-requests/nudge-suggestions') && r.request().method() === 'POST',
        { timeout: 20000 }
      )
      .catch(() => null);
    await openBtn.click();
    await genResp;

    await expect(page.getByTestId('intimacy-nudge-panel')).toBeVisible({ timeout: 15000 });
    const sendButtons = page.getByTestId('intimacy-nudge-send');
    await expect(sendButtons).toHaveCount(3, { timeout: 15000 });

    // Pick the first option → delivered to the partner (in-app + email).
    const sendResp = page
      .waitForResponse(
        (r) => r.url().includes('/intimacy-requests/send-nudge-message') && r.request().method() === 'POST',
        { timeout: 15000 }
      )
      .catch(() => null);
    await sendButtons.first().click();
    const resolved = await sendResp;

    if (resolved) {
      expect(resolved.status()).toBeLessThan(400);
    }
    // The chosen button flips to 已送出 on success.
    await expect(sendButtons.first()).toHaveText(/已送出/, { timeout: 10000 });
  });
});
