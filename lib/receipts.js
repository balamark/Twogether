// Electronic receipts (電子收據) for paid orders.
//
// Twogether is sold by an individual seller (個人賣家) that has no 統一編號 /
// 稅籍登記 yet, so it does not — and legally cannot — issue a 統一發票. What it
// issues instead, for every successful payment, is a numbered electronic
// receipt: mailed to the buyer, queryable in-app, and stored immutably in
// payment_receipts (migration 083). Both payment gateways' shop reviews ask for
// this document flow in writing; docs/PAYMENT_MODEL.zh-TW.md is the written
// version and this module is the implementation.
//
// Design notes:
//   * Issuing is IDEMPOTENT. Gateway callbacks retry until they get an ack, and
//     a retry must not mint a second document for the same order — hence
//     UNIQUE(source, order_id) plus ON CONFLICT DO NOTHING + re-select.
//   * Receipts are never updated or deleted. A corrected receipt would be a new
//     document; nothing in the app rewrites an issued one.
//   * issueReceipt() takes an explicit pg client so it runs inside the same
//     transaction that grants the entitlement — an order can never be marked
//     paid without its receipt, or vice versa.

const crypto = require('crypto');
const { logInfo, logWarn } = require('./logger');

// Who the receipt is issued BY. Env-overridable so the legal/display name can
// change (e.g. after 商業登記) without a code change. SELLER_TAX_ID stays empty
// until 稅籍登記 is done; the receipt renders the seller line accordingly.
function seller() {
  return {
    name: process.env.SELLER_NAME || 'Twogether（個人賣家）',
    contactEmail: process.env.SELLER_CONTACT_EMAIL || process.env.EMAIL_REPLY_TO || 'support@twogether.fun',
    taxId: process.env.SELLER_TAX_ID || '',
  };
}

// TG-YYYYMMDD-XXXXXX. Date-prefixed so receipts sort and reconcile by day at a
// glance; 6 hex chars of randomness (24 bits) keeps same-day collisions
// negligible, and UNIQUE(receipt_no) is the real guard.
function genReceiptNo(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TG-${y}${m}${d}-${rand}`;
}

// 統一編號 is exactly 8 digits. Anything else is stored as NULL rather than
// printed on a document — a malformed tax id on a receipt is worse than none.
function normalizeTaxId(value) {
  const s = String(value ?? '').trim();
  return /^\d{8}$/.test(s) ? s : null;
}

function normalizeTitle(value) {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, 100) : null;
}

// Issue (or return the already-issued) receipt for a paid order.
//
//   client  — pg client from db.transaction(), so this shares the caller's tx
//   source  — 'premium' | 'session'
//   orderId — payment_orders.id / session_payment_orders.id
//
// Returns the receipt row. Never throws for the duplicate case.
async function issueReceipt(client, {
  source,
  orderId,
  userId = null,
  buyerEmail = null,
  buyerName = null,
  buyerTitle = null,
  buyerTaxId = null,
  itemLabel,
  amount,
  provider = null,
  tradeNo = null,
}) {
  const inserted = await client.query(
    `INSERT INTO payment_receipts
       (receipt_no, source, order_id, user_id, buyer_email, buyer_name,
        buyer_title, buyer_tax_id, item_label, amount, provider, trade_no)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (source, order_id) DO NOTHING
     RETURNING *`,
    [
      genReceiptNo(),
      source,
      orderId,
      userId,
      buyerEmail,
      buyerName ? String(buyerName).slice(0, 100) : null,
      normalizeTitle(buyerTitle),
      normalizeTaxId(buyerTaxId),
      String(itemLabel || '').slice(0, 100),
      amount,
      provider,
      tradeNo,
    ]
  );

  if (inserted.rows[0]) {
    logInfo('billing.receipt.issued', {
      receiptNo: inserted.rows[0].receipt_no,
      source,
      orderId,
      amount,
      provider,
    });
    return inserted.rows[0];
  }

  // Already issued — a callback retry, or both the browser return and the
  // server-to-server notify racing. Hand back the existing document.
  const existing = await client.query(
    `SELECT * FROM payment_receipts WHERE source = $1 AND order_id = $2`,
    [source, orderId]
  );
  logWarn('billing.receipt.already_issued', {
    receiptNo: existing.rows[0]?.receipt_no,
    source,
    orderId,
  });
  return existing.rows[0] || null;
}

// Wire shape for the API / UI. Keeps the seller block on every receipt so the
// printable view is a complete document without the client knowing our env.
function formatReceipt(row) {
  if (!row) return null;
  const s = seller();
  return {
    receipt_no: row.receipt_no,
    source: row.source,
    order_id: row.order_id,
    item_label: row.item_label,
    amount: Number(row.amount),
    currency: 'TWD',
    provider: row.provider,
    trade_no: row.trade_no,
    invoice_no: row.invoice_no || null,
    buyer_email: row.buyer_email,
    buyer_name: row.buyer_name,
    buyer_title: row.buyer_title,
    buyer_tax_id: row.buyer_tax_id,
    issued_at: row.issued_at,
    seller_name: s.name,
    seller_tax_id: s.taxId || null,
    seller_contact: s.contactEmail,
  };
}

module.exports = {
  seller,
  genReceiptNo,
  normalizeTaxId,
  normalizeTitle,
  issueReceipt,
  formatReceipt,
};
