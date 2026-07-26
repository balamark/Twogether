import React, { useCallback, useEffect, useState } from 'react';
import {
  EngineerModeContext,
  ENGINEER_MODE_STORAGE_KEY as STORAGE_KEY,
} from './EngineerModeContext';

// 工程師模式（Engineer Mode）的 provider — Premium 限定的趣味彩蛋。
//
// 只負責「開關 + 持久化 + 權限判斷」三件事：
//  1. 開關偏好存在 localStorage（device-local，跟 authState 分開的專用 key）。
//  2. 只有 Premium（couple tier === 'premium'）才「生效」；非 Premium 時即使
//     偏好記著 true 也不套用（等他們續訂就會自動回來）。
//  3. 生效時在 <html> 掛上 `dark`（觸發 index.css 深色主題）與 `eng-mode`
//     （等寬標題），並讓 EngineerTextEngine 開始翻譯文字。

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

interface ProviderProps {
  /** 由 App 傳入：billingStatus?.tier === 'premium'。 */
  isPremium: boolean;
  children: React.ReactNode;
}

export const EngineerModeProvider: React.FC<ProviderProps> = ({ isPremium, children }) => {
  const [preferred, setPreferredState] = useState<boolean>(() => readStored());

  const enabled = preferred && isPremium;

  const setPreferred = useCallback((next: boolean) => {
    setPreferredState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
    } catch {
      /* localStorage 不可用（無痕/隱私模式）時，退化成僅此 session 生效。 */
    }
  }, []);

  const toggle = useCallback(() => {
    if (!isPremium) return; // 權限守門：非 Premium 不能開。
    setPreferred(!preferred);
  }, [isPremium, preferred, setPreferred]);

  // 把生效狀態反映到 <html> 的 class 上。
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', enabled);
    root.classList.toggle('eng-mode', enabled);
    return () => {
      root.classList.remove('dark');
      root.classList.remove('eng-mode');
    };
  }, [enabled]);

  return (
    <EngineerModeContext.Provider value={{ enabled, preferred, canUse: isPremium, toggle, setPreferred }}>
      {children}
    </EngineerModeContext.Provider>
  );
};
