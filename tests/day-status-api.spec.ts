import { test, expect, request, APIRequestContext } from '@playwright/test';

// 每日狀態 API (migration 104): one row per person per day, private until its
// owner shares it, never writable by the partner, and cleared = no row.
// Dedicated paired couple so the shared test-e2e user's state is untouched.
const USER_A = { email: 'daystatus-a-e2e@twogether.app', nickname: 'Day A', password: 'test123456' };
const USER_B = { email: 'daystatus-b-e2e@twogether.app', nickname: 'Day B', password: 'test123456' };

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

async function loginOrRegister(ctx: APIRequestContext, user: typeof USER_A): Promise<string> {
  let res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  if (!res.ok()) {
    await ctx.post(`${API}/auth/register`, { data: user });
    res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  }
  if (!res.ok()) throw new Error(`login failed for ${user.email}: ${res.status()} ${await res.text()}`);
  return (await res.json()).token;
}

async function isComplete(ctx: APIRequestContext): Promise<boolean> {
  const res = await ctx.get(`${API}/couples`);
  if (!res.ok()) return false;
  return !!(await res.json())?.couple?.is_complete;
}

let a: APIRequestContext;
let b: APIRequestContext;

// A past day unlikely to collide with other runs' leftovers; cleared up front.
const DAY = '2026-01-15';
const RANGE = `from=2026-01-01&to=2026-01-31`;

test.beforeAll(async () => {
  const base = await request.newContext();
  const tokenA = await loginOrRegister(base, USER_A);
  const tokenB = await loginOrRegister(base, USER_B);
  await base.dispose();
  a = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenA}` } });
  b = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenB}` } });
  if (!(await isComplete(a))) {
    const code = (await (await a.post(`${API}/couples/pairing-code`, { data: {} })).json())?.code;
    if (!code) throw new Error('no pairing code');
    await b.post(`${API}/couples`, { data: { pairing_code: code } });
    expect(await isComplete(a)).toBe(true);
  }
  await a.delete(`${API}/day-status/${DAY}`);
  await b.delete(`${API}/day-status/${DAY}`);
});

test.afterAll(async () => {
  await a?.dispose();
  await b?.dispose();
});

test('private by default; visible to the partner only while shared', async () => {
  const put = await a.put(`${API}/day-status/${DAY}`, { data: { mood: 'good', intimacy_intention: 'start_with_cuddles' } });
  expect(put.status(), await put.text()).toBe(200);
  const saved = (await put.json()).day_status;
  expect(saved).toMatchObject({ date: DAY, mood: 'good', intimacy_intention: 'start_with_cuddles', sharing_enabled: false });

  // Owner sees it; partner doesn't.
  const mine = await (await a.get(`${API}/day-status?${RANGE}`)).json();
  expect(mine.mine.map((r: { date: string }) => r.date)).toContain(DAY);
  const before = await (await b.get(`${API}/day-status?${RANGE}`)).json();
  expect(before.partner.find((r: { date: string }) => r.date === DAY)).toBeUndefined();

  // Owner shares → partner sees it.
  await a.put(`${API}/day-status/${DAY}`, { data: { sharing_enabled: true } });
  const shared = await (await b.get(`${API}/day-status?${RANGE}`)).json();
  expect(shared.partner.find((r: { date: string }) => r.date === DAY)).toMatchObject({ mood: 'good', sharing_enabled: true });
  // …but it is A's row, not B's.
  expect(shared.mine.find((r: { date: string }) => r.date === DAY)).toBeUndefined();

  // Unshare → hidden again.
  await a.put(`${API}/day-status/${DAY}`, { data: { sharing_enabled: false } });
  const after = await (await b.get(`${API}/day-status?${RANGE}`)).json();
  expect(after.partner.find((r: { date: string }) => r.date === DAY)).toBeUndefined();
});

test('the partner cannot write someone else\'s status — writes only touch their own row', async () => {
  await a.put(`${API}/day-status/${DAY}`, { data: { mood: 'great', sharing_enabled: true } });
  await b.put(`${API}/day-status/${DAY}`, { data: { mood: 'stressed' } });
  const aView = await (await a.get(`${API}/day-status?${RANGE}`)).json();
  expect(aView.mine.find((r: { date: string }) => r.date === DAY).mood).toBe('great');
  await b.delete(`${API}/day-status/${DAY}`);
  const stillThere = await (await a.get(`${API}/day-status?${RANGE}`)).json();
  expect(stillThere.mine.find((r: { date: string }) => r.date === DAY)).toBeTruthy();
});

test('clearing both fields removes the row; partial patches keep the other field', async () => {
  await a.put(`${API}/day-status/${DAY}`, { data: { mood: 'okay', intimacy_intention: 'not_sure' } });
  const partial = await (await a.put(`${API}/day-status/${DAY}`, { data: { mood: null } })).json();
  expect(partial.day_status).toMatchObject({ mood: null, intimacy_intention: 'not_sure' });
  const cleared = await (await a.put(`${API}/day-status/${DAY}`, { data: { intimacy_intention: null } })).json();
  expect(cleared.day_status).toBeNull();
  const list = await (await a.get(`${API}/day-status?${RANGE}`)).json();
  expect(list.mine.find((r: { date: string }) => r.date === DAY)).toBeUndefined();
});

test('rejects future days, invalid values and bad ranges with specific error codes', async () => {
  const future = await a.put(`${API}/day-status/2099-01-01`, { data: { mood: 'good' } });
  expect(future.status()).toBe(400);
  expect((await future.json()).error_code).toBe('DAY_STATUS_FUTURE_DATE');

  const badMood = await a.put(`${API}/day-status/${DAY}`, { data: { mood: 'ecstatic' } });
  expect((await badMood.json()).error_code).toBe('DAY_STATUS_MOOD_INVALID');

  const badIntent = await a.put(`${API}/day-status/${DAY}`, { data: { intimacy_intention: 'yes' } });
  expect((await badIntent.json()).error_code).toBe('DAY_STATUS_INTENTION_INVALID');

  const badDate = await a.put(`${API}/day-status/2026-02-30`, { data: { mood: 'good' } });
  expect((await badDate.json()).error_code).toBe('DAY_STATUS_DATE_INVALID');

  const badRange = await a.get(`${API}/day-status?from=2026-02-01&to=2026-01-01`);
  expect((await badRange.json()).error_code).toBe('DAY_STATUS_RANGE_INVALID');

  const tooLong = await a.get(`${API}/day-status?from=2024-01-01&to=2026-01-01`);
  expect((await tooLong.json()).error_code).toBe('DAY_STATUS_RANGE_TOO_LONG');
});
