import { test, expect, request } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

// 一句話翻譯 — the public /translate page (public/translate.html) and its
// POST /api/guest-ai/translate endpoint, against the real server with the mock
// LLM provider. Covers the caps, the page flow, the share image and the
// limit state's next step.
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true });

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

async function resetTranslateUsage() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set; cannot run translate-tool spec');
  if (!['localhost', '127.0.0.1'].includes(new URL(dbUrl).hostname)) {
    throw new Error('translate-tool spec refusing to touch a non-local DB');
  }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(`DELETE FROM guest_ai_usage WHERE kind = 'line_translate'`);
  } finally {
    await client.end();
  }
}

test.describe.serial('一句話翻譯 (public translate tool)', () => {
  test.beforeEach(resetTranslateUsage);

  test('API translates one line, validates input and enforces the per-tab cap', async () => {
    const ctx = await request.newContext();
    const guest = `t-${Date.now()}`;
    const ok = await ctx.post(`${API}/guest-ai/translate`, { data: { guest_id: guest, text: '你都不在乎我' } });
    expect(ok.status(), await ok.text()).toBe(200);
    const body = await ok.json();
    expect(typeof body.translation.rewrite).toBe('string');
    expect(body.translation.rewrite.length).toBeGreaterThan(0);
    expect(body.remaining).toBe(4);

    const empty = await ctx.post(`${API}/guest-ai/translate`, { data: { guest_id: guest, text: ' ' } });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).error_code).toBe('VALIDATION_ERROR');
    const tooLong = await ctx.post(`${API}/guest-ai/translate`, { data: { guest_id: guest, text: '吵'.repeat(201) } });
    expect(tooLong.status()).toBe(400);

    for (let i = 0; i < 4; i += 1) {
      const r = await ctx.post(`${API}/guest-ai/translate`, { data: { guest_id: guest, text: '隨便你啦' } });
      expect(r.status()).toBe(200);
    }
    const capped = await ctx.post(`${API}/guest-ai/translate`, { data: { guest_id: guest, text: '隨便你啦' } });
    expect(capped.status()).toBe(429);
    const cb = await capped.json();
    expect(cb.error_code).toBe('TRANSLATE_LIMIT');
    expect(cb.message).toContain('免費註冊');

    // The guest preview's 5 real AI tries are untouched by the tool.
    const quota = await (await ctx.get(`${API}/guest-ai/quota?guest_id=${guest}`)).json();
    expect(quota.usage.remaining).toBe(5);
    await ctx.dispose();
  });

  test('page: example → translation → share image downloads → app CTA', async ({ page }) => {
    // Force the download path (no Web Share sheet in a headless run).
    await page.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: undefined }); });
    await page.goto(`${BACKEND_BASE}/translate`);
    await expect(page.getByTestId('translate-title')).toContainText('冰山');

    await page.getByRole('button', { name: '你都不在乎我' }).click();
    await expect(page.getByTestId('translate-input')).toHaveValue('你都不在乎我');
    await page.getByTestId('translate-submit').click();
    await expect(page.getByTestId('translate-result')).toBeVisible();
    await expect(page.getByTestId('translate-meaning')).not.toBeEmpty();
    await expect(page.getByText('今天還可以免費翻 4 句')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('translate-share-image').click(),
    ]);
    expect(download.suggestedFilename()).toBe('twogether-translate.png');

    await expect(page.getByTestId('translate-app-link')).toHaveAttribute('href', '/');
  });

  test('page: limit state explains why and offers the app; English switch works', async ({ page }) => {
    await page.route('**/api/guest-ai/translate', (route) => route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error_code: 'TRANSLATE_LIMIT', message: '今天的免費翻譯次數用完了。免費註冊後每天都有 AI 額度，還能邀請另一半一起把話說開。', remaining: 0 }),
    }));
    await page.goto(`${BACKEND_BASE}/translate`);
    await page.getByTestId('translate-input').fill('你每次都這樣');
    await page.getByTestId('translate-submit').click();
    const err = page.getByTestId('translate-error');
    await expect(err).toContainText('免費註冊');
    await expect(err.getByRole('link')).toBeVisible();

    await page.getByRole('radio', { name: 'English' }).click();
    await expect(page.getByTestId('translate-title')).toContainText('tip of the iceberg');
    await expect(page).toHaveTitle(/One-line translator/);
  });
});
