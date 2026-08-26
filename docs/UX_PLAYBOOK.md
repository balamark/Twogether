# Twogether UX 上手體驗 — 診斷、改進提案與長期制度規範

> **讀者：AI 模型（Claude Opus/Sonnet、Codex/GPT 等）與人類維護者。**
> 這份文件有兩個部分：
> 1. **一次性的改進 backlog**（§2–§3）— 審核通過後逐項實作，做完就劃掉。
> 2. **永久性的制度規範**（§4–§5）— 之後任何 session 改 UI 時都必須遵守。
>    若規範與程式現況衝突，以規範為準並修正程式（或提出修改規範的理由）。
>
> 維護方式：實作完成的 backlog 項目標記 `✅ done (commit)`；新增規範走 PR 討論。
> 本文件的空間座標以 `檔案:行數` 標示，行數會漂移，請以語意搜尋為主。
> 英文版：`docs/UX_PLAYBOOK.en.md`（本 zh-TW 檔為正本，兩檔必須在同一個 commit 同步更新）。

---

## §0 產品的一句話與啟動時刻（先讀這個）

Twogether 是一個「情侶關係經營」App：記錄親密時光、用 AI 把衝突說開、
留言牆、角色扮演、真人/AI 諮商。全部繁體中文，主客群是台灣情侶。

**最重要的一件事：這是雙人產品，「配對成功」= 啟動時刻（activation）。**
未配對的用戶幾乎所有核心功能都是死路（衝突事件、牆、親密邀請都需要伴侶）。
但配對需要說服另一半下載註冊——這是全產品最大的漏斗斷點。所有 UX 決策都
應該回答：「這個改動有沒有讓用戶更快配對成功、或在配對前就感受到價值？」

第二重要：**核心差異化功能是衝突修復飛輪**（寫下委屈 → AI 整理成三種版本
→ 對方接住情緒 → AI 諮商師介入 → 標記解決）。不是月曆記錄。

---

## §1 現況盤點（2026-07 快照）

### 導覽結構（2026-08-25 後）
登入後 4 個分頁（`src/App.tsx` `navItems`）：
**今天 `home` / 對話 `talk` / 我們 `us` / 成長 `grow`**。
對應四個問題：現在怎麼了？／我們要談什麼？／我們一起經歷過什麼？／我們有沒有變好？

- **今天**：`HomeView.tsx`。不是總覽，是「現在最需要知道什麼」——開始三步驟、
  關係之屋（單一最急提醒）、Twogether 發現（靜態 teaser，**不自動呼叫**耗 AI 額度的
  `getCommunicationPattern`）、近兩週真實數字、最近動態、成長入口。
- **對話**：吸收原「好好說話」（子分頁 說開一件事 `events` / 接住情緒・檢查 `conflict`），
  另加入口卡 角色扮演 `talk-roleplay-entry`、心理諮商 `talk-therapists-entry`。
- **我們**：原「記錄時光」（`CalendarView`），新增 月曆／時間軸 切換
  （`us-view-toggle-calendar` / `us-view-toggle-timeline`，預設月曆；**記錄清單與快速回應
  只在時間軸**），另加入口卡 我們的牆 `us-wall-entry`、愛情旅程 `us-journey-entry`。
- **成長**：`GrowView.tsx`。成就統計（`AchievementsView`）＋ 事件分析與溝通模式
  （直接 import `EventAnalytics`，不經 `EventsView`）＋ 真實故事入口 `grow-stories-entry`。
  真實故事單人可用，**入口卡放在配對 gate 之上**。

角色扮演／心理諮商／真實故事不再是主分頁，改為上述入口卡（真實故事另在用戶選單
`user-menu-stories`）。舊 view id（`record`/`communicate`/`events`/`conflict`/`roleplay`/
`wall`/`stories`/`therapists`/`journey`/`achievements`…）全部保留有效，深連結與重新整理
不受影響；nav 高亮把各自的子視圖算回所屬主分頁。預設落地頁由 `record` 改為 `home`。
未登入導覽為 5 顆（+訪客限定 Premium），`LoggedOutPreview` 對 `home`/`grow` 有專屬範例，
並用 `ExploreLinks` 保留未登入者前往 角色扮演／心理諮商／我們的牆／真實故事 的路徑
（testid 與登入後的入口卡一致）。
另有用戶選單（Header 右上）：金幣商店、最近動態、愛情旅程、真實故事、訊息紀錄、
愛的語言、情緒深潛、意見回饋、使用說明、設定、升級 Premium。

### 既有的上手機制
- 註冊後：AI 諮商師選擇 modal（`AiCompanionPicker.tsx`）→ 配對邀請 modal。
- 未登入首頁：showroom（`LoggedOutPreview.tsx`），每個分頁有唯讀範例——**品質很好**，
  但登入後這些教學性內容全部消失。
- 設定頁散落的 💡 小提示。

### 缺口（一句話診斷）
**App 假設用戶已經知道要做什麼。** 沒有任何 in-app 幫助入口、沒有「接下來做
什麼」的引導、空狀態多數只有一句話沒有行動按鈕、未配對時看到的是「請先配對」
的牆而不是「配對前你可以先做這些」。

---

## §2 診斷：新用戶旅程的具體斷點

依「註冊 → 第一次有感 → 配對 → 養成習慣」順序排列。

### D1｜註冊後連續兩個 modal，關掉之後就被丟包
註冊 → AI 諮商師選擇 → 配對邀請 modal。兩個都處理完（或跳過）後，用戶落在
「記錄時光」月曆——一片空白，沒有任何「你現在可以做什麼」。
**用戶心聲：「好，然後呢？」**

### D2｜分頁名詞抽象且互相重疊
「和諧相處」vs「衝突事件」：兩個都是處理衝突/情緒，用戶無法從名字預測內容差異
（和諧相處=接住情緒+婚姻檢查+關係之屋；衝突事件=衝突修復飛輪）。
「記錄時光」聽不出是「親密時光記錄+月曆」。「衝突事件」的負面框架也可能讓
用戶不想點（沒有衝突時這個分頁跟我無關？——其實裡面有分析和情緒學習）。

### D3｜未配對 = 大半功能是死路，且死路沒有出口
`EventsView.tsx:81` 未配對時整頁只顯示配對提示。牆、親密邀請同樣。
未配對用戶唯一能做的事（私人事件、愛的語言測驗、瀏覽劇本、公開問答）**沒有被
主動告知**。另外邀請發出後，等待狀態的可見性弱（對方裝了沒？連結失效了嗎？）。
→ 由 P0-3（單人模式 gate）與 P1-4（常駐配對提醒橫幅，含邀請狀態與重新寄送）解決。

### D4｜空狀態是句號，不是引導
- `EventHistoryList.tsx:98`：「目前還沒有事件。」——沒有按鈕、沒有價值說明。
- `CalendarView.tsx:859`：「還沒有記錄 — 開始你們的愛情之旅吧」——沒有按鈕。
- `WallView.tsx:469` 有指到範例，是目前最好的一個。
空狀態是新用戶必經之地，每一個都應該是 mini-onboarding。

### D5｜全 App 沒有任何「幫助」入口
沒有 FAQ、沒有使用說明、沒有辦法重看功能介紹。用戶卡住只能亂點或流失。
連「意見回饋」都藏在用戶選單裡。唯一的解釋性內容（showroom）登入後就看不到了。

### D6｜AI 次數限制是驚喜彈窗，不是預期
免費方案每日 AI 次數有限（`lib/entitlements.js`），但用戶只有在「用完的那一刻」
才知道有限制。按鈕上、按鈕旁都沒有剩餘次數的暗示。付費牆該是爬得到的坡，
不是撞上的牆。

### D7｜第一次成功之後沒有「下一步」
建立第一個事件、記第一筆時光之後，只有一個成功 toast。沒有慶祝、沒有
「接下來可以試試 X」。習慣養成靠的是 success → next action 的鏈。

---

## §3 改進 Backlog（P0 → P2，每項含驗收標準）

### P0-1 首頁「開始三步驟」卡片（新用戶檢查清單） ✅ done 2026-07-07
**規格**：「記錄時光」頁最上方（關係儀表板之上）插入一張可收合卡片，
列出 3 個步驟、完成自動打勾、全部完成後永久消失（存 localStorage + user flag）：
1. ✅ 選擇你的 AI 諮商師（註冊時已完成即打勾）
2. ⬜ 邀請另一半配對（→ 一鍵開啟配對 modal）
3. ⬜ 記下第一筆記錄或開啟第一個事件（→ 兩個快捷按鈕）
**驗收**：新註冊帳號登入後可見；每步驟點擊直達對應動作；完成後消失且不再出現；
未配對時步驟 3 的「開啟事件」引導到私人事件（不被配對牆擋住）。
**檔案**：`src/App.tsx`（record view）、新元件 `src/components/GettingStartedCard.tsx`。

### P0-2 空狀態全面升級為 mini-onboarding ✅ done 2026-07-07（事件列表、月曆、親密邀請；劇本庫本就有預設內容不會空）
**規格**：每個列表型視圖的空狀態一律包含三件事——
①一句這功能對感情的價值（不是功能描述）②主要 CTA 按鈕 ③範例或預覽。
以 `WallView.tsx:469` 為基準模板。優先改：事件列表、月曆、親密邀請、劇本庫。
**驗收**：上述 4 個視圖的空狀態都有可點的 CTA；Playwright 各加一條
「空狀態 CTA 可點且到達正確畫面」的 case。

### P0-3 未配對狀態改為「單人模式」 ✅ done 2026-07-07（events gate 已改；「私人事件免配對」需後端 schema 改動、「邀請等待中」徽章 → 移入 P1-4 追蹤）
**規格**：被配對 gate 的視圖（events/wall/親密邀請）不再只顯示「請先配對」，
改為三段式：①這個功能兩人一起用會發生什麼（一句話+截圖式範例，可重用
LoggedOutPreview 的素材）②「邀請另一半」主 CTA ③「配對前你可以先做」的
替代行動清單（私人事件、愛的語言測驗、逛公開問答）。
同時在 Header 或儀表板顯示「配對邀請等待中」的狀態徽章（含重新發送）。
**驗收**：未配對帳號在 events 頁可以直接建立私人事件；能看到已發出邀請的狀態。

### P0-4 幫助入口：使用說明頁 + 各頁 (?) 提示 ✅ done 2026-07-07（src/content/featureIntros.ts + HelpView + InfoHint；showroom 文案整併仍為 TODO）
**規格**：
- 用戶選單新增「使用說明」，開啟 `/help` 視圖：按分頁組織的 FAQ
  （每分頁 3–5 題，內容從 LoggedOutPreview 的文案改寫，維持單一事實來源：
  把共用文案抽到 `src/content/featureIntros.ts`，showroom 與 help 都吃它）。
- 每個分頁標題旁一個小 (?)，點開顯示該功能的 2–3 句介紹（同一份文案）。
**驗收**：登入後 2 次點擊內可到任何功能的說明；文案只存在一處。

### P1-1 分頁合併 ✅ done 2026-07-07：和諧相處＋衝突事件 → 一個主分頁「好好說話」，子分頁「說開一件事」/「接住情緒・檢查」。view id `events`/`conflict` 保留有效（深連結、重新整理不受影響），nav 高亮把兩者都算在 communicate 上。主分頁 6 → 5。

### P1-2 AI 次數透明化 ✅ done 2026-07-07（GET /api/ai-usage/today + AiQuotaHint：compose 輸入頁、事件回覆列、牆的邀請按鈕下方；額度用完是 warning + 選項，不是灰按鈕）
**規格**：所有會扣每日 AI 次數的按鈕，附近顯示「今日剩餘 N 次」
（backend 已有 `countTodayAiUsage`/`resolveAiLimit`，加一個
`GET /api/ai-usage/today` 即可）。次數歸零時按鈕變為「明天再來或升級」
的引導樣式（非 disabled 灰色——要能點，點了說明原因）。
**驗收**：免費帳號能在按之前知道剩幾次；用完後點按鈕看到的是解釋+選項，
不是 error toast。

### P1-3 第一次成功的下一步引導 ✅ done 2026-07-07（第一次建立事件 → 提示「如何接住TA的情緒」；第一筆記錄 → 未配對推配對、已配對推「我們的牆」；localStorage 一次性）
**規格**：第一次建立事件/記錄/貼文成功後，成功畫面附「下一步建議」
（例：事件送出後→「對方回覆前，可以先看看『如何接住TA的情緒』」）。
用 localStorage 記 first-time flags，只出現一次。

### P1-4（部分完成）配對邀請狀態可見性
「邀請等待中」狀態 ✅ done 2026-08-04：實作成常駐橫幅而非 Header 徽章
（`src/components/PairingReminderBanner.tsx`，掛在 `App.tsx` 既有的橫幅插槽）。
未配對時常駐顯示，兩種狀態：①還沒邀請 → 價值說明 +「邀請另一半」/「用配對碼配對」
②已寄出 → 收件者 + 連結剩餘天數 +「重新寄送」/「傳連結給 TA」。
✕ 是 7 天 snooze（`pairingReminderSnoozedUntil`）而非永久關閉；邀請 2 天內到期
時覆蓋 snooze 強制顯示。量測見 `onboarding.pairing_reminder.*`。
**仍未完成**：後端允許無 couple 的私人事件（schema 改動）。

### P1-5（未完成）引導模式（Therapist Mode）前端量測
2026-07-11 出貨的「開始引導」/今日練習 tray 目前只有後端 logInfo
（`events.facilitation.*`），沒有 R5 要求的前端曝光/點擊事件
（`onboarding.facilitation.<action>`）。等前端有輕量 track 機制（或沿用
activity 記錄）時補上：開始引導點擊、快速回覆 chip 點擊、tray 收合。

### P2（記錄在案，暫不做）
- 功能導覽 replay（互動式 tour）——§6 Q3 已決策不做，維護成本高。
- iOS App 的 onboarding 對齊。
- 多語系。

---

## §4 制度規範（永久有效，之後所有 AI session 必守）

### R1 新功能出貨檢查清單（擴充 CLAUDE.md 既有規則）
每個 user-facing 功能改動，除了現有的 changelog/promo/showroom/錯誤文案規則外，加上：
- [ ] **空狀態**：新列表/新視圖必須有 §3 P0-2 定義的三段式空狀態。
- [ ] **首次使用提示**：新功能若不能從名字自明，加 (?) 提示或一次性 hint。
- [ ] **Gate 三段式**：任何「不能用」狀態（未配對/免費上限/未驗證 email）
      必須包含：原因＋能做什麼＋主 CTA。禁止只有一句「請先 X」。
- [ ] **文案自檢**：按 R2 檢查。

### R2 文案規範（zh-TW）
- 對用戶稱「你」，對伴侶稱「另一半」或「對方」（功能名裡用「TA」保持中性）。
- 按鈕文字 = 動詞開頭的具體行動（「邀請另一半」✓，「配對功能」✗）。
- 空狀態與 gate 文案先講**對感情的價值**，再講功能（「把委屈說成對方聽得進
  的話」✓；「AI 三版本改寫」✗）。
- 錯誤訊息必含下一步（CLAUDE.md 已有此規則，這裡重申適用範圍包括空狀態）。
- 情緒安全：衝突相關文案永遠不評對錯、不用「你應該」。
- **AI 產生的文字不用破折號（——、—、–）**：改用冒號、括號或分句。實作為
  `services/llm/claudeProvider.js` 的 `PUNCTUATION_RULE`（附加到所有 system prompt）。
- **通知語氣準則（2026-07-12 新增）**：通知應該讀起來像「邀請彼此理解」，而不是
  「有人被指控或被回報」的訊號。優先使用 分享、情境、對話、一起；避免 事件、回報、
  指責、提出問題 這類框架（例：「伴侶分享了一個情境」✓，「伴侶開啟了一個事件」✗）。
  適用於所有通知面（Email、in-app、LINE 推播）。

### R3 導覽規範
- 主分頁上限 6 個。要加第 7 個功能 → 併入現有分頁做子分頁，或放用戶選單。
- 新分頁名字必須通過「電梯測試」：一個沒用過的人看名字能猜中內容。
  猜不中的名字需要 (?) 提示常駐。

### R4 Blocking Modal 規範
- 同一時刻最多一個 blocking modal。現行優先序：
  **AI 諮商師選擇 > 配對邀請 > 其他**（實作見 `App.tsx` `needsCompanionPick`
  對 pairing prompt 的抑制）。新增 modal 必須在此文件登記優先序。
- 每個 blocking modal 必須有明確的「稍後再說」逃生口，且逃生後不得在同
  session 重複彈出。

### R5 量測規範
新的引導類 UI（檢查清單、空狀態 CTA、help 頁）出貨時，用既有的
`usePageTracking`/activity 機制記錄曝光與點擊，事件命名 `onboarding.<surface>.<action>`。
沒有量測的引導視同沒做完。

### R6 UX 變更的驗證方式（給 AI agent 的操作指引）
- **改前先看**：用 browse daemon（`~/.claude/skills/gstack/browse/dist/browse`）
  以 390px 寬截圖現況，改後再截，對比交付。
- **e2e 模式**：mock 型 spec 參考 `tests/events-reply.spec.ts` 的脚手架
  （seed localStorage authState + catch-all route）。**seed 的 user 必須含
  `selected_therapist`，否則 companion modal 不會如預期。**
  點擊目標一律用 `data-testid`（見 memory/feedback_playwright_locators）。
- **真實流程**：註冊/配對類改動跑 `tests/user-journey.spec.ts`。
- 導覽一律用四個主分頁的 testid：`nav-tab-home` / `nav-tab-talk` / `nav-tab-us` /
  `nav-tab-grow`（舊的 `nav-tab-communicate`/`-record`/`-roleplay`/`-stories`/
  `-therapists` 與 `has-text("我們的牆")` 皆已無效）。巢狀功能要先點主分頁再點入口卡，
  例如 `nav-tab-talk` → `talk-roleplay-entry`。
- **預設落地頁是 `home`**：需要月曆／記錄的 spec 必須顯式點 `nav-tab-us`；需要記錄清單或
  快速回應的還要再點 `us-view-toggle-timeline`。
- 判斷「已登入」的 readiness probe 用 `user-menu-toggle`（各視圖都在），
  不要用只存在於 我們 的 `add-record-button`。
- 已知 flake：`roleplay-invitation.spec.ts` 的配對 fixture 偶發失敗，與 UI 改動無關。
- **部署陷阱**：docs-only push 會跳過部署、卻仍會取消進行中的部署 run。連續 push
  間隔 <11 分鐘時，確認前一個 run 是 `success` 不是 `cancelled`；被取消就
  `gh run rerun <id>`。

### R7 送出即回應：背景處理 + 樂觀更新（2026-08-08 新增，預設規範）
使用者按下按鈕後，**預設要立刻把操作權還給使用者**，讓網路來回在背景進行，不要
讓人乾等轉圈。實作分三層，依動作性質選一層——**不是所有動作都能 fire-and-forget**，
選錯層會造成資料遺失或重複送出（例：2026-08-07 牆上傳誤報「網路失敗」但貼文其實已送出）。

- **預設層｜樂觀更新（可逆、低風險動作）**：toggle、reaction、標記已讀、刪除、
  排序、隱私/公開切換、設定開關。做法：**先更新本地 state（畫面立即變）→ 背景 await
  → 失敗就回滾到前一個值 + 跳 error 通知**。不要 disable 按鈕等回應。
  範本：`EventDetail.handleToggleTranslation`、`WallView` 的 reaction/隱私切換
  （`setPosts(...)` 先行，catch 內還原）。
- **上傳層｜內容建立且伺服器會產生 ID／媒體**：牆貼文、事件、故事、劇本、任何檔案
  上傳。**不能把草稿丟掉式的 fire-and-forget**。做法：非阻塞上傳並依檔案大小放寬
  timeout（`uploadTimeoutFor`）；逾時（`error_code === 'TIMEOUT'`）一律當作「可能
  已成功」——重新整理列表、跳 warning，**絕不留紅色錯誤誘使重送造成重複**；真正失敗
  才保留草稿讓使用者重試。範本：`api.ts` 的 `createWallPost` + `WallView.handleSubmit`。
- **阻塞層｜結果就是使用者在等的東西，或牽涉金流/授權（必須等，屬正確）**：登入/
  註冊/配對、付款（升級、送硬幣、預約諮商師）、AI 產生內容（情緒翻譯、諮商師回覆、
  各種摘要）。這些要顯示進度、成功才前進，**禁止假裝已完成**。這層仍受 R4 blocking
  modal 規範。

共同規則：
- **背景失敗一定要有通知**（error 或 warning + 下一步），不能靜默吞掉。
- **只有需要當下抉擇的事才打斷使用者**：金流、破壞性動作、需要驗證/授權的分岔——
  用 blocking modal（R4）或 inline 確認；其餘一律背景處理。
- 用 `useAsyncAction` 取得同步防連點鎖（避免重複送出），但 `pending` 只用來顯示，
  不該讓可樂觀化的動作退回「按鈕變灰乾等」。

### R8 對話視覺文法：三個座位、一個品牌色（2026-08-08 新增，預設規範）

Twogether 不是多人聊天室，是一個被引導的關係空間。一條時間軸上同時有兩個伴侶、
AI 諮商師、引導練習 —— 兩方對話好懂，三方開始吃力，四方就亂。**解法不是「一個角色
一個顏色」**：顏色一旦被角色用光，未來的語意色（生氣 / 難過 / 肯定 / 警告 / 成功 /
衝突）就沒有空間，情緒產品會變成 dashboard；而且只靠顏色分辨角色不符合 accessibility。

> **位置辨識誰，Label 辨識角色，Component 辨識行為，顏色只做輔助。**

單一事實來源：`src/utils/threadRoles.ts`（`SEAT` / `SEAT_ALIGN` / `ROLE_STYLE` /
`threadRole()` / `counselorLabel()`）。**不要在元件裡自己寫三元式決定泡泡底色** ——
那正是「同一個 AI 諮商師在牆上是奶油、在好好說話裡是鼠尾草」的成因。

| 座位 | 誰 | 視覺 |
|---|---|---|
| 右 | 我 | 中性泡泡 `bg-petal-cream-2` + 頭像 + 名字 |
| 左 | 對方 | 中性泡泡 `bg-white border-petal-rule` + 頭像 + 名字 |
| 中 | 中立第三方 | AI 諮商師拿**全站唯一的品牌淡色**（`bg-petal-rose-soft/25`）；真人心理師中性底 + 🩺 |
| 全寬 | 系統 | 不畫泡泡：icon + 分隔線（`ConflictBanner`、引導標記） |

不可違反的幾條：

- **人不佔色相。** 兩個伴侶都是中性的，誰在說話由左右 + 頭像 + 名字決定。玫瑰淡色
  只屬於 AI 諮商師；鼠尾草 / 琥珀 / 橘留給語意（做到了 / 注意 / 衝突）。
- **中間座位是產品語言。** 諮商師不站在任何一方，所以坐在兩個人中間 —— 不要把他
  改成靠左的第三個泡泡。
- **引導是 mode 不是角色。** 引導與諮商師是同一個 Luma：同色、同頭像，靠 🧭 icon、
  `Luma・引導` label 與獨立的練習介面（`GuideSessionView`）區分。**不要為引導新增
  第四個角色或第四個顏色。**
- **不是發言者的東西不要長得像泡泡。** 情緒翻譯是掛在訊息下的註解（虛線內縮、無填
  色，見 `MessageTranslationCard`）；系統訊息是全寬分隔線。
- **規則講一次就好。** 第一次進對話用 `ThreadRoleLegend` 說明三個座位，關掉後不再
  出現（R4）；不要在每則訊息上加重視覺提示。
- **深色模式要一起顧。** 新增任何淺色底都要在 `src/index.css` 的 Engineer Mode 區塊
  補 `.dark` 覆寫，`npm run check:contrast` 會擋。

---

## §5 單一事實來源地圖（改 UX 前先查這張表）

| 主題 | 位置 |
|---|---|
| 功能介紹文案與 FAQ | `src/content/featureIntros.ts`（showroom `LoggedOutPreview.tsx` 尚未整併） |
| 錯誤/訊息規範 | 專案根 `CLAUDE.md`「User-facing messages & logging」 |
| AI 次數/方案 | `lib/entitlements.js`；次數端點 `routes/ai-usage.js` |
| AI 諮商師人設 | `lib/aiCompanions.js`（後端）+ `src/utils/aiCompanions.ts`（顯示） |
| AI 標點與風格 | `services/llm/claudeProvider.js` 的 `PUNCTUATION_RULE` |
| 設計 token | `tailwind.config.js`（petal 色票）；圖片永不裁切（CLAUDE.md） |
| 對話角色配色與座位 | `src/utils/threadRoles.ts`（見 §4 R8）；引導專注層 `src/components/GuideSessionView.tsx` |
| 按鈕樣式基準 | 實色=可點、40% 透明=disabled（2026-07-06 改版後的慣例） |
| 未配對提醒與邀請狀態 | `src/components/PairingReminderBanner.tsx` + `src/utils/pairingReminder.ts`（snooze/到期判斷）；邀請連結組法 `src/utils/pairingLink.ts` |

---

## §6 已決策事項（2026-07-07 由產品負責人拍板）

> 以下決策為定案，之後的 session 不需重新討論；要推翻需經人類同意並更新本節。

### Q1 「和諧相處」×「衝突事件」→ **合併成一個分頁** ✅
合併為一個正向命名的分頁（工作名「好好說話」，實作時可再敲定），內部子分頁：
「開啟對話（現衝突事件）」/「接住情緒與檢查（現和諧相處）」。主分頁從 6 減為 5。
對應 backlog：P1-1 升級為確定要做。

### Q2 未配對用戶 → **單人先體驗** ✅
被 gate 的頁面改為「單人模式」三段式（範例預覽＋邀請 CTA＋配對前可先做的事），
單人動作完成後輕推配對。對應 backlog：P0-3。

### Q3 幫助系統 → **FAQ 頁 + 各頁 (?) 提示** ✅
不做互動式 tour。文案與 logged-out showroom 共用單一來源
（`src/content/featureIntros.ts`）。對應 backlog：P0-4。

### Q4 AI 次數 → **用完前就顯示剩餘次數** ✅
AI 按鈕旁顯示「今日剩 N 次」；歸零時按鈕仍可點，點開是解釋＋升級/明日再來，
不是灰色死按鈕。對應 backlog：P1-2。

---

### 2026-07-08 新增決策：真實故事（智慧故事庫）
- 本輪範圍：引導模板故事＋搜尋＋跨情侶留言＋三種投票＋閱讀數/影響力統計＋發表即 AI 洞察＋3 枚社群徽章＋本週精選。社群投票（polls）與公開 API 為下一批。
- 新主分頁「真實故事」吸收公開問答（用掉最後一個主分頁名額）；心理諮商回歸純名錄。
- 審核：先發後審＋檢舉＋發表時 LLM 毒性標記（admin 後台「真實故事」panel 覆核）。
- 故事為「使用者」層級（未配對也能發表，呼應 Q2 單人模式）；匿名快照發表當下的 public_share_show_nickname。
- 新通知類型 `story_comment`；匿名閱讀數有每 IP 節流（routes/stories.js）。

---

*建立：2026-07-07；§6 決策同日拍板；2026-07-08 真實故事上線。§4 R1 摘要已合併進 CLAUDE.md。*
