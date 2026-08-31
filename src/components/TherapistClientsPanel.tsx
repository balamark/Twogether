import React, { useCallback, useEffect, useState } from 'react';
import { Users, MessageSquare, ChevronRight } from 'lucide-react';
import { apiService, type TherapistClientCouple } from '../services/api';
import type { Notification } from './ErrorNotification';
import TherapistClientView from './TherapistClientView';

// 我輔導的伴侶 — shown only to a logged-in therapist. Lists the couples who added
// them as their dedicated therapist; opening one shows that couple's 牆 +
// 好好說話 (read-only, or with comment if the couple granted it).
interface Props {
  showNotification: (n: Omit<Notification, 'id'>) => void;
  // Bumped by a notification deep-link (dedicated_client_added) to auto-open the
  // couple that just added this counselor. Clients are ordered most-recent-first,
  // so the newest link — the one the notification is about — is clients[0].
  autoOpenToken?: number;
}

const TherapistClientsPanel: React.FC<Props> = ({ showNotification, autoOpenToken = 0 }) => {
  const [clients, setClients] = useState<TherapistClientCouple[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<TherapistClientCouple | null>(null);
  const [pendingAutoOpen, setPendingAutoOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setClients(await apiService.getTherapistClients());
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A notification asked to focus a client. Remember the request; the effect
  // below opens it once the list has loaded (the fetch may still be in flight).
  useEffect(() => {
    if (autoOpenToken > 0) setPendingAutoOpen(true);
  }, [autoOpenToken]);

  useEffect(() => {
    if (pendingAutoOpen && !loading && clients.length > 0) {
      setActive(clients[0]);
      setPendingAutoOpen(false);
    }
  }, [pendingAutoOpen, loading, clients]);

  if (loading) return null;

  return (
    <div className="rounded-lg border border-petal-rule bg-petal-cream-2/50 p-5" data-testid="therapist-clients-panel">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-pink-500" strokeWidth={1.5} />
        <h3 className="font-display text-lg text-petal-ink">我輔導的伴侶</h3>
      </div>

      {clients.length === 0 ? (
        <p className="font-body text-sm text-petal-muted">
          還沒有伴侶把你設為專屬心理師。當有人指定你之後，就能在這裡檢視他們的牆與好好說話。
        </p>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <button
              key={c.coupleId}
              onClick={() => setActive(c)}
              data-testid="therapist-client-row"
              className="w-full flex items-center justify-between gap-3 text-left rounded-md border border-petal-rule bg-petal-cream px-4 py-3 hover:border-petal-ink transition-colors"
            >
              <div className="min-w-0">
                <div className="font-display text-base text-petal-ink truncate">
                  {c.coupleName || (c.partnerNames.length ? c.partnerNames.join(' & ') : '伴侶')}
                </div>
                <div className="inline-flex items-center gap-1 font-body text-[11px] text-petal-muted mt-0.5">
                  {c.canComment ? (
                    <><MessageSquare className="w-3 h-3" strokeWidth={1.5} /> 可留言</>
                  ) : (
                    <>唯讀</>
                  )}
                  <span>· 自 {new Date(c.since).toLocaleDateString('zh-TW')}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-petal-muted shrink-0" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      )}

      {active && (
        <TherapistClientView
          client={active}
          onClose={() => setActive(null)}
          showNotification={showNotification}
        />
      )}
    </div>
  );
};

export default TherapistClientsPanel;
