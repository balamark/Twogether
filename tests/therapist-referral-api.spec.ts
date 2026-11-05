import { test, expect, request, APIRequestContext } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

// 諮商師專屬邀請碼 over HTTP against the real server + local test DB:
// code minting, public preview, claim before pairing (pending) → reward on
// pairing, partner opt-in to 專屬心理師, the 「個案把摘要帶來了」 client fields,
// the platform-fee discount, the coupon-box fallback and the admin funnel.
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true });

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'test-admin-pw';

const STAMP = Date.now();
const mk = (k: string) => ({ email: `tref-${k}-${STAMP}@twogether.app`, nickname: `ref${k}`, password: 'test123456' });
const T = mk('t');
const A = mk('a');
const B = mk('b');
const C = mk('c');
const D = mk('d');

async function withDb<T2>(fn: (client: Client) => Promise<T2>): Promise<T2> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set; cannot run therapist-referral spec');
  const url = new URL(dbUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`therapist-referral spec refusing to touch DB on host "${url.hostname}"`);
  }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function register(user: typeof A): Promise<{ token: string; id: string }> {
  const base = await request.newContext();
  try {
    const reg = await base.post(`${API}/auth/register`, { data: user });
    const body = await reg.json();
    if (!reg.ok()) throw new Error(`register failed: ${reg.status()} ${JSON.stringify(body)}`);
    return { token: body.token, id: body.user.id };
  } finally {
    await base.dispose();
  }
}

const ctxFor = (token: string) => request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

async function pair(ctxA: APIRequestContext, ctxB: APIRequestContext) {
  const codeRes = await ctxA.post(`${API}/couples/pairing-code`, { data: {} });
  const code = (await codeRes.json())?.code;
  if (!code) throw new Error(`no pairing code: ${codeRes.status()} ${await codeRes.text()}`);
  const join = await ctxB.post(`${API}/couples`, { data: { pairing_code: code } });
  if (!join.ok()) throw new Error(`pairing join failed: ${join.status()} ${await join.text()}`);
}

test.describe.serial('諮商師專屬邀請碼 (therapist referral)', () => {
  let ctxT: APIRequestContext;
  let ctxA: APIRequestContext;
  let ctxB: APIRequestContext;
  let ctxC: APIRequestContext;
  let ctxD: APIRequestContext;
  let aId = '';
  let code = '';

  test.beforeAll(async () => {
    const [t, a, b, c, d] = await Promise.all([register(T), register(A), register(B), register(C), register(D)]);
    aId = a.id;
    ctxT = await ctxFor(t.token);
    ctxA = await ctxFor(a.token);
    ctxB = await ctxFor(b.token);
    ctxC = await ctxFor(c.token);
    ctxD = await ctxFor(d.token);
    await withDb((db) => db.query(
      `INSERT INTO therapists (user_id, display_name, rate_twd, contact_email, status)
       VALUES ($1, '林心理師', 1500, $2, 'approved')`,
      [t.id, T.email],
    ));
  });

  test.afterAll(async () => {
    await Promise.all([ctxT, ctxA, ctxB, ctxC, ctxD].map((c) => c?.dispose()));
  });

  test('therapist gets a code; anyone can preview it; bad codes explain themselves', async () => {
    const res = await ctxT.get(`${API}/therapists/me/referral`);
    expect(res.status(), await res.text()).toBe(200);
    const ref = (await res.json()).referral;
    expect(ref.code).toMatch(/^T[A-Z0-9]{6}$/);
    expect(ref.link).toContain(`tref=${ref.code}`);
    expect(ref).toMatchObject({ rewarded: 0, feeDiscount: 0, premiumDays: 30 });
    code = ref.code;

    // Stable across calls.
    const again = await (await ctxT.get(`${API}/therapists/me/referral`)).json();
    expect(again.referral.code).toBe(code);

    const anon = await request.newContext();
    const preview = await anon.get(`${API}/therapists/referral/${code}`);
    expect(preview.status()).toBe(200);
    expect((await preview.json()).therapist.displayName).toBe('林心理師');
    const bad = await anon.get(`${API}/therapists/referral/TZZZZZZ`);
    expect(bad.status()).toBe(404);
    expect((await bad.json()).error_code).toBe('THERAPIST_REF_INVALID');
    await anon.dispose();

    const self = await ctxT.post(`${API}/therapists/referral/claim`, { data: { code } });
    expect(self.status()).toBe(400);
    expect((await self.json()).error_code).toBe('THERAPIST_REF_SELF');
  });

  test('claim before pairing is pending; pairing grants the Premium month', async () => {
    const claim = await ctxA.post(`${API}/therapists/referral/claim`, { data: { code, makeDedicated: true } });
    expect(claim.status(), await claim.text()).toBe(200);
    const body = await claim.json();
    expect(body.status).toBe('pending_pair');
    expect(body.dedicatedSet).toBe(false);

    await pair(ctxA, ctxB);

    const row = await withDb((db) => db.query(
      `SELECT tr.status, ce.plan FROM therapist_referrals tr
         LEFT JOIN couple_entitlements ce ON ce.id = tr.entitlement_id
        WHERE tr.user_id = $1`,
      [aId],
    ));
    expect(row.rows[0]).toMatchObject({ status: 'rewarded', plan: 'therapist_ref' });

    const billing = await (await ctxB.get(`${API}/billing/status`)).json();
    expect(billing.tier).toBe('premium');
  });

  test('partner opts in to 專屬心理師; therapist sees the couple, summaries and the fee discount', async () => {
    const claim = await ctxB.post(`${API}/therapists/referral/claim`, { data: { code, makeDedicated: true } });
    const body = await claim.json();
    expect(body.status).toBe('already_rewarded'); // one month per couple
    expect(body.dedicatedSet).toBe(true);

    const clients = (await (await ctxT.get(`${API}/therapists/clients`)).json()).clients;
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ referredByMe: true, summaryCount: 0, latestSummaryAt: null });

    const ref = (await (await ctxT.get(`${API}/therapists/me/referral`)).json()).referral;
    expect(ref).toMatchObject({ joined: 2, rewarded: 1, feeDiscount: 1, standardFeeRate: 19 });

    const earnings = (await (await ctxT.get(`${API}/therapists/me/earnings`)).json()).earnings;
    expect(earnings).toMatchObject({ baseFeeRate: 10, referralDiscount: 1, currentFeeRate: 9, referredCouples: 1 });
  });

  test('the code also works in the coupon box', async () => {
    await pair(ctxC, ctxD);
    const res = await ctxC.post(`${API}/billing/redeem-coupon`, { data: { code: code.toLowerCase() } });
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).days).toBe(30);

    const twice = await ctxD.post(`${API}/billing/redeem-coupon`, { data: { code } });
    expect(twice.status()).toBe(409);
    expect((await twice.json()).error_code).toBe('COUPON_ALREADY_REDEEMED');
  });

  test('admin growth funnel reports every step and the referral channel', async () => {
    const admin = await request.newContext({ httpCredentials: { username: 'admin', password: ADMIN_PW } });
    const res = await admin.get(`${API}/admin/growth-funnel`);
    expect(res.status(), await res.text()).toBe(200);
    const g = await res.json();
    expect(g.acquisition.map((s: { key: string }) => s.key)).toEqual(['visitors', 'guest_started', 'guest_ai', 'signup_opened', 'guest_signed_up']);
    expect(g.activation.map((s: { key: string }) => s.key)).toEqual(['signups', 'invite_sent', 'paired', 'first_talk', 'paid']);
    expect(g.activation[0].count).toBeGreaterThanOrEqual(5);
    expect(g.therapistReferrals.rewarded).toBeGreaterThanOrEqual(2);
    const mine = g.therapistReferrals.top.find((t: { referral_code: string }) => t.referral_code === code);
    expect(mine).toMatchObject({ joined: 4, rewarded: 2, fee_discount: 2 });
    await admin.dispose();
  });
});
