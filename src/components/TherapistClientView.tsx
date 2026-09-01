import React, { useCallback, useEffect, useState } from 'react';
import { X, Lock, Send, MessageCircle, ChevronLeft, Compass, Library, ClipboardList, Clock } from 'lucide-react';
import {
  apiService,
  type WallPost,
  type WallReply,
  type EventRecord,
  type TherapistClientCouple,
  type TherapistClientTopics,
  type TherapyTopicSelectionStatus,
  type TherapySummaryHistoryEntry,
} from '../services/api';
import type { Notification } from './ErrorNotification';
import { useScrollLock } from '../hooks/useScrollLock';
import { isVideoUrl } from '../utils/script';
import { companionName } from '../utils/aiCompanions';
import { ROLE_STYLE } from '../utils/threadRoles';
import ParticipantAvatar from './ParticipantAvatar';
import TherapySummaryDetail from './TherapySummaryDetail';

// A dedicated therapist's read-only (or read+comment) view of ONE client
// couple's 牆 and 好好說話. Private items are never returned by the API, so this
// only ever shows shared content. When the couple granted can_comment, each
// thread gets a reply/message composer whose posts are flagged 心理師.
interface Props {
  client: TherapistClientCouple;
  onClose: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}

type Tab = 'wall' | 'events' | 'topics' | 'summaries';

const coupleTitle = (c: TherapistClientCouple): string =>
  c.coupleName || (c.partnerNames.length ? c.partnerNames.join(' & ') : '伴侶');

const TherapistClientView: React.FC<Props> = ({ client, onClose, showNotification }) => {
  useScrollLock(true);
  const [tab, setTab] = useState<Tab>('wall');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-petal-cream w-full sm:max-w-2xl h-[92vh] sm:h-[85vh] flex flex-col rounded-t-2xl sm:rounded-lg border border-petal-rule shadow-petal" data-testid="therapist-client-view">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-petal-rule">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-medium text-petal-ink truncate">{coupleTitle(client)}</h3>
            <p className="inline-flex items-center gap-1 font-body text-[11px] text-petal-muted">
              <Lock className="w-3 h-3" strokeWidth={1.5} />
              {client.canComment ? '可留言・不含私密內容' : '唯讀・不含私密內容'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-petal-muted hover:text-petal-ink" aria-label="關閉">
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-petal-rule">
          {(['wall', 'events', 'topics', 'summaries'] as Tab[]).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              data-testid={`client-tab-${key}`}
              className={`flex-1 py-2.5 font-body text-sm font-medium transition-colors ${
                tab === key ? 'text-pink-600 border-b-2 border-pink-500' : 'text-petal-muted hover:text-petal-ink'
              }`}
            >
              {key === 'wall' ? '牆' : key === 'events' ? '好好說話' : key === 'topics' ? '話題建議' : '諮商摘要'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'wall' ? (
            <ClientWall coupleId={client.coupleId} canComment={client.canComment} showNotification={showNotification} />
          ) : tab === 'events' ? (
            <ClientEvents coupleId={client.coupleId} canComment={client.canComment} showNotification={showNotification} />
          ) : tab === 'topics' ? (
            <ClientTherapyTopics coupleId={client.coupleId} showNotification={showNotification} />
          ) : (
            <ClientTherapySummaries coupleId={client.coupleId} showNotification={showNotification} />
          )}
        </div>
      </div>
    </div>
  );
};

// --- Wall tab -------------------------------------------------------------

const ClientWall: React.FC<{
  coupleId: string;
  canComment: boolean;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ coupleId, canComment, showNotification }) => {
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { posts } = await apiService.getClientWall(coupleId);
      setPosts(posts);
    } catch (err) {
      showNotification({ type: 'error', title: '無法載入', message: err instanceof Error ? err.message : '請稍後再試', duration: 3500 });
    } finally {
      setLoading(false);
    }
  }, [coupleId, showNotification]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-center font-body text-sm text-petal-muted py-10">載入中…</p>;
  if (posts.length === 0) return <p className="text-center font-body text-sm text-petal-muted py-10">這對伴侶的牆上還沒有內容。</p>;

  return (
    <div className="p-4 space-y-3" data-testid="client-wall">
      {posts.map((p) => (
        <div key={p.id} className="rounded-lg border border-petal-rule bg-petal-cream p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-body text-sm font-medium text-petal-ink">{p.author_nickname || '某人'}</span>
            <span className="font-body text-[11px] text-petal-muted">{new Date(p.created_at).toLocaleDateString('zh-TW')}</span>
          </div>
          {p.mood_tag && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-pink-50 border border-pink-200 font-body text-[11px] text-pink-700">
              {p.mood_tag}
            </span>
          )}
          {p.content && (
            <p className="mt-1.5 font-body text-sm text-petal-ink-soft leading-relaxed whitespace-pre-wrap">{p.content}</p>
          )}
          {p.media && p.media.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {p.media.map((url) => (
                <div key={url} className="aspect-video rounded-md overflow-hidden bg-petal-cream-2 border border-petal-rule flex items-center justify-center">
                  {isVideoUrl(url) ? (
                    <video
                      src={url}
                      controls
                      controlsList="nodownload"
                      disablePictureInPicture
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img src={url} alt="" className="w-full h-full object-contain" />
                  )}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setOpenPostId(openPostId === p.id ? null : p.id)}
            className="mt-2.5 inline-flex items-center gap-1 font-body text-xs text-petal-muted hover:text-petal-ink"
            data-testid="client-wall-open-thread"
          >
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            {openPostId === p.id ? '收合' : `回覆串${p.reply_count > 0 ? ` (${p.reply_count})` : ''}`}
          </button>
          {openPostId === p.id && (
            <WallThread coupleId={coupleId} postId={p.id} canComment={canComment} onPosted={load} showNotification={showNotification} />
          )}
        </div>
      ))}
    </div>
  );
};

const WallThread: React.FC<{
  coupleId: string;
  postId: string;
  canComment: boolean;
  onPosted: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ coupleId, postId, canComment, onPosted, showNotification }) => {
  const [replies, setReplies] = useState<WallReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { replies } = await apiService.getClientWallReplies(coupleId, postId);
      setReplies(replies);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, [coupleId, postId]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const content = draft.trim();
    if (!content) return;
    try {
      setSending(true);
      await apiService.addClientWallReply(coupleId, postId, content);
      setDraft('');
      await load();
      onPosted();
    } catch (err) {
      showNotification({ type: 'error', title: '留言失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 3500 });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-petal-rule space-y-2">
      {loading ? (
        <p className="font-body text-xs text-petal-muted">載入回覆中…</p>
      ) : replies.length === 0 ? (
        <p className="font-body text-xs text-petal-muted">還沒有回覆。</p>
      ) : (
        replies.map((r) => (
          <div
            key={r.id}
            className={`rounded-md px-3 py-1.5 ${
              r.is_therapist
                ? ROLE_STYLE.therapist.surface
                : r.is_ai
                  ? ROLE_STYLE.counselor.surface
                  : ROLE_STYLE.partner.surface
            }`}
          >
            <div className="font-body text-[11px] text-petal-muted">
              {r.is_therapist ? `🩺 ${r.author_nickname || '心理師'}（心理師）` : r.is_ai ? 'AI 諮商師' : (r.author_nickname || '某人')}
            </div>
            <div className="font-body text-sm text-petal-ink">{r.content}</div>
          </div>
        ))
      )}
      {canComment && (
        <div className="flex items-center gap-2 pt-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="以心理師身分留言…"
            data-testid="client-wall-reply-input"
            className="flex-1 px-3 py-1.5 rounded-full border border-petal-rule bg-petal-cream focus:border-petal-ink focus:outline-none font-body text-sm text-petal-ink"
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            data-testid="client-wall-reply-send"
            className="shrink-0 p-2 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
};

// --- Events (好好說話) tab -------------------------------------------------

const ClientEvents: React.FC<{
  coupleId: string;
  canComment: boolean;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ coupleId, canComment, showNotification }) => {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { events } = await apiService.getClientEvents(coupleId);
      setEvents(events);
    } catch (err) {
      showNotification({ type: 'error', title: '無法載入', message: err instanceof Error ? err.message : '請稍後再試', duration: 3500 });
    } finally {
      setLoading(false);
    }
  }, [coupleId, showNotification]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-center font-body text-sm text-petal-muted py-10">載入中…</p>;
  if (openId) {
    return (
      <ClientEventDetail
        coupleId={coupleId}
        eventId={openId}
        canComment={canComment}
        onBack={() => setOpenId(null)}
        showNotification={showNotification}
      />
    );
  }
  if (events.length === 0) return <p className="text-center font-body text-sm text-petal-muted py-10">這對伴侶還沒有好好說話的對話。</p>;

  return (
    <div className="p-4 space-y-2" data-testid="client-events">
      {events.map((e) => (
        <button
          key={e.id}
          onClick={() => setOpenId(e.id)}
          data-testid="client-event-row"
          className="w-full text-left rounded-lg border border-petal-rule bg-petal-cream p-4 hover:border-petal-ink transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-base text-petal-ink truncate">{e.title}</span>
            <span className="font-body text-[11px] text-petal-muted shrink-0">{new Date(e.createdAt).toLocaleDateString('zh-TW')}</span>
          </div>
          {e.summary && <p className="mt-1 font-body text-sm text-petal-ink-soft line-clamp-2">{e.summary}</p>}
        </button>
      ))}
    </div>
  );
};

const ClientEventDetail: React.FC<{
  coupleId: string;
  eventId: string;
  canComment: boolean;
  onBack: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ coupleId, eventId, canComment, onBack, showNotification }) => {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { event } = await apiService.getClientEventDetail(coupleId, eventId);
      setEvent(event);
    } catch (err) {
      showNotification({ type: 'error', title: '無法載入', message: err instanceof Error ? err.message : '請稍後再試', duration: 3500 });
    } finally {
      setLoading(false);
    }
  }, [coupleId, eventId, showNotification]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const content = draft.trim();
    if (!content) return;
    try {
      setSending(true);
      await apiService.addClientEventMessage(coupleId, eventId, content);
      setDraft('');
      await load();
    } catch (err) {
      showNotification({ type: 'error', title: '留言失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 3500 });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="client-event-detail">
      <button onClick={onBack} className="flex items-center gap-1 px-4 py-2 font-body text-xs text-petal-muted hover:text-petal-ink">
        <ChevronLeft className="w-4 h-4" strokeWidth={1.5} /> 返回列表
      </button>
      {loading || !event ? (
        <p className="text-center font-body text-sm text-petal-muted py-10">載入中…</p>
      ) : (
        <>
          <div className="px-4 pb-3 border-b border-petal-rule">
            <h4 className="font-display text-lg text-petal-ink">{event.title}</h4>
            {event.summary && <p className="mt-1 font-body text-sm text-petal-ink-soft leading-relaxed">{event.summary}</p>}
            {event.status === 'resolved' && (
              <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-petal-sage/15 font-body text-[11px] text-petal-sage-deep">已完成</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {event.messages.length === 0 ? (
              <p className="text-center font-body text-sm text-petal-muted py-6">這段對話還沒有訊息。</p>
            ) : (
              event.messages.map((m) => {
                const who = m.isTherapist
                  ? '心理師'
                  : m.isAi
                    ? (companionName(m.aiTherapist) ? `${companionName(m.aiTherapist)}・AI 諮商師` : 'AI 諮商師')
                    : '伴侶';
                return (
                  <div
                    key={m.id}
                    className={`rounded-md px-3 py-1.5 ${
                      m.isTherapist
                        ? ROLE_STYLE.therapist.surface
                        : m.isAi
                          ? ROLE_STYLE.counselor.surface
                          : ROLE_STYLE.partner.surface
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <ParticipantAvatar
                        size="xs"
                        role={m.isTherapist ? 'therapist' : m.isAi ? 'ai' : 'user'}
                        companionId={m.aiTherapist}
                        colorKey={m.senderId}
                        name={who}
                      />
                      <span className="font-body text-[11px] text-petal-muted">{who}</span>
                    </div>
                    <div className="font-body text-sm text-petal-ink whitespace-pre-wrap mt-0.5">{m.content}</div>
                  </div>
                );
              })
            )}
          </div>
          {canComment && event.status !== 'resolved' && (
            <div className="border-t border-petal-rule px-4 py-3 flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="以心理師身分留言…"
                data-testid="client-event-message-input"
                className="flex-1 px-3.5 py-2 rounded-full border border-petal-rule bg-petal-cream focus:border-petal-ink focus:outline-none font-body text-sm text-petal-ink"
              />
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                data-testid="client-event-message-send"
                className="shrink-0 p-2 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// --- 話題建議 tab -----------------------------------------------------------

const STATUS_LABEL: Record<TherapyTopicSelectionStatus | 'none', string> = {
  selected: '已加入諮商',
  saved: '先收藏',
  dismissed: '不相關',
  none: '尚未決定',
};
const STATUS_CLS: Record<TherapyTopicSelectionStatus | 'none', string> = {
  selected: 'bg-petal-rose-deep text-white',
  saved: 'bg-petal-cream-2 text-petal-ink-soft',
  dismissed: 'bg-petal-cream-2 text-petal-muted',
  none: 'bg-petal-cream-2 text-petal-muted',
};

const StatusChip: React.FC<{ status: TherapyTopicSelectionStatus | null }> = ({ status }) => {
  const key = status ?? 'none';
  return (
    <span className={`inline-flex items-center rounded-full font-body text-[11px] px-2.5 py-0.5 ${STATUS_CLS[key]}`}>
      {STATUS_LABEL[key]}
    </span>
  );
};

// Read-only therapist rendering of one topic — pick + notes, no controls.
const TopicReadOnly: React.FC<{
  title: string;
  subtitleLabel: string;
  subtitle: string;
  status: TherapyTopicSelectionStatus | null;
  notes: string | null;
}> = ({ title, subtitleLabel, subtitle, status, notes }) => (
  <div className="rounded-lg border border-petal-rule bg-petal-cream p-4">
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <span className="font-display text-base text-petal-ink">{title}</span>
      <StatusChip status={status} />
    </div>
    <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">{subtitleLabel}</div>
    <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{subtitle}</p>
    {notes && (
      <div className="mt-2 rounded-md bg-pink-50 border border-pink-200 px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-pink-700 mb-0.5">伴侶想延伸聊的點</div>
        <p className="font-body text-sm text-petal-ink whitespace-pre-wrap">{notes}</p>
      </div>
    )}
  </div>
);

const ClientTherapyTopics: React.FC<{
  coupleId: string;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ coupleId, showNotification }) => {
  const [data, setData] = useState<TherapistClientTopics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setData(await apiService.getClientTherapyTopics(coupleId));
    } catch (err) {
      showNotification({ type: 'error', title: '無法載入', message: err instanceof Error ? err.message : '請稍後再試', duration: 3500 });
    } finally {
      setLoading(false);
    }
  }, [coupleId, showNotification]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-center font-body text-sm text-petal-muted py-10">載入中…</p>;
  if (!data) return null;

  const hasAiTopics = !!data.topics && data.topics.topics.length > 0;
  const hasLibrary = data.library.length > 0;

  return (
    <div className="p-4 space-y-5" data-testid="client-therapy-topics">
      <div>
        <div className="flex items-center gap-1.5 text-petal-sage-deep mb-2">
          <Compass className="w-4 h-4" strokeWidth={1.5} />
          <h4 className="font-display text-base text-petal-ink">話題建議</h4>
          {hasAiTopics && data.period?.quiet && (
            <span className="font-body text-[11px] text-petal-muted">・平靜模式</span>
          )}
        </div>
        {/* library is always non-empty, so the "no topics yet" state has to be
            scoped to the AI section — otherwise a couple who never generated
            shows the therapist a bare 話題庫 with no explanation. */}
        {hasAiTopics && data.topics ? (
          <>
            {data.topics.intro && (
              <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-2">{data.topics.intro}</p>
            )}
            <div className="space-y-2">
              {data.topics.topics.map((t, idx) => (
                <TopicReadOnly
                  key={idx}
                  title={t.title}
                  subtitleLabel="為什麼會建議這個"
                  subtitle={t.whySuggested}
                  status={data.selections[idx]?.status ?? null}
                  notes={data.selections[idx]?.notes ?? null}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="font-body text-sm text-petal-muted leading-relaxed">
            這對伴侶還沒有產生 AI 話題建議。等他們下次整理事件後，這裡會顯示下次諮商可以聊的方向。以下是他們可以直接挑選的話題庫。
          </p>
        )}
      </div>

      {hasLibrary && (
        <div>
          <div className="flex items-center gap-1.5 text-petal-sage-deep mb-2">
            <Library className="w-4 h-4" strokeWidth={1.5} />
            <h4 className="font-display text-base text-petal-ink">話題庫</h4>
          </div>
          <div className="space-y-2">
            {data.library.map((t) => (
              <TopicReadOnly
                key={t.id}
                title={t.title}
                subtitleLabel="為什麼值得聊聊"
                subtitle={t.description}
                status={data.librarySelections[t.id]?.status ?? null}
                notes={data.librarySelections[t.id]?.notes ?? null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- 諮商摘要 tab ----------------------------------------------------------

const summaryDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

// The couple's generated 諮商摘要 snapshots, read-only for the dedicated
// therapist. Newest first; each expands to the full digest. This is what the
// couple compiled to bring into the session — the therapist reads it here.
const ClientTherapySummaries: React.FC<{
  coupleId: string;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ coupleId, showNotification }) => {
  const [summaries, setSummaries] = useState<TherapySummaryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await apiService.getClientTherapySummaries(coupleId);
      setSummaries(rows);
      // Open the most recent one by default — it's the one they'd bring in.
      setOpenId(rows[0]?.id ?? null);
    } catch (err) {
      showNotification({ type: 'error', title: '無法載入', message: err instanceof Error ? err.message : '請稍後再試', duration: 3500 });
    } finally {
      setLoading(false);
    }
  }, [coupleId, showNotification]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-center font-body text-sm text-petal-muted py-10">載入中…</p>;
  if (summaries.length === 0) {
    return (
      <div className="p-4" data-testid="client-therapy-summaries">
        <div className="rounded-lg border border-petal-rule bg-petal-cream-2/50 p-5 flex items-start gap-3">
          <ClipboardList className="w-5 h-5 text-petal-sage-deep shrink-0 mt-0.5" strokeWidth={1.5} />
          <div>
            <h4 className="font-display text-base text-petal-ink">還沒有諮商摘要</h4>
            <p className="mt-1 font-body text-sm text-petal-ink-soft leading-relaxed">
              當這對伴侶把最近的事件整理成一份「諮商摘要」後，就會出現在這裡——最常出現的主題、雙方的情緒、已修復與未解決的事，以及他們想和你討論的問題。你可以在諮商前先讀過，直接切入重點。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2" data-testid="client-therapy-summaries">
      {summaries.map((s) => {
        const open = openId === s.id;
        return (
          <div key={s.id} className="rounded-lg border border-petal-rule bg-petal-cream overflow-hidden">
            <button
              onClick={() => setOpenId(open ? null : s.id)}
              data-testid="client-summary-row"
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-petal-cream-2/50 transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <ClipboardList className="w-4 h-4 text-petal-sage-deep shrink-0" strokeWidth={1.5} />
                <span className="font-body text-sm text-petal-ink truncate">
                  {s.periodLabel}
                  {typeof s.eventCount === 'number' ? ` · 共 ${s.eventCount} 件` : ''}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 font-body text-[11px] text-petal-muted shrink-0">
                <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                {summaryDate(s.createdAt)}
              </span>
            </button>
            {open && (
              <div className="px-4 pb-4 pt-1 border-t border-petal-rule" data-testid="client-summary-detail">
                <TherapySummaryDetail summary={s.summary} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default TherapistClientView;
