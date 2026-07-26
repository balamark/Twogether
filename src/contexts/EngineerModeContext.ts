import { createContext, useContext } from 'react';

// 工程師模式（Engineer Mode）— Premium 限定的趣味彩蛋。
// context 物件與 hook 放這支 .ts；provider 元件放 EngineerModeProvider.tsx
// （沿用本專案 FeatureFlagsContext.ts / FeatureFlagsProvider.tsx 的拆檔慣例）。

export const ENGINEER_MODE_STORAGE_KEY = 'engineerMode';

export interface EngineerModeValue {
  /** 目前是否「生效」（開關開 + 有 Premium 權限）。 */
  enabled: boolean;
  /** 使用者在 localStorage 記下的偏好（不看權限）。 */
  preferred: boolean;
  /** 是否有資格使用（Premium）。 */
  canUse: boolean;
  /** 切換偏好開關；沒有權限時無效。 */
  toggle: () => void;
  setPreferred: (next: boolean) => void;
}

export const EngineerModeContext = createContext<EngineerModeValue>({
  enabled: false,
  preferred: false,
  canUse: false,
  toggle: () => {},
  setPreferred: () => {},
});

export function useEngineerMode(): EngineerModeValue {
  return useContext(EngineerModeContext);
}
