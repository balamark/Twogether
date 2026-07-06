import { useEffect, useMemo, useState } from 'react';
import { Tag, CheckCircle2, Clock, Lock, MessageSquareHeart } from 'lucide-react';
import apiService, { type EventRecord, type EventStatus } from '../services/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateTime } from '../utils/datetime';

interface EventHistoryListProps {
  onOpenEvent: (id: string) => void;
  currentUserId: string;
  filterStatus?: Exclude<EventStatus, 'resolved'> | null;
  hideFilters?: boolean;
}

const STATUS_OPTIONS: { value: EventStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'open', label: '未解決' },
  { value: 'resolve_pending', label: '等待確認' },
  { value: 'resolved', label: '已解決' },
];

function statusPill(status: EventStatus) {
  switch (status) {
    case 'open':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-petal-rose/30 text-petal-ink">未解決</span>;
    case 'resolve_pending':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          等待確認
        </span>
      );
    case 'resolved':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-petal-sage/30 text-petal-ink inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          已解決
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
  filterStatus,
  hideFilters,
}: EventHistoryListProps) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<EventStatus | 'all'>(filterStatus ?? 'all');
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
        if (!cancelled) setError(err instanceof Error ? err.message : '無法取得事件列表');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const visibleEvents = useMemo(() => {
    if (!filterStatus) return events;
    return events.filter((e) => e.status !== 'resolved');
  }, [events, filterStatus]);

  if (loading) {
    return <div className="p-8 text-center text-petal-ink-soft">載入中…</div>;
  }
  if (error) {
    return <div className="p-6 text-center text-red-500">{error}</div>;
  }
  if (visibleEvents.length === 0) {
    return (
      <div className="bg-white border border-petal-rule-soft rounded-2xl p-10 text-center text-petal-ink-soft">
        <MessageSquareHeart className="w-8 h-8 mx-auto mb-3 text-petal-rose-deep" />
        <p>目前還沒有事件。</p>
        <p className="text-xs mt-1">當你有衝突或情緒想整理時，點上方「建立事件」開始。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!hideFilters && (
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
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
      )}

      {visibleEvents.map((event) => (
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
                <span className="text-xs px-2 py-0.5 rounded-full bg-petal-ink/10 text-petal-ink inline-flex items-center gap-1" title="私人">
                  <Lock className="w-3 h-3" />
                  <span className="hidden sm:inline">私人</span>
                </span>
              )}
              {statusPill(event.status)}
              {event.unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-petal-rose-deep text-white">
                  {event.unreadCount}
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-petal-muted mt-1">
            {formatDate(event.createdAt, tz)}
            {event.createdBy === currentUserId ? '・你發起' : '・伴侶發起'}
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
