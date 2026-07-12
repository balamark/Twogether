import { test, expect, request } from '@playwright/test';
import crypto from 'crypto';

// LINE 通知 binding flow against the live backend. The test server sets
// LINE_CHANNEL_ID/SECRET (playwright.config.ts), so token issuance and webhook
// signature verification run for real; only the outbound LINE reply/push hit
// LINE's API (and are allowed to no-op).

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;
// Must match the test server's LINE_CHANNEL_SECRET (playwright.config.ts). Not
// the real secret — signature verification only needs sign+verify to agree.
const CHANNEL_SECRET = 'test-line-secret';

function sign(body: string): string {
  return crypto.createHmac('sha256', CHANNEL_SECRET).update(body).digest('base64');
}

test.describe('LINE notifications — link flow', () => {
  test('issue code, bind via signed webhook, status flips to linked', async () => {
    const ctx = await request.newContext();
    const email = `line-e2e-${Date.now()}@example.com`;
    const reg = await ctx.post(`${API}/auth/register`, { data: { email, nickname: 'LINE測試', password: 'test123456' } });
    const token = (await reg.json()).token as string;
    const auth = { Authorization: `Bearer ${token}` };

    // configured true (server has channel creds); not linked yet.
    const before = await (await ctx.get(`${API}/line/status`, { headers: auth })).json();
    expect(before.configured).toBe(true);
    expect(before.linked).toBe(false);

    // Issue a binding code.
    const codeRes = await (await ctx.post(`${API}/line/link-code`, { headers: auth })).json();
    expect(codeRes.code).toMatch(/^[A-Z0-9]{6}$/);

    // Simulate the user sending the code to the official account (signed webhook).
    const body = JSON.stringify({
      events: [{
        type: 'message',
        replyToken: 'test-reply-token',
        source: { type: 'user', userId: `Ue2e${Date.now()}` },
        message: { type: 'text', text: codeRes.code },
      }],
    });
    const hookRes = await ctx.post(`${API}/line/webhook`, {
      headers: { 'Content-Type': 'application/json', 'X-Line-Signature': sign(body) },
      data: body,
    });
    expect(hookRes.status()).toBe(200);

    // Status now linked.
    const after = await (await ctx.get(`${API}/line/status`, { headers: auth })).json();
    expect(after.linked).toBe(true);

    // Toggle off, then unlink.
    await ctx.put(`${API}/line/notifications`, { headers: auth, data: { enabled: false } });
    const toggled = await (await ctx.get(`${API}/line/status`, { headers: auth })).json();
    expect(toggled.notificationsEnabled).toBe(false);

    await ctx.post(`${API}/line/unlink`, { headers: auth });
    const unlinked = await (await ctx.get(`${API}/line/status`, { headers: auth })).json();
    expect(unlinked.linked).toBe(false);
    await ctx.dispose();
  });

  test('webhook rejects a bad signature', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${API}/line/webhook`, {
      headers: { 'Content-Type': 'application/json', 'X-Line-Signature': 'wrong' },
      data: JSON.stringify({ events: [] }),
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });
});
