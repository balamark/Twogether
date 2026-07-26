// 工程師模式（Engineer Mode）詞典 — Premium 限定的趣味彩蛋。
//
// 概念：把「圖在一起」整個 App 重新想像成一個跑在 production 的
// On-call / SRE 事故管理平台。情侶關係 = 分散式系統；兩個人 =
// cluster 裡的兩個 node；吵架 = incident；和好 = rollback / postmortem。
//
// 這份 map 是「一般中文 → 工程師黑話」的對照表，由
// EngineerTextEngine 在啟用時，對畫面上「整個文字節點完全相符」的
// 字串做即時替換（不改任何元件的原始碼）。所以要擴充覆蓋率，只要在
// 這裡加一組 key/value 即可，不用去動 80 個元件。
//
// 規則：
//  - key 必須是畫面上「完整、去頭尾空白後」會出現的整段字串。
//  - 只做完全相符替換，避免誤傷使用者自己輸入的內容。
//  - 想保持某段文字不被翻譯，在外層元素加 data-no-eng 即可（見 engine）。

export const ENGINEER_LEXICON: Record<string, string> = {
  // ── 品牌 / 全域 ────────────────────────────────────────────────
  '圖在一起': 'twogether-prod ● live',
  '設定': 'config.yaml',
  '個人化你們的愛情應用。': '調校 runtime 參數與環境變數。',
  '保存設定 →': 'git commit -m "chore: update config" →',
  '保存中…': 'committing…',
  '已保存設定': 'Commit 成功 ● HEAD 已更新',
  '已更新': '200 OK ● Deploy 成功',

  // ── 主導覽列（6 個 tab）──────────────────────────────────────
  '記錄時光': 'Commit 紀錄',
  '好好說話': '事故處理 Incident',
  '角色扮演': 'Staging 演練',
  '我們的牆': 'Message Queue',
  '真實故事': '事故案例庫 KB',
  '心理諮商': '升級支援 Escalation',
  'Premium': 'Enterprise 授權',

  // 「好好說話」的兩個子分頁
  '說開一件事': '開 Ticket ● 建立事故單',
  '接住情緒・檢查': 'Postmortem ● 根因分析',

  // ── 使用者選單（Header 下拉）────────────────────────────────
  '金幣商店': 'Credits 儲值',
  '最近動態': 'Activity Log',
  '愛情旅程': 'Release Roadmap',
  '訊息紀錄': 'stdout Log Stream',
  '愛的語言': 'Protocol 通訊協定',
  '升級 Premium': '升級授權 License',
  '意見回饋': '提 Issue / Bug Report',
  '使用說明': 'README / Docs',
  '登出': 'kill session',
  '登入 / 註冊': 'auth login / signup',
  '登入': 'auth login',
  '登入 / 注册': 'auth login / signup',

  // 伴侶連線狀態
  '已連接伴侶': 'peer 已連線 ● cluster healthy',
  '等待伴侶連接': 'peer 離線 ● 等待 handshake',
  '發送親密邀請': '開 Merge Request',
  '親密邀請': 'Merge Request',

  // ── 記錄時光 / Calendar ─────────────────────────────────────
  '你們的節奏': '系統吞吐量 (throughput)',
  '點月曆任一天新增或查看紀錄': '點任一日期查看或新增 commit',
  '事件類型': 'commit type',
  '親密時光': '部署到 Production 🚀',
  '月經': '排程維護 (maintenance window)',

  // ── 好好說話 → 說開一件事 / Events ─────────────────────────
  '對話 × 由 AI 替你說': 'AI 事故協調員 × 幫你擬 incident 說明',
  '請先登入才能使用此功能。': '需先 auth login 才能存取此端點。',

  // ── 好好說話 → 接住情緒・檢查 / Conflict ────────────────────
  '和諧相處': '系統穩定度 SLA',
  '被接住的那一刻，修復才開始': 'ack 事故的那一刻，修復才開始',
  '雙方衝突時的應對工具': '雙方發生 conflict 時的 rollback 工具',
  '冷靜連結模式': 'Circuit Breaker 熔斷降溫',
  '剩餘時間': 'cooldown 剩餘',

  // ── 角色扮演 / Roleplay ─────────────────────────────────────
  '角色扮演劇本': 'Staging 測試腳本 (test scenarios)',
  '上傳劇本': '上傳 test script',
  '收藏劇本': '加入我的 test suite',
  '作者已停止分享': 'upstream 已下架此 script',

  // ── 我們的牆 / Wall ─────────────────────────────────────────
  '一個自由寫下重要話、心情、需求的空間。': '一條共享 message queue：寫入重要訊息、狀態、需求。',
  '公開到「公開問答」': 'publish 到公開 topic',
  '匿名': 'anonymous',

  // ── 真實故事 / Stories ──────────────────────────────────────
  '你想分享哪一種？': '要 publish 哪一種文件？',
  '分享你們的故事': 'push 一篇 postmortem',
  '依 6 個引導步驟，寫下你們走過的一段真實經歷。': '照 6 步範本，寫下一份完整的事故回顧 (RCA)。',

  // ── 心理諮商 / Therapists ───────────────────────────────────
  '與真人 諮商心理師 聊聊': 'Page on-call ● 呼叫資深 SRE（真人諮商師）',
  '想談的主題': 'incident 主題',
  '想聊聊的事（選填）': '事故描述（選填）',

  // ── 金幣商店 / Coin Shop ────────────────────────────────────
  '自訂禮品': '自訂 reward',
  '添加自訂禮品': '新增自訂 reward',

  // ── 情趣遊戲 / Games ────────────────────────────────────────
  '遊戲步驟': 'test steps',

  // ── 關係之屋 / Relationship dashboard ──────────────────────
  '關係之屋': 'SLA Dashboard ● 系統健康度',
  '經營信賴與奉獻': '維持 uptime 與 trust 額度',
  '好感存款明細': 'Trust/Karma 帳本明細',
  '近兩週哪些事讓好感加分或扣分。': '近兩週哪些 event 讓 Karma +/-。',

  // ── 常見狀態 / Toast ────────────────────────────────────────
  '已開啟週期追蹤': '已啟用 maintenance-window 追蹤 ● 200 OK',
  '已關閉週期追蹤': '已停用 maintenance-window 追蹤 ● 200 OK',
  '載入中…': 'loading…',
  '載入中...': 'loading…',
  '處理中…': 'processing…',
  '沒有資料': 'no data ● 0 rows returned',
};

/**
 * 直接查表：給定一段中文，回傳工程師黑話；查不到就原樣回傳。
 * 供在「定義處」明確包裹的少數字串使用（例如被 <em> 拆開、
 * DOM engine 抓不到整段的標題）。
 */
export function toEngineerTerm(text: string): string {
  const key = text.trim();
  const hit = ENGINEER_LEXICON[key];
  if (!hit) return text;
  // 保留原本的頭尾空白，只換中間的實體字。
  return text.replace(key, hit);
}
