import { test, expect, request, APIRequestContext } from '@playwright/test';

// 替代方案協商: the 'negotiation' intimacy-request type, its three-way response
// (accepted / later / rejected), and the co-authored plan list where a plan is
// only 'approved' once BOTH partners approved its current wording.
// Dedicated paired couple so the shared test-e2e user's paired state is never
// flipped; couples (and their plans/requests) are truncated between runs.
const USER_A = { email: 'negotiate-a-e2e@twogether.app', nickname: 'Nego A', password: 'test123456' };
const USER_B = { email: 'negotiate-b-e2e@twogether.app', nickname: 'Nego B', password: 'test123456' };

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

test('negotiation invite: later stays answerable, then accept; never counted as a rejection', async () => {
  const created = await a.post(`${API}/intimacy-requests`, {
    data: { message: '想聊聊我們的替代方案', request_type: 'negotiation' },
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = (await created.json()).intimacy_request.id;

  const later = await b.put(`${API}/intimacy-requests/${id}/respond`, { data: { response: 'later' } });
  expect(later.status(), await later.text()).toBe(200);
  expect((await later.json()).status).toBe('later');

  // 稍後再討論 is not final: the receiver can still answer.
  const accept = await b.put(`${API}/intimacy-requests/${id}/respond`, {
    data: { response: 'accepted', response_message: '好呀' },
  });
  expect(accept.status(), await accept.text()).toBe(200);
  expect((await accept.json()).status).toBe('accepted');

  const again = await b.put(`${API}/intimacy-requests/${id}/respond`, { data: { response: 'rejected' } });
  expect(again.status()).toBe(400);
  expect((await again.json()).error_code).toBe('ALREADY_RESPONDED');

  // A declined negotiation must not feed the「被婉拒」nudge stats.
  const second = await a.post(`${API}/intimacy-requests`, {
    data: { message: '改天再聊也可以', request_type: 'negotiation' },
  });
  const secondId = (await second.json()).intimacy_request.id;
  await b.put(`${API}/intimacy-requests/${secondId}/respond`, { data: { response: 'rejected' } });
  const stats = await (await b.get(`${API}/intimacy-requests/stats`)).json();
  expect(stats.statistics.month.rejected).toBe(0);

  // The sender is told, in their inbox, without blame.
  const inbox = await (await a.get(`${API}/intimacy-requests/notifications`)).json();
  const types = (inbox.notifications || []).map((n: { notification_type: string }) => n.notification_type);
  expect(types).toContain('negotiation_accepted');
  expect(types).toContain('negotiation_declined');
});

test('"later" is rejected for non-negotiation invites with a specific reason', async () => {
  const created = await a.post(`${API}/intimacy-requests`, { data: { message: '今晚？', request_type: 'intimate' } });
  const id = (await created.json()).intimacy_request.id;
  const res = await b.put(`${API}/intimacy-requests/${id}/respond`, { data: { response: 'later' } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error_code).toBe('LATER_NOT_SUPPORTED');
});

test('plans need both approvals; edits reset approval; either partner can pause', async () => {
  const created = await a.post(`${API}/intimacy-plans`, {
    data: {
      title: '週末劇本之夜',
      interaction: '依劇本演出咖啡店的陌生人',
      boundaries: '安全詞「打烊了」',
      time_prep: '約 90 分鐘',
      conditions: '當天再確認一次',
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const plan = (await created.json()).plan;
  expect(plan.status).toBe('pending');
  expect(plan.approved_by_me).toBe(true);
  expect(plan.approved_by_partner).toBe(false);

  // B sees it as pending, awaiting B.
  const listB = (await (await b.get(`${API}/intimacy-plans`)).json()).plans;
  const seen = listB.find((p: { id: string }) => p.id === plan.id);
  expect(seen.status).toBe('pending');
  expect(seen.approved_by_me).toBe(false);
  expect(seen.approved_by_partner).toBe(true);

  // A edits before B approves → B's approval of the old revision is refused.
  const edited = await a.put(`${API}/intimacy-plans/${plan.id}`, { data: { time_prep: '約 2 小時' } });
  expect(edited.status(), await edited.text()).toBe(200);
  const rev2 = (await edited.json()).plan;
  expect(rev2.revision).toBe(plan.revision + 1);

  const stale = await b.post(`${API}/intimacy-plans/${plan.id}/approve`, { data: { revision: plan.revision } });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error_code).toBe('PLAN_CHANGED');

  const ok = await b.post(`${API}/intimacy-plans/${plan.id}/approve`, { data: { revision: rev2.revision } });
  expect(ok.status(), await ok.text()).toBe(200);
  expect((await ok.json()).plan.status).toBe('approved');

  // B edits an approved plan → back to pending, only B approved.
  const reword = await b.put(`${API}/intimacy-plans/${plan.id}`, { data: { boundaries: '任一方說暫停就停' } });
  const reworded = (await reword.json()).plan;
  expect(reworded.status).toBe('pending');
  expect(reworded.approved_by_me).toBe(true);
  expect(reworded.approved_by_partner).toBe(false);
  await a.post(`${API}/intimacy-plans/${plan.id}/approve`, { data: { revision: reworded.revision } });

  // Either partner can pause at any time; a paused plan can't be approved/edited.
  const paused = await b.post(`${API}/intimacy-plans/${plan.id}/disable`);
  expect((await paused.json()).plan.status).toBe('disabled');
  const editPaused = await a.put(`${API}/intimacy-plans/${plan.id}`, { data: { title: 'x' } });
  expect((await editPaused.json()).error_code).toBe('PLAN_DISABLED');

  // Reactivating needs both yeses again.
  const back = (await (await a.post(`${API}/intimacy-plans/${plan.id}/reactivate`)).json()).plan;
  expect(back.status).toBe('pending');
  expect(back.approved_by_me).toBe(true);
  expect(back.approved_by_partner).toBe(false);
});

test('plan validation and not-found return specific, actionable errors', async () => {
  const missing = await a.post(`${API}/intimacy-plans`, { data: { title: '' } });
  expect(missing.status()).toBe(400);
  const body = await missing.json();
  expect(body.error_code).toBe('VALIDATION_FAILED');
  expect(body.message).toContain('方案名稱');

  const nf = await a.post(`${API}/intimacy-plans/not-a-uuid/disable`);
  expect(nf.status()).toBe(404);
  expect((await nf.json()).error_code).toBe('PLAN_NOT_FOUND');
});

test('unpaired users get a three-part gate, not a generic failure', async () => {
  const base = await request.newContext();
  const solo = { email: 'negotiate-solo-e2e@twogether.app', nickname: 'Nego Solo', password: 'test123456' };
  const token = await loginOrRegister(base, solo);
  await base.dispose();
  const ctx = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  const res = await ctx.get(`${API}/intimacy-plans`);
  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(body.error_code).toBe('NO_COMPLETE_COUPLE');
  expect(body.message).toContain('示範方案');

  const en = await ctx.get(`${API}/intimacy-plans`, { headers: { 'X-Locale': 'en' } });
  expect((await en.json()).message).toContain('pair up first');
  await ctx.dispose();
});
