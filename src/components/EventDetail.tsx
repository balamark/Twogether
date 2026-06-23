import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  Clock,
  Tag,
  Loader2,
  Lock,
  Sparkles,
  HeartHandshake,
  Globe,
  X,
} from 'lucide-react';
import apiService, {
  type EventRecord,
  type EventStatus,
  type ReplyRewritePreview,
  type EventVersionKey,
} from '../services/api';
import ReplyStepBar from './ReplyStepBar';
import { useScrollLock } from '../hooks/useScrollLock';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateTime } from '../utils/datetime';

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

function formatTime(iso: string, tz: string) {
  if (!iso) return '';
  try {
    return formatDateTime(iso, tz);
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
  const [rewriting, setRewriting] = useState(false);
  const [rewritePreview, setRewritePreview] = useState<ReplyRewritePreview | null>(null);
  const [aiInviting, setAiInviting] = useState(false);
  const [aiPosting, setAiPosting] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [shareWarnOpen, setShareWarnOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const tz = useTimezone();

  const insertPhrase = (phrase: string) => {
    setReply((prev) => (prev.trim().length > 0 ? `${prev}\n${phrase}` : phrase));
  };

  const requestRewrite = async () => {
    const draft = reply.trim();
    if (!draft) return;
    setRewriting(true);
    try {
      const preview = await apiService.previewReplyRewrite(eventId, draft);
      setRewritePreview(preview);
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'AI 改寫失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setRewriting(false);
    }
  };

  const applyRewriteVersion = (key: EventVersionKey) => {
    if (!rewritePreview) return;
    setReply(rewritePreview.versions[key]);
    setRewritePreview(null);
  };

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

  const inviteAiCounselor = async () => {
    setAiInviting(true);
    try {
      const comment = await apiService.previewEventAiComment(eventId);
      setAiPreview(comment);
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'AI 諮商師暫時無法回應',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setAiInviting(false);
    }
  };

  const postAiCounselor = async () => {
    if (!aiPreview) return;
    setAiPosting(true);
    try {
      await apiService.postEventAiComment(eventId, aiPreview);
      setAiPreview(null);
      await refresh();
    } catch (err) {
      showNotification({
        type: 'error',
        title: '貼上失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setAiPosting(false);
    }
  };

  const confirmShare = async () => {
    setSharing(true);
    try {
      const updated = await apiService.publishEvent(eventId);
      setEvent((prev) => (prev ? { ...prev, publicStatus: updated.publicStatus } : prev));
      setShareWarnOpen(false);
      showNotification({
        type: 'success',
        title: '已匿名公開',
        message: '這段對話會以匿名方式顯示在「公開問答」，謝謝你願意幫助別人。',
      });
    } catch (err) {
      showNotification({ type: 'error', title: '公開失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSharing(false);
    }
  };

  const unshare = async () => {
    setSharing(true);
    try {
      const updated = await apiService.unpublishEvent(eventId);
      setEvent((prev) => (prev ? { ...prev, publicStatus: updated.publicStatus } : prev));
      showNotification({ type: 'info', title: '已取消公開', message: '這段對話不再顯示於公開問答。' });
    } catch (err) {
      showNotification({ type: 'error', title: '操作失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSharing(false);
    }
  };

  const handleResolveRequest = async () => {
    setResolving(true);
    try {
      await apiService.requestEventResolve(eventId);
      await refresh();
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
      await apiService.confirmEventResolve(eventId);
      await refresh();
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
          {formatTime(event.createdAt, tz)}・{isAuthor ? '你發起' : '伴侶發起'}
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

        {/* Share to 公開問答 (anonymised, single-party toggle with warning) */}
        {!event.isPrivate && (
          <div className="mt-4 pt-3 border-t border-petal-rule">
            {event.publicStatus === 'published' ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-petal-sage-deep inline-flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  已匿名公開到公開問答
                </span>
                <button
                  type="button"
                  data-testid="event-unshare-button"
                  onClick={unshare}
                  disabled={sharing}
                  className="text-xs px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink disabled:opacity-50"
                >
                  取消公開
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="event-share-button"
                onClick={() => setShareWarnOpen(true)}
                className="text-xs px-3 py-1.5 rounded-full border border-petal-sage text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink inline-flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5" />
                匿名公開到公開問答
              </button>
            )}
          </div>
        )}
      </header>

      {!event.isPrivate && (
        <section className="bg-petal-cream border border-petal-rule rounded-2xl p-4 space-y-3">
          {event.messages.length === 0 && (
            <p className="text-sm text-petal-ink-soft text-center py-4">尚無訊息</p>
          )}
          {event.messages.map((m) => {
            if (m.isAi) {
              return (
                <div key={m.id} className="flex justify-center">
                  <div className="max-w-[92%] w-full rounded-2xl px-4 py-3 bg-petal-sage/15 border border-petal-sage/40">
                    <div className="flex items-center gap-1.5 mb-1 text-petal-sage-deep">
                      <HeartHandshake className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">AI 諮商師</span>
                    </div>
                    <p className="text-sm text-petal-ink whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    <p className="text-[10px] text-petal-muted mt-1.5">{formatTime(m.createdAt, tz)}</p>
                  </div>
                </div>
              );
            }
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
                    <span>{formatTime(m.createdAt, tz)}</span>
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
          <ReplyStepBar onInsertPhrase={insertPhrase} />
          <textarea
            data-testid="event-reply-input"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="回覆…"
            rows={2}
            maxLength={2000}
            className="w-full p-2 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
          <div className="flex flex-wrap justify-end gap-2 mt-2">
            <button
              type="button"
              data-testid="event-ai-counselor-button"
              onClick={inviteAiCounselor}
              disabled={aiInviting}
              className="px-3 py-2 rounded-full border border-petal-sage-deep text-petal-sage-deep inline-flex items-center gap-2 disabled:opacity-50 hover:bg-petal-sage/20 mr-auto"
              title="請 AI 諮商師讀過你們的對話，給一段中立的建議"
            >
              {aiInviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <HeartHandshake className="w-4 h-4" />}
              <span>請 AI 諮商師加入</span>
            </button>
            <button
              type="button"
              data-testid="event-reply-rewrite-button"
              onClick={requestRewrite}
              disabled={rewriting || reply.trim().length === 0}
              className="px-3 py-2 rounded-full border border-petal-sage text-petal-ink inline-flex items-center gap-2 disabled:opacity-50 hover:bg-petal-sage/20"
              title="讓 AI 把你的回覆改得更中性、客觀"
            >
              {rewriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>讓 AI 重寫</span>
            </button>
            <button
              type="button"
              data-testid="event-reply-send-button"
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

      {rewritePreview && (
        <RewritePicker
          preview={rewritePreview}
          onApply={applyRewriteVersion}
          onCancel={() => setRewritePreview(null)}
        />
      )}

      {aiPreview !== null && (
        <AiCounselorPreview
          comment={aiPreview}
          posting={aiPosting}
          onPost={postAiCounselor}
          onCancel={() => setAiPreview(null)}
        />
      )}

      {shareWarnOpen && (
        <ShareWarning
          busy={sharing}
          onConfirm={confirmShare}
          onCancel={() => setShareWarnOpen(false)}
        />
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

function AiCounselorPreview({
  comment,
  posting,
  onPost,
  onCancel,
}: {
  comment: string;
  posting: boolean;
  onPost: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      data-testid="event-ai-counselor-modal"
    >
      <div className="bg-petal-cream rounded-2xl max-w-lg w-full max-h-[min(85vh,calc(100dvh-80px))] overflow-y-auto overscroll-contain p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-petal-sage-deep" />
            <div>
              <h3 className="text-lg font-serif text-petal-ink">AI 諮商師的建議</h3>
              <p className="text-xs text-petal-ink-soft mt-1">看看這段建議，貼到對話串後雙方都看得到。</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="text-petal-ink-soft hover:text-petal-ink" aria-label="取消">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-white border border-petal-sage/40 rounded-xl p-4 mb-4">
          <p className="text-sm text-petal-ink whitespace-pre-wrap leading-relaxed">{comment}</p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            先不要
          </button>
          <button
            type="button"
            data-testid="event-ai-counselor-post"
            onClick={onPost}
            disabled={posting}
            className="text-sm px-4 py-2 rounded-full bg-petal-sage-deep text-petal-cream inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            貼到對話串
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareWarning({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="event-share-warning">
      <div className="bg-petal-cream rounded-2xl max-w-md w-full p-5">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-5 h-5 text-petal-rose-deep" />
          <h3 className="text-lg font-serif text-petal-ink">公開到「公開問答」</h3>
        </div>
        <p className="text-sm text-petal-ink-soft leading-relaxed mb-2">
          公開後，這段對話會<span className="text-petal-ink font-medium">匿名</span>顯示在「公開問答」，
          <span className="text-petal-ink font-medium">所有人（包含未登入的訪客）都看得到</span>。
        </p>
        <p className="text-sm text-petal-ink-soft leading-relaxed mb-4">
          你們會顯示為「匿名 A / 匿名 B」，不會出現名字。你隨時可以取消公開。
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="event-share-confirm"
            onClick={onConfirm}
            disabled={busy}
            className="text-sm px-4 py-2 rounded-full bg-petal-ink text-petal-cream inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            確定公開
          </button>
        </div>
      </div>
    </div>
  );
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

const VERSION_LABELS: Record<EventVersionKey, { title: string; hint: string }> = {
  neutral: { title: '中性版', hint: '第三方客觀描述，不示弱也不指責' },
  firm: { title: '堅定版', hint: '以「我訊息」說感受，不指責' },
  warm: { title: '善意版', hint: '在堅定的基礎上多一份願意聊聊的善意' },
};

function RewritePicker({
  preview,
  onApply,
  onCancel,
}: {
  preview: ReplyRewritePreview;
  onApply: (key: EventVersionKey) => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      data-testid="event-reply-rewrite-modal"
    >
      <div className="bg-petal-cream rounded-2xl max-w-lg w-full max-h-[min(85vh,calc(100dvh-80px))] overflow-y-auto overscroll-contain p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-serif text-petal-ink">AI 幫你改寫的版本</h3>
            <p className="text-xs text-petal-ink-soft mt-1">挑一個版本套用到你的草稿，或保留原文。</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-petal-ink-soft hover:text-petal-ink"
            aria-label="取消"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {(Object.keys(VERSION_LABELS) as EventVersionKey[]).map((key) => (
            <div
              key={key}
              className="bg-white border border-petal-rule rounded-xl p-3"
              data-testid={`event-reply-rewrite-card-${key}`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <div className="text-sm font-medium text-petal-ink">{VERSION_LABELS[key].title}</div>
                <div className="text-[11px] text-petal-muted">{VERSION_LABELS[key].hint}</div>
              </div>
              <p className="text-sm text-petal-ink whitespace-pre-wrap mb-2">{preview.versions[key]}</p>
              <div className="flex justify-end">
                <button
                  type="button"
                  data-testid={`event-reply-rewrite-apply-${key}`}
                  onClick={() => onApply(key)}
                  className="text-sm px-3 py-1.5 rounded-full bg-petal-ink text-petal-cream hover:opacity-90"
                >
                  使用這個版本
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            保留原文
          </button>
        </div>
      </div>
    </div>
  );
}
