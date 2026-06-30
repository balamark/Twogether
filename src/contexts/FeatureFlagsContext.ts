import { createContext, useContext } from 'react';

// Admin-controlled on/off bits for gated UI experiments, fetched once from the
// public /api/feature-flags endpoint by FeatureFlagsProvider. Unknown / missing
// keys read as `false`, so every gate defaults to OFF until an admin turns it on
// in the /admin 功能開關 dashboard.
export const FeatureFlagsContext = createContext<Record<string, boolean>>({});

// Read a single flag (defaults to false when unknown).
export function useFeatureFlag(key: string): boolean {
  return !!useContext(FeatureFlagsContext)[key];
}

export function useFeatureFlags(): Record<string, boolean> {
  return useContext(FeatureFlagsContext);
}
