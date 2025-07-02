# Twogether Frontend

現代化的 React + TypeScript 前端應用，為情侶提供親密關係追蹤和管理功能。

## 🚀 技術棧

- **框架**: React 18 + TypeScript + Vite
- **樣式**: Tailwind CSS
- **圖標**: Lucide React
- **狀態管理**: React Hooks (useState, useEffect, useCallback)
- **HTTP 客戶端**: Axios
- **構建工具**: Vite (開發服務器運行在 5174 端口)

## 📁 項目結構

```
frontend/
├── src/
│   ├── components/           # React 組件
│   │   ├── SettingsView.tsx  # 設置頁面組件
│   │   └── RoleplayView.tsx  # 角色扮演組件
│   ├── services/             # API 服務層
│   │   └── api.ts           # 雙模式 API 服務
│   ├── App.tsx              # 主應用組件
│   └── main.tsx             # 應用入口點
├── public/                  # 靜態資源
├── package.json             # 依賴配置
├── tailwind.config.js       # Tailwind CSS 配置
├── tsconfig.json           # TypeScript 配置
└── vite.config.ts          # Vite 配置
```

## 🔧 核心功能

### 📱 主要組件

#### App.tsx - 主應用
- 完整的單頁應用 (SPA) 架構
- 標籤式導航 (愛的日曆、統計、遊戲、設置等)
- 響應式設計，適配移動端和桌面端
- 完整的狀態管理和數據持久化

#### 組件分離架構
- `SettingsView.tsx` - 暱稱設置和用戶偏好
- `RoleplayView.tsx` - 角色扮演劇本管理
- 避免組件內部定義，防止 React 重複渲染問題

### 🔌 API 服務層 (services/api.ts)

#### 完整後端集成
```typescript
// 完全使用後端 API 進行數據管理
const response = await apiClient.get('/love-moments');
return response.data.map(this.transformApiRecord);

// 錯誤處理和用戶提示
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

#### 支持的 API 操作
- **愛的時光記錄**: CRUD 操作
- **暱稱管理**: 個性化設置
- **硬幣系統**: 餘額查詢和交易
- **成就系統**: 徽章和進度追蹤
- **健康檢查**: 後端連接狀態

### 💾 數據管理

#### 本地存儲 (localStorage)
- 完整的離線功能支持
- 自動數據序列化/反序列化
- 錯誤處理和數據恢復

#### 後端集成
- RESTful API 調用
- JWT 認證支持 (準備中)
- 實時數據同步
- 錯誤處理和重試機制

## 🎨 UI/UX 設計

### 🎯 設計原則
- **溫馨浪漫**: 暖色調和柔和的漸變
- **直觀易用**: 清晰的導航和操作流程
- **響應式**: 完美適配各種設備尺寸
- **無障礙**: 符合 Web 無障礙標準

### 🎨 視覺元素
- **色彩**: 粉色漸變主題 (#FF6B9D 到 #FF8CC8)
- **圖標**: Lucide React 提供的現代圖標
- **動畫**: 流暢的過渡效果和微交互
- **表情符號**: 豐富的心情表達選項

### 📱 響應式設計
```css
/* 移動端優先設計 */
.container {
  @apply px-4 py-6;
}

/* 桌面端適配 */
@media (min-width: 768px) {
  .container {
    @apply px-8 py-8 max-w-4xl mx-auto;
  }
}
```

## 🚀 開發指南

### 安裝和啟動
```bash
# 安裝依賴
npm install

# 啟動開發服務器 (端口 5174)
npm run dev

# 構建生產版本
npm run build

# 預覽生產構建
npm run preview
```

### 🔧 開發工具
```bash
# TypeScript 類型檢查
npm run type-check

# ESLint 代碼檢查
npm run lint

# 代碼格式化
npm run format
```

### 🧪 性能優化

#### React 優化策略
```typescript
// 使用 useCallback 防止不必要的重渲染
const addIntimateRecord = useCallback(async (data) => {
  await apiService.createIntimateRecord(data);
  // 更新本地狀態
}, []);

// 組件分離避免內部定義
// ❌ 錯誤做法 - 會導致重複渲染
const MyComponent = () => {
  const InnerComponent = () => <div>...</div>;
  return <InnerComponent />;
};

// ✅ 正確做法 - 組件外部定義
const InnerComponent = () => <div>...</div>;
const MyComponent = () => <InnerComponent />;
```

#### 圖片優化
- 自動圖片壓縮 (`compressImage` 函數)
- Base64 編碼存儲
- 響應式圖片加載

## 🔗 後端集成

### API 端點
```typescript
// 基礎配置
const API_BASE_URL = 'http://localhost:8080/api';

// 主要端點
const endpoints = {
  loveMoments: '/love-moments',
  nicknames: '/nicknames', 
  coins: '/coins',
  achievements: '/achievements',
  health: '/health'
};
```

### 錯誤處理
```typescript
try {
  const response = await apiService.getIntimateRecords();
  setRecords(response);
} catch (error) {
  console.error('API call failed:', error);
  // 自動降級到 localStorage
  const localRecords = getLocalRecords();
  setRecords(localRecords);
}
```

## 📊 狀態管理

### React Hooks 模式
```typescript
// 主要狀態
const [intimateRecords, setIntimateRecords] = useState<IntimateRecord[]>([]);
const [nicknames, setNicknames] = useState({ partner1: '', partner2: '' });
const [totalCoins, setTotalCoins] = useState(0);

// 副作用管理
useEffect(() => {
  const loadData = async () => {
    const records = await apiService.getIntimateRecords();
    setIntimateRecords(records);
  };
  loadData();
}, []);

// 性能優化的更新函數
const updateIntimacyMilestones = useCallback(() => {
  // 計算里程碑邏輯
}, [intimateRecords]);
```

## 🎮 功能模塊

### 1. 愛的時光記錄
- **日期時間選擇器**: 精確記錄時刻
- **心情選擇**: 豐富的表情符號
- **照片上傳**: 壓縮和預覽功能
- **詳細描述**: 多字段記錄支持

### 2. 統計分析
- **月度視圖**: 日曆格式顯示
- **趨勢分析**: 頻率和模式識別
- **成就進度**: 可視化進度條
- **硬幣統計**: 收入和支出記錄

### 3. 遊戲化元素
- **成就系統**: 多種徽章解鎖
- **硬幣經濟**: 獲得和消費機制
- **角色扮演**: 劇本和場景管理
- **每日挑戰**: 增加互動性

### 4. 個性化設置
- **暱稱管理**: 雙人暱稱系統
- **主題設置**: 色彩和樣式選項
- **數據管理**: 導出和備份功能

## 🔒 安全和隱私

### 數據保護
- 本地數據加密存儲
- 敏感信息不記錄真實姓名
- 可選的數據清除功能
- 隱私模式支持

### 代碼安全
- TypeScript 類型安全
- 輸入驗證和清理
- XSS 防護
- 安全的圖片處理

## 🌟 未來計劃

### 短期目標
- [ ] 完善後端認證集成
- [ ] 添加實時數據同步
- [ ] 優化移動端體驗
- [ ] 增加更多成就類型

### 長期目標
- [ ] PWA (漸進式Web應用) 支持
- [ ] 離線功能增強
- [ ] 多語言支持
- [ ] 高級數據分析

## 🤝 貢獻指南

### 代碼風格
- 使用 TypeScript 嚴格模式
- 遵循 ESLint 規則
- 組件使用函數式寫法
- 優先使用 Hooks

### 提交規範
```bash
# 功能添加
git commit -m "feat: add new love moment recording feature"

# 錯誤修復
git commit -m "fix: resolve nickname input focus issue"

# 樣式更新
git commit -m "style: improve mobile responsive design"
```

---

**用心創造，用愛連接** ❤️
