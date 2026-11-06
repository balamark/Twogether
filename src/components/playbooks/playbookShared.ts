import { tr, isEnglish } from '../../i18n/tr';
import { trackAction } from '../../utils/track';

// Shared bits for the 關係解方手冊 views.

export interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

/** Public, shareable URL of the library or one Playbook (in the current language). */
export function playbookPath(slug?: string | null): string {
  const base = slug ? `/playbooks/${slug}` : '/playbooks';
  return isEnglish() ? `${base}?lang=en` : base;
}

export function playbookUrl(slug?: string | null): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://twogether.fun';
  return `${origin}${playbookPath(slug)}`;
}

/** R5 measurement: `onboarding.playbooks.<action>[:<slug>]` (≤64 chars). */
export function trackPlaybook(action: string, slug?: string): void {
  trackAction(`onboarding.playbooks.${action}${slug ? `:${slug}` : ''}`.slice(0, 64));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall back below */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const PLAYBOOK_NAME = tr('關係解方手冊', 'Relationship Playbook');

/** Error text for a failed load: the server's specific message when there is one. */
export function loadErrorMessage(e: Error | null): string {
  const msg = e?.message;
  if (msg && msg !== tr('未知錯誤', 'Unknown error')) return msg;
  return tr('暫時讀不到手冊內容，請檢查網路後再試一次', 'We couldn\'t load the playbooks right now. Check your connection and try again.');
}

/** The slug in /playbooks/<slug>, if the page was opened on one. */
export function slugFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const m = /^\/playbooks\/([a-z0-9-]+)\/?$/.exec(window.location.pathname);
  return m ? m[1] : null;
}

export function isPlaybooksPath(): boolean {
  return typeof window !== 'undefined' && /^\/playbooks(\/|$)/.test(window.location.pathname);
}
