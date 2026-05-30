import React, { useEffect, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { apiService, type WallReply } from '../services/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatRelativeOrDate } from '../utils/datetime';

interface WallPostThreadProps {
  postId: string;
  currentUserId: string | undefined;
  onReplyCountChange?: (newCount: number) => void;
  onError?: (message: string) => void;
}

const formatTime = (iso: string, tz: string) =>
  formatRelativeOrDate(iso, tz, { month: 'short', day: 'numeric' });

const WallPostThread: React.FC<WallPostThreadProps> = ({
  postId,
  currentUserId,
  onReplyCountChange,
  onError,
}) => {
  const [replies, setReplies] = useState<WallReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const tz = useTimezone();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiService.getWallPostReplies(postId);
        if (!cancelled) {
          setReplies(data);
          onReplyCountChange?.(data.length);
        }
      } catch (err) {
        if (!cancelled) {
          onError?.(err instanceof Error ? err.message : '無法載入回覆');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const reply = await apiService.createWallPostReply(postId, trimmed);
      setReplies((prev) => {
        const next = [...prev, reply];
        onReplyCountChange?.(next.length);
        return next;
      });
      setDraft('');
    } catch (err) {
      onError?.(err instanceof Error ? err.message : '回覆失敗');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (replyId: string) => {
    if (!confirm('確定要刪除這則回覆嗎？')) return;
    try {
      await apiService.deleteWallPostReply(replyId);
      setReplies((prev) => {
        const next = prev.filter((r) => r.id !== replyId);
        onReplyCountChange?.(next.length);
        return next;
      });
    } catch (err) {
      onError?.(err instanceof Error ? err.message : '刪除失敗');
    }
  };

  return (
    <div
      className="mt-4 pt-4 border-t border-petal-rule space-y-3"
      data-testid={`wall-thread-${postId}`}
    >
      {loading && (
        <div className="font-body text-xs text-petal-muted">載入回覆中…</div>
      )}

      {!loading && replies.length === 0 && (
        <div className="font-body text-xs text-petal-muted italic">
          還沒有回覆 — 留下第一句話吧。
        </div>
      )}

      {replies.map((reply) => {
        const isOwn = reply.author_id === currentUserId;
        return (
          <div
            key={reply.id}
            className="pl-4 border-l-2 border-petal-rule"
            data-testid={`wall-reply-${reply.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-sm font-medium text-petal-ink">
                  {reply.author_nickname || (isOwn ? '我' : '對方')}
                </span>
                <span className="font-body text-[11px] text-petal-muted">
                  {formatTime(reply.created_at, tz)}
                </span>
              </div>
              {isOwn && (
                <button
                  type="button"
                  onClick={() => handleDelete(reply.id)}
                  className="p-1 text-petal-muted hover:text-petal-rose-deep transition-colors"
                  aria-label="刪除回覆"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              )}
            </div>
            <div className="mt-1 font-body text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">
              {reply.content}
            </div>
          </div>
        );
      })}

      <div className="flex items-start gap-2 pt-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="回覆⋯"
          className="flex-1 bg-white border border-petal-rule rounded-md px-3 py-2 font-body text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          data-testid={`wall-reply-input-${postId}`}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          className="bg-petal-ink text-petal-cream px-3 py-2 rounded-md hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="送出回覆"
          data-testid={`wall-reply-send-${postId}`}
        >
          <Send className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};

export default WallPostThread;
