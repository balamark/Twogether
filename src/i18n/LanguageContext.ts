import { createContext, useContext } from 'react';
import { MESSAGES, type MessageKey } from './messages';

// 介面語言（繁體中文 / English）。
// context 物件與 hook 放這支 .ts；provider 元件放 LanguageProvider.tsx
// （沿用 EngineerModeContext.ts / EngineerModeProvider.tsx 的拆檔慣例）。
//
// 翻譯範圍：共用外框（Header、使用者選單、主導覽）與「使用說明 / Help &
// Support」頁。其餘分頁內文仍是繁中；新增或改寫外框文字時，請同時在
// messages.ts 補上兩種語言。

export type Locale = 'zh-TW' | 'en';

export const LOCALES: Locale[] = ['zh-TW', 'en'];

// public/support.html 也讀寫同一個 key，讓 App 與公開客服頁的語言一致。
export const LOCALE_STORAGE_KEY = 'twogether.locale';

export interface LanguageValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  /** 取共用外框字串；{name} 形式的佔位符以 vars 代入。 */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let text: string = MESSAGES[locale][key] ?? MESSAGES['zh-TW'][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  }
  return text;
}

export const LanguageContext = createContext<LanguageValue>({
  locale: 'zh-TW',
  setLocale: () => {},
  t: (key, vars) => translate('zh-TW', key, vars),
});

export function useLanguage(): LanguageValue {
  return useContext(LanguageContext);
}
