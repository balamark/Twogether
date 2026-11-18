import { test, expect, request } from '@playwright/test';
import { supportEmail as SUPPORT_EMAIL } from '../lib/supportContact.json';

// Public static pages are served by Express, not the Vite dev server.
const SERVER = 'http://localhost:8080';

// One product, one sentence. The homepage, pricing, support and privacy pages
// used to describe Twogether three different ways (諮商延伸工具 / 親密關係追蹤
// App / 記錄美好的 App). The static pages can't import
// src/content/positioning.ts, so this spec pins them to its tagline.
const TAGLINE_ZH = '把諮商帶回日常的伴侶練習工具'; // POSITIONING_TAGLINE (繁中)
const STALE_FRAMINGS = ['親密關係追蹤', '情侶親密追蹤', 'Relationship Tracking', '攜手共度，讓愛情更美好'];

for (const path of ['/pricing', '/support', '/privacy']) {
  test(`${path} uses the canonical positioning line`, async () => {
    const ctx = await request.newContext();
    const html = await (await ctx.get(`${SERVER}${path}`)).text();
    expect(html).toContain(TAGLINE_ZH);
    for (const stale of STALE_FRAMINGS) expect(html).not.toContain(stale);
    // Every public page links to the privacy policy.
    if (path !== '/privacy') expect(html).toContain('href="/privacy');
    await ctx.dispose();
  });
}

// The privacy policy must be reachable without an account (App Store review,
// payment-provider audits) on every alias, with the support address filled in.
for (const path of ['/privacy', '/privacy-policy', '/privacy.html']) {
  test(`${path} serves the privacy policy with no unsubstituted placeholders`, async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${SERVER}${path}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('隱私權政策');
    expect(html).toContain('Privacy Policy');
    expect(html).toContain(`mailto:${SUPPORT_EMAIL}`);
    expect(html).not.toContain('{{');
    await ctx.dispose();
  });
}

test('privacy policy switches language and lists the PDPA rights', async ({ page }) => {
  await page.goto(`${SERVER}/privacy?lang=zh-TW`);
  await expect(page.getByTestId('privacy-title')).toHaveText(/隱私權政策/);
  await expect(page.getByText('請求刪除。')).toBeVisible();
  await page.getByTestId('privacy-language-switch').getByRole('radio', { name: 'English' }).click();
  await expect(page.getByTestId('privacy-title')).toHaveText(/Privacy Policy/);
  await expect(page.getByText('ask us to delete it.')).toBeVisible();
});

test('sitemap lists the privacy policy', async () => {
  const ctx = await request.newContext();
  const xml = await (await ctx.get(`${SERVER}/sitemap.xml`)).text();
  expect(xml).toContain('<loc>https://twogether.fun/privacy</loc>');
  await ctx.dispose();
});
