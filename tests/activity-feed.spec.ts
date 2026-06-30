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

test.describe('Activity feed + diagnostics', () => {
  test('GET /api/activity returns a feed and an X-Request-Id header', async () => {
    const token = await getAuthToken();
    const ctx = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });

    const res = await ctx.get(`${API_BASE}/activity`);
    expect(res.status(), await res.text()).toBe(200);

    // B5: every API response carries a request id so a client failure can be
    // correlated to the backend execution trace.
    expect(res.headers()['x-request-id']).toBeTruthy();

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.activities)).toBe(true);

    // Shape check when the feed has rows (depends on the account's data).
    for (const item of body.activities) {
      expect(typeof item.type).toBe('string');
      expect(typeof item.description).toBe('string');
      expect(typeof item.isSelf).toBe('boolean');
      expect(item.date).toBeTruthy();
    }
    await ctx.dispose();
  });

  test('client-log beacon accepts events and returns 204', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${API_BASE}/track/client-log`, {
      data: { event: 'e2e_smoke', level: 'info', data: { from: 'playwright' } },
    });
    expect(res.status()).toBe(204);
    await ctx.dispose();
  });
});
