import { test, expect, type Page } from '@playwright/test';

// Key-flow E2E for the 心理諮商師 (human therapist) feature. Chrome-only, MVP
// scope: the public sign-up page, browsing therapists, booking a consultation,
// and exchanging a message in the consultation chat room.
//
// Locator policy: getByTestId for click targets, text only for content
// assertions (matches the rest of the suite).

const TEST_USER = {
  email: 'test-e2e@twogether.app',
  password: 'test123456',
};

// The public sign-up page is served by the Express backend (not Vite), so we
// hit it directly on :8080 rather than through the SPA dev server on :5174.
const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('pairingPromptDismissed', 'true');
  });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const loginButton = page.getByTestId('header-auth-button');
  const userMenu = page.getByTestId('user-menu-toggle');

  await Promise.race([
    loginButton.waitFor({ state: 'visible', timeout: 20000 }),
    userMenu.waitFor({ state: 'visible', timeout: 20000 }),
  ]).catch(() => {});

  if (await userMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
    return; // already authenticated (session reused)
  }

  await loginButton.click();
  await expect(page.getByTestId('auth-modal-heading')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('auth-email-input').fill(TEST_USER.email);
  await page.getByTestId('auth-password-input').fill(TEST_USER.password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/login'), { timeout: 15000 }),
    page.getByTestId('auth-submit-button').click(),
  ]);
  await userMenu.waitFor({ state: 'visible', timeout: 20000 });
}

async function openTherapists(page: Page) {
  await page.getByTestId('user-menu-toggle').click();
  await page.getByTestId('user-menu-therapists').click();
  await expect(page.getByTestId('therapists-view')).toBeVisible({ timeout: 10000 });
}

test.describe('Therapist counseling', () => {
  test('public sign-up page accepts an application', async ({ page }) => {
    await page.goto(`${BACKEND_BASE}/therapist-signup`);
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input[name="displayName"]', 'E2E 測試諮商師');
    await page.fill('input[name="contactEmail"]', `e2e-therapist-${Date.now()}@example.com`);
    // Pick a focus area (clicking the label toggles its checkbox).
    await page.click('#focus label:has(input[value="anxiety"])');

    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/therapists/apply'), { timeout: 15000 }),
      page.click('#submit'),
    ]);

    await expect(page.locator('#result.ok')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#result')).toContainText('申請已送出');
  });

  test('browse, book, and chat in a consultation room', async ({ page }) => {
    await login(page);
    await openTherapists(page);

    // Browse: the seeded therapists should render as cards.
    const firstCard = page.getByTestId('therapist-card').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });

    // Book a consultation with the first therapist.
    await firstCard.getByTestId('therapist-book-button').click();
    await expect(page.getByTestId('consultation-modal')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('consultation-message').fill('E2E 想預約諮詢');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/consult') && r.request().method() === 'POST', { timeout: 15000 }),
      page.getByTestId('consultation-submit').click(),
    ]);

    // Open "我的預約" and enter the consultation room.
    await page.getByTestId('therapist-mybookings-button').click();
    await expect(page.getByTestId('my-consultations')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('enter-room-button').first().click();
    await expect(page.getByTestId('chat-room')).toBeVisible({ timeout: 10000 });

    // Send a message and confirm it shows up in the thread.
    const msg = `E2E 訊息 ${Date.now()}`;
    await page.getByTestId('chat-input').fill(msg);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/messages') && r.request().method() === 'POST', { timeout: 15000 }),
      page.getByTestId('chat-send').click(),
    ]);
    await expect(page.getByTestId('chat-messages')).toContainText(msg, { timeout: 10000 });
  });
});
