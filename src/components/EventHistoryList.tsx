import { useEffect, useState } from 'react';
import { Tag, CheckCircle2, Sprout, Lock, MessageSquareHeart } from 'lucide-react';
import apiService, { type EventRecord, type EventStatus } from '../services/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateTime } from '../utils/datetime';

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
  { value: 'all', label: '全部' },
  { value: 'open', label: '未解決' },
  { value: 'closing', label: '收尾中' },
  { value: 'resolved', label: '已解決' },
];

function statusPill(status: EventStatus) {
  switch (status) {
    // 'resolve_pending' is a legacy row from the retired 標記為解決 handshake and
    // reads as 未解決 — exactly how the detail view treats it too.
    case 'open':
    case 'resolve_pending':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-petal-rose/30 text-petal-ink">未解決</span>;
    case 'closing':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-petal-sage/20 text-petal-ink inline-flex items-center gap-1">
          <Sprout className="w-3 h-3" />
          收尾中
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
        if (!cancelled) setError(err instanceof Error ? err.message : '無法取得對話列表');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (loading) {
    return <div className="p-8 text-center text-petal-ink-soft">載入中…</div>;
  }
  if (error) {
    return <div className="p-6 text-center text-red-500">{error}</div>;
  }
  if (events.length === 0) {
    return (
      <div
        className="bg-white border border-petal-rule-soft rounded-2xl p-8 text-center text-petal-ink-soft"
        data-testid="events-empty-state"
      >
        <MessageSquareHeart className="w-8 h-8 mx-auto mb-3 text-petal-rose-deep" />
        <p className="text-petal-ink font-medium">說不出口的委屈，寫在這裡</p>
        <p className="text-xs mt-1.5 leading-relaxed max-w-xs mx-auto">
          把當下的情緒原封不動寫下來（可以罵、可以很火），AI 會幫你整理成對方
          聽得進去的說法，你挑一個版本再送出。
        </p>
        {onCompose && (
          <button
            type="button"
            data-testid="events-empty-compose"
            onClick={onCompose}
            className="mt-4 px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition"
          >
            寫下第一件想說開的事
          </button>
        )}
        <p className="text-[11px] text-petal-muted mt-3">也可以只存成私人對話，對方不會看到。</p>
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
