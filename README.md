# Twogether - 情侶親密時光記錄 App

A modern couples app for recording intimate moments, achievements, and relationship milestones. Now built with a cost-optimized single-server architecture using Node.js + React.

## ⚡ TL;DR - Get Started in 3 Commands

```bash
cp .env.example .env          # Copy and edit with your credentials
npm install                   # Install all dependencies
npm run build && npm run dev:backend
```

Then visit: http://localhost:8080

## 🎯 What's New - Single Server Architecture

✅ **Combined Architecture**: Frontend + Backend in one Node.js instance  
✅ **Cost Optimization**: From expensive App Engine Flex → Free-tier App Engine Standard  
✅ **Simplified Deployment**: One command builds and deploys everything  
✅ **Faster Cold Starts**: Node.js starts much faster than Rust  
✅ **No CORS Issues**: Same origin for frontend and backend

## Features

- **親密記錄**: Log intimate moments with mood, duration, location, and photos
- **成就系統**: Earn badges for milestones and achievements
- **角色扮演**: Custom roleplay scripts and scenarios with predefined templates
- **親密邀請系統**: Send and respond to intimacy requests with notifications
- **替代選項**: Alternative intimate activities when requests are declined
- **通知系統**: Real-time notifications for requests and responses
- **金幣商店**: Virtual currency system for rewards
- **配對系統**: Secure partner pairing with codes
- **統計分析**: Weekly/monthly intimacy statistics
- **隱私保護**: Secure authentication and data storage

## 📝 Changelog

User-facing feature changes, newest first. (Convention: every UI feature change
adds a dated entry here; see `CLAUDE.md`.)

### 2026-07-06
- **歷史事件卡片改版**: 事件歷史列表的卡片改為白色卡面＋柔和陰影，在米色背景上清楚浮起，
  不再與頁面底色融成一片；卡片間距與卡片內部留白統一，沒有摘要或標籤的卡片也不會再出現
  多餘的空白，整份列表看起來更整齊、更好掃讀。
- **事件簡介顯示在版本選擇頁最上方**: 讓 AI 整理完情緒後，選擇回覆版本的畫面現在會先顯示
  「事件簡介」——一段雙方都會看到的中性事件紀錄——再列出三個回覆版本，讓你先確認 AI 理解的
  事件經過，再決定怎麼開口。
- **中性旁白版不再與簡介重複**: 重新設計 AI 的分工——事件簡介只寫「發生了什麼事」（客觀事實、
  零情緒字眼），第三方中性旁白版則是「要傳給對方的開場訊息」（事件＋你的感受＋一句訊息收尾），
  兩者不再像雙胞胎。
- **送出前可以修改 AI 寫的訊息**: 選好版本後，下方會出現「送出前可以修改這段訊息」編輯框，
  改到滿意再送出；每個版本的修改各自保留，切換版本不會弄丟。改過的版本會標示「已編輯」。
- **送出後也能編輯**: 事件頁新增編輯功能——發起人可修改事件標題與簡介，雙方都可修改自己
  送出的訊息（點訊息旁的鉛筆）；修改過的內容會顯示「已編輯」讓對方知道，AI 諮商師留言與
  已解決的事件則不可修改。

### 2026-07-04
- **親密邀請帶上劇本資訊**: 由劇本發出的入戲邀請，現在會清楚標示是哪一部劇本——收邀請的一方
  在「親密邀請紀錄」列表與詳情中都會看到 🎭 劇本名稱與情境簡介，並可一鍵「查看劇本內容」直接
  跳到該劇本；Email 通知同樣附上劇本名稱、簡介與快速連結，另一半不再看到一句入戲台詞卻摸不著
  頭緒。
- **頁尾顯示版本資訊**: 網頁最下方新增一行版本列——版本號、環境、建置時間與 commit hash
  （例如 `v1.0.0 | production | 2026/7/4 上午10:19:51 | 5da817b`），每次部署自動更新，
  回報問題時附上這行即可精準對應到程式版本。
- **修正：AI 入戲邀請的視角跟著你的性別走**: 男性用戶產生的劇本邀請訊息，先前可能以劇中女主角
  的口吻撰寫（例如以女方視角說「我會準時回家」）。已強化 AI 的角色判斷——現在會先確認傳送者在
  劇本中扮演哪個角色，再以該角色的第一人稱撰寫全部訊息，並清除舊的錯誤快取，重新產生即可看到
  正確視角。
- **劇本庫升級：Google 文件匯入＋場景地點＋市集搜尋**: 上傳劇本時可直接貼上 Google 文件
  分享連結一鍵匯入內容（文件需開啟「知道連結的任何人皆可檢視」）；新增「場景地點」欄位
  （教室、辦公室、飯店⋯），我的劇本可用地點小標籤篩選；創作市集新增搜尋框，可依標題、
  情境、地點即時搜尋公開劇本。
- **AI 智慧辨識角色性別（Premium）**: 匯入或貼上含角色名的劇本後，Premium 用戶可一鍵讓
  AI 判斷每個角色是男是女並自動完成「角色對應」，劇本立即帶入你們的暱稱；免費用戶會看到
  清楚的升級說明，草稿不會遺失。
- **劇本角色自動帶入你們的暱稱（依性別）**: 劇本裡的 [男]／[他] 現在會帶入男方的暱稱、
  [女]／[她] 帶入女方的暱稱（在「設定」選好性別即可），不再固定「上傳者=男」。上傳劇本時
  貼上含角色名的內容（例如「小明：對白」），系統會自動偵測角色並讓你把每個角色指定為男／女，
  日後改暱稱或性別，劇本顯示也會跟著更新。伴侶雙方看同一份劇本，各自的暱稱都會出現在
  正確的角色上。
- **修正：親密記錄照片上傳真的能用了**: 上傳照片會 500（後端 SQL 用了資料表沒有的欄位），
  已改成對應實際的 `photos` 結構。現在新增記錄時上傳照片可正確保存並顯示。
- **編輯記錄也能換照片**: 從月曆點日期→編輯，按「更換照片」現在會真的上傳並更新照片
  （之前編輯時完全忽略照片變更）；清空照片也會一併移除。

### 2026-07-02
- **修正：親密記錄的照片終於顯示**: 之前上傳的照片因為上傳端點與紀錄的連結都壞掉，導致詳情
  與列表都看不到照片。現已修好——新記錄上傳的照片會正確保存並顯示在列表與詳情頁（需先配對，
  照片才存得下來）。
- **親密記錄顯示間隔天數**: 「記錄時光」的親密記錄列表，每一筆紀錄旁現在會顯示「距上次相隔
  N 天」，一眼看出你們的節奏變化。
- **周平均改為功能開關**: 「周平均」統計卡片預設隱藏，改由管理後台 (`/admin`) 的「功能開關」
  分頁即時開啟／關閉——這也是新的「功能開關」機制，之後的 UI 實驗都能藏在開關後面試用，
  不必重新部署。
- **月曆補滿上下月的日子**: 記錄時光的月檢視不再只顯示當月、月初月底留白，現在會把該週補滿的
  上個月／下個月日子也一起顯示（淡色呈現），這些日子上的紀錄（親密、月經、備孕）也看得到、
  也能點進去。例如 7/1 是週三時，同一列會看到 6/30 當天的紀錄，不再被藏起來。

### 2026-07-01
- **劇本圖片可在小圖直接翻頁**: 打開劇本 modal 後，不用再點進放大檢視，直接在預覽小圖上用
  左右箭頭或滑動就能瀏覽多張照片；點小圖仍可放大，放大檢視也支援滑動翻頁。
- **縮圖變大、標籤可篩選**: 「我的劇本」卡片縮圖放大（桌面更大、手機也比原本清楚），並新增
  「查看所有標籤」按鈕——展開後可點任一標籤（劇本的 tags）進一步過濾清單，預設收合不占空間。
- **角色扮演改用單一清單 + 篩選**: 「我的劇本」不再拆成「我的最愛／所有／自訂」三個區塊，改成
  一排篩選標籤（所有／浪漫／冒險／校園／大膽／我的最愛／自訂）過濾同一份清單；點「自訂」就只看
  自訂劇本、點「我的最愛」就只看收藏的劇本。搜尋、縮圖/清單切換、編輯／分享／查看／開始都保留，
  「上傳劇本」按鈕移到最上方。

### 2026-06-30
- **刪除自訂劇本**: 編輯自訂劇本時新增「刪除這個劇本」按鈕，二次確認後即可移除，不再需要保留
  不想要的劇本。
- **最近動態**: 個人選單新增「最近動態」分頁，一眼看見你與另一半最近的 20 筆互動紀錄——
  親密時光、上傳劇本、留言板、事件、成就、金幣與關係檢查，依時間排序並標示是「你」還是
  對方做的。
- **搜尋自訂劇本**: 自訂劇本區塊新增搜尋框，可用標題、情境或標籤快速找到劇本，劇本多也不怕。
- **重新整理保留分頁**: 重新整理頁面後會停留在原本的分頁（例如角色扮演），不再跳回記錄時光。
- **登出回到首頁**: 點擊登出後會清空畫面並回到未登入首頁，不再停在原本的設定／商店等頁面。
- **未登入月曆改用愛心**: 未登入首頁的範例月曆現在用 ♥ 標記親密時光（與登入後一致），
  並移除「心情」標記，讓圖例更貼近真實使用畫面。

### 2026-06-28
- **婚姻檢查**: 「和諧相處」新增「婚姻檢查」區塊 — 每隔一段時間，兩個人各自誠實為
  溝通、親密、家務、金錢、情緒支持、共同未來打分數，寫下想感謝對方的事與最想一起改善的，
  雙方都完成後一起揭曉並排呈現，AI 會像中立的第三方給出總結與可以一起聊的對話方向。
- **先接住情緒，溝通才開始**: 衝突事件的對話串新增「如何接住TA的情緒」按鈕 — 當對方
  表達情緒時，AI 會先幫你看見對方的感受，並給三句肯定、能被接受的回應，讓你先接住情緒、
  再談事情。「和諧相處」改以「先接住情緒」為主軸，移除了「相處練習」；原本的對話指引
  移到「親密邀請」裡的新類型「情緒指引」，可挑選想說的步驟與句子傳給對方。
- **最常出現的情緒 & 接住提示**: 衝突事件的分析新增「你最常出現的情緒」，點任一情緒即可
  看到這種情緒在表達什麼、可以怎麼接住，以及幾句可以直接說的話。
- **藍新金流 (NewebPay) 雙金流**: 升級 Premium 與預約付費視訊諮商時，現在可以選擇
  以「綠界 ECPay」或「藍新金流」付款，支援信用卡、LINE Pay、ATM 與超商代碼／條碼。
  兩種金流走相同的開通邏輯、購買天數一樣會累加堆疊。
- **未登入也能看方案**: 未登入首頁新增「Premium」分頁，直接呈現 30／90／365 天方案、
  價格與包含的權益，並可一鍵註冊或前往完整方案頁 (`/pricing`)。完整方案頁同步更新
  雙金流付款說明。

### 2026-06-25
- **愛的行動 & 好感存款明細**: The 愛的語言 result page now suggests 5 actions for
  your partner's love language and lets each partner keep a custom "what makes me
  feel loved" wishlist. The 關係之屋 好感存款 meter is now explainable — a 明細 view
  of what adds/costs goodwill (with the actual items + why), a (?) hint on the 5:1
  ratio, and a 檢視結果 view of past 關係檢視 scores for both partners.
- **心理諮商頁精簡**: 成為諮商師 moved to a low-key page footer, the separate
  therapist-login button was removed (therapists use the normal login), and the
  focus-area tags collapse to a few common ones behind a 更多 toggle.

### 2026-06-24
- **關係之屋 智能提醒儀表板**: A relationship-cultivation dashboard at the top of
  記錄時光 — one ranked nudge (intimacy gap / check-in due / goodwill / appreciation),
  a weekly 關係檢視 rating 信賴 / 奉獻 / 連結, and a 好感存款 (5:1) meter. In-app +
  email reminders go to both partners.
- **愛的語言測驗**: A 15-question quiz that finds your primary love language and
  saves it to your profile; you can see your partner's result too.

### 2026-06-23
- **未登入體驗改版**: Each nav tab now previews its own feature when logged out
  (sample calendar, the conflict-repair flywheel, real roleplay scripts), plus a
  「聽聽其他用戶怎麼說」testimonials section and a stats hook (周平均 / 已經幾天沒有親密了).
- **衝突事件 AI 諮商師 + 公開問答分享**: A「請 AI 諮商師加入」button brings an AI
  counselor into the conflict thread; conflict and wall threads can be shared
  anonymously to the public 公開問答.
- **親密提醒升級**: The「已經幾天沒有親密了」stat escalates (font + colour + a one-tap
  親密邀請) as the gap passes 7 / 10 / 12 / 15 days.
- **金幣商店移入 Profile**: Coin shop moved into the Profile menu so the Two*gether*
  logo renders fully on mobile.

## 📧 Email 通知

Email 由 `services/emailService.js` 統一寄送，所有信件共用 `_activityEmailHtml`
模板（簡潔表頭 + 引言區塊 + 單一 CTA）。

### 會發送 Email 的功能

| 功能 | 觸發時機 | 主旨（範例） | 受「Email 通知」開關控制 |
|---|---|---|---|
| 帳號註冊（歡迎 + 驗證） | 使用者完成註冊 | `🎉 歡迎加入 Twogether！請驗證你的 Email` | 否（交易型） |
| 重寄驗證信 | 使用者於提示橫幅按「重新寄送驗證信」 | `🎉 歡迎加入 Twogether！請驗證你的 Email` | 否（交易型，限流 60 秒） |
| 重設密碼 | 登入頁「忘記密碼？」送出 | `🔑 重設你的 Twogether 密碼` | 否（交易型，連結 1 小時有效） |
| 配對邀請 | 以 Email 邀請伴侶 / 重寄 | `💕 {名字} 邀請你加入 Twogether！` | 否（交易型） |
| 配對成功 | 對方接受配對邀請 | `🎉 {名字} 接受了你的配對邀請！` | 否（交易型） |
| 傳訊息給伴侶（含和解訊息） | 伴侶送出訊息／邀請 | `💌 {名字} 傳了一則訊息給你` | ⚠️ 否（直接寄給伴侶） |
| 邀請回應（接受／婉拒） | 伴侶回應你的訊息 | 接受／婉拒通知 | 是 |
| 親密互動洞察提醒（Nudge） | 主動寄出提醒 | `💞 {名字} 想和你聊聊彼此的親密時光` | ⚠️ 否（直接寄給伴侶） |
| 牆上留言／回覆 | 伴侶在牆上發文或回覆 | `💌 / 💬 / ⭐ {名字} …` | 是 |
| 事件通知 | 事件 建立／回覆／請求解決／已解決 | `📣 / 💬 / 🤝 / ✅ {名字} …` | 是 |
| 付款收據 | Premium 付款成功（ECPay callback） | `🧾 Twogether Premium 購買收據` | 否（交易型，寄給購買者） |
| 諮商「第一次預約」 | 使用者首次預約諮商 | `🗓️ {名字} 向你預約了諮商` + `🗓️ 你的諮商預約已送出`（雙方各一封） | 否（交易型） |
| 諮商師 Email 驗證 | 諮商師申請註冊 | `🩺 請驗證你的 Email · Twogether 諮商師申請` | 否（交易型） |

### 只有 App 內通知、不寄 Email 的功能

| 功能 | 說明 |
|---|---|
| 諮商室後續聊天訊息 | 第一次預約寄 Email，之後的對話只發 App 內通知（`consultation_message`） |
| 記錄親密時光 / 月經週期 | 只存資料 |
| 金幣商店兌換、自訂禮品 | 無 |
| 上傳／編輯自訂劇本、收藏、創作市集評分 | 無 |
| 情趣遊戲 / 前戲 / 姿勢 / 組合技 | 無 |
| 成就、里程碑、愛情旅程 | 無 |
| 升級頁 / 優惠碼兌換 | 無（付款成功才寄收據） |
| App 內通知（通知匣） | 站內通知，與 Email 各自獨立 |

> 「Email 通知」開關存於 `users.email_notifications_enabled`（設定頁可調），
> 控制牆上、事件、邀請回應。標記 ⚠️ 的兩種（傳訊息、洞察提醒）目前會繞過此開關
> 直接寄給伴侶。Email 驗證採**軟性**機制：未驗證仍可使用 App，只顯示提示橫幅。

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Lucide React for icons

### Backend
- Node.js with Express framework
- PostgreSQL database (Supabase)
- JWT authentication
- Supabase for file storage
- Docker containerization

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL (or Supabase account)
- Google Cloud CLI (for deployment)

### 1. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials (required before running)
```

### 2. Install Dependencies
```bash
# Install all dependencies (both frontend and backend)
npm install
```

### 3. Development Mode

#### Option A: With Cloud Database (Supabase)
```bash
# Build frontend first
npm run build

# Start combined server (uses cloud database)
npm run dev:backend

# Visit: http://localhost:8080
```

#### Option B: With Local PostgreSQL Database
```bash
# 1. Set up local PostgreSQL database
./scripts/setup-local-db.sh

# 2. Copy your .env to .env.local and update DATABASE_URL
cp .env .env.local
# Edit .env.local to use: DATABASE_URL=postgresql://twogether:twogether123@localhost:5432/twogether_dev

# 3. Run migrations to create tables
NODE_ENV=development npm run migrate

# 4. Build and start server
npm run build
NODE_ENV=development npm run dev:backend

# Visit: http://localhost:8080
```

#### Development with Hot Reload (For Frontend Changes)
```bash
# Terminal 1: Start backend API
npm run dev:backend

# Terminal 2: Start frontend dev server with hot reload
npm run dev

# Visit: http://localhost:5174 (proxies to backend on :8080)
```

### 4. Production Deployment

#### Automatic (GitHub Actions)
```bash
# Push to main branch triggers automatic deployment
git add .
git commit -m "Deploy update"
git push origin main
```

#### Manual Deployment
```bash
# Build frontend
npm run build

# Deploy to Google App Engine
gcloud app deploy

# Check deployment
gcloud app browse
```

## 🗄️ Local PostgreSQL Setup

For local development, you can use a local PostgreSQL database instead of the cloud database:

### Installation

**macOS (with Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Quick Setup
```bash
# Run the automated setup script
./scripts/setup-local-db.sh

# This creates:
# - Database: twogether_dev
# - User: twogether
# - Password: twogether123
# - Connection: postgresql://twogether:twogether123@localhost:5432/twogether_dev
```

### Manual Setup
```bash
# 1. Create database user
psql postgres -c "CREATE USER twogether WITH PASSWORD 'twogether123';"
psql postgres -c "ALTER USER twogether CREATEDB;"

# 2. Create database
createdb -O twogether twogether_dev

# 3. Update .env.local
echo "DATABASE_URL=postgresql://twogether:twogether123@localhost:5432/twogether_dev" >> .env.local

# 4. Run migrations
NODE_ENV=development npm run migrate
```

### Database Management
```bash
# Connect to local database
psql postgresql://twogether:twogether123@localhost:5432/twogether_dev

# Run migrations
npm run migrate

# Check migration status
npm run migrate:status

# Reset database (drops all tables)
psql twogether_dev -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
NODE_ENV=development npm run migrate
```

## 🧪 Database Setup for Different Environments

### Test Environment (Automated)
The test database is automatically set up when running tests:

```bash
# Run tests with automatic database setup
npm run test:backend

# The test script automatically:
# 1. Creates test database (twogether_test) if it doesn't exist
# 2. Runs all migrations to ensure schema is up to date
# 3. Optionally cleans existing data for fresh test runs
```

**Manual Test Database Setup:**
```bash
# Set up test database manually (if needed)
node scripts/setup-test-db.js

# Or clean and set up test database
node scripts/setup-test-db.js --clean

# Check test migration status
NODE_ENV=test npm run migrate:status
```

### Local Development Environment
```bash
# Quick setup (automated)
./scripts/setup-local-db.sh

# Manual setup
psql postgres -c "CREATE USER twogether WITH PASSWORD 'twogether123';"
psql postgres -c "ALTER USER twogether CREATEDB;"
createdb -O twogether twogether_dev

# Run migrations for local development
NODE_ENV=development npm run migrate

# Check local development migration status
NODE_ENV=development npm run migrate:status
```

### Production Environment
```bash
# Production database setup (usually managed by cloud provider)
# For Supabase: Database is auto-created, just run migrations

# Run production migrations (if using custom PostgreSQL)
NODE_ENV=production npm run migrate

# Check production migration status
NODE_ENV=production npm run migrate:status
```

### Database Environments Summary

| Environment | Database Name | Environment File | Auto-Setup |
|-------------|---------------|------------------|-----------|
| **Test** | `twogether_test` | `.env.test` | ✅ Automatic (during tests) |
| **Local Dev** | `twogether_dev` | `.env.local` | ⚙️ Manual (run script) |
| **Production** | (Cloud managed) | `.env` | 🌐 Cloud provider |

### Database Configuration Files
- **Test**: `.env.test` - Contains `DATABASE_URL` for test database
- **Local Development**: `.env.local` - Contains `DATABASE_URL` for local PostgreSQL
- **Production**: `.env` - Contains `DATABASE_URL` for cloud database (Supabase)

## 📋 Development Commands

### Quick Reference
```bash
# Development
npm run build              # Build frontend for production
npm run dev               # Start frontend dev server with hot reload
npm run dev:backend       # Start backend API server
npm start                 # Start production server

# Testing
npm test                  # Run all tests (backend + E2E)
npm run test:backend      # Run backend tests only
npm run test:e2e          # Run E2E tests only
npm run test:e2e:ui       # Run E2E tests with UI

# Linting & Code Quality
npm run lint              # Lint TypeScript/JavaScript code
```

## 📁 Project Structure

```
twogether/
├── server.js              # Main Express server (serves API + frontend)
├── package.json           # Combined dependencies (frontend + backend)
├── app.yaml               # App Engine Standard config
├── vite.config.ts         # Vite frontend build configuration
├── index.html             # HTML entry point
├── src/                   # React source code
│   ├── App.tsx            # Main React component
│   ├── components/        # React components
│   └── services/          # API service layer
├── dist/                  # Built React app (auto-generated)
├── routes/                # Backend API routes (auth, couples, etc.)
├── database/              # PostgreSQL connection
├── middleware/            # Auth & validation middleware
├── tailwind.config.js     # Tailwind CSS configuration
├── tsconfig.json          # TypeScript configuration
└── cloudbuild.yaml        # Google Cloud Build configuration
```

## Environment Variables

### Required Variables
```env
# Database (required)
DATABASE_URL=postgresql://user:password@localhost/twogether

# JWT Authentication
JWT_SECRET=your-long-random-secret-key

# Supabase (required for storage features)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Server Configuration
NODE_ENV=production
PORT=8080
CORS_ORIGIN=http://localhost:5174

# Email (optional, for notifications)
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=Twogether <no-reply@example.com>

# Admin funnel dashboard (gates /admin and /api/admin/*)
ADMIN_PASSWORD=pick-a-long-random-password
```

## 🔧 Supabase Setup

### 1. Create Supabase Project
1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project
3. Note your Project URL and Service Role Key

### 2. Create Storage Bucket
1. Go to **Storage** in Supabase dashboard
2. Create a bucket named `photos`
3. Enable **Public bucket** for direct image access

### 3. Update Environment
Add your Supabase credentials to `.env`:
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 🔒 Security Best Practices

### Environment Security
- ✅ **DO**: Use `.env` file for all secrets
- ✅ **DO**: Use different secrets for development and production
- ❌ **DON'T**: Commit `.env` file to version control
- ❌ **DON'T**: Share your `SUPABASE_SERVICE_ROLE_KEY`

### Password Security
- ✅ **DO**: Use long, random strings for `JWT_SECRET` (minimum 32 characters)
- ✅ **DO**: Use strong passwords for database
- ✅ **DO**: Rotate secrets regularly in production

## API Endpoints

All API routes are prefixed with `/api/`:

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Couples
- `GET /api/couples` - Get couple information
- `POST /api/couples` - Create or join couple (with pairing code)
- `POST /api/couples/generate-pairing-code` - Generate pairing code
- `PUT /api/couples/nicknames` - Update partner nicknames
- `PUT /api/couples/journey` - Update couple journey milestones

### Love Moments
- `GET /api/love-moments` - Get all records
- `POST /api/love-moments` - Create new record
- `GET /api/love-moments/{id}` - Get specific record
- `PUT /api/love-moments/{id}` - Update record
- `DELETE /api/love-moments/{id}` - Delete record

### Photos
- `POST /api/photos/upload` - Upload photo to Supabase
- `GET /api/photos` - Get photo listings

### Achievements & Coins
- `GET /api/achievements` - Get achievements
- `GET /api/coins/balance` - Get coin balance
- `POST /api/coins/transactions` - Coin transactions

### Statistics
- `GET /api/stats` - Get user statistics
- `GET /api/stats/leaderboard` - Get leaderboard

### Intimacy Requests
- `GET /api/intimacy-requests` - Get intimacy requests
- `POST /api/intimacy-requests` - Create intimacy request
- `PUT /api/intimacy-requests/:id/respond` - Respond to intimacy request
- `DELETE /api/intimacy-requests/:id` - Delete intimacy request

### Intimacy Templates & Options
- `GET /api/intimacy-requests/intimacy-templates` - Get all intimacy templates
- `GET /api/intimacy-requests/intimacy-templates/:category` - Get templates by category
- `GET /api/intimacy-requests/alternative-intimacy-options` - Get alternative intimacy options

### Notifications
- `GET /api/intimacy-requests/notifications` - Get user notifications
- `PUT /api/intimacy-requests/notifications/mark-read` - Mark notifications as read
- `GET /api/intimacy-requests/notifications/unread-count` - Get unread count
- `GET /api/intimacy/notifications/unread-count` - Alternative endpoint for frontend compatibility

## 🚀 Development Workflow

### Scripts Available
```bash
# Development
npm run dev              # Start backend API server
npm run dev:frontend     # Start frontend with hot reload

# Production
npm run build            # Build frontend to /public
npm run start            # Start production server

# Utilities
npm run install:all      # Install all dependencies
npm run test            # Run tests
```

## 🌐 Architecture Benefits

### Cost Optimization
- **Before**: App Engine Flex ~$50-100/month (always-on instances)
- **After**: App Engine Standard ~$0-5/month (scales to zero, free tier)

### Performance
- **Cold Start**: Node.js ~1-2s vs Rust ~5-10s
- **Memory**: Lower memory usage with combined instance
- **Network**: No inter-service calls (frontend ↔ backend)

### Development
- **Single Deploy**: One command deploys everything
- **Shared Dependencies**: No version mismatches
- **Simplified CORS**: No cross-origin issues in production

## 🐛 Troubleshooting

### Common Issues

#### 1. Environment Setup
```bash
# Check if .env file exists
ls -la .env

# Verify environment variables are set
cat .env | grep -E "(DATABASE_URL|JWT_SECRET|SUPABASE_URL)"

# Create .env from template if missing
cp .env.example .env
```

#### 2. Database Connection Issues
```bash
# Test database connection (requires psql)
psql $DATABASE_URL -c "SELECT NOW();"

# Check DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://user:pass@host:port/database
```

#### 3. Port Issues
```bash
# Check what's running on port 8080
lsof -i :8080

# Kill processes on port 8080
lsof -ti:8080 | xargs kill -9

# Or use a different port
PORT=8081 node server.js
```

#### 4. Frontend Build Issues
```bash
# Clean and rebuild frontend
rm -rf dist
npm run build

# Check build output
ls -la dist/
```

#### 5. Dependencies Issues
```bash
# Clean install all dependencies
rm -rf node_modules
npm install
```

#### 6. Deployment Issues
```bash
# Check Google Cloud auth
gcloud auth list

# Set project
gcloud config set project YOUR_PROJECT_ID

# Check App Engine status
gcloud app describe

# View deployment logs
gcloud app logs tail -s default
```

### Health Checks

#### Local Development
```bash
# Test backend health
curl http://localhost:8080/health

# Test API endpoint (if exists)
curl http://localhost:8080/api/auth/me

# Expected health response:
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development",
  "version": "1.0.0"
}
```

#### Production
```bash
# Test production health (replace with your domain)
curl https://your-project.uc.r.appspot.com/health

# Check Google Cloud Console for logs and metrics
```

### Debug Mode
```bash
# Start backend with debug logging
DEBUG=* npm run dev:backend

# Or specific debug namespace
DEBUG=express:* npm run dev:backend

# Start frontend in development mode for debugging
npm run dev
```

## 🔍 Monitoring

- **Health Endpoint**: `/health` for uptime monitoring
- **App Engine Logs**: Centralized logging in Google Cloud Console
- **Error Tracking**: Automatic error logging
- **Performance**: Built-in App Engine metrics

### Querying email failures in Cloud Logging

All server code uses `lib/logger.js`, which emits one structured JSON entry
per call. SMTP errors come with `jsonPayload.code` (e.g. `EAUTH`),
`jsonPayload.kind` (`pairing_invite`, `intimacy_request`, `wall_post`,
`event`, `intimacy_response`, etc.), and `jsonPayload.responseCode`.

```bash
# Tail email-related errors in real time
gcloud app logs tail -s default --project=$GCP_PROJECT_ID \
  | grep -iE 'smtp|email'

# Pull the last 24h of email errors as structured rows
gcloud logging read \
  'resource.type="gae_app" AND severity>=ERROR AND jsonPayload.message=~"email|SMTP"' \
  --project=$GCP_PROJECT_ID --limit=50 --freshness=24h \
  --format='value(timestamp, jsonPayload.message, jsonPayload.code, jsonPayload.kind, jsonPayload.err)'

# Find auth failures specifically (typical when the App Password is wrong
# or hasn't been redeployed)
gcloud logging read \
  'resource.type="gae_app" AND jsonPayload.code="EAUTH"' \
  --project=$GCP_PROJECT_ID --limit=20 --freshness=7d
```

### Verifying SMTP credentials locally

Before deploying a new `SMTP_PASS`, confirm the credential works against
Gmail without sending any user-facing email:

```bash
# Auth check only (TLS handshake + AUTH)
node scripts/verify-smtp.js

# Auth check + send a real test email
node scripts/verify-smtp.js --to you@example.com
```

The script never prints the password (only a length + first/last char) and
exits non-zero on failure.

> ⚠️ **Production note**: Updating `SMTP_PASS` in the GitHub secret only
> takes effect on the *next* `gcloud app deploy` — App Engine env vars are
> substituted from `_SMTP_PASS` at deploy time. After rotating the
> credential, push to `main` (or run the deploy workflow manually) before
> expecting prod emails to start flowing.

## 💰 Cost Breakdown & Optimization

This project uses the following GCP services and their associated costs:

### Service Cost Distribution

**Current Monthly Cost: ~$3-8/month** (varies with usage)

| Service | % of Cost | Monthly Estimate | What It's For |
|---------|-----------|------------------|---------------|
| **Artifact Registry** | ~40-50% | $0.30-0.50 | Stores Docker images from deployments |
| **Cloud Build** | ~30-40% | $0.50-2.00 | Builds and deploys app on each push to main |
| **App Engine Standard** | ~10-20% | $0-0.50 | Hosts the application (F1 instance) |
| **Cloud Storage** | ~5-10% | $0.10-0.30 | GitHub Actions artifacts & logs |

**Note**: Supabase (database & file storage) costs are separate and not included above.

### Cost Optimization Tips

#### 1. Reduce Artifact Registry Storage (Save ~60%)
```bash
# Set up automatic cleanup policy (keeps last 5 images only)
gcloud artifacts repositories set-cleanup-policies gae-standard \
  --location=asia-east1 \
  --policy=cleanup-policy.json

# Create cleanup-policy.json:
{
  "rules": [{
    "id": "keep-recent-5",
    "action": "KEEP",
    "mostRecentVersions": {
      "keepCount": 5
    }
  }, {
    "id": "delete-old",
    "action": "DELETE",
    "olderThan": "7d"
  }]
}

# Or manually delete old images
gcloud artifacts docker images list \
  asia-east1-docker.pkg.dev/twogether-couples-app/gae-standard \
  --format="value(IMAGE)" | head -n -5 | xargs -I {} gcloud artifacts docker images delete {} --quiet
```

#### 2. Reduce Build Frequency (Save ~70%)
Your GitHub Actions currently triggers on every push to main. Consider:
- **Batching commits**: Push less frequently, or use feature branches
- **Skip CI for docs**: Add `[skip ci]` to commit messages for documentation-only changes
- **Use pull requests**: Test on PRs before merging to main (workflow already has this)

#### 3. Monitor Build Status
```bash
# Check recent builds
gcloud builds list --limit=10

# Check artifact registry usage
gcloud artifacts repositories describe gae-standard --location=asia-east1

# View current costs
# Visit: https://console.cloud.google.com/billing/
```

#### 4. App Engine Optimization
Your current setup is already optimized:
- ✅ Using App Engine Standard (not Flex) - saves ~$50/month
- ✅ `min_instances: 0` - scales to zero when idle
- ✅ `max_instances: 1` - prevents unexpected scaling
- ✅ `instance_class: F1` - smallest instance size

### Why Costs Increased Recently

Common causes of cost spikes:
1. **Multiple failed builds**: Failed builds still consume Cloud Build minutes and create artifacts
2. **Accumulated Docker images**: Old images not cleaned up (currently 3.26 GB)
3. **Frequent deployments**: 20 builds in 2 days = excessive Cloud Build usage
4. **Build timeouts**: Timeout builds (15 min each) consume maximum minutes

### Cost Monitoring Dashboard

Track your costs in real-time:
1. Go to [GCP Billing Dashboard](https://console.cloud.google.com/billing/)
2. Set up budget alerts for > $10/month
3. Enable cost breakdown by service

![Cost Breakdown Graph](https://i.imgur.com/example.png)

### Expected Costs by Usage Level

| Usage Level | Monthly Cost | Details |
|-------------|--------------|---------|
| **Development** | $0-2 | Few deployments, free tier covers most |
| **Light Production** | $2-5 | 1-2 deployments/week, minimal traffic |
| **Active Production** | $5-15 | Daily deployments, moderate traffic |
| **Heavy Production** | $15+ | Multiple daily deployments, high traffic |

**Pro Tip**: Most production apps with 100-500 MAU stay under $5/month with proper optimization.

## 🎛️ Scaling

The app is designed for small to medium couple user bases:

- **Free Tier**: ~1000 MAU with basic usage
- **Paid Tier**: Scales automatically based on traffic
- **Database**: PostgreSQL on Supabase (separate scaling)
- **Storage**: Supabase Storage (separate scaling)

## 📊 E2E Testing Checklist

To verify everything is working:

1. 註冊兩個帳號 → 登入 A
2. 透過 `配對碼` 或 email 完成配對 → 登入 B 確認
3. 在 A 端發送「親密邀請」→ B 端通知中心可看到
4. B 端輸入自訂回覆並「接受」→ A 端收到通知、可見回覆文字

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- Use TypeScript for all code; prefer interfaces over types
- Use functional and declarative programming patterns
- Write concise, technical code with accurate examples
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, email support@twogether.app or create an issue in this repository.