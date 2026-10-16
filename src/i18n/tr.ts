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
