import { test, expect, request, Page, APIRequestContext } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

// Tests run against the locked-down local test DB (see playwright.config.ts).
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true });

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

// Fresh identities per run. `users` rows persist across runs (only `couples`
// etc. are truncated by global-teardown), so a unique stamp keeps this whole
// journey — including the one-time email change — repeatable.
const STAMP = Date.now();
const PRIMARY = {
  email: `journey-${STAMP}@twogether.app`,
  newEmail: `journey-${STAMP}-new@twogether.app`,
  nickname: 'Journey User',
  password: 'test123456',
};
const PARTNER = {
  email: `journey-partner-${STAMP}@twogether.app`,
  nickname: 'Journey Partner',
  password: 'test123456',
};

// --- DB helper (no inbox in tests, so we read the email-change token directly).
async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set; cannot run user-journey spec');
  const url = new URL(dbUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`user-journey refusing to touch DB on host "${url.hostname}"`);
  }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// Wait for an in-app toast to surface text. Toasts auto-dismiss, so we poll a
// substring match rather than assert on the whole message.
async function expectToast(page: Page, text: string) {
  await expect(page.locator(`text=${text}`).first()).toBeVisible({ timeout: 8000 });
}

async function openAuthModal(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pairingPromptDismissed', 'true'));
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  const loginButton = page.getByTestId('header-auth-button');
  await expect(loginButton).toBeVisible({ timeout: 20000 });
  await loginButton.click();
  await expect(page.getByTestId('auth-modal-heading')).toBeVisible({ timeout: 5000 });
}

async function loginUI(page: Page, email: string, password: string) {
  await openAuthModal(page);
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-password-input').fill(password);
  const resp = page
    .waitForResponse((r) => r.url().includes('/auth/login'), { timeout: 15000 })
    .catch(() => null);
  await page.getByTestId('auth-submit-button').click();
  await resp;
  // Logged-in state: the user menu toggle replaces the login button.
  await expect(page.getByTestId('user-menu-toggle')).toBeVisible({ timeout: 15000 });
}

async function logoutUI(page: Page) {
  await page.getByTestId('user-menu-toggle').click();
  await page.getByText('登出', { exact: true }).click();
  await expect(page.getByTestId('header-auth-button')).toBeVisible({ timeout: 10000 });
}

// Real pairing-code flow: A generates a code, B joins. Mirrors
// roleplay-invitation.spec.ts so the UI sees a genuinely connected couple.
async function pairViaApi(tokenA: string, partner: typeof PARTNER) {
  const base = await request.newContext();
  const regB = await base.post(`${API}/auth/register`, { data: partner });
  const tokenB = regB.ok()
    ? (await regB.json()).token
    : (await (await base.post(`${API}/auth/login`, { data: { email: partner.email, password: partner.password } })).json()).token;
  await base.dispose();

  const ctxA = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenA}` } });
  const ctxB = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenB}` } });
  try {
    const codeRes = await ctxA.post(`${API}/couples/pairing-code`, { data: {} });
    const code = (await codeRes.json())?.code;
    if (!code) throw new Error(`no pairing code: ${codeRes.status()} ${await codeRes.text()}`);
    const joinRes = await ctxB.post(`${API}/couples`, { data: { pairing_code: code } });
    if (!joinRes.ok()) throw new Error(`pairing join failed: ${joinRes.status()} ${await joinRes.text()}`);
  } finally {
    await ctxA.dispose();
    await ctxB.dispose();
  }
}

// Serial: each step builds on the previous one's account state.
test.describe.serial('Full user journey: sign up → log in → change email → pair', () => {
  test('sign up creates an account and lands logged in', async ({ page }) => {
    await openAuthModal(page);

    // Switch to the register form and fill it out.
    await page.getByText('還沒帳號？立即註冊').click();
    await page.locator('#register-email').fill(PRIMARY.email);
    await page.locator('#register-nickname').fill(PRIMARY.nickname);
    await page.locator('#register-password').fill(PRIMARY.password);
    await page.locator('#register-confirm-password').fill(PRIMARY.password);

    const resp = page
      .waitForResponse((r) => r.url().includes('/auth/register'), { timeout: 15000 })
      .catch(() => null);
    await page.getByTestId('auth-submit-button').click();
    const registerResp = await resp;
    expect(registerResp?.status(), 'register should return 201').toBe(201);

    // Auto-logged-in after sign up.
    await expect(page.getByTestId('user-menu-toggle')).toBeVisible({ timeout: 15000 });
  });

  test('log out, then log back in with the sign-up email', async ({ page }) => {
    await loginUI(page, PRIMARY.email, PRIMARY.password);
    await logoutUI(page);
    await loginUI(page, PRIMARY.email, PRIMARY.password);
  });

  test('change the login email and confirm via the emailed link', async ({ page }) => {
    await loginUI(page, PRIMARY.email, PRIMARY.password);

    // Open Settings from the user menu and start an email change.
    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-settings').click();

    await page.getByTestId('change-email-button').click();
    await page.getByTestId('new-email-input').fill(PRIMARY.newEmail);
    await page.getByTestId('email-change-password-input').fill(PRIMARY.password);

    const resp = page
      .waitForResponse((r) => r.url().includes('/auth/user/email') && r.request().method() === 'PUT', { timeout: 15000 })
      .catch(() => null);
    await page.getByTestId('submit-email-change').click();
    const changeResp = await resp;
    expect(changeResp?.status(), 'email change request should succeed').toBe(200);
    await expectToast(page, '確認信已寄出');

    // The login email must NOT have changed yet; the new address is parked as a
    // pending change with a confirmation token (which we'd normally email).
    const token = await withDb(async (db) => {
      const r = await db.query(
        'SELECT email, pending_email, pending_email_token FROM users WHERE email = $1',
        [PRIMARY.email]
      );
      expect(r.rows.length, 'original account still keyed by old email').toBe(1);
      expect(r.rows[0].pending_email).toBe(PRIMARY.newEmail);
      expect(r.rows[0].pending_email_token).toBeTruthy();
      return r.rows[0].pending_email_token as string;
    });

    // Click the confirmation link (served as a standalone HTML page).
    const ctx = await request.newContext();
    const confirmRes = await ctx.get(`${API}/auth/confirm-email-change?token=${encodeURIComponent(token)}`);
    expect(confirmRes.status()).toBe(200);
    expect(await confirmRes.text()).toContain('Email 已更新');
    await ctx.dispose();

    // The swap is now live: new email logs in, old email no longer works.
    const verify = await request.newContext();
    const newLogin = await verify.post(`${API}/auth/login`, { data: { email: PRIMARY.newEmail, password: PRIMARY.password } });
    expect(newLogin.ok(), 'new email should log in').toBeTruthy();
    const oldLogin = await verify.post(`${API}/auth/login`, { data: { email: PRIMARY.email, password: PRIMARY.password } });
    expect(oldLogin.ok(), 'old email should no longer log in').toBeFalsy();
    await verify.dispose();
  });

  test('wrong password is rejected with a specific reason (and no logout)', async ({ page }) => {
    await loginUI(page, PRIMARY.newEmail, PRIMARY.password);
    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-settings').click();

    await page.getByTestId('change-email-button').click();
    await page.getByTestId('new-email-input').fill(`journey-${STAMP}-other@twogether.app`);
    await page.getByTestId('email-change-password-input').fill('definitely-wrong');
    await page.getByTestId('submit-email-change').click();

    await expectToast(page, '目前密碼不正確');
    // A 400 (not 401) means the session survives — user menu is still here.
    await expect(page.getByTestId('user-menu-toggle')).toBeVisible({ timeout: 5000 });
  });

  test('pair with a partner and see the connected state in the UI', async ({ page }) => {
    // Log in as the (now renamed) primary user via API to drive pairing.
    const ctx = await request.newContext();
    const login = await ctx.post(`${API}/auth/login`, { data: { email: PRIMARY.newEmail, password: PRIMARY.password } });
    const tokenA = (await login.json()).token;
    await ctx.dispose();

    await pairViaApi(tokenA, PARTNER);

    // The 親密邀請 button in the header only renders for a connected couple.
    await loginUI(page, PRIMARY.newEmail, PRIMARY.password);
    await expect(page.getByTestId('header-intimacy-button')).toBeVisible({ timeout: 15000 });
  });
});
