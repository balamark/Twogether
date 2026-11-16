import { test, expect, request, APIRequestContext } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

// 親密記錄・感受小調查 over HTTP against the real server + local test DB:
//   record → a check-in is queued for the PARTNER, due in 2h
//   → backdate it, hit the inbox count (the lazy sweep) → partner gets
//     「剛剛的感覺如何？」→ partner answers → recorder gets notified and sees it
//   → validation keeps its own error_code; dismiss closes it for good;
//     back-filled records don't ask at all.
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true });

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

const STAMP = Date.now();
const A = { email: `checkin-a-${STAMP}@twogether.app`, nickname: '小安', password: 'test123456' };
const B = { email: `checkin-b-${STAMP}@twogether.app`, nickname: '阿哲', password: 'test123456' };

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set; cannot run moment-checkins spec');
  const url = new URL(dbUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`moment-checkins refusing to touch DB on host "${url.hostname}"`);
  }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function registerOrLogin(user: typeof A): Promise<string> {
  const base = await request.newContext();
  try {
    const reg = await base.post(`${API}/auth/register`, { data: user });
    if (reg.ok()) return (await reg.json()).token;
    const login = await base.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
    if (!login.ok()) throw new Error(`login failed: ${login.status()} ${await login.text()}`);
    return (await login.json()).token;
  } finally {
    await base.dispose();
  }
}

const ctxFor = (token: string) => request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

async function pair(ctxA: APIRequestContext, ctxB: APIRequestContext) {
  const code = (await (await ctxA.post(`${API}/couples/pairing-code`, { data: {} })).json())?.code;
  if (!code) throw new Error('no pairing code');
  const join = await ctxB.post(`${API}/couples`, { data: { pairing_code: code } });
  if (!join.ok()) throw new Error(`pairing join failed: ${join.status()} ${await join.text()}`);
}

async function createMoment(ctx: APIRequestContext, momentDate: string) {
  const res = await ctx.post(`${API}/love-moments`, { data: { moment_date: momentDate, duration: '30-60分鐘' } });
  expect(res.status()).toBe(201);
  return (await res.json()).love_moment.id as string;
}

async function notificationsOf(ctx: APIRequestContext, type: string) {
  const res = await ctx.get(`${API}/intimacy-requests/notifications`, { params: { notification_type: type } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return (body.notifications || []) as { title: string; content: string; target_id: string }[];
}

test.describe.serial('love moment check-ins (感受小調查)', () => {
  let ctxA: APIRequestContext;
  let ctxB: APIRequestContext;

  test.beforeAll(async () => {
    ctxA = await ctxFor(await registerOrLogin(A));
    ctxB = await ctxFor(await registerOrLogin(B));
    await pair(ctxA, ctxB);
  });

  test.afterAll(async () => {
    await ctxA?.dispose();
    await ctxB?.dispose();
  });

  test('asks the partner 2h later, then tells the recorder how it felt', async () => {
    const momentId = await createMoment(ctxA, new Date().toISOString());

    // Queued for B only, due ~2h out — and not delivered yet.
    const rows = await withDb((c) => c.query(
      `SELECT user_id, due_at, notified_at FROM love_moment_checkins WHERE moment_id = $1`, [momentId]));
    expect(rows.rows).toHaveLength(1);
    const dueInMin = (new Date(rows.rows[0].due_at).getTime() - Date.now()) / 60000;
    expect(dueInMin).toBeGreaterThan(110);
    expect(dueInMin).toBeLessThan(125);
    await ctxB.get(`${API}/intimacy-requests/notifications/unread-count`);
    expect(await notificationsOf(ctxB, 'love_moment_checkin')).toHaveLength(0);

    // B sees it on the record as "mine", A sees it as "theirs".
    const listB = (await (await ctxB.get(`${API}/love-moments`, { params: { limit: 2000 } })).json()).love_moments;
    const seenByB = listB.find((m: { id: string }) => m.id === momentId);
    expect(seenByB.my_checkin.answered_at).toBeNull();
    expect(seenByB.partner_checkin).toBeNull();

    // Two hours pass. The inbox count rides the lazy sweep.
    await withDb((c) => c.query(
      `UPDATE love_moment_checkins SET due_at = NOW() - INTERVAL '1 minute' WHERE moment_id = $1`, [momentId]));
    await ctxB.get(`${API}/intimacy-requests/notifications/unread-count`);
    const asks = await notificationsOf(ctxB, 'love_moment_checkin');
    expect(asks).toHaveLength(1);
    expect(asks[0].title).toBe('剛剛的感覺如何？');
    expect(asks[0].target_id).toBe(momentId);
    // Claimed once: another sweep doesn't send it again.
    await ctxB.get(`${API}/intimacy-requests/notifications/unread-count`);
    expect(await notificationsOf(ctxB, 'love_moment_checkin')).toHaveLength(1);

    // Validation names the exact problem.
    const bad = await ctxB.put(`${API}/love-moments/${momentId}/checkin`, { data: { liked: ['atmosphere'] } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error_code).toBe('CHECKIN_SATISFACTION_REQUIRED');
    const badKey = await ctxB.put(`${API}/love-moments/${momentId}/checkin`, { data: { satisfaction: 4, liked: ['nope'] } });
    expect((await badKey.json()).error_code).toBe('CHECKIN_OPTION_INVALID');

    // B answers.
    const ans = await ctxB.put(`${API}/love-moments/${momentId}/checkin`, {
      data: { satisfaction: 5, liked: ['atmosphere', 'aftercare'], timing: 'perfect', note: '下次也這樣' },
    });
    expect(ans.ok()).toBeTruthy();
    const ansBody = await ans.json();
    expect(ansBody.my_checkin.satisfaction).toBe(5);
    expect(ansBody.my_checkin.answered_at).toBeTruthy();

    // A is told, and sees the answer on the record.
    const told = await notificationsOf(ctxA, 'love_moment_checkin_answered');
    expect(told).toHaveLength(1);
    expect(told[0].title).toBe('阿哲 分享了剛剛的感受');
    expect(told[0].content).toContain('5/5');
    const one = (await (await ctxA.get(`${API}/love-moments/${momentId}`)).json()).love_moment;
    expect(one.partner_checkin).toMatchObject({ satisfaction: 5, liked: ['atmosphere', 'aftercare'], timing: 'perfect', note: '下次也這樣' });
    expect(one.my_checkin).toBeNull();

    // Re-answering updates it without pinging A again.
    await ctxB.put(`${API}/love-moments/${momentId}/checkin`, { data: { satisfaction: 4, liked: [] } });
    expect(await notificationsOf(ctxA, 'love_moment_checkin_answered')).toHaveLength(1);
  });

  test('dismiss closes it for good; back-filled records never ask', async () => {
    const momentId = await createMoment(ctxB, new Date().toISOString());
    const dismiss = await ctxA.post(`${API}/love-moments/${momentId}/checkin/dismiss`);
    expect(dismiss.ok()).toBeTruthy();
    await withDb((c) => c.query(
      `UPDATE love_moment_checkins SET due_at = NOW() - INTERVAL '1 minute' WHERE moment_id = $1`, [momentId]));
    await ctxA.get(`${API}/intimacy-requests/notifications/unread-count`);
    const asks = (await notificationsOf(ctxA, 'love_moment_checkin')).filter((n) => n.target_id === momentId);
    expect(asks).toHaveLength(0);

    const old = await createMoment(ctxA, new Date(Date.now() - 5 * 86400000).toISOString());
    const rows = await withDb((c) => c.query(`SELECT 1 FROM love_moment_checkins WHERE moment_id = $1`, [old]));
    expect(rows.rows).toHaveLength(0);
  });
});
