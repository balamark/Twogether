import { test, expect, request, APIRequestContext } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// 說開一件事 — 提醒對方回覆 (POST /events/:id/nudge). The share icon in a thread
// sends the partner an in-app notification that deep-links back to that exact
// thread; it has a per-sender cooldown and refuses private threads.
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true });

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

const STAMP = Date.now();
const A = { email: `nudge-a-${STAMP}@twogether.app`, nickname: '阿哲', password: 'test123456' };
const B = { email: `nudge-b-${STAMP}@twogether.app`, nickname: '小圓', password: 'test123456' };

async function register(user: typeof A): Promise<string> {
  const base = await request.newContext();
  try {
    const reg = await base.post(`${API}/auth/register`, { data: user });
    if (!reg.ok()) throw new Error(`register failed: ${reg.status()} ${await reg.text()}`);
    return (await reg.json()).token;
  } finally {
    await base.dispose();
  }
}

const ctxFor = (token: string) =>
  request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

async function createEvent(ctx: APIRequestContext, isPrivate: boolean) {
  const res = await ctx.post(`${API}/events`, {
    data: { title: '週末的安排', summary: '想聊聊週末怎麼分配時間。', ai_neutral: 'x', ai_firm: 'y', ai_warm: 'z', is_private: isPrivate },
  });
  if (!res.ok()) throw new Error(`create event failed: ${res.status()} ${await res.text()}`);
  return (await res.json()).event;
}

let ctxA: APIRequestContext;
let ctxB: APIRequestContext;

test.beforeAll(async () => {
  ctxA = await ctxFor(await register(A));
  ctxB = await ctxFor(await register(B));
  const code = (await (await ctxA.post(`${API}/couples/pairing-code`, { data: {} })).json())?.code;
  const join = await ctxB.post(`${API}/couples`, { data: { pairing_code: code } });
  if (!join.ok()) throw new Error(`pairing failed: ${join.status()} ${await join.text()}`);
});

test.afterAll(async () => {
  await ctxA?.dispose();
  await ctxB?.dispose();
});

test('nudge notifies the partner with the event id, then cools down', async () => {
  const event = await createEvent(ctxA, false);

  const first = await ctxA.post(`${API}/events/${event.id}/nudge`);
  expect(first.ok()).toBeTruthy();

  const inbox = await ctxB.get(`${API}/intimacy-requests/notifications?notification_type=event_nudge`);
  const rows = (await inbox.json()).notifications as Array<{ event_id: string; notification_type: string }>;
  expect(rows.some((n) => n.event_id === event.id)).toBeTruthy();

  const second = await ctxA.post(`${API}/events/${event.id}/nudge`);
  expect(second.status()).toBe(429);
  expect((await second.json()).error_code).toBe('NUDGE_COOLDOWN');
});

test('a private thread cannot be nudged', async () => {
  const event = await createEvent(ctxA, true);
  const res = await ctxA.post(`${API}/events/${event.id}/nudge`);
  expect(res.status()).toBe(400);
  expect((await res.json()).error_code).toBe('NUDGE_PRIVATE_EVENT');
});

test('an outsider cannot nudge someone else\'s thread', async () => {
  const event = await createEvent(ctxA, false);
  const outsider = await ctxFor(await register({ email: `nudge-c-${STAMP}@twogether.app`, nickname: '路人', password: 'test123456' }));
  const res = await outsider.post(`${API}/events/${event.id}/nudge`);
  expect(res.status()).toBe(404);
  await outsider.dispose();
});
