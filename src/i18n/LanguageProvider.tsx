import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LanguageContext,
  LOCALE_STORAGE_KEY as STORAGE_KEY,
  translate,
  type Locale,
} from './LanguageContext';

// 介面語言的 provider：只負責「選擇 + 持久化 + 反映到 <html lang>」。
//  1. 偏好存在 localStorage（device-local）。
//  2. 沒選過時一律繁中（主要使用者在台灣；很多人手機系統是英文，不能因此
//     被自動切成英文）。想看英文的人點右上角 EN 即可，選擇會被記住。
//  3. 生效語言寫到 <html lang>，讓螢幕閱讀器與字型 fallback 正確。

function readInitial(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh-TW') return saved;
  } catch {
    /* localStorage 不可用時用預設語言。 */
  }
  return 'zh-TW';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => readInitial());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState((prev) => {
      if (prev !== next) console.info('[i18n] locale changed', { from: prev, to: next });
      return next;
    });
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 無痕/隱私模式：僅此 session 生效。 */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-Hant';
  }, [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t: (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars) }),
    [locale, setLocale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
