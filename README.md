# Twogether - 情侶親密追蹤應用

一個現代化的情侶親密關係追蹤應用，幫助情侶記錄美好時光、建立親密連接，並通過遊戲化的方式增進感情。

## 🌟 功能特色

### 核心功能
- **愛的時光記錄** - 記錄親密時刻，包含日期、時間、心情、照片和詳細描述
- **智能暱稱系統** - 個性化的暱稱設定，讓記錄更加溫馨
- **照片管理** - 上傳和管理美好回憶的照片
- **數據持久化** - 完整的後端數據庫支持，數據永不丟失

### 進階功能
- **成就徽章系統** - 解鎖各種情侶成就，增加趣味性
- **愛情硬幣** - 通過記錄獲得硬幣，兌換特殊獎勵
- **角色扮演模式** - 內建多種情趣劇本，增加生活樂趣
- **統計分析** - 詳細的親密度統計和趨勢分析
- **日曆視圖** - 直觀的月曆顯示所有重要時刻

## 🏗️ 技術架構

### 前端 (Frontend)
- **框架**: React 18 + TypeScript + Vite
- **樣式**: Tailwind CSS
- **圖標**: Lucide React
- **狀態管理**: React Hooks (useState, useEffect, useCallback)
- **API集成**: Axios + 雙模式支持 (localStorage/Backend API)
- **響應式設計**: 完全適配移動端和桌面端

### 後端 (Backend)
- **語言**: Rust
- **框架**: Axum (現代異步Web框架)
- **數據庫**: PostgreSQL 15
- **ORM**: SQLx (編譯時檢查的SQL查詢)
- **認證**: JWT (JSON Web Tokens)
- **API設計**: RESTful API

### 數據庫架構
- **用戶管理**: 用戶註冊、登錄、配對系統
- **愛的時光**: 完整的親密記錄存儲
- **成就系統**: 徽章和里程碑追蹤
- **硬幣系統**: 交易記錄和餘額管理
- **照片存儲**: 文件管理和元數據存儲

## 🎯 最新改進

### ✅ **增強日誌記錄與錯誤處理**
- 詳細的請求/響應日誌記錄，包含執行時間
- 中英文友好的錯誤提示信息
- 結構化日誌，支持多種級別 (debug, info, warn, error)
- 日誌文件輸出 (`logs/backend.log`, `logs/frontend.log`) 便於調試
- 改進的 API 錯誤處理，提供具體錯誤代碼和用戶友好消息

### ✅ **改進用戶界面**
- 登錄/註冊移至右上角標頭 (符合行業標準)
- 專業的標頭組件，包含用戶下拉菜單
- 增強的通知系統，更好的錯誤顯示
- 清晰的模塊化組件分離
- 更好的響應式設計和可訪問性

### ✅ **Supabase 雲端存儲集成**
- 照片存儲從數據庫 BLOB 遷移到 Supabase 雲端存儲
- 更好的性能和可擴展性
- 免費套餐限額充足 (1GB 存儲, 2GB 流量)
- 全球 CDN 自動加速照片載入
- 詳見 [SUPABASE_SETUP.md](SUPABASE_SETUP.md)

### ✅ **本地開發環境優化**
- 解決 Docker 編譯問題，推薦本地開發
- 使用 `./start-dev.sh` 一鍵啟動開發環境
- PostgreSQL 運行在 Docker，後端+前端本地運行
- SQLx 離線模式，加快編譯速度
- 完整的數據庫遷移系統

## 🚀 快速開始

### 環境要求
- Node.js 18+ (前端)
- Rust 1.70+ (後端)
- PostgreSQL 15+ (數據庫)
- Docker & Docker Compose (用於數據庫)
- Supabase 帳號 (用於照片存儲)

### 本地開發環境 (推薦)

```bash
# 1. 克隆項目
git clone <repository-url>
cd Twogether

# 2. 設置 Supabase 存儲
# 請參考 SUPABASE_SETUP.md 詳細指南
# 然後更新 start-dev.sh 中的憑證

# 3. 啟動開發環境
./start-dev.sh

# 訪問應用
# 前端: http://localhost:5173
# 後端 API: http://localhost:8080
# 數據庫管理: http://localhost:5050 (pgAdmin)
```

### Docker Compose (有編譯問題)

⚠️ **注意**: Docker 構建目前有 Rust 依賴問題，建議使用本地開發環境。

```bash
# 如果要嘗試 Docker (可能失敗)
docker-compose up --build
```

### 手動安裝

#### 1. 數據庫設置
```bash
# 安裝並啟動 PostgreSQL
createdb twogether_dev
```

#### 2. 後端設置
```bash
cd backend

# 安裝 SQLx CLI
cargo install sqlx-cli --features postgres

# 設置環境變量
export DATABASE_URL="postgresql://username:password@localhost:5432/twogether_dev"

# 運行數據庫遷移
sqlx migrate run

# 啟動後端服務
cargo run
```

#### 3. 前端設置
```bash
cd frontend

# 安裝依賴
npm install

# 啟動開發服務器
npm run dev
```

## 🚀 To start the development servers:

```bash
# Option 1: Use our convenient script
./scripts/dev-start.sh backend    # Terminal 1
./scripts/dev-start.sh frontend   # Terminal 2

# Option 2: Manual startup
cd backend && DATABASE_URL="postgresql://twogether:twogether_dev_password@localhost:5432/twogether_dev" cargo run
cd frontend && npm run dev
```

## 📋 View Logs

### Backend Logs
```bash
# If running with cargo run - check the terminal where backend is running
# If using Docker Compose:
docker compose logs backend
docker compose logs -f backend  # Follow logs in real-time
```

### Frontend Logs  
```bash
# If running with npm run dev - check the terminal where frontend is running
# If using Docker Compose:
docker compose logs frontend
docker compose logs -f frontend  # Follow logs in real-time
```

### Database Logs
```bash
docker compose logs postgres
docker compose logs -f postgres  # Follow logs in real-time
```

### All Container Logs
```bash
docker compose logs           # All logs
docker compose logs -f        # Follow all logs in real-time
docker compose logs --tail=50 # Last 50 lines from all services
```

## 🔧 Process Management

### Check Running Processes
```bash
# Check what's running on port 8080
lsof -i :8080

# Check all Twogether processes  
ps aux | grep twogether

# Check Docker containers
docker compose ps
```

### Kill Processes
```bash
# Kill specific process by PID
kill <PID>

# Kill all processes on port 8080
lsof -ti:8080 | xargs kill -9

# Kill by process name
pkill -f twogether-backend

# Stop Docker containers
docker compose down
```

### Troubleshooting "Address already in use"
```bash
# 1. Check what's using the port
lsof -i :8080

# 2. Kill the process
kill <PID_from_step_1>

# 3. Or kill all processes on port 8080
lsof -ti:8080 | xargs kill -9

# 4. Then restart your service
cd backend && DATABASE_URL="postgresql://twogether:twogether_dev_password@localhost:5432/twogether_dev" cargo run
```

## 📁 項目結構

```
Twogether/
├── frontend/                 # React 前端應用
│   ├── src/
│   │   ├── components/       # React 組件
│   │   ├── services/         # API 服務層
│   │   └── App.tsx          # 主應用組件
│   ├── public/              # 靜態資源
│   └── package.json         # 前端依賴
├── backend/                 # Rust 後端 API
│   ├── src/
│   │   ├── routes/          # API 路由
│   │   ├── models/          # 數據模型
│   │   ├── services/        # 業務邏輯
│   │   └── main.rs          # 後端入口
│   ├── migrations/          # 數據庫遷移
│   └── Cargo.toml           # 後端依賴
├── docker-compose.yml       # 開發環境編排
└── README.md               # 項目文檔
```

## 🔧 開發指南

### API 端點

#### 認證
- `POST /api/auth/register` - 用戶註冊
- `POST /api/auth/login` - 用戶登錄
- `GET /api/auth/me` - 獲取用戶信息

#### 愛的時光
- `GET /api/love-moments` - 獲取記錄列表
- `POST /api/love-moments` - 創建新記錄
- `GET /api/love-moments/:id` - 獲取單個記錄
- `GET /api/love-moments/stats` - 獲取統計數據

#### 其他功能
- `GET /api/achievements` - 獲取成就列表
- `GET /api/coins/balance` - 獲取硬幣餘額
- `POST /api/photos` - 上傳照片

### 前端架構特點

#### 完整後端 API 集成
```typescript
// 完全使用後端 API 進行數據管理
const response = await apiClient.get('/love-moments');
return response.data.map(transformApiRecord);

// 包含錯誤處理和用戶友好提示
try {
  await apiService.createIntimateRecord(data);
} catch (error) {
  showNotification({
    type: 'warning',
    title: '記錄失敗',
    message: '無法保存記錄，請稍後再試'
  });
}
```

#### 組件化設計
- `SettingsView.tsx` - 設置頁面組件
- `RoleplayView.tsx` - 角色扮演組件
- 避免組件內部定義，防止重複渲染

### 後端架構特點

#### 類型安全的 SQL
```rust
// 編譯時檢查的 SQL 查詢
let moments = sqlx::query!(
    "SELECT * FROM love_moments WHERE couple_id = $1",
    couple_id
).fetch_all(&pool).await?;
```

#### 現代 Rust 異步
```rust
// 基於 Tokio 的異步處理
#[tokio::main]
async fn main() -> Result<()> {
    let app = create_app().await?;
    axum::Server::bind(&addr).serve(app).await?;
}
```

## 🎯 核心功能演示

### 1. 愛的時光記錄
- 日期時間選擇
- 心情表情選擇
- 詳細描述和備註
- 照片上傳和預覽
- 地點和持續時間記錄

### 2. 數據可視化
- 月度統計圖表
- 親密度趨勢分析
- 成就進度追蹤
- 硬幣獲得歷史

### 3. 遊戲化元素
- 連續記錄獎勵
- 成就徽章解鎖
- 愛情硬幣系統
- 等級提升機制

## 🔒 安全特性

- JWT 身份驗證
- PostgreSQL 參數化查詢防止 SQL 注入
- CORS 跨域保護
- 密碼哈希存儲
- 用戶數據隔離

## 📊 性能優化

- React useCallback 防止不必要重渲染
- PostgreSQL 索引優化
- 圖片壓縮和優化
- 異步數據加載
- 響應式圖片處理

## 🤝 貢獻指南

1. Fork 項目
2. 創建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

## 📄 許可證

本項目使用 MIT 許可證 - 查看 [LICENSE](LICENSE) 文件了解詳情。

## 🙏 致謝

- React 社區提供的優秀生態系統
- Rust 社區的 Axum 和 SQLx 項目
- Tailwind CSS 的美觀設計系統
- PostgreSQL 的可靠數據存儲

---

**讓愛情更有趣，讓回憶更珍貴** ❤️ 

## 💝 配對流程說明

### 步驟 1：用戶註冊/登錄
1. 第一個用戶註冊帳號（例如：用戶A）
2. 登錄後會看到未配對狀態
3. 在設置頁面可以生成配對碼

### 步驟 2：生成配對碼
1. 用戶A在設置頁面點擊「生成配對碼」
2. 系統生成8位字母數字組合（例如：X5RX6S7D）
3. 配對碼有效期24小時
4. 將配對碼分享給伴侶（用戶B）

### 步驟 3：伴侶配對
1. 用戶B需要先註冊自己的帳號
2. 登錄後在設置頁面輸入配對碼
3. 點擊「配對」按鈕
4. 系統驗證配對碼並建立伴侶關係

### 預期行為
- ✅ 配對成功後，兩個用戶都會看到「已與伴侶連接」狀態
- ✅ 可以開始記錄和分享愛的時光
- ✅ 數據會在兩個帳號間同步
- ✅ 配對碼會被標記為已使用

### 常見問題排查

#### 問題：配對後顯示登錄頁面
**原因**：前端在配對成功後沒有正確更新認證狀態
**解決方案**：
1. 檢查瀏覽器控制台是否有錯誤
2. 確認 API 響應包含正確的用戶信息
3. 檢查 localStorage 中的認證狀態
4. 重新刷新頁面嘗試

#### 問題：配對碼無效
**可能原因**：
- 配對碼已過期（24小時後失效）
- 配對碼已被使用
- 輸入錯誤（區分大小寫）
- 生成配對碼的用戶已有伴侶

#### 問題：無法生成配對碼
**可能原因**：
- 用戶已有配對的伴侶
- 已有未過期的配對碼存在
- 認證 token 無效

## 🧪 測試用例

### 後端測試

#### 配對碼生成測試
```bash
# 測試生成配對碼（需要有效的 JWT token）
curl -X POST http://localhost:8080/api/couples/pairing-code \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>"

# 預期響應：
{
  "code": "X5RX6S7D",
  "expires_at": "2025-07-04T13:28:47Z"
}
```

#### 使用配對碼創建伴侶關係
```bash
# 測試使用配對碼配對
curl -X POST http://localhost:8080/api/couples \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <partner-jwt-token>" \
  -d '{"pairing_code": "X5RX6S7D"}'

# 預期響應：
{
  "id": "uuid",
  "couple_name": null,
  "anniversary_date": null,
  "user1_nickname": "用戶A暱稱",
  "user2_nickname": "用戶B暱稱",
  "created_at": "2025-07-03T13:28:47Z",
  "pairing_code": null
}
```

#### 錯誤情況測試
```bash
# 測試過期/無效配對碼
curl -X POST http://localhost:8080/api/couples \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{"pairing_code": "INVALID1"}'

# 預期響應：
{
  "error": {
    "code": "NOT_FOUND",
    "message": "配對碼無效或已過期"
  }
}
```

### 前端測試

#### 手動測試流程
1. **用戶A註冊測試**
   - 郵箱：`user-a@test.com`
   - 暱稱：`測試用戶A`
   - 密碼：`password123`

2. **生成配對碼**
   - 登錄後進入設置頁面
   - 點擊「生成配對碼」
   - 驗證配對碼顯示

3. **用戶B註冊測試**
   - 郵箱：`user-b@test.com`
   - 暱稱：`測試用戶B`
   - 密碼：`password123`

4. **配對測試**
   - 用戶B登錄後進入設置頁面
   - 輸入用戶A的配對碼
   - 點擊「配對」
   - 驗證配對成功消息
   - 檢查是否正確更新認證狀態

#### 自動化測試
```javascript
// 配對流程端到端測試
describe('Pairing Flow', () => {
  it('should complete pairing process successfully', async () => {
    // 1. 用戶A註冊
    const userA = await registerUser('user-a@test.com', '測試用戶A', 'password123');
    
    // 2. 生成配對碼
    const pairingCode = await generatePairingCode(userA.token);
    expect(pairingCode.code).toMatch(/^[A-Z0-9]{8}$/);
    
    // 3. 用戶B註冊
    const userB = await registerUser('user-b@test.com', '測試用戶B', 'password123');
    
    // 4. 使用配對碼配對
    const coupleResult = await pairWithCode(userB.token, pairingCode.code);
    expect(coupleResult.user1_nickname).toBe('測試用戶A');
    expect(coupleResult.user2_nickname).toBe('測試用戶B');
    
    // 5. 驗證配對狀態
    const userACouple = await getCouple(userA.token);
    const userBCouple = await getCouple(userB.token);
    expect(userACouple.id).toBe(userBCouple.id);
  });
});
```