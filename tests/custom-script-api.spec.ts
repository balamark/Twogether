import { test, expect, request } from '@playwright/test';

const API_BASE = 'http://localhost:8080/api';
const TEST_USER = { email: 'test-e2e@twogether.app', password: 'test123456' };
// .env.test ships with a placeholder Supabase URL so we don't accidentally
// upload to a real bucket from CI. Skip the multipart test in that case.
const HAS_REAL_SUPABASE =
  !!process.env.SUPABASE_URL &&
  !process.env.SUPABASE_URL.includes('test.supabase.co');

async function getAuthToken() {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API_BASE}/auth/login`, { data: TEST_USER });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  await ctx.dispose();
  return body.token as string;
}

test.describe('Custom scripts API', () => {
  test('creates a script via JSON (no thumbnail)', async () => {
    const token = await getAuthToken();
    const ctx = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const res = await ctx.post(`${API_BASE}/custom-scripts`, {
      data: {
        title: `API JSON ${Date.now()}`,
        category: 'romantic',
        scenario: 'Test scenario',
        content: '[男]: hi\n[女]: hi',
        tags: ['api', 'json'],
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.custom_script.thumbnailUrl).toBeNull();
    expect(body.custom_script.tags).toEqual(['api', 'json']);
    await ctx.dispose();
  });

  test('creates a script via multipart with thumbnail', async () => {
    test.skip(!HAS_REAL_SUPABASE, 'Skipped: .env.test uses placeholder SUPABASE_URL');
    const token = await getAuthToken();
    const ctx = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    // 1x1 red PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    );
    const res = await ctx.post(`${API_BASE}/custom-scripts`, {
      multipart: {
        title: `API Multipart ${Date.now()}`,
        category: 'romantic',
        scenario: 'Test scenario with thumb',
        content: '[男]: hi\n[女]: hi',
        tags: JSON.stringify(['api', 'multipart']),
        thumbnail: { name: 'thumb.png', mimeType: 'image/png', buffer: png },
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.custom_script.thumbnailUrl).toMatch(
      /\/storage\/v1\/object\/public\/photos\/custom-script-thumbnails\/.+\.jpg$/,
    );
    expect(body.custom_script.tags).toEqual(['api', 'multipart']);
    await ctx.dispose();
  });
});
