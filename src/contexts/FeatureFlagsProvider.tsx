import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import apiService from '../services/api';
import { FeatureFlagsContext } from './FeatureFlagsContext';

// Fetches the admin-controlled feature-flag map once on mount and provides it to
// the tree. On any failure the map stays empty, so every gate falls back to its
// default (off) rather than breaking the page.
export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    apiService.getFeatureFlags().then((f) => {
      if (alive) setFlags(f);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <FeatureFlagsContext.Provider value={flags}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}
