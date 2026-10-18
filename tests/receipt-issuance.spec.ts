import { test, expect, request, APIRequestContext } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { TEST_NEWEBPAY } from './helpers/newebpay';

// Electronic receipt issuance (lib/receipts.js) driven over HTTP against the
// real server and the local test DB — the money path, end to end:
//
//   checkout → signed 藍新 MPG payload → NotifyURL callback → receipt row
//            → the buyer reads it back through the API
//
// upgrade-flow.spec.ts stubs /billing/orders and /billing/receipts to cover how
// a receipt RENDERS; nothing there would notice if issuance broke, because no
// receipt is ever created. This spec is the only place the issuance itself, its
// idempotency under the gateway's retries, and the per-buyer access check are
// exercised. 藍新's shop review turns on exactly these properties
// (docs/PAYMENT_MODEL.zh-TW.md §3-2).
//
// Tests run against the locked-down local test DB (see playwright.config.ts).
dotenv.config({ path: path.resolve(__dirname, '..', '.env.test'), override: true });

/* eslint-disable @typescript-eslint/no-require-imports */
const newebpay = require('../lib/newebpay.js');
const receiptsLib = require('../lib/receipts.js');

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

const STAMP = Date.now();
const BUYER = { email: `receipt-a-${STAMP}@twogether.app`, nickname: '收據買家', password: 'test123456' };
const PARTNER = { email: `receipt-b-${STAMP}@twogether.app`, nickname: '收據伴侶', password: 'test123456' };

// The plan under test. Price must match routes/billing.js PLANS — the callback
// is rejected on any amount mismatch, which is itself part of what we assert.
const PLAN = { id: 'pass_90', amount: 240, label: 'Twogether Premium 90 天' };
const RECEIPT_TITLE = '測試股份有限公司';
const RECEIPT_TAX_ID = '12345678';

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set; cannot run receipt-issuance spec');
  const url = new URL(dbUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`receipt-issuance refusing to touch DB on host "${url.hostname}"`);
  }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function registerOrLogin(user: typeof BUYER): Promise<string> {
  const base = await request.newContext();
  try {
    const reg = await base.post(`${API}/auth/register`, { data: user });
    if (reg.ok()) return (await reg.json()).token;
    const login = await base.post(`${API}/auth/login`, {
      data: { email: user.email, password: user.password },
    });
    if (!login.ok()) throw new Error(`login failed: ${login.status()} ${await login.text()}`);
    return (await login.json()).token;
  } finally {
    await base.dispose();
  }
}

function ctxFor(token: string, extra: Record<string, string> = {}) {
  return request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}`, ...extra } });
}

// Premium is billed per COUPLE, so checkout 404s until both accounts are paired.
async function pair(ctxA: APIRequestContext, ctxB: APIRequestContext) {
  const codeRes = await ctxA.post(`${API}/couples/pairing-code`, { data: {} });
  const code = (await codeRes.json())?.code;
  if (!code) throw new Error(`no pairing code: ${codeRes.status()} ${await codeRes.text()}`);
  const join = await ctxB.post(`${API}/couples`, { data: { pairing_code: code } });
  if (!join.ok()) throw new Error(`pairing join failed: ${join.status()} ${await join.text()}`);
}

// Build the form 藍新 POSTs to NotifyURL for a successful payment, signed with
// the same HashKey/HashIV the test server runs on.
function signedCallback(merchantOrderNo: string, amount: number) {
  const payload = {
    Status: 'SUCCESS',
    Message: '授權成功',
    Result: {
      MerchantOrderNo: merchantOrderNo,
      Amt: amount,
      TradeNo: `E2E${STAMP}`.slice(0, 20),
      PaymentType: 'CREDIT',
    },
  };
  const tradeInfo = newebpay.aesEncrypt(
    JSON.stringify(payload), TEST_NEWEBPAY.hashKey, TEST_NEWEBPAY.hashIV,
  );
  return {
    Status: 'SUCCESS',
    MerchantID: TEST_NEWEBPAY.merchantId,
    TradeInfo: tradeInfo,
    TradeSha: newebpay.genTradeSha(tradeInfo, TEST_NEWEBPAY.hashKey, TEST_NEWEBPAY.hashIV),
    Version: '2.0',
  };
}

let ctxBuyer: APIRequestContext;
let ctxPartner: APIRequestContext;
let merchantTradeNo: string;
let receiptNo: string;

test.beforeAll(async () => {
  ctxBuyer = await ctxFor(await registerOrLogin(BUYER));
  ctxPartner = await ctxFor(await registerOrLogin(PARTNER));
  await pair(ctxBuyer, ctxPartner);
});

test.afterAll(async () => {
  await ctxBuyer?.dispose();
  await ctxPartner?.dispose();
});

test.describe.serial('電子收據 — issuance over HTTP', () => {
  test('checkout returns a signed MPG payload and stores the buyer 抬頭／統編', async () => {
    const res = await ctxBuyer.post(`${API}/billing/checkout`, {
      data: {
        plan: PLAN.id,
        provider: 'newebpay',
        receipt_title: RECEIPT_TITLE,
        receipt_tax_id: RECEIPT_TAX_ID,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.action_url).toContain('newebpay.com');

    // The payload 藍新 receives must be decryptable with the shop's key and its
    // TradeSha must check out — this is the signing contract the shop review
    // asks us to document, so assert it rather than trusting the helper.
    expect(newebpay.genTradeSha(body.params.TradeInfo, TEST_NEWEBPAY.hashKey, TEST_NEWEBPAY.hashIV))
      .toBe(body.params.TradeSha);

    const plain = newebpay.aesDecrypt(body.params.TradeInfo, TEST_NEWEBPAY.hashKey, TEST_NEWEBPAY.hashIV);
    const fields = Object.fromEntries(new URLSearchParams(plain));
    expect(fields.Amt).toBe(String(PLAN.amount)); // server-side price, never the client's
    expect(fields.NotifyURL).toBe(`${BACKEND_BASE}/api/billing/newebpay/callback`);
    expect(fields.ItemDesc).toBe(PLAN.label);
    merchantTradeNo = fields.MerchantOrderNo;
    expect(merchantTradeNo).toMatch(/^TG[0-9A-Z]+$/);

    // Receipt details ride along on the pending order, waiting for a payment
    // that may never come; no receipt exists yet.
    const order = await withDb((c) =>
      c.query('SELECT status, amount, receipt_title, receipt_tax_id FROM payment_orders WHERE merchant_trade_no = $1',
        [merchantTradeNo])
    );
    expect(order.rows[0]).toMatchObject({
      status: 'pending',
      amount: PLAN.amount,
      receipt_title: RECEIPT_TITLE,
      receipt_tax_id: RECEIPT_TAX_ID,
    });
    const none = await withDb((c) => c.query('SELECT 1 FROM payment_receipts WHERE trade_no = $1', [`E2E${STAMP}`]));
    expect(none.rows.length).toBe(0);
  });

  test('a malformed 統編 is refused before any order exists', async () => {
    // The UI checks this too, but the server is the authority — and the buyer
    // must be told which field to fix, not a bare 驗證失敗.
    const res = await ctxBuyer.post(`${API}/billing/checkout`, {
      data: { plan: PLAN.id, provider: 'newebpay', receipt_tax_id: '123' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('CHECKOUT_INVALID_INPUT');
    expect(body.message).toContain('8 位數字');

    const orders = await withDb((c) =>
      c.query(`SELECT COUNT(*)::int AS n FROM payment_orders WHERE receipt_tax_id = '123'`)
    );
    expect(orders.rows[0].n).toBe(0);
  });

  test('a signed callback issues exactly one receipt — and a retry does not mint a second', async () => {
    const form = signedCallback(merchantTradeNo, PLAN.amount);
    const anon = await request.newContext();
    try {
      // NotifyURL is public (no JWT): 藍新 calls it server-to-server.
      const first = await anon.post(`${API}/billing/newebpay/callback`, { form });
      expect(first.status()).toBe(200);

      const issued = await withDb((c) =>
        c.query(`SELECT r.* FROM payment_receipts r
                   JOIN payment_orders o ON o.id = r.order_id AND r.source = 'premium'
                  WHERE o.merchant_trade_no = $1`, [merchantTradeNo])
      );
      expect(issued.rows.length).toBe(1);
      receiptNo = issued.rows[0].receipt_no;
      expect(receiptNo).toMatch(/^TG-\d{8}-[0-9A-F]{6}$/);
      expect(issued.rows[0]).toMatchObject({
        buyer_email: BUYER.email,
        buyer_name: BUYER.nickname,
        buyer_title: RECEIPT_TITLE,
        buyer_tax_id: RECEIPT_TAX_ID,
        amount: PLAN.amount,
        item_label: PLAN.label,
        provider: 'newebpay',
      });
      // Nothing is issued until 稅籍登記 — the field is reserved, not filled.
      expect(issued.rows[0].invoice_no).toBeNull();

      // The entitlement and the receipt are committed in one transaction.
      const paid = await withDb((c) =>
        c.query('SELECT status, paid_at FROM payment_orders WHERE merchant_trade_no = $1', [merchantTradeNo])
      );
      expect(paid.rows[0].status).toBe('paid');
      expect(paid.rows[0].paid_at).not.toBeNull();

      // 藍新 retries NotifyURL until it gets an ack, so a later delivery must be
      // a no-op. Sequentially the route short-circuits on status='paid' before
      // issuing anything; the concurrent case is the next test.
      const retry = await anon.post(`${API}/billing/newebpay/callback`, { form });
      expect(retry.status()).toBe(200);

      const after = await withDb((c) =>
        c.query(`SELECT COUNT(*)::int AS n FROM payment_receipts r
                   JOIN payment_orders o ON o.id = r.order_id AND r.source = 'premium'
                  WHERE o.merchant_trade_no = $1`, [merchantTradeNo])
      );
      expect(after.rows[0].n).toBe(1);
    } finally {
      await anon.dispose();
    }
  });

  test('simultaneous first deliveries ack cleanly and grant the pass once', async () => {
    // The sequential retry above never reaches the insert — the route returns
    // early on status='paid'. Deliveries that land together can all pass that
    // check before any of them commits, so this is the shape of traffic the DB
    // guard exists for. Whether they truly interleave depends on timing, so
    // this covers the acks and the single grant; the guard itself is pinned
    // deterministically by the next test.
    const checkout = await ctxBuyer.post(`${API}/billing/checkout`, {
      data: { plan: 'pass_30', provider: 'newebpay' },
    });
    const params = (await checkout.json()).params;
    const plain = newebpay.aesDecrypt(params.TradeInfo, TEST_NEWEBPAY.hashKey, TEST_NEWEBPAY.hashIV);
    const orderNo = Object.fromEntries(new URLSearchParams(plain)).MerchantOrderNo;
    const form = signedCallback(orderNo, 90); // pass_30 = NT$90

    const anon = await request.newContext();
    try {
      const burst = await Promise.all(
        [0, 1, 2, 3].map(() => anon.post(`${API}/billing/newebpay/callback`, { form })),
      );
      for (const res of burst) expect(res.status()).toBe(200);

      const receipts = await withDb((c) =>
        c.query(`SELECT COUNT(*)::int AS n FROM payment_receipts r
                   JOIN payment_orders o ON o.id = r.order_id AND r.source = 'premium'
                  WHERE o.merchant_trade_no = $1`, [orderNo])
      );
      expect(receipts.rows[0].n).toBe(1);

      // The entitlement must not be granted four times either.
      const ents = await withDb((c) =>
        c.query(`SELECT COUNT(*)::int AS n FROM couple_entitlements e
                   JOIN payment_orders o ON o.id = e.order_id
                  WHERE o.merchant_trade_no = $1`, [orderNo])
      );
      expect(ents.rows[0].n).toBe(1);
    } finally {
      await anon.dispose();
    }
  });

  test('re-issuing for the same order returns the existing document, never a second one', async () => {
    // Called straight against the DB because the race above is timing-dependent:
    // this is the deterministic proof that UNIQUE(source, order_id) + ON CONFLICT
    // make issueReceipt idempotent. Without the guard this raises a unique
    // violation, which inside a callback would roll the whole grant back.
    const { orderId, again } = await withDb(async (c) => {
      const order = await c.query('SELECT id FROM payment_orders WHERE merchant_trade_no = $1', [merchantTradeNo]);
      const id = order.rows[0].id;
      return {
        orderId: id,
        again: await receiptsLib.issueReceipt(c, {
          source: 'premium',
          orderId: id,
          itemLabel: '重複開立測試',
          amount: 999,
        }),
      };
    });

    // Same document back — not a new number, and not the bogus values above.
    expect(again.receipt_no).toBe(receiptNo);
    expect(Number(again.amount)).toBe(PLAN.amount);
    expect(again.item_label).toBe(PLAN.label);

    const count = await withDb((c) =>
      c.query(`SELECT COUNT(*)::int AS n FROM payment_receipts WHERE source = 'premium' AND order_id = $1`, [orderId])
    );
    expect(count.rows[0].n).toBe(1);
  });

  test('a tampered callback is rejected and issues nothing', async () => {
    const checkout = await ctxBuyer.post(`${API}/billing/checkout`, {
      data: { plan: 'pass_30', provider: 'newebpay' },
    });
    const params = (await checkout.json()).params;
    const plain = newebpay.aesDecrypt(params.TradeInfo, TEST_NEWEBPAY.hashKey, TEST_NEWEBPAY.hashIV);
    const otherOrderNo = Object.fromEntries(new URLSearchParams(plain)).MerchantOrderNo;

    const anon = await request.newContext();
    try {
      // Right order, wrong signature: TradeSha from a different TradeInfo.
      const forged = signedCallback(otherOrderNo, 30);
      forged.TradeSha = signedCallback(otherOrderNo, 31).TradeSha;
      const badSig = await anon.post(`${API}/billing/newebpay/callback`, { form: forged });
      expect(badSig.status()).toBe(400);

      // Correctly signed, but claiming a price we never charged (pass_30 = 90).
      const wrongAmount = await anon.post(`${API}/billing/newebpay/callback`, {
        form: signedCallback(otherOrderNo, 1),
      });
      expect(wrongAmount.status()).toBe(400);

      const rows = await withDb((c) =>
        c.query(`SELECT o.status, r.id AS receipt_id FROM payment_orders o
                   LEFT JOIN payment_receipts r ON r.order_id = o.id AND r.source = 'premium'
                  WHERE o.merchant_trade_no = $1`, [otherOrderNo])
      );
      expect(rows.rows[0].status).toBe('pending');
      expect(rows.rows[0].receipt_id).toBeNull();
    } finally {
      await anon.dispose();
    }
  });

  test('the buyer reads the receipt back; their partner cannot', async () => {
    const orders = await (await ctxBuyer.get(`${API}/billing/orders`)).json();
    const row = orders.orders.find((o: { order_no: string }) => o.order_no === merchantTradeNo);
    expect(row).toMatchObject({
      status: 'paid',
      source: 'premium',
      item_label: PLAN.label,
      amount: PLAN.amount,
      receipt_no: receiptNo,
      invoice_no: null,
    });

    const doc = await (await ctxBuyer.get(`${API}/billing/receipts/${receiptNo}`)).json();
    expect(doc.receipt).toMatchObject({
      receipt_no: receiptNo,
      amount: PLAN.amount,
      currency: 'TWD',
      provider: 'newebpay',
      buyer_title: RECEIPT_TITLE,
      buyer_tax_id: RECEIPT_TAX_ID,
      // 個人賣家: no 統編 of our own, and the contact is the published one.
      seller_tax_id: null,
      seller_contact: 'support@twogether.fun',
    });

    // A receipt can carry the buyer's 抬頭／統編. That is the buyer's data to
    // share, not their partner's to read — even though Premium is couple-wide.
    const asPartner = await ctxPartner.get(`${API}/billing/receipts/${receiptNo}`);
    expect(asPartner.status()).toBe(404);
    expect((await asPartner.json()).error_code).toBe('RECEIPT_NOT_FOUND');

    const partnerOrders = await (await ctxPartner.get(`${API}/billing/orders`)).json();
    expect(partnerOrders.orders.some((o: { order_no: string }) => o.order_no === merchantTradeNo)).toBe(false);
  });

  test('English buyers get the receipt line item and the not-found message in English', async () => {
    const en = await ctxFor((await registerOrLogin(BUYER)), { 'X-Locale': 'en' });
    try {
      const orders = await (await en.get(`${API}/billing/orders`)).json();
      const row = orders.orders.find((o: { order_no: string }) => o.order_no === merchantTradeNo);
      expect(row.item_label).toBe('Twogether Premium 90 days');

      const missing = await en.get(`${API}/billing/receipts/TG-19990101-FFFFFF`);
      expect(missing.status()).toBe(404);
      expect((await missing.json()).message).toContain('purchase history');
    } finally {
      await en.dispose();
    }
  });
});
