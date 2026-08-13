import { test, expect, request } from '@playwright/test';

const API_BASE = 'http://localhost:8080/api';
const TEST_USER = { email: 'test-e2e@twogether.app', password: 'test123456' };

// 1x1 red PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
// Tiny ftyp box — videos are stored raw so any buffer satisfies the API contract.
const MP4 = Buffer.from('AAAAIGZ0eXBpc29t', 'base64');

async function getAuthToken() {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API_BASE}/auth/login`, { data: TEST_USER });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  await ctx.dispose();
  return body.token as string;
}

// Wall posting requires a couple. Creating a couple is idempotent for a user who
// already has one, so this is safe to call before every test.
async function ensureCouple(token: string) {
  const ctx = await request.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  await ctx.post(`${API_BASE}/couples`, { data: {} });
  await ctx.dispose();
}

test.describe('Wall media API', () => {
  test('creates a text-only post via JSON (no media)', async () => {
    const token = await getAuthToken();
    await ensureCouple(token);
    const ctx = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const res = await ctx.post(`${API_BASE}/wall`, {
      data: { content: `文字貼文 ${Date.now()}`, category: 'general' },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.wall_post.media).toEqual([]);
    await ctx.dispose();
  });

  test('creates a post with a photo (multipart)', async () => {
    const token = await getAuthToken();
    await ensureCouple(token);
    const ctx = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const res = await ctx.post(`${API_BASE}/wall`, {
      multipart: {
        content: `帶照片的貼文 ${Date.now()}`,
        category: 'general',
        media: { name: 'photo.png', mimeType: 'image/png', buffer: PNG },
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.wall_post.media).toHaveLength(1);
    expect(body.wall_post.media[0]).toMatch(
      /\/storage\/v1\/object\/public\/photos\/wall-photos\/.+\.jpg$/,
    );
    await ctx.dispose();
  });

  test('creates a media-only post (empty text) with a video', async () => {
    const token = await getAuthToken();
    await ensureCouple(token);
    const ctx = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const res = await ctx.post(`${API_BASE}/wall`, {
      multipart: {
        content: '',
        category: 'general',
        media: { name: 'clip.mp4', mimeType: 'video/mp4', buffer: MP4 },
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.wall_post.content).toBe('');
    // Videos are stored under wall-videos/ with the .mp4 extension so the client
    // renders <video> instead of <img>.
    expect(body.wall_post.media[0]).toMatch(
      /\/storage\/v1\/object\/public\/photos\/wall-videos\/.+\.mp4$/,
    );
    await ctx.dispose();
  });

  test('rejects an entirely empty post with WALL_POST_EMPTY', async () => {
    const token = await getAuthToken();
    await ensureCouple(token);
    const ctx = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const res = await ctx.post(`${API_BASE}/wall`, {
      data: { content: '   ', category: 'general' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('WALL_POST_EMPTY');
    await ctx.dispose();
  });

  test('rejects an oversize image with WALL_MEDIA_TOO_LARGE', async () => {
    const token = await getAuthToken();
    await ensureCouple(token);
    const ctx = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    // 11MB > the 10MB image cap (but under the 30MB multer ceiling) → the
    // per-type size check rejects it before upload.
    const bigImage = Buffer.alloc(11 * 1024 * 1024, 1);
    const res = await ctx.post(`${API_BASE}/wall`, {
      multipart: {
        content: 'too big',
        category: 'general',
        media: { name: 'huge.png', mimeType: 'image/png', buffer: bigImage },
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('WALL_MEDIA_TOO_LARGE');
    await ctx.dispose();
  });
});
