import React, { useCallback, useEffect, useState } from 'react';
import { Users, MessageSquare, ChevronRight, FileText } from 'lucide-react';
import { apiService, type TherapistClientCouple } from '../services/api';
import type { Notification } from './ErrorNotification';
import TherapistClientView from './TherapistClientView';
import { tr, dateLocale } from '../i18n/tr';

// 我輔導的伴侶 — shown only to a logged-in therapist. Lists the couples who added
// them as their dedicated therapist; opening one shows that couple's 牆 +
// 好好說話 (read-only, or with comment if the couple granted it).
interface Props {
  showNotification: (n: Omit<Notification, 'id'>) => void;
  // Bumped by a notification deep-link (dedicated_client_added) to auto-open the
  // couple that just added this counselor.
  autoOpenToken?: number;
  // The exact couple to open when autoOpenToken fires. When null/not found (e.g.
  // an older notification with no coupleId), fall back to clients[0] — the list
  // is ordered most-recent-first, so that's the couple most likely meant.
  autoOpenCoupleId?: string | null;
}

// A summary from the last 7 days reads as "just brought in" for the next session.
const isRecent = (iso: string) => Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000;

const TherapistClientsPanel: React.FC<Props> = ({ showNotification, autoOpenToken = 0, autoOpenCoupleId = null }) => {
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
      const match = autoOpenCoupleId
        ? clients.find((c) => c.coupleId === autoOpenCoupleId)
        : null;
      setActive(match || clients[0]);
      setPendingAutoOpen(false);
    }
  }, [pendingAutoOpen, loading, clients, autoOpenCoupleId]);

  if (loading) return null;

  return (
    <div className="rounded-lg border border-petal-rule bg-petal-cream-2/50 p-5" data-testid="therapist-clients-panel">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-pink-500" strokeWidth={1.5} />
        <h3 className="font-display text-lg text-petal-ink">{tr('我輔導的伴侶', 'Couples I support')}</h3>
      </div>

      {clients.length === 0 ? (
        <p className="font-body text-sm text-petal-muted">
          {tr('還沒有伴侶把你設為專屬心理師。把下方的專屬邀請碼傳給你正在諮商的伴侶：他們加入後就會出現在這裡，諮商前也能先讀他們帶來的摘要。', 'No couple has chosen you as their dedicated therapist yet. Send your invite code below to couples you already see: once they join they appear here, and you can read the summaries they bring before each session.')}
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
                  {c.coupleName || (c.partnerNames.length ? c.partnerNames.join(' & ') : tr('伴侶', 'Couple'))}
                </div>
                <div className="inline-flex items-center gap-1 font-body text-[11px] text-petal-muted mt-0.5">
                  {c.canComment ? (
                    <><MessageSquare className="w-3 h-3" strokeWidth={1.5} /> {tr('可留言', 'Can comment')}</>
                  ) : (
                    <>{tr('唯讀', 'Read-only')}</>
                  )}
                  <span>{tr('· 自', '· Since')} {new Date(c.since).toLocaleDateString(dateLocale())}</span>
                </div>
                {((c.summaryCount ?? 0) > 0 || c.referredByMe) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {(c.summaryCount ?? 0) > 0 && c.latestSummaryAt && (
                      <span
                        data-testid="therapist-client-summary-badge"
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-body text-[11px] ${
                          isRecent(c.latestSummaryAt) ? 'bg-pink-100 text-pink-700' : 'bg-petal-cream-2 text-petal-ink-soft'
                        }`}
                      >
                        <FileText className="w-3 h-3" strokeWidth={1.5} />
                        {isRecent(c.latestSummaryAt)
                          ? tr('帶來了新的諮商摘要', 'Brought a new summary')
                          : tr(`諮商摘要 ${c.summaryCount} 份`, `${c.summaryCount} summaries`)}
                        <span className="opacity-70">· {new Date(c.latestSummaryAt).toLocaleDateString(dateLocale())}</span>
                      </span>
                    )}
                    {c.referredByMe && (
                      <span className="rounded-full bg-petal-sage/15 px-2 py-0.5 font-body text-[11px] text-petal-sage-deeper">
                        {tr('經你的邀請碼加入', 'Joined via your code')}
                      </span>
                    )}
                  </div>
                )}
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
