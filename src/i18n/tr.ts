import type { Locale } from './LanguageContext';

// Inline bilingual strings: tr('繁中原文', 'English').
//
// The 繁中 text stays exactly where it was (so the source still reads in
// Chinese and grep keeps working); the English sits right next to it. Use it
// for every user-visible string — JSX text, attributes (title / placeholder /
// aria-label), toasts, confirm() text, error fallbacks, and data/content
// modules. Do NOT use it for logic values: ids, enum values stored in the DB,
// strings compared with ===, or text sent to the AI as a prompt.
//
// The locale is read ONCE per page load. Switching language reloads the page
// (LanguageProvider.setLocale), so module-level constants built with tr() are
// always in the right language without any subscription plumbing.

export const LOCALE_STORAGE_KEY = 'twogether.locale';

let cached: Locale | null = null;

export function getLocale(): Locale {
  if (cached) return cached;
  let next: Locale = 'zh-TW';
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'en' || saved === 'zh-TW') next = saved;
    // No saved choice yet: a shared/search link may carry ?lang=en (the public
    // 關係解方手冊 pages are indexed in both languages). Not persisted — the
    // top-right switch stays the only thing that saves a preference.
    else {
      const fromUrl = new URLSearchParams(window.location.search).get('lang');
      if (fromUrl === 'en' || fromUrl === 'zh-TW') next = fromUrl;
    }
  } catch {
    /* localStorage unavailable (private mode / SSR) → default 繁中 */
  }
  cached = next;
  return next;
}

export function isEnglish(): boolean {
  return getLocale() === 'en';
}

export function tr(zh: string, en: string): string {
  return getLocale() === 'en' ? en : zh;
}

/** BCP-47 tag for Intl / toLocale*String calls. */
export function dateLocale(): string {
  return getLocale() === 'en' ? 'en-US' : 'zh-TW';
}
