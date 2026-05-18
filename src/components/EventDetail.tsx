import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  Clock,
  Tag,
  Loader2,
  Lock,
} from 'lucide-react';
import apiService, { type EventRecord, type EventStatus } from '../services/api';

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface EventDetailProps {
  eventId: string;
  currentUserId: string;
  onBack: () => void;
  showNotification: (n: NotificationInput) => void;
}

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

function formatTime(iso: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function EventDetail({ eventId, currentUserId, onBack, showNotification }: EventDetailProps) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);

  const refresh = async () => {
    try {
      const data = await apiService.getEvent(eventId);
      setEvent(data);
      // Mark inbound unread messages as read (fire-and-forget)
      data.messages
        .filter((m) => m.senderId !== currentUserId && !m.readAt)
        .forEach((m) => apiService.markEventMessageRead(eventId, m.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法取得事件詳情');
    }
  };

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const sendReply = async () => {
    const content = reply.trim();
    if (!content) return;
    setSending(true);
    try {
      await apiService.replyToEvent(eventId, content);
      setReply('');
      await refresh();
    } catch (err) {
      showNotification({
        type: 'error',
        title: '送出失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setSending(false);
    }
  };

  const handleResolveRequest = async () => {
    setResolving(true);
    try {
      const updated = await apiService.requestEventResolve(eventId);
      setEvent(updated);
      showNotification({
        type: 'success',
        title: '已發起解決請求',
        message: '等待對方確認',
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: '操作失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setResolving(false);
    }
  };

  const handleResolveConfirm = async () => {
    setResolving(true);
    try {
      const updated = await apiService.confirmEventResolve(eventId);
      setEvent(updated);
      showNotification({ type: 'success', title: '事件已解決', message: '雙方確認完成' });
    } catch (err) {
      showNotification({
        type: 'error',
        title: '操作失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-petal-ink-soft">載入中…</div>;
  }
  if (error || !event) {
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        <div className="p-6 text-center text-red-500">{error || '找不到事件'}</div>
      </div>
    );
  }

  const isAuthor = event.createdBy === currentUserId;
  const canSendMessage = !event.isPrivate && event.status !== 'resolved';

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />

      <header className="bg-petal-cream border border-petal-rule rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="text-xl font-serif text-petal-ink flex-1">{event.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {event.isPrivate && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-petal-ink/10 text-petal-ink inline-flex items-center gap-1">
                <Lock className="w-3 h-3" />
                私人
              </span>
            )}
            {statusPill(event.status)}
          </div>
        </div>
        <p className="text-xs text-petal-muted mb-3">
          {formatTime(event.createdAt)}・{isAuthor ? '你發起' : '伴侶發起'}
        </p>

        <p className="text-sm text-petal-ink-soft leading-relaxed mb-3 whitespace-pre-wrap">{event.summary}</p>

        <div className="flex flex-wrap gap-1.5">
          {event.emotions.map((e) => (
            <span key={`em-${e}`} className="text-xs px-2 py-0.5 rounded-full bg-petal-rose/20 text-petal-ink">
              {e}
            </span>
          ))}
          {event.tags.map((t) => (
            <span
              key={`tg-${t}`}
              className="text-xs px-2 py-0.5 rounded-full bg-petal-sage/20 text-petal-ink inline-flex items-center gap-1"
            >
              <Tag className="w-3 h-3" />
              {t}
            </span>
          ))}
        </div>
      </header>

      {!event.isPrivate && (
        <section className="bg-petal-cream border border-petal-rule rounded-2xl p-4 space-y-3">
          {event.messages.length === 0 && (
            <p className="text-sm text-petal-ink-soft text-center py-4">尚無訊息</p>
          )}
          {event.messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                    mine ? 'bg-petal-rose/20' : 'bg-petal-sage/15'
                  }`}
                >
                  <p className="text-sm text-petal-ink whitespace-pre-wrap">{m.content}</p>
                  <p className="text-[10px] text-petal-muted mt-1 flex items-center gap-1">
                    <span>{formatTime(m.createdAt)}</span>
                    {mine && m.readAt && <span>・已讀</span>}
                  </p>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {canSendMessage && (
        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-3">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="回覆…"
            rows={2}
            maxLength={2000}
            className="w-full p-2 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={sendReply}
              disabled={sending || reply.trim().length === 0}
              className="px-4 py-2 rounded-full bg-petal-ink text-petal-cream inline-flex items-center gap-2 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>送出</span>
            </button>
          </div>
        </div>
      )}

      {!event.isPrivate && event.status !== 'resolved' && (
        <ResolveControls
          event={event}
          currentUserId={currentUserId}
          busy={resolving}
          onRequest={handleResolveRequest}
          onConfirm={handleResolveConfirm}
        />
      )}
    </div>
  );
}

function ResolveControls({
  event,
  currentUserId,
  busy,
  onRequest,
  onConfirm,
}: {
  event: EventRecord;
  currentUserId: string;
  busy: boolean;
  onRequest: () => void;
  onConfirm: () => void;
}) {
  if (event.status === 'open') {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={onRequest}
          className="px-4 py-2 rounded-full border border-petal-sage text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          標記為解決
        </button>
      </div>
    );
  }
  if (event.status === 'resolve_pending') {
    if (event.resolveRequestedBy === currentUserId) {
      return (
        <div className="text-center text-sm text-petal-ink-soft bg-amber-50 border border-amber-200 rounded-2xl p-3 inline-flex items-center gap-2 justify-center w-full">
          <Clock className="w-4 h-4 text-amber-700" />
          已發起解決請求，等待對方確認…
        </div>
      );
    }
    return (
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="px-4 py-2 rounded-full bg-petal-sage-deep text-petal-cream inline-flex items-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          確認解決
        </button>
      </div>
    );
  }
  return null;
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-sm text-petal-ink-soft hover:text-petal-ink"
    >
      <ArrowLeft className="w-4 h-4" />
      回到歷史
    </button>
  );
}
