import { useCallback, useEffect, useState } from 'react';
import { apiService, type AiUsageToday } from '../services/api';

// Today's shared AI budget (docs/UX_PLAYBOOK.md P1-2): fetched once on mount;
// call refresh() after any AI action so the「剩 N 次」hint stays honest.
export function useAiQuota() {
  const [quota, setQuota] = useState<AiUsageToday | null>(null);

  const refresh = useCallback(() => {
    apiService
      .getAiUsageToday()
      .then(setQuota)
      .catch(() => {
        // Hint is best-effort: a failed lookup just hides it.
        setQuota(null);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { quota, refresh };
}
