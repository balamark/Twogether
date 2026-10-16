import React, { useCallback, useEffect, useMemo } from 'react';
import { LanguageContext, translate, type Locale } from './LanguageContext';
import { getLocale, LOCALE_STORAGE_KEY } from './tr';

// 介面語言的 provider：只負責「讀取 + 切換 + 反映到 <html lang>」。
//  1. 偏好存在 localStorage（device-local），沒選過時一律繁中（主要使用者在
//     台灣；很多人手機系統是英文，不能因此被自動切成英文）。
//  2. 語言在每次載入頁面時讀一次（見 tr.ts）。切換時存檔後重新整理頁面，
//     這樣模組層級用 tr() 建好的常數、各元件的 state 初值也都會換成新語言。
//     目前分頁會被 App 記住（VIEW_STORAGE_KEY），重新整理後回到同一頁。
//  3. 生效語言寫到 <html lang>，讓螢幕閱讀器與字型 fallback 正確。

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const locale = getLocale();

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      console.info('[i18n] locale changed', { from: locale, to: next });
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        /* 無痕/隱私模式存不了：重新整理後會回到預設語言，所以不重新整理。 */
        return;
      }
      window.location.reload();
    },
    [locale],
  );

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-Hant';
    // index.html ships the 繁中 title (crawlers / link previews); swap it for
    // English visitors once the app boots.
    if (locale === 'en') document.title = 'Twogether · A couples practice tool that brings counseling into everyday life';
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars),
    }),
    [locale, setLocale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
