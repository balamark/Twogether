import { apiService } from '../../services/api';
import type { RepairOverview } from '../../services/api';
import { getCached, setCached, useCachedQuery, userKey } from '../../services/queryCache';

// 回頭接住 overview: one cache entry shared by the 今天 card and every composer,
// so an optimistic send/answer shows up wherever the card is painted.
export const repairOverviewKey = () => userKey('/repair', 'overview');

export function useRepairOverview() {
  return useCachedQuery<RepairOverview>(repairOverviewKey(), () => apiService.getRepairOverview());
}

/** Optimistic local edit of the cached overview (no-op until it has loaded). */
export function patchRepairOverview(fn: (prev: RepairOverview) => RepairOverview): void {
  const key = repairOverviewKey();
  if (!key) return;
  const prev = getCached<RepairOverview>(key)?.data;
  if (prev) setCached(key, fn(prev));
}
