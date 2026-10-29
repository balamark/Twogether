import { test, expect, request, type APIRequestContext } from '@playwright/test';

const API_BASE = 'http://localhost:8080/api';
const TEST_USER = { email: 'test-e2e@twogether.app', password: 'test123456' };

async function authedContext(): Promise<APIRequestContext> {
  const login = await request.newContext();
  const res = await login.post(`${API_BASE}/auth/login`, { data: TEST_USER });
  expect(res.ok()).toBeTruthy();
  const { token } = await res.json();
  await login.dispose();
  return request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

async function listGifts(ctx: APIRequestContext) {
  const res = await ctx.get(`${API_BASE}/custom-gifts`);
  expect(res.status(), await res.text()).toBe(200);
  return res.json() as Promise<{ custom_gifts: { id: string; title: string; cost: number }[]; hidden_defaults: string[] }>;
}

// Coin shop: every gift — built-in defaults included — can be added, edited
// and removed, and the built-in ones can be restored.
test.describe.serial('Custom gifts API (coin shop management)', () => {
  test('edits and removes a custom gift', async () => {
    const ctx = await authedContext();
    const created = await ctx.post(`${API_BASE}/custom-gifts`, {
      data: { title: `Gift ${Date.now()}`, description: 'desc', cost: 300, category: 'service', icon: '🎁' },
    });
    expect(created.status(), await created.text()).toBe(200);
    const { custom_gift } = await created.json();

    const updated = await ctx.put(`${API_BASE}/custom-gifts/${custom_gift.id}`, {
      data: { title: 'Renamed gift', cost: 450 },
    });
    expect(updated.status(), await updated.text()).toBe(200);
    expect((await updated.json()).custom_gift).toMatchObject({ title: 'Renamed gift', cost: 450 });

    const removed = await ctx.delete(`${API_BASE}/custom-gifts/${custom_gift.id}`);
    expect(removed.status()).toBe(200);
    const after = await listGifts(ctx);
    expect(after.custom_gifts.some((g) => g.id === custom_gift.id)).toBe(false);
    await ctx.dispose();
  });

  test('hides, replaces and restores built-in gifts', async () => {
    const ctx = await authedContext();
    await ctx.delete(`${API_BASE}/custom-gifts/defaults/hidden`);

    // Remove a default (idempotent).
    expect((await ctx.delete(`${API_BASE}/custom-gifts/defaults/massage`)).status()).toBe(200);
    expect((await ctx.delete(`${API_BASE}/custom-gifts/defaults/massage`)).status()).toBe(200);

    // Edit a default → custom copy + original hidden.
    const replaced = await ctx.post(`${API_BASE}/custom-gifts`, {
      data: { title: 'Home dinner', description: 'Edited default', cost: 1800, category: 'service', icon: '🍽️', replaces_default: 'dinner' },
    });
    expect(replaced.status(), await replaced.text()).toBe(200);
    const copy = (await replaced.json()).custom_gift;

    let state = await listGifts(ctx);
    expect(state.hidden_defaults.sort()).toEqual(['dinner', 'massage']);
    expect(state.custom_gifts.some((g) => g.id === copy.id && g.cost === 1800)).toBe(true);

    // Restore brings defaults back; the edited copy stays.
    const restored = await ctx.delete(`${API_BASE}/custom-gifts/defaults/hidden`);
    expect(restored.status()).toBe(200);
    expect((await restored.json()).restored).toBe(2);
    state = await listGifts(ctx);
    expect(state.hidden_defaults).toEqual([]);
    expect(state.custom_gifts.some((g) => g.id === copy.id)).toBe(true);

    await ctx.delete(`${API_BASE}/custom-gifts/${copy.id}`);
    await ctx.dispose();
  });

  test('rejects unknown default keys with a specific error_code', async () => {
    const ctx = await authedContext();
    const hide = await ctx.delete(`${API_BASE}/custom-gifts/defaults/not_a_gift`);
    expect(hide.status()).toBe(404);
    expect((await hide.json()).error_code).toBe('DEFAULT_GIFT_NOT_FOUND');

    const replace = await ctx.post(`${API_BASE}/custom-gifts`, {
      data: { title: 'x', description: 'x', cost: 10, category: 'service', replaces_default: 'not_a_gift' },
    });
    expect(replace.status()).toBe(400);
    const body = await replace.json();
    expect(body.error_code).toBe('GIFT_VALIDATION_FAILED');
    expect(body.message).toContain('預設禮品');
    await ctx.dispose();
  });
});
