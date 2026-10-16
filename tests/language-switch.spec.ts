import { test, expect, request } from '@playwright/test';
import { supportEmail as SUPPORT_EMAIL } from '../lib/supportContact.json';
import { seedAuth } from './helpers/closure';

// The top-right 繁中 / EN switch (src/components/LanguageSwitch.tsx) and the
// public English support page (/support). The app defaults to 繁中 even on an
// English-locale browser (Playwright runs en-US); EN is opt-in and remembered.

const SERVER = 'http://localhost:8080';

test.describe('language switch', () => {
  test('logged-out: defaults to 繁中, switches to EN, and remembers it across reload', async ({ page }) => {
    await page.goto('/');
    const sw = page.getByTestId('language-switch');
    await expect(sw).toBeVisible();
    await expect(page.getByTestId('language-switch-zh-TW')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('nav-tab-home')).toContainText('今天');
    await expect(page.getByTestId('header-auth-button')).toContainText('登入');

    await page.getByTestId('language-switch-en').click();
    await expect(page.getByTestId('language-switch-en')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('nav-tab-home')).toContainText('Today');
    await expect(page.getByTestId('header-auth-button')).toContainText('Sign in');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.reload();
    await expect(page.getByTestId('nav-tab-home')).toContainText('Today');

    await page.getByTestId('language-switch-zh-TW').click();
    await expect(page.getByTestId('nav-tab-home')).toContainText('今天');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  });

  test('logged-in: Help & Support renders in English with the support email', async ({ page }) => {
    await seedAuth(page);
    await page.goto('/');
    await page.getByTestId('language-switch-en').click();

    await page.getByTestId('user-menu-toggle').click();
    await expect(page.getByTestId('user-menu-help')).toContainText('Help & Support');
    await page.getByTestId('user-menu-help').click();

    await expect(page.getByTestId('help-title')).toHaveText('Help & Support');
    await expect(page.getByTestId('help-support-email')).toContainText(SUPPORT_EMAIL);
    await expect(page.getByTestId('help-support-page-link')).toHaveAttribute('href', '/support?lang=en');
    // FAQ content is translated too, not just the chrome.
    await expect(page.getByTestId('help-section-home')).toContainText('Today');
  });
});

test.describe('English beyond the header', () => {
  test('logged-out showroom content follows the switch, not just the nav', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('language-switch-en').click();
    await expect(page.getByTestId('nav-tab-home')).toContainText('Today');
    // Showroom copy lives in LoggedOutPreview (tr() strings), not messages.ts.
    await expect(page.getByText('Today, the one thing most')).toBeVisible();
    await expect(page.getByText('今天，最值得做的')).toHaveCount(0);
  });

  test('server messages come back in English with X-Locale: en', async () => {
    const ctx = await request.newContext();
    const bad = { email: 'not-an-email', password: 'x' };

    const en = await ctx.post(`${SERVER}/api/auth/login`, { data: bad, headers: { 'X-Locale': 'en' } });
    expect(en.status()).toBe(400);
    expect(JSON.stringify(await en.json())).toContain('Please enter a valid email address');

    // No header → the original 繁中 message, so existing clients are unaffected.
    const zh = await ctx.post(`${SERVER}/api/auth/login`, { data: bad });
    expect(JSON.stringify(await zh.json())).toContain('請輸入有效的電子郵件地址');
    await ctx.dispose();
  });
});

test.describe('public /support page', () => {
  for (const path of ['/support', '/support.html']) {
    test(`${path} is public, English, and carries the real support email`, async () => {
      const ctx = await request.newContext();
      const res = await ctx.get(`${SERVER}${path}`);
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toContain('How can we help?');
      expect(html).toContain(`mailto:${SUPPORT_EMAIL}`);
      expect(html).not.toContain('{{');
      await ctx.dispose();
    });
  }

  test('switches between EN and 繁中 in the browser', async ({ page }) => {
    await page.goto(`${SERVER}/support`);
    await expect(page.getByTestId('support-title')).toHaveText('How can we help?', { useInnerText: true });
    await page.getByRole('radio', { name: '繁體中文' }).click();
    await expect(page.getByTestId('support-title')).toHaveText('需要什麼協助？', { useInnerText: true });
    await page.goto(`${SERVER}/support?lang=en`);
    await expect(page.getByTestId('support-title')).toHaveText('How can we help?', { useInnerText: true });
  });
});
