import { useEffect, useState } from 'react';
import { Tag, CheckCircle2, Sprout, Lock, MessageSquareHeart } from 'lucide-react';
import apiService, { type EventRecord, type EventStatus } from '../services/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateTime } from '../utils/datetime';
import { tr } from '../i18n/tr';

interface EventHistoryListProps {
  onOpenEvent: (id: string) => void;
  currentUserId: string;
  hideFilters?: boolean;
  // Empty-state CTA: jump straight into the compose flow.
  onCompose?: () => void;
}

// 'resolve_pending' is deliberately absent: nothing produces it any more, and a
// filter chip that can only ever match legacy rows is noise. Those rows still
// list under 未解決 (see statusPill).
const STATUS_OPTIONS: { value: EventStatus | 'all'; label: string }[] = [
  { value: 'all', label: tr('全部', 'All') },
  { value: 'open', label: tr('未解決', 'Open') },
  { value: 'closing', label: tr('收尾中', 'Wrapping up') },
  { value: 'resolved', label: tr('已解決', 'Resolved') },
];

function statusPill(status: EventStatus) {
  switch (status) {
    // 'resolve_pending' is a legacy row from the retired 標記為解決 handshake and
    // reads as 未解決 — exactly how the detail view treats it too.
    case 'open':
    case 'resolve_pending':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-petal-rose/30 text-petal-ink">{tr('未解決', 'Open')}</span>;
    case 'closing':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-petal-sage/20 text-petal-ink inline-flex items-center gap-1">
          <Sprout className="w-3 h-3" />
          {tr('收尾中', 'Wrapping up')}
        </span>
      );
    case 'resolved':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-petal-sage/30 text-petal-ink inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          {tr('已解決', 'Resolved')}
        </span>
      );
  }
}

function formatDate(iso: string, tz: string) {
  if (!iso) return '';
  try {
    return formatDateTime(iso, tz, { withYear: true });
  } catch {
    return iso;
  }
}

export default function EventHistoryList({
  onOpenEvent,
  currentUserId,
  hideFilters,
  onCompose,
}: EventHistoryListProps) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<EventStatus | 'all'>('all');
  const tz = useTimezone();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiService
      .listEvents({ status })
      .then((res) => {
        if (!cancelled) setEvents(res.events);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : tr('無法取得對話列表', 'Couldn\'t load conversations. Please try again in a moment.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (loading) {
    return <div className="p-8 text-center text-petal-ink-soft">{tr('載入中…', 'Loading…')}</div>;
  }
  if (error) {
    return <div className="p-6 text-center text-red-500">{error}</div>;
  }
  const filterChips = !hideFilters && (
    <div className="flex flex-wrap gap-2">
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-testid={`events-filter-${opt.value}`}
          onClick={() => setStatus(opt.value)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            status === opt.value
              ? 'bg-petal-ink text-petal-cream border-petal-ink'
              : 'border-petal-rule text-petal-ink hover:bg-petal-sage/20'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  if (events.length === 0) {
    // A filtered-to-empty list is NOT first-run onboarding. Rendering the
    // onboarding state here also unmounted the chips, removing the only control
    // that could undo the filter — and re-tapping 歷史 doesn't remount.
    const filtered = status !== 'all';
    const activeLabel = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? '';
    return (
      <div className="flex flex-col gap-3">
        {filterChips}
        {filtered ? (
          <div
            className="bg-white border border-petal-rule-soft rounded-2xl p-8 text-center text-petal-ink-soft"
            data-testid="events-filter-empty-state"
          >
            <p className="text-petal-ink font-medium">{tr('目前沒有', 'No ')}{activeLabel}{tr('的對話', ' conversations right now')}</p>
            <button
              type="button"
              data-testid="events-filter-reset"
              onClick={() => setStatus('all')}
              className="mt-4 px-4 py-2 rounded-full border border-petal-rule text-petal-ink text-sm font-medium hover:bg-petal-sage/20 transition"
            >
              {tr('看全部', 'See all')}
            </button>
          </div>
        ) : (
          <div
            className="bg-white border border-petal-rule-soft rounded-2xl p-8 text-center text-petal-ink-soft"
            data-testid="events-empty-state"
          >
            <MessageSquareHeart className="w-8 h-8 mx-auto mb-3 text-petal-rose-deep" />
            <p className="text-petal-ink font-medium">{tr('說不出口的委屈，寫在這裡', 'What\'s hard to say out loud, write it here')}</p>
            <p className="text-xs mt-1.5 leading-relaxed max-w-xs mx-auto">
              {tr('把當下的情緒原封不動寫下來（可以罵、可以很火），AI 會幫你整理成對方 聽得進去的說法，你挑一個版本再送出。', 'Write down how you feel exactly as it is (vent, be angry). The AI shapes it into words your partner can hear, and you pick a version before sending.')}
            </p>
            {onCompose && (
              <button
                type="button"
                data-testid="events-empty-compose"
                onClick={onCompose}
                className="mt-4 px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition"
              >
                {tr('寫下第一件想說開的事', 'Write the first thing you want to talk through')}
              </button>
            )}
            <p className="text-[11px] text-petal-muted mt-3">{tr('也可以只存成私人對話，對方不會看到。', 'You can also save it as a private note your partner won\'t see.')}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {filterChips}

      {events.map((event) => (
        <button
          key={event.id}
          type="button"
          onClick={() => onOpenEvent(event.id)}
          className="w-full text-left bg-white border border-petal-rule-soft rounded-2xl p-4 shadow-sm hover:border-petal-rose/60 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-serif text-petal-ink truncate flex-1 leading-snug">{event.title}</h3>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {event.isPrivate && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-petal-ink/10 text-petal-ink inline-flex items-center gap-1" title={tr("私人", 'Private')}>
                  <Lock className="w-3 h-3" />
                  <span className="hidden sm:inline">{tr('私人', 'Private')}</span>
                </span>
              )}
              {statusPill(event.status)}
              {/* A 收尾中 row waiting on me looked identical to one waiting on my
                  partner — the single biggest reason the ceremony stalls. */}
              {event.closurePendingMe && (
                <span
                  data-testid="closure-your-turn-chip"
                  className="text-xs px-2 py-0.5 rounded-full bg-petal-rose-deep text-white font-medium"
                >
                  {tr('輪到你了', 'Your turn')}
                </span>
              )}
              {event.unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-petal-rose-deep text-white">
                  {event.unreadCount}
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-petal-muted mt-1">
            {formatDate(event.createdAt, tz)}
            {event.createdBy === currentUserId ? tr('・你發起', '・Started by you') : tr('・伴侶發起', '・Started by your partner')}
          </p>

          {event.lastMessagePreview && (
            <p className="text-sm text-petal-ink-soft line-clamp-2 mt-2">{event.lastMessagePreview}</p>
          )}

          {event.tags.length > 0 && (
            <div className="hidden sm:flex flex-wrap gap-1.5 mt-2.5">
              {event.tags.map((t) => (
                <span
                  key={t}
                  className="text-xs px-2 py-0.5 rounded-full bg-petal-sage/20 text-petal-ink inline-flex items-center gap-1"
                >
                  <Tag className="w-3 h-3" />
                  {t}
                </span>
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
