import { useEffect } from 'react';

// Makes the couple's photos and videos harder to save off the page: blocks the
// right-click "save image as" menu and drag-to-desktop on every <img>/<video>
// in the app. The matching CSS half lives in src/index.css (`-webkit-touch-callout`
// is the only thing that stops iOS Safari's long-press sheet — it never fires a
// `contextmenu` event, so JS alone leaves mobile unprotected).
//
// This is friction, not protection. Media URLs are public Supabase URLs, so
// DevTools, the Network tab, pasting the URL, or a screenshot all still work.
// The point is to remove the one-gesture "oops, saved it" path from the most
// private surface in the product (我們的牆). Real protection would need signed,
// short-lived URLs behind an authorization check.
//
// One document-level listener rather than a wrapper component: it covers images
// that don't exist as JSX (MarkdownContent renders <img> from user markdown)
// and anything added later, without touching ~23 call sites.

// Opt-out for media a user is *meant* to be able to save. Nothing uses it today
// (no QR codes, no canvas exports) — it exists so a future "download this" image
// doesn't have to unpick the global handler.
const ALLOW_ATTR = 'data-allow-save';

function isProtectedMedia(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag !== 'IMG' && tag !== 'VIDEO') return false;
  return !target.closest(`[${ALLOW_ATTR}]`);
}

/**
 * Blocks right-click-save and drag-save on images/videos app-wide.
 *
 * @param onBlocked called every time an attempt is blocked; the caller decides
 *   whether to surface it (App shows a one-time toast so the user knows this is
 *   deliberate rather than a broken page).
 */
export function useMediaProtection(onBlocked?: () => void): void {
  useEffect(() => {
    const block = (e: Event) => {
      if (!isProtectedMedia(e.target)) return;
      e.preventDefault();
      onBlocked?.();
    };

    document.addEventListener('contextmenu', block);
    document.addEventListener('dragstart', block);
    return () => {
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('dragstart', block);
    };
  }, [onBlocked]);
}

export default useMediaProtection;
