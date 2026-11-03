import { useEffect, useRef, useState } from 'react';
import { Share2, BellRing, Link2, MessageCircle, Send, Check } from 'lucide-react';
import apiService from '../services/api';
import { tr } from '../i18n/tr';

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

// The deep link the partner taps: App.tsx consumes ?event=<id> (surviving a
// login detour) and opens this exact 說開一件事 thread.
function eventDeepLink(eventId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://twogether.fun';
  return `${origin}/?event=${encodeURIComponent(eventId)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path (e.g. LINE's in-app browser) */ }
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

interface EventShareMenuProps {
  eventId: string;
  eventTitle: string;
  showNotification: (n: NotificationInput) => void;
}

// 提醒對方回覆: the little share icon in a 說開一件事 thread header. Three ways
// to get the partner back into this exact conversation — an in-app reminder
// (+ LINE/email mirror server-side), a copyable link, or LINE / the OS share
// sheet with a gentle pre-written line.
export default function EventShareMenu({ eventId, eventTitle, showNotification }: EventShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const link = eventDeepLink(eventId);
  const shareText = tr(
    `我在 Twogether 留了話給你，還在等你回覆「${eventTitle}」💬`,
    `I left you a message on Twogether and I'm waiting for your reply to "${eventTitle}" 💬`
  );
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Playbook §R7: hand control back at once; the request runs in the
  // background and its outcome arrives as a notification.
  const nudge = () => {
    setOpen(false);
    console.log('[events] nudge partner', { eventId });
    apiService
      .nudgePartnerOnEvent(eventId)
      .then((message) => {
        showNotification({ type: 'success', title: tr('提醒送出了', 'Reminder sent'), message });
      })
      .catch((err: Error & { error_code?: string }) => {
        const expected = err?.error_code === 'NUDGE_COOLDOWN'
          || err?.error_code === 'NUDGE_PRIVATE_EVENT'
          || err?.error_code === 'NUDGE_NO_PARTNER';
        showNotification({
          type: expected ? 'info' : 'error',
          title: err?.error_code === 'NUDGE_COOLDOWN'
            ? tr('剛剛提醒過了', 'Already reminded')
            : tr('提醒沒送出', 'Reminder not sent'),
          message: err?.message || tr('請稍後再試；也可以複製連結用 LINE 傳給伴侶。', 'Try again later, or copy the link and send it to your partner on LINE.'),
        });
      });
  };

  const copy = async () => {
    const ok = await copyText(link);
    console.log('[events] copy thread link', { eventId, ok });
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      showNotification({
        type: 'success',
        title: tr('已複製連結', 'Link copied'),
        message: tr('貼到 LINE 或任何聊天 App，伴侶點開就會直接到這段對話。', 'Paste it into LINE or any chat app — your partner lands right on this conversation.'),
      });
    } else {
      showNotification({
        type: 'warning',
        title: tr('沒辦法自動複製', 'Couldn\'t copy automatically'),
        message: tr(`請手動複製這個連結：${link}`, `Please copy this link manually: ${link}`),
        duration: 10000,
      });
    }
  };

  const shareToLine = () => {
    setOpen(false);
    console.log('[events] share thread link to LINE', { eventId });
    const url = `https://line.me/R/share?text=${encodeURIComponent(`${shareText}\n${link}`)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const nativeShare = () => {
    setOpen(false);
    console.log('[events] native share thread link', { eventId });
    navigator.share?.({ title: 'Twogether', text: shareText, url: link }).catch(() => { /* user cancelled */ });
  };

  const item = 'w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-petal-cream-2 transition-colors';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        data-testid="event-share-link-button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={tr('提醒伴侶回覆 / 分享連結', 'Remind your partner / share link')}
        aria-label={tr('提醒伴侶回覆 / 分享連結', 'Remind your partner / share link')}
        className="p-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink"
      >
        <Share2 className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          data-testid="event-share-menu"
          className="absolute right-0 top-full mt-2 z-30 w-64 max-w-[calc(100vw-2rem)] bg-white border border-petal-rule rounded-xl shadow-petal overflow-hidden"
        >
          <p className="px-3 pt-2.5 pb-1.5 text-[11px] text-petal-muted leading-relaxed border-b border-petal-rule">
            {tr('伴侶點開連結或通知，就會直接回到這段對話。', 'Your partner taps the link or notification and lands right on this conversation.')}
          </p>
          <button type="button" role="menuitem" data-testid="event-nudge-partner" onClick={nudge} className={item}>
            <BellRing className="w-4 h-4 mt-0.5 text-petal-rose-deep shrink-0" />
            <span>
              <span className="block text-sm text-petal-ink">{tr('提醒伴侶回覆', 'Remind your partner')}</span>
              <span className="block text-[11px] text-petal-muted">{tr('送一則站內通知（有綁 LINE 也會收到）', 'Sends an in-app notification (and LINE, if linked)')}</span>
            </span>
          </button>
          <button type="button" role="menuitem" data-testid="event-copy-link" onClick={copy} className={item}>
            {copied
              ? <Check className="w-4 h-4 mt-0.5 text-petal-sage-deep shrink-0" />
              : <Link2 className="w-4 h-4 mt-0.5 text-petal-rose-deep shrink-0" />}
            <span>
              <span className="block text-sm text-petal-ink">{copied ? tr('已複製！', 'Copied!') : tr('複製連結', 'Copy link')}</span>
              <span className="block text-[11px] text-petal-muted">{tr('自己貼到 LINE 或其他聊天 App', 'Paste it into LINE or any chat app yourself')}</span>
            </span>
          </button>
          <button type="button" role="menuitem" data-testid="event-share-line" onClick={shareToLine} className={item}>
            <MessageCircle className="w-4 h-4 mt-0.5 text-petal-rose-deep shrink-0" />
            <span className="block text-sm text-petal-ink">{tr('用 LINE 傳給伴侶', 'Send to your partner on LINE')}</span>
          </button>
          {canNativeShare && (
            <button type="button" role="menuitem" data-testid="event-share-native" onClick={nativeShare} className={item}>
              <Send className="w-4 h-4 mt-0.5 text-petal-rose-deep shrink-0" />
              <span className="block text-sm text-petal-ink">{tr('分享到其他 App…', 'Share to another app…')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
