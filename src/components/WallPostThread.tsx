import React, { useEffect, useState } from 'react';
import { Send, Trash2, Sparkles, X, HeartHandshake } from 'lucide-react';
import { apiService, type WallReply, type MessageTranslationMap } from '../services/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatRelativeOrDate } from '../utils/datetime';
import { companionName, resolveCompanion } from '../utils/aiCompanions';
import { useAiQuota } from '../hooks/useAiQuota';
import AiQuotaHint from './AiQuotaHint';
import MessageTranslationCard from './MessageTranslationCard';
import ConflictBanner from './ConflictBanner';

interface WallPostThreadProps {
  postId: string;
  currentUserId: string | undefined;
  // The viewer's chosen AI 諮商師 (null = default Luma); names the invite
  // button and the preview panel.
  companionId?: string | null;
  onReplyCountChange?: (newCount: number) => void;
  onError?: (message: string) => void;
  onNotify?: (n: { type: 'success' | 'error' | 'warning' | 'info'; title: string; message: string }) => void;
}

const formatTime = (iso: string, tz: string) =>
  formatRelativeOrDate(iso, tz, { month: 'short', day: 'numeric' });

const WallPostThread: React.FC<WallPostThreadProps> = ({
  postId,
  currentUserId,
  companionId,
  onReplyCountChange,
  onError,
  onNotify,
}) => {
  const myCompanion = resolveCompanion(companionId);
  const { quota, refresh: refreshQuota } = useAiQuota();
  const [replies, setReplies] = useState<WallReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPosting, setAiPosting] = useState(false);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translations, setTranslations] = useState<MessageTranslationMap>({});
  const [translationLoading, setTranslationLoading] = useState(false);
  const tz = useTimezone();

  // Load the emotion/need translations for the thread's human replies. Cached
  // server-side per reply, so this only bills for still-untranslated messages.
  const loadTranslations = async () => {
    setTranslationLoading(true);
    const startedAt = Date.now();
    console.info('[情緒翻譯] wall: loading translations…', { postId });
    try {
      const map = await apiService.getWallTranslations(postId);
      const keys = Object.keys(map);
      console.info('[情緒翻譯] wall: got translations', { postId, count: keys.length, ms: Date.now() - startedAt, keys });
      if (keys.length === 0) {
        console.warn('[情緒翻譯] wall: empty translation map — nothing will render');
      }
      setTranslations(map);
    } catch (err) {
      console.error('[情緒翻譯] wall: load failed', err);
      const code = (err as { error_code?: string })?.error_code;
      const message = err instanceof Error ? err.message : '情緒翻譯暫時無法產生';
      if (code === 'AI_DAILY_LIMIT_REACHED') {
        onNotify?.({ type: 'warning', title: 'AI 額度已用完', message });
      } else {
        onError?.(message);
      }
    } finally {
      refreshQuota();
      setTranslationLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiService.getWallThread(postId);
        if (!cancelled) {
          setReplies(data.replies);
          onReplyCountChange?.(data.replies.length);
          setTranslationEnabled(data.translationEnabled);
          if (data.translationEnabled) loadTranslations();
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

  const handleToggleTranslation = async () => {
    const next = !translationEnabled;
    setTranslationEnabled(next);
    try {
      await apiService.setWallTranslation(postId, next);
      if (next) await loadTranslations();
    } catch (err) {
      setTranslationEnabled(!next);
      onError?.(err instanceof Error ? err.message : '無法更新情緒翻譯設定');
    }
  };

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
      // Translate the newcomer so the lens stays complete without a manual retap.
      if (translationEnabled) loadTranslations();
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

  const handleAiPreview = async () => {
    setAiLoading(true);
    try {
      const comment = await apiService.previewWallAiComment(postId);
      setAiPreview(comment);
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      const message = err instanceof Error ? err.message : 'AI 諮商師暫時無法回應';
      // A reached quota is an expected state with a next step (upgrade), not a
      // failure — surface it as a warning rather than a red error toast.
      if (code === 'AI_DAILY_LIMIT_REACHED') {
        onNotify?.({ type: 'warning', title: 'AI 額度已用完', message });
      } else {
        onError?.(message);
      }
    } finally {
      refreshQuota();
      setAiLoading(false);
    }
  };

  const handlePostAi = async () => {
    if (!aiPreview) return;
    setAiPosting(true);
    try {
      const reply = await apiService.postWallAiComment(postId, aiPreview);
      setReplies((prev) => {
        const next = [...prev, reply];
        onReplyCountChange?.(next.length);
        return next;
      });
      setAiPreview(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : '貼上 AI 留言失敗');
    } finally {
      setAiPosting(false);
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

      {!loading && (
        <ConflictBanner
          messages={replies.map((r) => ({ content: r.content, isAi: r.is_ai === true }))}
          threadKey={`wall:${postId}`}
        />
      )}

      {/* 情緒翻譯 lens toggle — shared across both partners. Turns each message
          into the underlying emotion + need so nobody reads an attack. */}
      {!loading && (
        <div className="flex items-center justify-between gap-2 bg-petal-cream-2 border border-petal-rule rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <HeartHandshake className="w-4 h-4 text-petal-rose-deep shrink-0" strokeWidth={1.5} />
            <span className="font-body text-xs text-petal-ink truncate">情緒翻譯</span>
            <span
              className="font-body text-[11px] text-petal-muted cursor-help shrink-0"
              title="開啟後，AI 會在每句話下方顯示背後的情緒與需求，幫你們從「立場」轉向「需求」。兩人都看得到。"
            >
              (?)
            </span>
            {translationLoading && (
              <span className="font-body text-[11px] text-petal-muted shrink-0">翻譯中…</span>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={translationEnabled}
            aria-label="情緒翻譯"
            onClick={handleToggleTranslation}
            data-testid={`wall-translation-toggle-${postId}`}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              translationEnabled ? 'bg-petal-rose-deep' : 'bg-petal-rule'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                translationEnabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )}

      {replies.map((reply) => {
        const isOwn = reply.author_id === currentUserId;
        const isAi = reply.is_ai === true;
        // A reply from the couple's dedicated (human) therapist — render it
        // distinctly from the two partners and from the AI 諮商師.
        const isTherapist = reply.is_therapist === true;
        return (
          <div
            key={reply.id}
            className={
              isAi
                ? 'pl-4 border-l-2 border-petal-rose-deep/40 bg-petal-cream-2 rounded-r-md py-2 pr-2'
                : isTherapist
                  ? 'pl-4 border-l-2 border-pink-400 bg-pink-50/60 rounded-r-md py-2 pr-2'
                  : 'pl-4 border-l-2 border-petal-rule'
            }
            data-testid={`wall-reply-${reply.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span
                  className={
                    isAi
                      ? 'font-display text-sm font-medium text-petal-rose-deep flex items-center gap-1'
                      : isTherapist
                        ? 'font-display text-sm font-medium text-pink-700 flex items-center gap-1'
                        : 'font-display text-sm font-medium text-petal-ink'
                  }
                >
                  {isAi ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                      {companionName(reply.ai_therapist) ? `${companionName(reply.ai_therapist)}・AI 諮商師` : 'AI 諮商師'}
                    </>
                  ) : isTherapist ? (
                    <>
                      <HeartHandshake className="w-3.5 h-3.5" strokeWidth={1.5} />
                      {reply.author_nickname ? `${reply.author_nickname}・心理師` : '專屬心理師'}
                    </>
                  ) : (
                    reply.author_nickname || (isOwn ? '我' : '對方')
                  )}
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
            {translationEnabled && !isAi && !isTherapist && translations[reply.id] && (
              <MessageTranslationCard translation={translations[reply.id]} />
            )}
          </div>
        );
      })}

      {/* Invite an AI 諮商師 to read the thread and post a gentle, even-handed
          comment. Preview-then-post: nothing reaches the partner until shared. */}
      <div className="pt-1">
        {!aiPreview ? (
          <button
            type="button"
            onClick={handleAiPreview}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 bg-petal-rose-deep text-white font-medium shadow-sm rounded-full px-3 py-1.5 font-body text-xs hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={`wall-ai-comment-btn-${postId}`}
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
            {aiLoading ? `${myCompanion.name} 思考中⋯` : `請 ${myCompanion.name} 看看`}
          </button>
        ) : null}
        {!aiPreview ? (
          <div className="mt-1.5">
            <AiQuotaHint quota={quota} />
          </div>
        ) : (
          <div
            className="border border-petal-rose-deep/30 bg-petal-cream-2 rounded-md p-3 space-y-2"
            data-testid={`wall-ai-preview-${postId}`}
          >
            <div className="flex items-center gap-1.5 text-petal-rose-deep font-display text-sm font-medium">
              <Sparkles className="w-4 h-4" strokeWidth={1.5} />
              {myCompanion.name}（AI 諮商師）的建議（僅你看得到，貼出後對方才會看到）
            </div>
            <div className="font-body text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">
              {aiPreview}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handlePostAi}
                disabled={aiPosting}
                className="inline-flex items-center gap-1.5 bg-petal-rose-deep text-petal-cream px-3 py-1.5 rounded-md font-body text-xs hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`wall-ai-post-${postId}`}
              >
                <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                {aiPosting ? '貼上中⋯' : '貼到對話串'}
              </button>
              <button
                type="button"
                onClick={() => setAiPreview(null)}
                disabled={aiPosting}
                className="inline-flex items-center gap-1.5 text-petal-muted hover:text-petal-ink px-2 py-1.5 font-body text-xs transition-colors disabled:opacity-50"
                data-testid={`wall-ai-cancel-${postId}`}
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                取消
              </button>
            </div>
          </div>
        )}
      </div>

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
