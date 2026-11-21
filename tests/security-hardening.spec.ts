import { test, expect, request } from '@playwright/test';
import path from 'path';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.test'), override: true });

/* eslint-disable @typescript-eslint/no-require-imports */
const ecpay = require('../lib/ecpay.js');

// Guards the fixes from the 2026-11 security audit:
//   1. 綠界 ECPay can't be used (or forged) in production without real keys,
//      and a gateway callback can only settle an order sent to that gateway.
//   2. Resetting the password signs out every older session (TOKEN_REVOKED).
//   3. Therapist identity documents are private storage refs; free-form URLs
//      are refused and the admin opens them through a signed redirect.
//   4. The admin dashboard escapes quotes, so a crafted email can't add
//      attributes (event handlers) to the recent-users table.

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'test-admin-pw';
const STAMP = Date.now();

// ECPay's published stage credentials — the very keys an attacker would use.
const STAGE = { merchantId: '2000132', hashKey: '5294y06JbISpM5x9', hashIV: 'v77hoKGq4kWxNNIS' };

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set; cannot run security-hardening spec');
  if (!['localhost', '127.0.0.1'].includes(new URL(dbUrl).hostname)) {
    throw new Error('security-hardening refusing to touch a non-local DB');
  }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function register(user: { email: string; nickname: string; password: string }): Promise<string> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.post(`${API}/auth/register`, { data: user });
    expect(res.ok(), await res.text()).toBeTruthy();
    return (await res.json()).token;
  } finally {
    await ctx.dispose();
  }
}

const authed = (token: string) => request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

test.describe('security hardening', () => {
  test('ECPay is refused in production without its own keys, even with the public stage keys', () => {
    const script = `
      const e = require('./lib/ecpay');
      const p = { MerchantID: '${STAGE.merchantId}', MerchantTradeNo: 'TWFORGED', RtnCode: '1', TradeAmt: '240' };
      p.CheckMacValue = e.genCheckMacValue(p, '${STAGE.hashKey}', '${STAGE.hashIV}');
      console.log(JSON.stringify({ configured: e.isConfigured(), accepted: e.verifyCallback(p) }));`;
    const run = (env: Record<string, string>) => {
      const out = spawnSync(process.execPath, ['-e', script], {
        cwd: path.resolve(__dirname, '..'),
        env: { PATH: process.env.PATH || '', ...env },
        encoding: 'utf8',
      });
      return JSON.parse(out.stdout.trim().split('\n').pop() || '{}');
    };
    expect(run({ NODE_ENV: 'production' })).toEqual({ configured: false, accepted: false });
    // Dev/test keep working on the stage keys.
    expect(run({ NODE_ENV: 'test' })).toEqual({ configured: true, accepted: true });
  });

  test('an ECPay callback cannot settle a NewebPay order', async () => {
    const a = { email: `sec-pay-a-${STAMP}@twogether.app`, nickname: '安全測試A', password: 'test123456' };
    const b = { email: `sec-pay-b-${STAMP}@twogether.app`, nickname: '安全測試B', password: 'test123456' };
    const ctxA = await authed(await register(a));
    const ctxB = await authed(await register(b));
    try {
      const code = (await (await ctxA.post(`${API}/couples/pairing-code`, { data: {} })).json())?.code;
      expect((await ctxB.post(`${API}/couples`, { data: { pairing_code: code } })).ok()).toBeTruthy();

      const checkout = await ctxA.post(`${API}/billing/checkout`, { data: { plan: 'pass_30', provider: 'newebpay' } });
      expect(checkout.ok(), await checkout.text()).toBeTruthy();

      const order = await withDb(async (db) => (await db.query(
        `SELECT o.merchant_trade_no, o.amount FROM payment_orders o
           JOIN users u ON u.id = o.created_by WHERE u.email = $1 ORDER BY o.created_at DESC LIMIT 1`,
        [a.email],
      )).rows[0]);
      expect(order).toBeTruthy();

      // Signed correctly for ECPay (stage keys are valid in the test env), but
      // the order went to NewebPay — must not be marked paid.
      const forged: Record<string, string> = {
        MerchantID: STAGE.merchantId,
        MerchantTradeNo: order.merchant_trade_no,
        RtnCode: '1',
        RtnMsg: 'paid',
        TradeNo: `F${STAMP}`.slice(0, 20),
        TradeAmt: String(order.amount),
        PaymentType: 'Credit_CreditCard',
      };
      forged.CheckMacValue = ecpay.genCheckMacValue(forged, STAGE.hashKey, STAGE.hashIV);
      const anon = await request.newContext();
      const cb = await anon.post(`${API}/billing/ecpay/callback`, { form: forged });
      const cbBody = await cb.text();
      await anon.dispose();
      expect(cb.status()).toBe(400);
      expect(cbBody).toContain('Provider Mismatch');

      const status = await withDb(async (db) => (await db.query(
        'SELECT status FROM payment_orders WHERE merchant_trade_no = $1', [order.merchant_trade_no],
      )).rows[0].status);
      expect(status).not.toBe('paid');
    } finally {
      await ctxA.dispose();
      await ctxB.dispose();
    }
  });

  test('resetting the password signs out sessions issued before it', async () => {
    const user = { email: `sec-reset-${STAMP}@twogether.app`, nickname: '重設測試', password: 'test123456' };
    const oldToken = await register(user);
    const oldCtx = await authed(oldToken);
    try {
      expect((await oldCtx.get(`${API}/auth/me`)).ok()).toBeTruthy();

      // JWT iat has 1-second resolution; make sure the reset is strictly later.
      await new Promise((r) => setTimeout(r, 1100));
      const resetToken = `sec-${STAMP}-reset-token`;
      await withDb((db) => db.query(
        `UPDATE users SET password_reset_token = $1, password_reset_expires = NOW() + INTERVAL '1 hour' WHERE email = $2`,
        [resetToken, user.email],
      ));
      const anon = await request.newContext();
      const reset = await anon.post(`${API}/auth/reset-password`, {
        form: { token: resetToken, password: 'newpass123', confirm: 'newpass123' },
      });
      expect(reset.ok(), await reset.text()).toBeTruthy();

      const me = await oldCtx.get(`${API}/auth/me`);
      expect(me.status()).toBe(401);
      expect((await me.json()).error_code).toBe('TOKEN_REVOKED');

      // A fresh login with the new password works right away.
      const login = await anon.post(`${API}/auth/login`, { data: { email: user.email, password: 'newpass123' } });
      expect(login.ok(), await login.text()).toBeTruthy();
      const freshCtx = await authed((await login.json()).token);
      expect((await freshCtx.get(`${API}/auth/me`)).ok()).toBeTruthy();
      await freshCtx.dispose();
      await anon.dispose();
    } finally {
      await oldCtx.dispose();
    }
  });

  test('therapist documents are private refs; free-form URLs are refused', async () => {
    const anon = await request.newContext();
    try {
      const up = await anon.post(`${API}/therapists/upload-document`, {
        multipart: { document: { name: 'license.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') } },
      });
      expect(up.status(), await up.text()).toBe(201);
      const ref: string = (await up.json()).url;
      expect(ref).toMatch(/^storage:\/\/therapist-documents\/[0-9a-f-]{36}-\d{13}\.pdf$/);

      const base = {
        displayName: '安全測試諮商師',
        focusAreas: ['couple'],
        rateTwd: 1500,
        contactEmail: `sec-therapist-${STAMP}@twogether.app`,
      };
      const bad = await anon.post(`${API}/therapists/apply`, {
        data: { ...base, identityDocuments: ['javascript:alert(document.domain)'] },
      });
      expect(bad.status()).toBe(400);
      expect((await bad.json()).error_code).toBe('DOCUMENT_REF_INVALID');

      const good = await anon.post(`${API}/therapists/apply`, { data: { ...base, identityDocuments: [ref] } });
      expect(good.ok(), await good.text()).toBeTruthy();
      const therapistId = (await good.json()).application.id;

      // No auth → no document.
      const noAuth = await anon.get(`${API}/admin/therapists/${therapistId}/documents/0`, { maxRedirects: 0 });
      expect(noAuth.status()).toBe(401);

      const admin = await request.newContext({ httpCredentials: { username: 'admin', password: ADMIN_PW } });
      const view = await admin.get(`${API}/admin/therapists/${therapistId}/documents/0`, { maxRedirects: 0 });
      expect(view.status()).toBe(302);
      expect(view.headers()['location']).toContain('/storage/v1/object/sign/therapist-documents/');
      await admin.dispose();
    } finally {
      await anon.dispose();
    }
  });

  test('applying logged out with someone else\'s email does not touch their account', async () => {
    const victim = { email: `sec-victim-${STAMP}@twogether.app`, nickname: '帳號主人', password: 'test123456' };
    const victimToken = await register(victim);
    const base = { displayName: '冒用者', focusAreas: ['couple'], rateTwd: 1000 };

    const anon = await request.newContext();
    const asVictim = await authed(victimToken);
    try {
      // Same address, and a re-cased copy of it: both refused, nothing created.
      for (const contactEmail of [victim.email, victim.email.toUpperCase()]) {
        const res = await anon.post(`${API}/therapists/apply`, { data: { ...base, contactEmail } });
        expect(res.status()).toBe(409);
        expect((await res.json()).error_code).toBe('ACCOUNT_EXISTS_LOGIN_REQUIRED');
      }
      const rows = await withDb(async (db) => (await db.query(
        'SELECT t.id FROM therapists t JOIN users u ON u.id = t.user_id WHERE u.email = $1', [victim.email],
      )).rows);
      expect(rows).toHaveLength(0);
      expect((await asVictim.get(`${API}/therapists/me`)).status()).toBe(404);

      // The account owner can still apply — logged in, as themselves.
      const own = await asVictim.post(`${API}/therapists/apply`, {
        data: { ...base, displayName: '帳號主人本人', contactEmail: victim.email },
      });
      expect(own.status(), await own.text()).toBe(201);
      const body = await own.json();
      expect(body.account).toMatchObject({ created: false, password: null });
      const me = await asVictim.get(`${API}/therapists/me`);
      expect(me.ok(), await me.text()).toBeTruthy();
    } finally {
      await anon.dispose();
      await asVictim.dispose();
    }
  });

  test('a crafted email cannot inject attributes into the admin users table', async ({ browser }) => {
    // Accepted by express-validator isEmail (quoted local part).
    const email = `"\\"onmouseover=window.__pwned=1//${STAMP}"@example.com`;
    const ctx = await request.newContext();
    const reg = await ctx.post(`${API}/auth/register`, { data: { email, nickname: 'XSS測試', password: 'test123456' } });
    const regBody = await reg.text();
    await ctx.dispose();
    expect(reg.ok(), regBody).toBeTruthy();

    const context = await browser.newContext({ httpCredentials: { username: 'admin', password: ADMIN_PW } });
    const page = await context.newPage();
    await page.goto(`${BACKEND_BASE}/admin`);
    const btn = page.locator('#usersTable button[data-del-user]').first();
    await expect(btn).toBeVisible({ timeout: 15000 });
    const injected = await page.evaluate(() => document.querySelectorAll('#usersTable [onmouseover]').length);
    expect(injected).toBe(0);
    const emails = await page.locator('#usersTable button[data-del-user]').evaluateAll(
      (els) => els.map((e) => e.getAttribute('data-email')),
    );
    expect(emails).toContain(email);
    await context.close();
  });
});
