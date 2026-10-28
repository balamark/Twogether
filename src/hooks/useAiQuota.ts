import { useCallback } from 'react';
import { useAiUsageToday } from './usePageData';

// Today's shared AI budget (docs/UX_PLAYBOOK.md P1-2). Cached across pages
// (src/hooks/usePageData.ts) so the hint paints instantly; call refresh()
// after any AI action so the「剩 N 次」hint stays honest.
export function useAiQuota() {
  const { data, error, refetch } = useAiUsageToday();
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  // Hint is best-effort: a failed lookup with nothing cached just hides it.
  return { quota: error && !data ? null : data ?? null, refresh };
}
