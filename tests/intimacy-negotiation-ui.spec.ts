import { test, expect, request, Page, APIRequestContext } from '@playwright/test';

// UI for 替代方案協商: the receiver answers a negotiation invite with one of the
// three choices, lands on 共同方案, starts a plan from a 示範方案, and the
// sender approves it onto the shared list. Own paired couple (see the API spec).
const USER_A = { email: 'negotiate-ui-a-e2e@twogether.app', nickname: 'NegoUI A', password: 'test123456' };
const USER_B = { email: 'negotiate-ui-b-e2e@twogether.app', nickname: 'NegoUI B', password: 'test123456' };

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

async function loginOrRegister(ctx: APIRequestContext, user: typeof USER_A): Promise<string> {
  let res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  if (!res.ok()) {
    await ctx.post(`${API}/auth/register`, { data: user });
    res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  }
  if (!res.ok()) throw new Error(`login failed for ${user.email}: ${res.status()}`);
  return (await res.json()).token;
}

async function signInOnIntimacyHistory(page: Page, user: typeof USER_A) {
  await page.addInitScript(() => {
    localStorage.setItem('pairingPromptDismissed', 'true');
    localStorage.setItem('tw:lastView', 'intimacy-history');
  });
  await page.goto('/');
  await page.getByTestId('header-auth-button').click();
  await page.getByTestId('auth-email-input').fill(user.email);
  await page.getByTestId('auth-password-input').fill(user.password);
  await page.getByTestId('auth-submit-button').click();
  await expect(page.getByTestId('user-menu-toggle')).toBeVisible({ timeout: 15000 });
  const close = page.getByTestId('auth-modal-close-button');
  if (await close.isVisible({ timeout: 1000 }).catch(() => false)) await close.click().catch(() => {});
  await expect(page.getByRole('tab', { name: /共同方案|Shared plans/ })).toBeVisible({ timeout: 15000 });
}

let requestId = '';

test.beforeAll(async () => {
  const base = await request.newContext();
  const tokenA = await loginOrRegister(base, USER_A);
  const tokenB = await loginOrRegister(base, USER_B);
  await base.dispose();
  const a = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenA}` } });
  const b = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenB}` } });
  const complete = !!(await (await a.get(`${API}/couples`)).json())?.couple?.is_complete;
  if (!complete) {
    const code = (await (await a.post(`${API}/couples/pairing-code`, { data: {} })).json())?.code;
    await b.post(`${API}/couples`, { data: { pairing_code: code } });
  }
  const created = await a.post(`${API}/intimacy-requests`, {
    data: { message: '想跟你聊聊，有沒有其他我們都喜歡的方式？', request_type: 'negotiation' },
  });
  requestId = (await created.json()).intimacy_request.id;
  await a.dispose();
  await b.dispose();
});

test.describe.serial('替代方案協商 UI', () => {
  test('receiver answers "願意一起討論" and proposes a plan from a sample', async ({ page }) => {
    expect(requestId).toBeTruthy();
    await signInOnIntimacyHistory(page, USER_B);

    await page.getByTestId('intimacy-card').filter({ hasText: '替代方案協商' }).first().click();
    const panel = page.getByTestId('negotiation-response-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('不代表同意任何特定的親密行為');
    await expect(page.getByTestId('negotiation-later')).toBeVisible();
    await expect(page.getByTestId('negotiation-decline')).toBeVisible();

    await page.getByTestId('negotiation-accept').click();
    await page.getByTestId('negotiation-send').click();

    // Lands on 共同方案 with the empty-state samples.
    await expect(page.getByTestId('alt-plans-empty')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('alt-plan-samples')).toContainText('範例');
    await page.getByTestId('alt-plan-use-sample-cafe-roleplay').click();
    await expect(page.getByTestId('alt-plan-title')).toHaveValue(/咖啡店/);
    await page.getByTestId('alt-plan-save').click();

    const card = page.getByTestId('alt-plan-card').first();
    await expect(card).toContainText('咖啡店');
    await expect(page.getByTestId('alt-plans-pending')).toBeVisible();
    await expect(card).toContainText('待認可', { timeout: 10000 });
  });

  test('sender approves → plan joins the shared list; pausing removes it', async ({ page }) => {
    await signInOnIntimacyHistory(page, USER_A);
    await page.getByRole('tab', { name: /共同方案/ }).click();

    await page.getByTestId('alt-plan-approve').first().click();
    const approved = page.getByTestId('alt-plans-approved');
    await expect(approved).toBeVisible();
    await expect(approved).toContainText('咖啡店');
    await expect(page.getByRole('status')).toContainText('雙方都認可了', { timeout: 10000 });

    await approved.getByTestId('alt-plan-disable').click();
    await expect(page.getByTestId('alt-plans-approved')).toHaveCount(0);
    await expect(page.getByText(/已停用（1）/)).toBeVisible();
  });
});
