// Cached loaders for data that several main pages read. One hook per
// endpoint so every component showing it shares a single cache entry and a
// single request (首頁, 我們 and the dashboard all read the summary). See
// src/services/queryCache.ts for the caching rules and docs/PERFORMANCE.md.

import { apiService } from '../services/api';
import type { ActivityItem, AiUsageToday, RelationshipSummary } from '../services/api';
import { useCachedQuery, userKey } from '../services/queryCache';

export function useRelationshipSummary(enabled = true) {
  return useCachedQuery<RelationshipSummary>(
    enabled ? userKey('/relationship', 'summary') : null,
    () => apiService.getRelationshipSummary(),
  );
}

export function useActivityFeed() {
  return useCachedQuery<ActivityItem[]>(userKey('/activity', 'feed'), () => apiService.getActivityFeed());
}

// Short staleMs: the remaining-quota hint should catch up quickly after an AI
// call elsewhere (those POSTs also mark it stale).
export function useAiUsageToday() {
  return useCachedQuery<AiUsageToday>(userKey('/ai-usage', 'today'), () => apiService.getAiUsageToday(), { staleMs: 5_000 });
}
