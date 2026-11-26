const crypto = require('crypto');
const { logInfo, logWarn } = require('./logger');
const { supportEmail: SUPPORT_EMAIL } = require('./supportContact.json');

function seller() {
  return {
    name: process.env.SELLER_NAME || 'Twogether（個人賣家）',
    contactEmail: process.env.SELLER_CONTACT_EMAIL || SUPPORT_EMAIL,
    taxId: process.env.SELLER_TAX_ID || '',
  };
}

function genReceiptNo(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TG-${y}${m}${d}-${rand}`;
}

function normalizeTaxId(value) {
  const s = String(value ?? '').trim();
  return /^\d{8}$/.test(s) ? s : null;
}

function normalizeTitle(value) {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, 100) : null;
}

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
