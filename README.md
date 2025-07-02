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

## 🚀 快速開始

### 環境要求
- Node.js 18+ (前端)
- Rust 1.70+ (後端)
- PostgreSQL 15+ (數據庫)
- Docker & Docker Compose (可選，用於開發環境)

### 使用 Docker Compose (推薦)

```bash
# 克隆項目
git clone <repository-url>
cd Twogether

# 啟動完整開發環境
docker-compose up -d

# 訪問應用
# 前端: http://localhost:5173
# 後端 API: http://localhost:8080
# 數據庫管理: http://localhost:5050 (pgAdmin)
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