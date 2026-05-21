import { useEffect } from 'react';

// Reference-counted body-scroll-lock. Multiple modals stacking concurrently
// share the same lock; the body stays locked until every active caller becomes
// inactive or unmounts. Without the counter, a nested modal closing would
// prematurely release the lock its parent still needs.
let lockCount = 0;
let savedOverflow: string | null = null;

function acquire() {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

function release() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow ?? '';
    savedOverflow = null;
  }
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    acquire();
    return release;
  }, [active]);
}
