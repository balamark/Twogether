# Twogether 交易模式說明書（金流平台審核用）

> 本文件用於回覆金流平台（藍新金流 NewebPay／綠界科技 ECPay）之商店審核補件要求，
> 內容涵蓋 **金流交易模式** 與 **憑證（發票／收據）開立流程**。
> 文件與程式碼同步維護：文中每個流程都對應到本專案的實際檔案路徑，修改流程時請一併更新本文件。

| 項目 | 內容 |
| --- | --- |
| 商店名稱 | Twogether |
| 藍新商店代號 | MS1839358868 |
| 服務網址 | https://twogether.fun |
| 公開商品頁（免登入） | https://twogether.fun/pricing |
| 營運型態 | 個人賣家（尚未辦理營業／稅籍登記） |
| 客服聯絡信箱 | wangmark510@gmail.com |
| 服務性質 | 情侶關係經營 App（數位內容訂用服務 + 線上諮商媒合） |

---

## 一、商品與服務內容

### 1-1. Twogether Premium 會員（主要商品）

| 方案 | 售價（TWD） | 服務期間 |
| --- | --- | --- |
| Premium 30 天 | 90 | 30 天 |
| Premium 90 天 | 240 | 90 天 |
| Premium 365 天 | 790 | 365 天 |

- **商品性質**：數位內容服務使用權（提高 App 內 AI 功能每日次數上限、解除自訂劇本與照片上傳數量限制）。
- **一次性買斷、不自動續訂、不自動扣款**：本站未使用任何定期定額／信用卡約定扣款功能。
- **以「情侶」為計費單位**：由其中一方付款，配對中的兩人同時享有權益；期間可累加堆疊，已付費天數不會因再次購買而消失。
- 售價僅存在於伺服器端目錄（`routes/billing.js` 的 `PLANS`），前端不傳送金額，杜絕竄改。

### 1-2. 視訊諮商預約（次要商品）

- 消費者於平台預約合作心理諮商／療癒師的 1 對 1 視訊晤談，視訊本身於第三方工具（Zoom／Google Meet）進行。
- 消費者支付「全額晤談費用」，平台抽取服務費 **20%**（該諮商師前 10 場完成之晤談為 **10%** 新手費率），其餘為諮商師報酬。
- 費率於付款當下即凍結快照於訂單（`session_payment_orders.fee_rate / platform_fee / therapist_net`），事後不會重新計價。
- 諮商師報酬採**人工結算撥款**，平台不提供任何儲值、提領或轉帳功能。

### 1-3. 非交易項目（特別聲明）

- App 內的「金幣」為互動獎勵點數，**只能由使用行為免費取得，不販售、不可儲值、不可提領、不可兌換現金或商品**。
- 平台**不提供**：虛擬貨幣、代收代付第三方款項、點數交易、抽獎或博弈性質功能。

---

## 二、金流交易模式

### 2-1. 支援之付款方式

透過藍新金流 MPG 幕前支付頁提供：信用卡（`CREDIT`）、WebATM（`WEBATM`）、ATM 虛擬帳號（`VACC`）、
超商代碼（`CVS`）、超商條碼（`BARCODE`）。程式設定位置：`lib/newebpay.js` → `buildCheckoutParams()`。

> 消費者的信用卡卡號、有效期、驗證碼等敏感資料**全程於金流平台之付款頁輸入**，不經過本站伺服器，本站亦不儲存任何卡片資料。

### 2-2. 交易流程（以 Premium 會員為例）

```
 消費者                     Twogether 伺服器                    藍新金流 MPG
   │                              │                                  │
   │ 1. 於 App 選擇方案與付款方式 │                                  │
   ├─────────────────────────────>│                                  │
   │                              │ 2. 以伺服器端定價建立            │
   │                              │    payment_orders（status=pending）│
   │                              │    產生訂單編號 TGxxxxxxxxxxxx     │
   │                              │ 3. 訂單參數 AES-256-CBC 加密為     │
   │                              │    TradeInfo，另計 SHA256 TradeSha │
   │ 4. 自動轉送付款表單          │                                  │
   │<─────────────────────────────┤                                  │
   │ 5. 於藍新付款頁完成付款      │                                  │
   ├──────────────────────────────┼─────────────────────────────────>│
   │                              │ 6.【權威】NotifyURL 伺服器對伺服器 │
   │                              │<─────────────────────────────────┤
   │                              │    驗 TradeSha → 解密 → 比對訂單   │
   │                              │    與金額 → 冪等檢查              │
   │                              │ 7. 同一資料庫交易內：              │
   │                              │    ・開通會員權益                  │
   │                              │    ・訂單標記 paid                 │
   │                              │    ・開立電子收據（見第三節）      │
   │                              │ 8. 寄送收據信件                    │
   │ 9. ReturnURL 導回結果頁      │                                  │
   │<─────────────────────────────┼──────────────────────────────────┤
```

對應程式碼：

| 步驟 | 端點／函式 | 檔案 |
| --- | --- | --- |
| 2–4 | `POST /api/billing/checkout` | `routes/billing.js` |
| 3 | `buildCheckoutParams()`（AES 加密 + TradeSha） | `lib/newebpay.js` |
| 6 | `POST /api/billing/newebpay/callback`（NotifyURL） | `routes/billing.js` |
| 6 | `verifyCallback()` / `parseCallback()` | `lib/newebpay.js` |
| 7 | `grantPaidOrder()` | `routes/billing.js` |
| 7 | `issueReceipt()` | `lib/receipts.js` |
| 9 | `POST /api/billing/newebpay/return`（ReturnURL） | `routes/billing.js` |

視訊諮商採完全相同的流程，端點為 `POST /api/therapists/consultations/:id/pay`
與 `POST /api/therapists/sessions/newebpay/callback`（`routes/therapists.js`）。

### 2-3. 交易安全與正確性控制

| 風險 | 控制措施 |
| --- | --- |
| 前端竄改金額 | 金額一律取自伺服器端目錄（`PLANS`），API 不接受任何客戶端傳入的金額 |
| 偽造回拋 | 以 HashKey／HashIV 重新計算 TradeSha 驗章，不符即回 400 並記錄 `billing.callback.bad_mac` |
| 回拋金額不符 | 與資料庫訂單金額比對，不符即拒絕並記錄 `billing.callback.amount_mismatch` |
| 重複回拋／重試 | 訂單編號 `merchant_trade_no` 唯一；已 `paid` 之訂單直接回應成功（冪等），收據亦以 `UNIQUE(source, order_id)` 保證只開立一次 |
| 權益與收據不一致 | 開通權益、標記付款、開立收據三者在**同一個資料庫交易**中完成，全成功或全回滾 |
| 稽核 | 完整回拋內容存入 `raw_callback`（JSONB）；結構化日誌寫入 Google Cloud Logging |

### 2-4. 資金流與對帳

1. 消費者款項由藍新金流依合約結算，撥付至商店負責人之銀行帳戶。
2. 平台端對帳資料表：
   - `payment_orders`：Premium 會員每一次結帳（含未完成、失敗）。
   - `session_payment_orders`：視訊諮商每一次結帳，含平台服務費與諮商師報酬拆分。
   - `payment_receipts`：每一筆成功交易所開立之電子收據（不可竄改、不刪除）。
3. 每日以藍新後台交易明細與上述資料表核對；異常時可由訂單編號（`TG` 開頭）雙向查得。
4. 結構化日誌事件：`billing.checkout.created`、`billing.callback.granted`、`billing.callback.failed`、
   `billing.callback.amount_mismatch`、`billing.receipt.issued`（`lib/logger.js` → Cloud Logging）。
5. 諮商師報酬為人工結算後匯款，並記錄撥款狀態（`routes/therapists.js` 撥款端點）。

---

## 三、憑證（發票／收據）開立流程

### 3-1. 現況說明

本商店目前為**個人賣家，尚未辦理營業（稅籍）登記，依法無法開立統一發票**。
因此每一筆成功交易均由系統**自動開立載有編號的「電子收據」**作為消費者之付款憑證，
並以電子郵件寄送、於 App 內長期保存供查詢與列印。相關政策亦公告於免登入的公開商品頁
https://twogether.fun/pricing 之「交易憑證（電子收據）」段落。

### 3-2. 電子收據開立流程

```
藍新 NotifyURL 回拋（驗章、金額比對通過）
        │
        ▼
┌────────────────────── 同一個資料庫交易 ──────────────────────┐
│ 1. 開通消費者權益（會員天數／預約付款狀態）                  │
│ 2. 訂單標記 status = paid、寫入 paid_at 與金流交易序號        │
│ 3. 開立電子收據 payment_receipts                              │
│      ・收據編號：TG-YYYYMMDD-XXXXXX（唯一）                   │
│      ・凍結買受人、品項、金額、付款方式、金流交易序號         │
│      ・UNIQUE(source, order_id) → 回拋重試不會重複開立        │
└──────────────────────────────────────────────────────────────┘
        │
        ├─ 4. 以電子郵件寄送收據內容至消費者信箱（信件本身即為收據）
        └─ 5. App 內「升級 Premium → 購買紀錄與收據」可隨時查看、
              列印或存成 PDF（`GET /api/billing/receipts/:receiptNo`）
```

### 3-3. 電子收據記載事項

| 欄位 | 說明 |
| --- | --- |
| 收據編號 | `TG-YYYYMMDD-XXXXXX`，全站唯一 |
| 開立人 | Twogether（個人賣家）；完成稅籍登記後將顯示統一編號 |
| 開立日期 | 付款成功並經驗章確認之時間 |
| 品項 | 例：Twogether Premium 90 天／視訊諮商 — ○○○ |
| 金額 | 消費者實付金額（TWD） |
| 付款方式 | 綠界 ECPay 或藍新金流 NewebPay |
| 金流交易序號 | 金流平台之 TradeNo，供雙向查帳 |
| 抬頭、統一編號 | 消費者於付款前可選填（報帳用），未填則不列印 |
| 購買人信箱 | 交易當下之帳號信箱快照 |

### 3-4. 收據的不可竄改性

- 收據一經開立**不做任何更新或刪除**（程式中沒有任何 UPDATE／DELETE 該表的路徑）。
- 買受人資訊於開立當下快照，日後修改暱稱或信箱不會回頭改寫已開立之收據。
- 收據僅本人可查詢（`GET /api/billing/receipts/:receiptNo` 以登入身分驗證買受人）。

### 3-5. 退款時的憑證處理

發生退款時（見第四節），由客服以電子郵件寄送退款說明，載明原收據編號、退款金額與退款日期，
原收據於帳務上註記作廢；退款一律經原金流平台循原付款管道退回，不以其他方式退現。

### 3-6. 未來銜接統一發票之規劃

待營業額達營業登記門檻或完成稅籍登記後，將串接**藍新電子發票 API** 於付款成功後自動開立 B2C 雲端發票
（支援手機條碼載具、愛心碼捐贈與公司統編三種模式），並同步寄送發票通知信。
資料結構已預留欄位 `payment_receipts.invoice_no`，屆時同一筆交易之收據與發票號碼可一一對應，
前端與收據信件亦已支援發票號碼之顯示（有值時自動顯示）。

---

## 四、退費政策與客服流程

1. 依《消費者保護法》第 19 條及數位內容例外規定，線上數位服務於提供後即開始使用，
   原則上不適用七日鑑賞期無條件解約；此政策已公告於公開商品頁。
2. **例外全額退款**：因系統錯誤導致重複扣款、未開通、無法使用等情形，請於付款後 7 日內來信客服，
   經查證屬實全額退還該筆款項。
3. 退款一律經原金流平台循原付款管道退回，作業時間依金流平台與發卡行規定。
4. 已使用之服務期間，恕不退還剩餘天數之費用。
5. 客服信箱：wangmark510@gmail.com；一般於 3 個工作日內回覆。

---

## 五、資料存儲與資訊安全

| 項目 | 說明 |
| --- | --- |
| 應用程式主機 | Google Cloud Platform — App Engine（亞洲區） |
| 資料庫 | Supabase（PostgreSQL），交易資料與使用者資料皆儲存於此 |
| 檔案儲存 | Supabase Storage（使用者上傳之照片） |
| 郵件寄送 | Resend（SPF／DKIM／DMARC 已設定，見 `docs/EMAIL_DELIVERABILITY.md`） |
| AI 功能 | Anthropic Claude API（僅傳送必要文字內容以產生建議） |
| 傳輸加密 | 全站 HTTPS |
| 卡片資料 | **完全不經過、不儲存**，由金流平台於其付款頁處理 |
| 資料庫防護 | 所有資料表啟用 Row Level Security（migration 063），應用程式以後端專用連線存取 |

---

## 六、附錄

- 廠商與合約文件清單（補件項目二）：見 `docs/VENDOR_CONTRACTS.zh-TW.md`
- 測試帳號提供方式（補件項目三）：見 `docs/REVIEW_TEST_ACCOUNT.zh-TW.md`
- 公開商品／退費政策頁：`public/pricing.html`（線上網址 https://twogether.fun/pricing）
