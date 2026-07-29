import React, { useCallback, useEffect, useState } from 'react';
import { Heart, MessageCircle, ThumbsUp, ChevronLeft, Sparkles, MessageSquareHeart, StickyNote } from 'lucide-react';
import {
  apiService,
  type TherapistFocusArea,
  type PublicQaThreadSummary,
  type PublicQaThread,
  type PublicQaSource,
} from '../services/api';
import type { Notification } from './ErrorNotification';
import { focusLabel } from './therapistShared';
import { FocusFilter } from './FocusFilter';
import ParticipantAvatar from './ParticipantAvatar';
import MarkdownContent from './MarkdownContent';

// 公開問答 (Public Q&A): a read-only, anonymised browse of consultation chats
// that both the client and therapist agreed to publish. Helps people with
// similar problems learn from how a therapist handled it. The asker is always
// shown as "匿名個案"; only the therapist is identified.

interface PublicQaViewProps {
  isAuthenticated: boolean;
  showNotification: (n: Omit<Notification, 'id'>) => void;
  // Opens the directory tab focused on a therapist (so a reader can go book one).
  onFindTherapist?: () => void;
}

const TherapistMini: React.FC<{ therapist: NonNullable<PublicQaThreadSummary['therapist']> }> = ({ therapist }) => (
  <div className="flex items-center gap-2 min-w-0">
    <div className="w-7 h-7 shrink-0 rounded-full overflow-hidden bg-petal-cream-2 border border-petal-rule flex items-center justify-center">
      {therapist.photoUrl ? (
        <img src={therapist.photoUrl} alt={therapist.displayName} className="w-full h-full object-contain" />
      ) : (
        <Heart className="w-3.5 h-3.5 text-pink-300" strokeWidth={1.5} />
      )}
    </div>
    <span className="font-body text-xs text-petal-ink-soft truncate">
      {therapist.displayName}
      {therapist.title ? <span className="text-petal-muted">・{therapist.title}</span> : null}
    </span>
  </div>
);

// Couple-shared (non-therapist) threads show a source chip instead of a therapist.
const SOURCE_META: Record<Exclude<PublicQaSource, 'consultation'>, { label: string; icon: typeof MessageSquareHeart }> = {
  event: { label: '衝突事件 · 匿名分享', icon: MessageSquareHeart },
  wall: { label: '我們的牆 · 匿名分享', icon: StickyNote },
};

const SourceMini: React.FC<{ source: PublicQaSource }> = ({ source }) => {
  if (source === 'consultation') return null;
  const meta = SOURCE_META[source];
  const Icon = meta.icon;
  return (
    <span className="flex items-center gap-1.5 min-w-0 font-body text-xs text-petal-ink-soft">
      <Icon className="w-3.5 h-3.5 text-petal-sage-deep shrink-0" strokeWidth={1.5} />
      <span className="truncate">{meta.label}</span>
    </span>
  );
};

const PublicQaView: React.FC<PublicQaViewProps> = ({ isAuthenticated, showNotification, onFindTherapist }) => {
  const [focus, setFocus] = useState<TherapistFocusArea | 'all'>('all');
  const [threads, setThreads] = useState<PublicQaThreadSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState<{ id: string; source: PublicQaSource } | null>(null);

  const load = useCallback(async (nextPage: number, replace: boolean) => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiService.getPublicQa(focus === 'all' ? undefined : focus, nextPage);
      setThreads((prev) => (replace ? res.threads : [...prev, ...res.threads]));
      setHasMore(res.hasMore);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法取得公開問答列表');
    } finally {
      setLoading(false);
    }
  }, [focus]);

  useEffect(() => { load(1, true); }, [load]);

  if (open) {
    return (
      <PublicQaDetail
        id={open.id}
        source={open.source}
        isAuthenticated={isAuthenticated}
        showNotification={showNotification}
        onBack={() => setOpen(null)}
        onFindTherapist={onFindTherapist}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="public-qa-view">
      <div className="text-center max-w-2xl mx-auto">
        <p className="font-body text-sm text-petal-ink-soft">
          這些是經諮商師與個案雙方同意、<span className="text-petal-ink">匿名公開</span>的對話。
          也許別人的經驗，正好能幫上你。
        </p>
      </div>

      {/* Focus filter — a few common tags, the rest behind 更多 */}
      <FocusFilter value={focus} onChange={setFocus} />

      {loading && threads.length === 0 ? (
        <p className="text-center font-body text-sm text-petal-muted py-12">載入中…</p>
      ) : error ? (
        <div className="text-center py-12">
          <p className="font-body text-sm text-petal-rose-deep mb-3">{error}</p>
          <button onClick={() => load(1, true)} className="font-body text-sm text-petal-ink underline underline-offset-4">
            重新載入
          </button>
        </div>
      ) : threads.length === 0 ? (
        <p className="text-center font-body text-sm text-petal-muted py-12">
          這個領域還沒有公開問答。換個領域看看，或成為第一個分享對話的人。
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="public-qa-list">
            {threads.map((t) => (
              <button
                key={`${t.source}-${t.id}`}
                onClick={() => setOpen({ id: t.id, source: t.source })}
                data-testid="public-qa-card"
                className="text-left flex flex-col bg-petal-cream rounded-lg border border-petal-rule shadow-petal p-5 hover:border-petal-ink transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-medium text-petal-ink line-clamp-2">{t.title}</h3>
                  {t.focusArea && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-petal-cream-2 border border-petal-rule font-body text-[11px] text-petal-ink-soft">
                      {focusLabel(t.focusArea)}
                    </span>
                  )}
                </div>
                {t.preview && (
                  <p className="mt-2 font-body text-sm text-petal-ink-soft line-clamp-3">{t.preview}</p>
                )}
                <div className="mt-3 pt-3 border-t border-petal-rule flex items-center justify-between gap-3">
                  {t.therapist ? <TherapistMini therapist={t.therapist} /> : <SourceMini source={t.source} />}
                  <div className="flex items-center gap-3 font-body text-[11px] text-petal-muted shrink-0">
                    <span className="inline-flex items-center gap-1"><ThumbsUp className="w-3 h-3" strokeWidth={1.5} /> {t.helpfulCount}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" strokeWidth={1.5} /> {t.messageCount}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {hasMore && (
            <div className="text-center">
              <button
                onClick={() => load(page + 1, false)}
                disabled={loading}
                className="px-5 py-2 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-[13px] font-medium disabled:opacity-50"
              >
                {loading ? '載入中…' : '載入更多'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// --- Read-only thread detail ----------------------------------------------

const PublicQaDetail: React.FC<{
  id: string;
  source: PublicQaSource;
  isAuthenticated: boolean;
  showNotification: (n: Omit<Notification, 'id'>) => void;
  onBack: () => void;
  onFindTherapist?: () => void;
}> = ({ id, source, isAuthenticated, showNotification, onBack, onFindTherapist }) => {
  const [thread, setThread] = useState<PublicQaThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    let alive = true;
    apiService.getPublicQaThread(id, source)
      .then((t) => { if (alive) setThread(t); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : '無法載入公開問答'); });
    return () => { alive = false; };
  }, [id, source]);

  const toggleVote = async () => {
    if (!isAuthenticated) {
      showNotification({ type: 'info', title: '請先登入', message: '登入後就能標記對你有幫助的公開問答', duration: 3500 });
      return;
    }
    if (!thread) return;
    try {
      setVoting(true);
      const res = await apiService.votePublicQa(thread.id);
      setThread({ ...thread, hasVoted: res.voted, helpfulCount: res.helpfulCount });
    } catch (err) {
      showNotification({ type: 'error', title: '操作失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 3500 });
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <button onClick={onBack} className="inline-flex items-center gap-1 font-body text-sm text-petal-muted hover:text-petal-ink">
        <ChevronLeft className="w-4 h-4" strokeWidth={1.5} /> 回到公開問答
      </button>

      {error ? (
        <p className="text-center font-body text-sm text-petal-rose-deep py-12">{error}</p>
      ) : !thread ? (
        <p className="text-center font-body text-sm text-petal-muted py-12">載入中…</p>
      ) : (
        <div className="bg-petal-cream rounded-lg border border-petal-rule shadow-petal" data-testid="public-qa-detail">
          <div className="px-5 py-4 border-b border-petal-rule">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl font-light text-petal-ink">{thread.title}</h2>
              {thread.focusArea && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-petal-cream-2 border border-petal-rule font-body text-[11px] text-petal-ink-soft mt-1">
                  {focusLabel(thread.focusArea)}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {thread.therapist ? (
                <>
                  <TherapistMini therapist={thread.therapist} />
                  <span className="font-body text-[11px] text-petal-muted">回答</span>
                </>
              ) : (
                <SourceMini source={thread.source} />
              )}
            </div>
          </div>

          {/* Anonymised transcript. AI 諮商師 messages render distinctly; the
              two partners are 匿名 A / 匿名 B. */}
          <div className="px-4 py-4 space-y-3">
            {thread.messages.map((m) => {
              const highlighted = m.isTherapist || m.isAi; // left-aligned, accented
              return (
                <div key={m.id} className={`flex ${highlighted ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[82%] flex flex-col ${highlighted ? 'items-start' : 'items-end'}`}>
                    <div className="flex items-center gap-1.5 mb-0.5 px-1">
                      <ParticipantAvatar
                        size="xs"
                        role={m.isTherapist ? 'therapist' : m.isAi ? 'ai' : 'user'}
                        name={m.isAi ? 'AI 諮商師' : m.senderName}
                        colorKey={m.senderName}
                      />
                      <span className="font-body text-[11px] text-petal-muted">
                        {m.isTherapist ? `${m.senderName}（諮商師）` : m.isAi ? 'AI 諮商師' : m.senderName}
                      </span>
                    </div>
                    <div
                      className={`px-3.5 py-2 rounded-2xl font-body text-sm ${
                        m.isTherapist
                          ? 'bg-pink-100 text-petal-ink rounded-bl-sm'
                          : m.isAi
                            ? 'bg-petal-sage/20 text-petal-ink rounded-bl-sm'
                            : 'bg-petal-cream-2 text-petal-ink rounded-br-sm'
                      }`}
                    >
                      <MarkdownContent content={m.body} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer: helpful vote + CTA to find a therapist */}
          <div className="px-5 py-4 border-t border-petal-rule flex items-center justify-between gap-3">
            {thread.source === 'consultation' ? (
              <button
                onClick={toggleVote}
                disabled={voting}
                data-testid="public-qa-vote"
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border font-body text-[13px] font-medium transition-colors disabled:opacity-50 ${
                  thread.hasVoted
                    ? 'bg-pink-500 text-white border-pink-500'
                    : 'border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink'
                }`}
              >
                <ThumbsUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                有幫助 {thread.helpfulCount > 0 ? thread.helpfulCount : ''}
              </button>
            ) : (
              <span className="font-body text-[11px] text-petal-muted">由用戶匿名分享</span>
            )}
            {onFindTherapist && (
              <button
                onClick={onFindTherapist}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 transition-colors font-body text-[13px] font-medium"
              >
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                找諮商師聊聊
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicQaView;
