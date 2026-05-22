import { useEffect } from 'react';

// Reference-counted body-scroll-lock with iOS-Safari-safe fixed-position
// pattern. Plain `overflow: hidden` on <body> is enough for desktop and
// Chromium-based mobile, but iOS Safari lets touch-momentum scroll bypass it.
// Pinning the body via `position: fixed` and restoring `scrollY` on release is
// the canonical workaround. The reference counter lets stacked modals share
// one lock — closing a nested modal doesn't drop the lock its parent needs.
let lockCount = 0;
let saved: {
  overflow: string;
  position: string;
  top: string;
  width: string;
  scrollY: number;
} | null = null;

function acquire() {
  if (lockCount === 0) {
    const scrollY = window.scrollY;
    saved = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      scrollY,
    };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
  }
  lockCount += 1;
}

function release() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && saved) {
    const { overflow, position, top, width, scrollY } = saved;
    document.body.style.overflow = overflow;
    document.body.style.position = position;
    document.body.style.top = top;
    document.body.style.width = width;
    window.scrollTo(0, scrollY);
    saved = null;
  }
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    acquire();
    return release;
  }, [active]);
}
