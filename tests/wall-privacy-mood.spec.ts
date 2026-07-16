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

// Wall posting requires a couple; creating one is idempotent for an existing
// couple, so it's safe to call before each test.
async function ensureCouple(token: string) {
  const ctx = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  await ctx.post(`${API_BASE}/couples`, { data: {} });
  await ctx.dispose();
}

test.describe('Wall privacy + custom mood tags API', () => {
  test('creates a private post; author can see it in their own list', async () => {
    const token = await getAuthToken();
    await ensureCouple(token);
    const ctx = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const marker = `私密貼文 ${Date.now()}`;
    const create = await ctx.post(`${API_BASE}/wall`, {
      data: { content: marker, category: 'general', is_private: true },
    });
    expect(create.status(), await create.text()).toBe(200);
    const created = (await create.json()).wall_post;
    expect(created.is_private).toBe(true);

    // The author still sees their own private post in the list.
    const list = await ctx.get(`${API_BASE}/wall`);
    const posts = (await list.json()).wall_posts as Array<{ id: string; is_private: boolean }>;
    const found = posts.find((p) => p.id === created.id);
    expect(found?.is_private).toBe(true);
    await ctx.dispose();
  });

  test('a private post cannot be published to the public Q&A', async () => {
    const token = await getAuthToken();
    await ensureCouple(token);
    const ctx = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const create = await ctx.post(`${API_BASE}/wall`, {
      data: { content: `私密不可公開 ${Date.now()}`, category: 'general', is_private: true },
    });
    const postId = (await create.json()).wall_post.id;

    const publish = await ctx.post(`${API_BASE}/wall/${postId}/publish`, { data: {} });
    expect(publish.status()).toBe(400);
    expect((await publish.json()).error_code).toBe('WALL_PRIVATE_CANNOT_PUBLISH');
    await ctx.dispose();
  });

  test('toggling privacy off via PUT then publishing works', async () => {
    const token = await getAuthToken();
    await ensureCouple(token);
    const ctx = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const create = await ctx.post(`${API_BASE}/wall`, {
      data: { content: `切回公開 ${Date.now()}`, category: 'general', is_private: true },
    });
    const postId = (await create.json()).wall_post.id;

    const update = await ctx.put(`${API_BASE}/wall/${postId}`, { data: { is_private: false } });
    expect(update.status(), await update.text()).toBe(200);
    expect((await update.json()).wall_post.is_private).toBe(false);

    const publish = await ctx.post(`${API_BASE}/wall/${postId}/publish`, { data: {} });
    expect(publish.status(), await publish.text()).toBe(200);
    await ctx.dispose();
  });

  test('accepts a custom mood tag and remembers it', async () => {
    const token = await getAuthToken();
    await ensureCouple(token);
    const ctx = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const customTag = `加班中-${Date.now().toString().slice(-5)}`;
    const create = await ctx.post(`${API_BASE}/wall`, {
      data: { content: '自訂心情', category: 'general', mood_tag: customTag },
    });
    expect(create.status(), await create.text()).toBe(200);
    expect((await create.json()).wall_post.mood_tag).toBe(customTag);

    // The custom (non-preset) tag is remembered for reuse.
    const tagsRes = await ctx.get(`${API_BASE}/wall/mood-tags`);
    expect(tagsRes.status()).toBe(200);
    expect((await tagsRes.json()).tags).toContain(customTag);
    await ctx.dispose();
  });
});
