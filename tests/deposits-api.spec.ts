import { test, expect, request, APIRequestContext } from '@playwright/test';

// 存款 API (migration 108): each partner has their own account that only the
// OTHER partner pays into (感謝存款 / confirmed 申請存款); spending it on a gift
// needs the partner's agreement. Dedicated paired couple so the shared
// test-e2e user's state is untouched.
const USER_A = { email: 'deposit-a-e2e@twogether.app', nickname: 'Dep A', password: 'test123456' };
const USER_B = { email: 'deposit-b-e2e@twogether.app', nickname: 'Dep B', password: 'test123456' };
const SOLO = { email: 'test-e2e@twogether.app', password: 'test123456' };

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

async function loginOrRegister(ctx: APIRequestContext, user: { email: string; password: string; nickname?: string }): Promise<string> {
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

const key = () => `dep-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function summary(ctx: APIRequestContext) {
  const res = await ctx.get(`${API}/coins/summary`);
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

async function deposit(ctx: APIRequestContext, kind: 'thanks' | 'request', amount: number, note = 'test') {
  return ctx.post(`${API}/coins/deposits`, { data: { kind, amount, note, idempotency_key: key() } });
}

let a: APIRequestContext;
let b: APIRequestContext;

test.describe.configure({ mode: 'serial' });

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
});

test.afterAll(async () => {
  await a?.dispose();
  await b?.dispose();
});

test('感謝存款 goes into the partner account only, and the average follows', async () => {
  const before = await summary(a);
  const res = await deposit(a, 'thanks', 100, '謝謝你幫我寫劇本');
  expect(res.status(), await res.text()).toBe(200);

  const afterA = await summary(a);
  const afterB = await summary(b);
  expect(afterA.me.balance).toBe(before.me.balance);
  expect(afterA.partner.balance).toBe(before.partner.balance + 100);
  expect(afterB.me.balance).toBe(before.partner.balance + 100);
  expect(afterA.average).toBe(Math.round((afterA.me.balance + afterA.partner.balance) / 2));
});

test('申請存款 waits for the partner; the owner cannot confirm it', async () => {
  const before = (await summary(b)).me.balance;
  const res = await deposit(b, 'request', 50, '我做了早餐');
  expect(res.status()).toBe(200);
  const { transaction } = await res.json();
  expect(transaction.status).toBe('pending');
  expect((await summary(b)).me.balance).toBe(before);

  const own = await b.post(`${API}/coins/transactions/${transaction.id}/respond`, { data: { decision: 'confirm' } });
  expect(own.status()).toBe(403);
  expect((await own.json()).error_code).toBe('CANNOT_RESPOND_OWN');

  expect((await summary(a)).awaiting_me.some((t: { id: string }) => t.id === transaction.id)).toBe(true);
  const ok = await a.post(`${API}/coins/transactions/${transaction.id}/respond`, { data: { decision: 'confirm' } });
  expect(ok.status(), await ok.text()).toBe(200);
  expect((await summary(b)).me.balance).toBe(before + 50);

  const again = await a.post(`${API}/coins/transactions/${transaction.id}/respond`, { data: { decision: 'confirm' } });
  expect(again.status()).toBe(409);
  expect((await again.json()).error_code).toBe('ALREADY_RESPONDED');
});

test('redeeming reserves the amount and deducts only after the partner agrees', async () => {
  await deposit(a, 'thanks', 300);
  const start = (await summary(b)).me;

  const tooMuch = await b.post(`${API}/coins/redemptions`, {
    data: { gift_title: '太貴的禮物', cost: start.available + 1, idempotency_key: key() },
  });
  expect(tooMuch.status()).toBe(400);
  expect((await tooMuch.json()).error_code).toBe('INSUFFICIENT_DEPOSIT');

  // Declined → nothing deducted, reservation released.
  const first = await (await b.post(`${API}/coins/redemptions`, {
    data: { gift_title: '按摩', gift_icon: '💆', cost: 200, idempotency_key: key() },
  })).json();
  const pending = (await summary(b)).me;
  expect(pending.balance).toBe(start.balance);
  expect(pending.available).toBe(start.available - 200);
  await a.post(`${API}/coins/transactions/${first.transaction.id}/respond`, { data: { decision: 'decline' } });
  expect((await summary(b)).me).toEqual(start);

  // Approved → deducted.
  const second = await (await b.post(`${API}/coins/redemptions`, {
    data: { gift_title: '按摩', gift_icon: '💆', cost: 200, idempotency_key: key() },
  })).json();
  const approve = await a.post(`${API}/coins/transactions/${second.transaction.id}/respond`, { data: { decision: 'confirm' } });
  expect(approve.status(), await approve.text()).toBe(200);
  const end = (await summary(b)).me;
  expect(end.balance).toBe(start.balance - 200);
  expect(end.available).toBe(start.available - 200);
});

test('the owner can cancel a pending request, after which it cannot be answered', async () => {
  const { transaction } = await (await deposit(b, 'request', 30)).json();
  const cancel = await b.post(`${API}/coins/transactions/${transaction.id}/cancel`);
  expect(cancel.status()).toBe(200);
  const answer = await a.post(`${API}/coins/transactions/${transaction.id}/respond`, { data: { decision: 'confirm' } });
  expect(answer.status()).toBe(409);
});

test('the same idempotency key deposits once', async () => {
  const before = (await summary(b)).me.balance;
  const payload = { kind: 'thanks', amount: 7, note: 'idem', idempotency_key: key() };
  expect((await a.post(`${API}/coins/deposits`, { data: payload })).status()).toBe(200);
  const second = await a.post(`${API}/coins/deposits`, { data: payload });
  expect((await second.json()).deduped).toBe(true);
  expect((await summary(b)).me.balance).toBe(before + 7);
});

test('unpaired users get a specific NOT_PAIRED gate; self-crediting is gone', async () => {
  const base = await request.newContext();
  const token = await loginOrRegister(base, SOLO);
  await base.dispose();
  const solo = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

  const balance = await (await solo.get(`${API}/coins/balance`)).json();
  expect(balance).toMatchObject({ paired: false, balance: 0 });
  const res = await deposit(solo, 'request', 10);
  expect(res.status()).toBe(409);
  expect((await res.json()).error_code).toBe('NOT_PAIRED');

  // The old client-trusted grant endpoint no longer exists.
  const legacy = await solo.post(`${API}/coins/transaction`, { data: { amount: 50, transaction_type: 'earn', description: 'x' } });
  expect(legacy.status()).toBe(404);
  await solo.dispose();
});
