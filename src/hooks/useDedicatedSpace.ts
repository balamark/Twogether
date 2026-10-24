import { useCallback, useEffect, useState } from 'react';
import { apiService, type DedicatedSpace } from '../services/api';
import type { Notification } from '../components/ErrorNotification';
import { tr } from '../i18n/tr';

// Data for the 專屬諮商空間 (src/components/DedicatedSpace.tsx). coupleId set →
// the therapist's path for that client couple; omitted → the caller's couple.
// Polls lightly while the tab is visible so the other side's messages show up
// without a refresh.

type Notify = (n: Omit<Notification, 'id'>) => void;

const POLL_MS = 20000;

export interface DedicatedSpaceState {
  space: DedicatedSpace | null;
  loading: boolean;
  loadError: { message: string; code?: string } | null;
  reload: (opts?: { silent?: boolean }) => Promise<void>;
  setSpace: React.Dispatch<React.SetStateAction<DedicatedSpace | null>>;
  coupleId?: string;
  notify: Notify;
}

export function useDedicatedSpace(coupleId: string | undefined, notify: Notify): DedicatedSpaceState {
  const [space, setSpace] = useState<DedicatedSpace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; code?: string } | null>(null);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      const data = await apiService.getDedicatedSpace(coupleId);
      setSpace(data);
      setLoadError(null);
    } catch (err) {
      // A silent poll failing shouldn't wipe what's on screen.
      if (!opts?.silent) {
        const e = err as Error & { error_code?: string };
        setLoadError({ message: err instanceof Error && err.message ? err.message : tr('無法載入諮商空間，請重新整理頁面後再試', 'Couldn\'t load the counseling space. Please refresh and try again'), code: e?.error_code });
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [coupleId]);

  useEffect(() => { reload(); }, [reload]);

  // Light polling so a message from the other side shows up without a refresh.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') reload({ silent: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [reload]);

  return { space, loading, loadError, reload, setSpace, coupleId, notify };
}
