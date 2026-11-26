# 0011. Dependency-free payment gateways & immutable receipts

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/ecpay.js`, `lib/newebpay.js`, `lib/paymentProviders.js`, `lib/receipts.js`

## Gateways

- **No vendor SDKs.** Money-handling code must stay fully reviewable, and the
  only non-trivial part of each gateway is a well-defined signature, which we
  implement ourselves.
- **ECPay AIO (CheckMacValue, SHA256):**
  1. Drop CheckMacValue and sort the params by key, case-insensitively.
  2. Build `HashKey=…&k=v…&HashIV=…`.
  3. URL-encode it *.NET-style* and lowercase it.
  4. Take the SHA256 and uppercase it.

  .NET encoding differs from `encodeURIComponent`: a space becomes `+`, and `~`
  and `'` are encoded. `-_.!*()` are already literal.

  `MerchantTradeDate` uses the local `YYYY/MM/DD HH:mm:ss` format.
- **Stage credentials are refused in production.** ECPay's published stage keys
  are the default outside production (dev, e2e). In production,
  `isConfigured()` requires the real merchant secrets: the stage
  HashKey/HashIV are public, so accepting callbacks signed with them would let
  anyone forge a "paid" callback and grant themselves Premium. While
  `isConfigured()` is false, `verifyCallback` always fails, for both gateways.
- **Callback signatures are compared in constant time** (`timingSafeEqual` on
  equal-length buffers).
- **One rule for choosing a gateway** (`lib/paymentProviders.js`), shared by
  Premium checkout and paid video sessions, so both refuse a gateway the same
  way. An explicit choice wins. Otherwise ECPay is used while it's configured,
  and NewebPay otherwise. An unusable gateway gets a 503 body whose message
  points at the other gateway only when that one works.
- **NewebPay MPG 2.0:** the order fields, URL-encoded, are AES-256-CBC encrypted
  (PKCS7, hex) to make `TradeInfo`, and
  `TradeSha = upper(SHA256("HashKey=…&" + TradeInfo + "&HashIV=…"))`. The
  NotifyURL callback is authoritative: verify `TradeSha`, then decrypt.
  - Notify payloads sometimes carry trailing control bytes, so auto-unpadding is
    off and padding is stripped defensively.
  - There are no public test credentials, so the config is env-only and
    `isConfigured()` lets routes fail with an actionable message.
  - `ItemDesc` is cut to 50 chars, so a long therapist name can't get an order
    rejected.
  - URL mapping: our `returnUrl` → NotifyURL (server-to-server grant),
    `orderResultUrl` → ReturnURL (browser), `clientBackUrl` → ClientBackURL.
  - Stage runs on `ccore.*`, production on `core.*`. All payment methods are
    enabled, matching ECPay `ChoosePayment=ALL`.

## Receipts (電子收據)

- The seller is an individual (個人賣家) with no 統一編號 yet, so it can't legally
  issue a 統一發票. Every paid order instead gets a numbered electronic receipt:
  mailed to the buyer, viewable in the app, and stored immutably in
  `payment_receipts` (migration 083). Both gateways' shop reviews require this
  flow in writing (docs/PAYMENT_MODEL.zh-TW.md).
- **Issuing is idempotent.** Gateway callbacks retry, and the browser return races
  the server notify. `UNIQUE(source, order_id)` with `ON CONFLICT DO NOTHING`
  and a re-select hands back the existing receipt.
- **Receipts are never updated or deleted.** A correction would be a new document.
- **Issued in the same transaction as the entitlement grant**, so an order is never
  paid without its receipt, or the reverse.
- Number format `TG-YYYYMMDD-XXXXXX`: sortable by day, with 24 random bits and
  `UNIQUE(receipt_no)` as the real guard.
- A buyer 統一編號 must be exactly 8 digits; anything else is stored as NULL. A
  malformed tax id on a receipt is worse than none.
- Seller name and tax id come from env, so they can change after 商業登記 without a
  deploy. The support email is the single product-wide address
  (`lib/supportContact.json`), the same channel as payment disputes. Every
  formatted receipt carries the seller block, so the printable view is complete.
