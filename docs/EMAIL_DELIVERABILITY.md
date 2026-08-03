# Email 送達率 — 為什麼配對邀請會進垃圾信箱，以及怎麼修

## 問題

配對邀請信長期被 Gmail 丟進垃圾信箱或「促銷」分頁，讓新使用者的伴侶根本看不到邀請，
配對流程在第一步就斷掉。

根本原因是**寄件網域不對齊**。過去每封信的 `From:` 都是一個私人 Gmail 地址
（`services/emailService.js` 寫死 `SMTP_USER`），但信件內容裡所有連結都指向
`twogether.fun`。對收信端來說，這是「宣稱代表某個品牌、卻從無關網域寄出」的典型釣魚
特徵；再加上沒有 SPF / DKIM / DMARC 對齊、沒有 `List-Unsubscribe` 標頭，分數自然
被打到垃圾桶。

程式端已經修好（見本文最後的「程式端做了什麼」）。**但真正的修復需要你手動設定 DNS —
沒有這一步，前面的改動不會生效。**

---

## 一、找出 twogether.fun 的 DNS 管在哪裡

```bash
dig NS twogether.fun +short
whois twogether.fun | grep -i registrar
```

`dig` 回傳的 nameserver 就指出實際管理 DNS 的地方（不一定是當初買網域的地方）：

| Nameserver 長這樣 | 到哪裡設定 |
|---|---|
| `*.cloudflare.com` | Cloudflare Dashboard → 選網域 → **DNS** → Records |
| `*.domaincontrol.com` | GoDaddy → My Products → 網域 → **DNS** |
| `*.registrar-servers.com` | Namecheap → Domain List → Manage → **Advanced DNS** |
| `*.squarespacedns.com` / `*.googledomains.com` | Squarespace Domains（Google Domains 已整批移轉過去） |
| `*.name.com`, `*.gandi.net`, `*.porkbun.com` … | 各自後台的 DNS / DNS Records 頁面 |
| 指向你的主機商 | 主機商後台的 DNS 管理頁 |

## 二、在 Resend 驗證網域

1. 到 <https://resend.com> 註冊（免費方案 3,000 封/月、100 封/日，對現在的量足夠）
2. **Domains → Add Domain →** 輸入 `twogether.fun`
3. Resend 會列出三筆要加進 DNS 的記錄。**一律用它畫面上顯示的實際值**，
   下面只是讓你知道長什麼樣子：

   | Type | Name | Value |
   |---|---|---|
   | `MX` | `send.twogether.fun` | `feedback-smtp.<region>.amazonses.com`（priority 10） |
   | `TXT` | `send.twogether.fun` | `v=spf1 include:amazonses.com ~all` |
   | `TXT` | `resend._domainkey.twogether.fun` | `p=MIGfMA0GCSq…`（DKIM 公鑰，很長） |

   > ⚠️ Cloudflare 使用者注意：這些記錄的 proxy 必須關掉（灰雲，不要橘雲）。
   > 另外部分供應商的 Name 欄位要填**相對名稱**（`send`、`resend._domainkey`），
   > 不要重複打上 `.twogether.fun`。

4. 自己再加一筆 DMARC（Resend 不會幫你加，但沒有它 Gmail 仍會扣分）：

   | Type | Name | Value |
   |---|---|---|
   | `TXT` | `_dmarc.twogether.fun` | `v=DMARC1; p=none; rua=mailto:dmarc@twogether.fun; adkim=r; aspf=r` |

   先用 `p=none`（只觀察、不攔截）。跑一到兩週、確認 `rua` 收到的報告裡沒有
   合法信件被判定失敗之後，再改成 `p=quarantine`，最後才考慮 `p=reject`。

5. 回 Resend 按 **Verify**。DNS 生效通常幾分鐘，最長可能要數小時。

## 三、設定應用程式的環境變數

**本機**（`.env`，格式見 `env.example`）：

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_SECURE=starttls
SMTP_USER=resend                  # 字面值，不是 email 地址
SMTP_PASS=re_xxxxxxxxxxxx         # Resend → API Keys 產生
EMAIL_FROM=Twogether <hello@twogether.fun>
EMAIL_REPLY_TO=support@twogether.fun
```

**正式環境**：這些值來自 GitHub repo secrets（`Settings → Secrets and variables →
Actions`），由 `.github/workflows/deploy.yml` 對應成 `_SMTP_*` / `_EMAIL_*`，再由
`envsubst` 寫進 `app.yaml`。需要設定的 secret：

`SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、
`EMAIL_FROM`、`EMAIL_REPLY_TO`

> ⚠️ App Engine 的環境變數是**部署當下**才被 `envsubst` 寫進去的。改完 GitHub
> secret 之後必須重新部署（push 到 `main`，或手動 `gcloud app deploy`）才會生效。

`EMAIL_FROM` 沒設時，程式會退回舊行為（用 `SMTP_USER` 當寄件人），所以切換過程不會
中斷寄信 — 但在 `EMAIL_FROM` 設好之前，垃圾信問題不會消失。

## 三之二、讓 @twogether.fun 收得到信

**在 Resend 驗證網域只讓你「寄」，不讓你「收」。** 這是兩件完全獨立的事：

- `EMAIL_FROM=hello@twogether.fun` — **不需要**真的存在這個信箱。寄信只要求
  網域通過驗證，`hello@` 只是一個標籤。
- `EMAIL_REPLY_TO=support@twogether.fun` — **必須**是真的收得到信的地址，
  否則使用者按回覆之後信會退回，而他會以為你已讀不回。

目前 `twogether.fun` 的根網域**沒有 MX 記錄**，代表任何寄到 `@twogether.fun`
的信都會直接退信。確認方式：

```bash
dig MX twogether.fun +short     # 沒有輸出 = 收不到信
```

要讓 `support@twogether.fun` 真的能用，選一個做：

### 選項 A：ImprovMX（免費，約 5 分鐘）

轉寄服務，把 `support@twogether.fun` 收到的信自動轉到你的 Gmail。

1. 到 <https://improvmx.com> 輸入 `twogether.fun` 和你的 Gmail
2. 到 GoDaddy DNS 加它給的兩筆 **MX**（加在**根網域** `@`，不是 `send`）：
   `mx1.improvmx.com`（priority 10）、`mx2.improvmx.com`（priority 20）
3. 加一筆根網域 TXT：`v=spf1 include:spf.improvmx.com ~all`

> 這不會影響 Resend — Resend 的 MX 在 `send.twogether.fun` 子網域上，
> 兩者各自獨立，不會互相覆蓋。

### 選項 B：GoDaddy Email Forwarding

GoDaddy 後台就有轉寄功能（部分方案要另外付費，看你的網域方案含不含）。
設定 `support@twogether.fun` → 你的 Gmail 即可，DNS 由 GoDaddy 自動處理。

### 選項 C：暫時先用你的個人信箱

`EMAIL_REPLY_TO` 直接填你的 Gmail。立刻可用、不會退信，代價是你的私人地址會
出現在每封交易信的 `Reply-To` 標頭上。

> 注意：配對邀請信不受這個設定影響 — 它的 `Reply-To` 一律是**邀請人本人**的
> 地址，所以伴侶按回覆是回給邀請他的人，不是回給你。

## 四、驗證

1. **SMTP 連線與寄件人**
   ```bash
   node scripts/verify-smtp.js --to 你的信箱@gmail.com
   ```
   它會印出實際使用的 `from` / `reply` 位址，執行 AUTH 握手，並選擇性寄一封測試信。

2. **標頭對齊**：在 Gmail 打開收到的信 → 右上角 ⋮ → **顯示原始郵件**。要看到：
   - `SPF: PASS`
   - `DKIM: PASS`
   - `DMARC: PASS`
   - **DKIM 的網域是 `twogether.fun`**（不是 `gmail.com`、也不是 `amazonses.com`）

   第四點最關鍵 — 前三個 PASS 但網域不是 `twogether.fun`，就代表對齊還沒完成。

3. **垃圾信評分**：到 <https://www.mail-tester.com> 取一個一次性地址，從 app 真的
   寄一封配對邀請過去，回網頁看分數。目標 **9/10 以上**，它會逐項列出還缺什麼。

4. **端到端**：用另一個 Gmail 帳號跑完整流程（註冊 → 輸入伴侶 email → 送出），
   確認信落在「主要」收件匣，而不是「促銷」或垃圾郵件。

## 五、往後要維持的習慣

- **不要用共用信箱寄大量信**。發信量突然暴增會觸發限流與信譽下降。
- **保持低退信率**。收件地址打錯造成的硬退信（hard bounce）累積會傷害網域信譽；
  邀請流程已經在前端做 email 格式驗證。
- **定期看 DMARC 報告**（`rua` 那個信箱）。有陌生來源冒用網域寄信時會顯示在這裡。
- **新增寄信情境時記得帶 `List-Unsubscribe`**（見下）。

---

## 程式端做了什麼

| 改動 | 位置 |
|---|---|
| 寄件人改讀 `EMAIL_FROM`（未設定則沿用 `SMTP_USER`） | `services/emailService.js` — `_fromAddress()` / `_from()` |
| 全域 `Reply-To`（`EMAIL_REPLY_TO`） | `services/emailService.js` — `_replyTo()` |
| 配對邀請的 `Reply-To` 設為**邀請人本人**的地址 | `services/emailService.js` — `sendPairingInvitation()` |
| 通知信加上 RFC 8058 一鍵退訂標頭 | `services/emailService.js` — `_unsubscribeHeaders()`；`lib/emailUnsubscribe.js`；`routes/email.js` |
| 邀請信改寫成簡短個人信（移除行銷版面與功能宣傳格） | `services/emailService.js` — `sendPairingInvitation()` |
| 邀請信的暱稱／個人訊息補上 HTML escape | 同上（原本是全檔唯一未過濾的範本） |
| 所有信件都有純文字版本（不再只有 HTML） | `sendPairingAccepted()` 等 |
| 送出邀請後提供「複製連結 / 用 LINE 傳給 TA」 | `src/components/PairingInviteShare.tsx` |

最後一項是刻意的雙保險：email 送達率永遠不會是 100%，而台灣情侶多半用 LINE，
直接把連結傳過去比等信可靠得多。

## 排錯

寄信失敗的結構化日誌查詢方式見 `README.md` 的「Querying email failures in
Cloud Logging」。常見錯誤：

| 現象 | 多半是什麼 |
|---|---|
| `EAUTH` / `535` | `SMTP_PASS`（API key）錯了或已撤銷 |
| `450` / `550 ... not verified` | Resend 網域還沒驗證通過，或 `EMAIL_FROM` 用了未驗證的網域 |
| 信寄出了但 DKIM 顯示 `amazonses.com` | 網域驗證沒完成，Resend 用共用網域代寄 |
| 改了 secret 卻沒生效 | App Engine 需要重新部署（見第三節的警告） |
