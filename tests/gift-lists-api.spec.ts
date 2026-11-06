import { test, expect, request, APIRequestContext } from '@playwright/test';

// 感情存款 gift shop split into 我的禮品 / TA 的禮品 (migration 114): each
// partner sees both lists, but only edits their own — and hiding a built-in
// gift hides it on the caller's list only. Dedicated paired couple so other
// specs' state is untouched.
const USER_A = { email: 'giftlist-a-e2e@twogether.app', nickname: 'Gift A', password: 'test123456' };
const USER_B = { email: 'giftlist-b-e2e@twogether.app', nickname: 'Gift B', password: 'test123456' };

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

async function loginOrRegister(ctx: APIRequestContext, user: { email: string; password: string; nickname?: string }) {
  let res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  if (!res.ok()) {
    await ctx.post(`${API}/auth/register`, { data: user });
    res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  }
  if (!res.ok()) throw new Error(`login failed for ${user.email}: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return { token: body.token as string, id: body.user.id as string };
}

type Lists = {
  custom_gifts: { id: string; createdBy: string }[];
  hidden_defaults: string[];
  partner_id: string | null;
  partner_hidden_defaults: string[];
};
const lists = async (ctx: APIRequestContext): Promise<Lists> => {
  const res = await ctx.get(`${API}/custom-gifts`);
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
};

let a: APIRequestContext;
let b: APIRequestContext;
let idA: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const base = await request.newContext();
  const ua = await loginOrRegister(base, USER_A);
  const ub = await loginOrRegister(base, USER_B);
  await base.dispose();
  idA = ua.id;
  a = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${ua.token}` } });
  b = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${ub.token}` } });
  const complete = async () => !!(await (await a.get(`${API}/couples`)).json())?.couple?.is_complete;
  if (!(await complete())) {
    const code = (await (await a.post(`${API}/couples/pairing-code`, { data: {} })).json())?.code;
    if (!code) throw new Error('no pairing code');
    await b.post(`${API}/couples`, { data: { pairing_code: code } });
    expect(await complete()).toBe(true);
  }
  await a.delete(`${API}/custom-gifts/defaults/hidden`);
  await b.delete(`${API}/custom-gifts/defaults/hidden`);
});

test.afterAll(async () => {
  await a?.dispose();
  await b?.dispose();
});

test('both partners see both lists, but only the owner can edit or remove', async () => {
  const created = await a.post(`${API}/custom-gifts`, {
    data: { title: `A's wish ${Date.now()}`, description: 'desc', cost: 300, category: 'service', icon: '🎁' },
  });
  expect(created.status(), await created.text()).toBe(200);
  const gift = (await created.json()).custom_gift;
  expect(gift.createdBy).toBe(idA);

  const seenByB = await lists(b);
  expect(seenByB.partner_id).toBe(idA);
  expect(seenByB.custom_gifts.find((g) => g.id === gift.id)?.createdBy).toBe(idA);

  const edit = await b.put(`${API}/custom-gifts/${gift.id}`, { data: { cost: 1 } });
  expect(edit.status()).toBe(403);
  expect((await edit.json()).error_code).toBe('GIFT_NOT_OWNER');
  const del = await b.delete(`${API}/custom-gifts/${gift.id}`);
  expect(del.status()).toBe(403);
  expect((await del.json()).error_code).toBe('GIFT_NOT_OWNER');

  expect((await a.put(`${API}/custom-gifts/${gift.id}`, { data: { cost: 450 } })).status()).toBe(200);
  expect((await a.delete(`${API}/custom-gifts/${gift.id}`)).status()).toBe(200);
});

test('hiding a built-in gift only hides it on the caller’s own list', async () => {
  expect((await a.delete(`${API}/custom-gifts/defaults/massage`)).status()).toBe(200);

  const forA = await lists(a);
  expect(forA.hidden_defaults).toEqual(['massage']);
  expect(forA.partner_hidden_defaults).toEqual([]);

  const forB = await lists(b);
  expect(forB.hidden_defaults).toEqual([]);
  expect(forB.partner_hidden_defaults).toEqual(['massage']);
  expect(forB.partner_id).toBe(idA);

  // B restoring their own list doesn't touch A's.
  await b.delete(`${API}/custom-gifts/defaults/hidden`);
  expect((await lists(a)).hidden_defaults).toEqual(['massage']);
  await a.delete(`${API}/custom-gifts/defaults/hidden`);
  expect((await lists(a)).hidden_defaults).toEqual([]);
});
