import { useCallback, useRef, useState } from 'react';

// Guards an async action against double-submit and gives callers a `pending`
// flag for in-flight UI feedback (disabled + spinner).
//
// Why a ref lock and not just `pending`: a state-based `disabled={pending}`
// has a render-race window — two clicks dispatched in the same tick both enter
// the handler before React re-renders the button as disabled, so both fire the
// request → duplicate records. `lock` flips synchronously on the first call, so
// the second call returns immediately. `pending` is only for rendering.
// `fn` may return a Promise or a plain value; `await` handles both. Accepting
// `unknown` lets callers pass handlers whose prop type says `=> void` but which
// are `async` at runtime (e.g. App's `purchaseGift`) — the lock still holds for
// the real request duration.
export function useAsyncAction<A extends unknown[]>(
  fn: (...args: A) => unknown
): { run: (...args: A) => Promise<void>; pending: boolean } {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  const run = useCallback(
    async (...args: A) => {
      if (lock.current) return; // a second synchronous click is dropped
      lock.current = true;
      setPending(true);
      try {
        await fn(...args);
      } finally {
        lock.current = false;
        setPending(false);
      }
    },
    [fn]
  );

  return { run, pending };
}
