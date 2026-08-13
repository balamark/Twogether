import { test, expect, request } from '@playwright/test';

const API_BASE = 'http://localhost:8080/api';
const TEST_USER = { email: 'test-e2e@twogether.app', password: 'test123456' };

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

  test('creates a script with a video cover (multipart, photos[])', async () => {
    const token = await getAuthToken();
    const ctx = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    // Videos are stored raw (no re-encode), so any buffer works for the API
    // contract test; the non-prod uploadToSupabase short-circuit returns a
    // fake public URL without touching a real bucket.
    const mp4 = Buffer.from('AAAAIGZ0eXBpc29t', 'base64'); // tiny ftyp box
    const res = await ctx.post(`${API_BASE}/custom-scripts`, {
      multipart: {
        title: `API Video ${Date.now()}`,
        category: 'romantic',
        scenario: 'Test scenario with video cover',
        content: '[男]: hi\n[女]: hi',
        photos: { name: 'cover.mp4', mimeType: 'video/mp4', buffer: mp4 },
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Cover is stored under custom-script-videos/ with the .mp4 extension so
    // the client renders <video> instead of <img>.
    expect(body.custom_script.thumbnailUrl).toMatch(
      /\/storage\/v1\/object\/public\/photos\/custom-script-videos\/.+\.mp4$/,
    );
    expect(body.custom_script.photos[0]).toBe(body.custom_script.thumbnailUrl);
    await ctx.dispose();
  });

  test('rejects an oversize image with SCRIPT_MEDIA_TOO_LARGE', async () => {
    const token = await getAuthToken();
    const ctx = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    // 11MB > the 10MB image cap (but under the 30MB multer ceiling) → the
    // per-type size check rejects it before upload.
    const bigImage = Buffer.alloc(11 * 1024 * 1024, 1);
    const res = await ctx.post(`${API_BASE}/custom-scripts`, {
      multipart: {
        title: `API Oversize ${Date.now()}`,
        category: 'romantic',
        scenario: 'Too big',
        content: '[男]: hi\n[女]: hi',
        photos: { name: 'huge.png', mimeType: 'image/png', buffer: bigImage },
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('SCRIPT_MEDIA_TOO_LARGE');
    await ctx.dispose();
  });
});
