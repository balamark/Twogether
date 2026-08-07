import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InfoHint from './InfoHint';
import {
  Plus,
  Star,
  MessageCircle,
  Pencil,
  Trash2,
  StickyNote,
  Lightbulb,
  X,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  apiService,
  type WallPost,
  type WallPostCategory,
  type WallReactionKey,
} from '../services/api';
import type { Notification } from './ErrorNotification';
import WallPostComposer, { type WallExample } from './WallPostComposer';
import WallPostThread from './WallPostThread';
import MarkdownContent from './MarkdownContent';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatRelativeOrDate } from '../utils/datetime';
import { isVideoUrl } from '../utils/script';
import { useScrollLock } from '../hooks/useScrollLock';

interface WallViewProps {
  authState: {
    user: { id: string; nickname?: string; selected_therapist?: string | null } | null;
    isAuthenticated: boolean;
    partnerConnected: boolean;
  };
  nicknames: { partner1: string; partner2: string };
  defaultWallExamples: WallExample[];
  moodTags: readonly string[];
  showNotification: (notification: Omit<Notification, 'id'>) => void;
}

type WallFilter = 'all' | 'important' | 'general' | 'mood';

const FILTER_TABS: { id: WallFilter; label: string; icon: string }[] = [
  { id: 'all', label: '全部', icon: '🌿' },
  { id: 'important', label: '重要', icon: '⭐' },
  { id: 'general', label: '一般', icon: '📝' },
  { id: 'mood', label: '帶心情', icon: '💭' },
];

// One-tap acknowledgements. Keys must match WALL_REACTIONS in routes/wall.js.
// These exist because a bare 已讀 makes silence louder: the reader needs a way
// to say "I saw it, I'm with you" that costs one tap, not a written reply.
const WALL_REACTIONS: { key: WallReactionKey; emoji: string; label: string }[] = [
  { key: 'hug', emoji: '🫂', label: '抱抱' },
  { key: 'understand', emoji: '💛', label: '我懂' },
  { key: 'thanks', emoji: '🙏', label: '謝謝你說' },
  { key: 'later', emoji: '⏳', label: '晚點好好回你' },
];

const reactionMeta = (key: WallReactionKey | null | undefined) =>
  WALL_REACTIONS.find((r) => r.key === key) || null;

// A post counts as read once it has been on screen for this long — long enough
// that 已讀 means "TA actually read it", not "TA scrolled past at speed".
const READ_DWELL_MS = 1000;
// Ids collected during that window are reported in one batched call.
const READ_FLUSH_MS = 800;

const formatTime = (iso: string, tz: string) =>
  formatRelativeOrDate(iso, tz, { year: 'numeric', month: 'short', day: 'numeric' });

// Read receipts / reactions are recent-by-nature — a relative time ("3 小時前")
// reads better here than the post's absolute date.
const formatShortTime = (iso: string, tz: string) =>
  formatRelativeOrDate(iso, tz, { month: 'short', day: 'numeric' });

const WallView: React.FC<WallViewProps> = ({
  authState,
  nicknames,
  defaultWallExamples,
  moodTags,
  showNotification,
}) => {
  const userId = authState.user?.id;
  const tutorialKey = `wall_tutorial_seen_${userId || 'anon'}`;
  // Remembers that the composer's 「從範本開始」 panel has already been met, so
  // it stops auto-expanding and stops eating the top of the composer.
  const templatesSeenKey = `wall_templates_seen_${userId || 'anon'}`;
  const tz = useTimezone();

  const [posts, setPosts] = useState<WallPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<WallFilter>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<WallPost | null>(null);
  const [initialTemplate, setInitialTemplate] = useState<WallExample | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  // Full-screen image viewer (videos play inline in the card, so only images
  // open the lightbox).
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Natural aspect ratio (w/h) per media URL, learned on load, so portrait
  // photos get portrait slots instead of a fixed 16:9 that pillarboxes them.
  const [mediaRatios, setMediaRatios] = useState<Record<string, number>>({});
  const [privacyBusyId, setPrivacyBusyId] = useState<string | null>(null);
  const [reactionBusyId, setReactionBusyId] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem(tutorialKey);
  });

  // --- Read receipts -------------------------------------------------------
  // A post is reported as read only after it has genuinely been on screen for
  // READ_DWELL_MS. Opening the wall tab must not mark a week-old post 已讀 that
  // the partner never scrolled to — the whole point of the indicator is that
  // the author can trust it.
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Ids already sent, so re-renders and re-scrolls don't re-report them.
  const reportedRef = useRef<Set<string>>(new Set());
  // Ids that have finished their dwell and are waiting for the next batch.
  const pendingRef = useRef<Set<string>>(new Set());
  // Per-post dwell timers, cleared if the post leaves the viewport early.
  const dwellTimersRef = useRef<Map<string, number>>(new Map());
  const flushTimerRef = useRef<number | null>(null);

  const flushReads = useCallback(async () => {
    const ids = [...pendingRef.current];
    if (!ids.length) return;
    pendingRef.current.clear();
    // Mark them as reported up front so an in-flight batch can't be duplicated
    // by a scroll that happens while it's still open.
    ids.forEach((id) => reportedRef.current.add(id));
    const marked = await apiService.markWallPostsRead(ids);
    // Reflect it locally so the partner's own view stays consistent without a
    // refetch. (The indicator itself only renders on the author's side.)
    if (marked > 0) {
      const now = new Date().toISOString();
      setPosts((prev) =>
        prev.map((p) => (ids.includes(p.id) && !p.partner_read_at ? { ...p, partner_read_at: now } : p))
      );
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushReads();
    }, READ_FLUSH_MS);
  }, [flushReads]);

  // Built on first use rather than in an effect, so a card that mounts in the
  // same commit as the observer still gets observed.
  const ensureObserver = useCallback(() => {
    if (observerRef.current) return observerRef.current;
    if (typeof IntersectionObserver === 'undefined') return null;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const timers = dwellTimersRef.current;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.postId;
          if (!id) continue;
          if (entry.isIntersecting) {
            if (timers.has(id) || reportedRef.current.has(id)) continue;
            timers.set(
              id,
              window.setTimeout(() => {
                timers.delete(id);
                pendingRef.current.add(id);
                scheduleFlush();
              }, READ_DWELL_MS)
            );
          } else {
            // Scrolled away before the dwell finished — that isn't reading.
            const timer = timers.get(id);
            if (timer !== undefined) {
              window.clearTimeout(timer);
              timers.delete(id);
            }
          }
        }
      },
      { threshold: 0.5 }
    );
    return observerRef.current;
  }, [scheduleFlush]);

  // Tear everything down on unmount: a pending dwell or flush must not fire
  // into a component that's gone.
  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      dwellTimersRef.current.forEach((t) => window.clearTimeout(t));
      dwellTimersRef.current.clear();
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    },
    []
  );

  // Ref callback for a post card — only the partner's shared posts get one.
  // The returned cleanup (React 19) unobserves a card that filtering removed.
  const readObserverRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const observer = ensureObserver();
      if (!observer) return;
      observer.observe(node);
      return () => observer.unobserve(node);
    },
    [ensureObserver]
  );

  // --- Reactions -----------------------------------------------------------
  // Optimistic: the chip fills instantly (one tap should feel instant), and
  // rolls back with the server's own message if the write fails.
  const toggleReaction = async (post: WallPost, key: WallReactionKey) => {
    const previous = post.my_reaction ?? null;
    const next = previous === key ? null : key;
    setReactionBusyId(post.id);
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, my_reaction: next } : p)));
    try {
      const result = await apiService.setWallPostReaction(post.id, next);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, my_reaction: result.my_reaction, partner_reaction: result.partner_reaction }
            : p
        )
      );
    } catch (err) {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, my_reaction: previous } : p)));
      showNotification({
        type: 'error',
        title: '心意沒有送出',
        message: err instanceof Error ? err.message : '請稍後再試一次。',
      });
    } finally {
      setReactionBusyId(null);
    }
  };

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.getWallPosts();
      setPosts(data);
    } catch (err) {
      showNotification({
        type: 'error',
        title: '無法載入牆',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const filteredPosts = useMemo(() => {
    switch (filter) {
      case 'important':
        return posts.filter((p) => p.category === 'important');
      case 'general':
        return posts.filter((p) => p.category === 'general');
      case 'mood':
        return posts.filter((p) => !!p.mood_tag);
      default:
        return posts;
    }
  }, [posts, filter]);

  const importantPosts = filteredPosts.filter((p) => p.category === 'important');
  const generalPosts = filteredPosts.filter((p) => p.category === 'general');

  const handleSubmit = async (input: {
    content: string;
    mood_tag: string | null;
    category: WallPostCategory;
    media: File[];
    is_private: boolean;
    existingMedia?: string[];
  }) => {
    try {
      if (editingPost) {
        const updated = await apiService.updateWallPost(editingPost.id, input);
        setPosts((prev) =>
          prev.map((p) => (p.id === updated.id ? { ...updated, reply_count: p.reply_count } : p))
        );
        showNotification({
          type: 'success',
          title: '已更新',
          message: '貼文已儲存',
        });
      } else {
        const created = await apiService.createWallPost(input);
        setPosts((prev) => [created, ...prev]);
        showNotification({
          type: 'success',
          title: '已發布',
          message: '對方會收到通知',
        });
      }
    } catch (err) {
      // A media upload that outran the client timeout usually still finished
      // server-side, so re-posting would create a duplicate. Instead of letting
      // the composer show a red "failed", reload the wall so the post that did
      // go through appears, and tell the user calmly what happened.
      const code = (err as { error_code?: string })?.error_code;
      if (code === 'TIMEOUT') {
        await loadPosts();
        showNotification({
          type: 'warning',
          title: editingPost ? '儲存時間較長' : '上傳時間較長',
          message: '網路較慢，內容可能已送出。已為你重新整理牆面——若已出現就不用再送一次。',
        });
        return; // resolve so the composer closes without an error
      }
      throw err; // real failure → composer surfaces it inline for a retry
    }
  };

  const handleDelete = async (post: WallPost) => {
    if (!confirm('確定要刪除這則貼文嗎？所有回覆也會一起刪除。')) return;
    try {
      await apiService.deleteWallPost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      if (expandedPostId === post.id) setExpandedPostId(null);
    } catch (err) {
      showNotification({
        type: 'error',
        title: '刪除失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    }
  };

  const openComposer = (opts: {
    editing?: WallPost | null;
    template?: WallExample | null;
  } = {}) => {
    setEditingPost(opts.editing || null);
    setInitialTemplate(opts.template || null);
    setComposerOpen(true);
  };

  const dismissTutorial = () => {
    setShowTutorial(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(tutorialKey, '1');
    }
  };

  const updateReplyCount = (postId: string, newCount: number) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, reply_count: newCount } : p))
    );
  };

  // Remember a media item's natural aspect ratio (clamped so extreme panoramas
  // or very tall shots stay within a sane slot), used to size its grid cell.
  const rememberRatio = (url: string, w: number, h: number) => {
    if (!w || !h) return;
    const ratio = Math.min(1.8, Math.max(0.6, w / h));
    setMediaRatios((prev) => (prev[url] ? prev : { ...prev, [url]: ratio }));
  };

  // Quick toggle a post's privacy from its card (own posts only). Optimistic,
  // rolls back on failure.
  const togglePrivacy = async (post: WallPost) => {
    const next = !post.is_private;
    // Private → shared is a one-way disclosure: once TA has seen it, hiding it
    // again doesn't undo that. The other direction is safe, so it stays instant.
    if (!next && !confirm('要把這則貼文分享給TA嗎？\n\nTA會立刻看得到，之後再設回私密也收不回來了。')) return;
    setPrivacyBusyId(post.id);
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_private: next } : p)));
    try {
      await apiService.updateWallPost(post.id, { is_private: next });
      showNotification({
        type: 'info',
        title: next ? '已設為私密' : '已分享給對方',
        message: next ? '對方看不到這則貼文，也不會收到通知。' : '對方現在看得到這則貼文了。',
      });
    } catch (err) {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_private: !next } : p)));
      showNotification({
        type: 'error',
        title: '操作失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setPrivacyBusyId(null);
    }
  };

  // Share to 公開問答 (anonymised). Single-party toggle with a warning dialog.
  const [shareWarnPost, setShareWarnPost] = useState<WallPost | null>(null);
  // Both of these render `fixed inset-0` overlays; without the lock the page
  // scrolls behind them on iOS and taps inside land offset.
  useScrollLock(!!shareWarnPost || !!lightboxUrl);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const confirmShare = async (post: WallPost) => {
    setSharingId(post.id);
    try {
      await apiService.publishWallPost(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, public_status: 'published' } : p)));
      setShareWarnPost(null);
      showNotification({
        type: 'success',
        title: '已匿名公開',
        message: '這段對話會以匿名方式顯示在「公開問答」，謝謝你願意幫助別人。',
      });
    } catch (err) {
      showNotification({ type: 'error', title: '公開失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSharingId(null);
    }
  };

  const unshare = async (post: WallPost) => {
    setSharingId(post.id);
    try {
      await apiService.unpublishWallPost(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, public_status: 'private' } : p)));
      showNotification({ type: 'info', title: '已取消公開', message: '這段對話不再顯示於公開問答。' });
    } catch (err) {
      showNotification({ type: 'error', title: '操作失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSharingId(null);
    }
  };

  const renderPostCard = (post: WallPost) => {
    const isOwn = post.author_id === userId;
    const isExpanded = expandedPostId === post.id;
    const authorName =
      post.author_nickname ||
      (isOwn ? nicknames.partner1 : nicknames.partner2) ||
      '對方';
    const isImportant = post.category === 'important';
    // Only the partner's shared posts are worth tracking: a private post never
    // reaches them, and reading your own post means nothing.
    const tracksRead = !isOwn && !post.is_private;
    // The author sees the read state only where it can be true — a shared post,
    // with someone on the other side to read it.
    const showsReadState = isOwn && !post.is_private && authState.partnerConnected;
    const partnerReaction = reactionMeta(post.partner_reaction?.reaction);

    return (
      <div
        key={post.id}
        ref={tracksRead ? readObserverRef : undefined}
        data-post-id={post.id}
        className={`bg-white rounded-md p-5 border transition-colors ${
          isImportant
            ? 'border-petal-rose-deep/40 ring-1 ring-petal-rose-deep/20'
            : 'border-petal-rule hover:border-petal-rose'
        }`}
        data-testid={`wall-post-${post.id}`}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            {isImportant && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-petal-rose-soft/50 text-petal-rose-deep font-body text-[10px] uppercase tracking-[0.12em]">
                <Star className="w-3 h-3 mr-1" strokeWidth={1.5} />
                重要
              </span>
            )}
            {post.is_private && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-petal-cream-2 text-petal-ink-soft font-body text-[10px] uppercase tracking-[0.12em]"
                data-testid={`wall-post-private-badge-${post.id}`}
              >
                <Lock className="w-3 h-3 mr-1" strokeWidth={1.5} />
                只有我看得到
              </span>
            )}
            <span className="font-display text-base font-medium text-petal-ink">
              {authorName}
            </span>
            {post.mood_tag && (
              <span className="font-body text-[11px] text-petal-muted">
                · {post.mood_tag}
              </span>
            )}
            <span className="font-body text-[11px] text-petal-muted">
              · {formatTime(post.created_at, tz)}
            </span>
          </div>
          {/* 44px targets with a real gap between them: these two used to be
              ~26px icons 4px apart, so a slightly-off tap meant for 編輯 landed
              on 刪除. The separator keeps the destructive one visually and
              physically apart from the one people actually reach for. */}
          {isOwn && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openComposer({ editing: post })}
                className="p-2.5 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md text-petal-muted hover:text-petal-ink hover:bg-petal-cream-2 transition-colors"
                aria-label="編輯"
              >
                <Pencil className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <span aria-hidden className="w-px h-5 bg-petal-rule" />
              <button
                type="button"
                onClick={() => handleDelete(post)}
                className="p-2.5 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md text-petal-muted hover:text-petal-rose-deep hover:bg-petal-cream-2 transition-colors"
                aria-label="刪除"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>

        {post.content && (
          <MarkdownContent
            content={post.content}
            className="font-body text-[15px] text-petal-ink leading-relaxed"
          />
        )}

        {(post.media?.length ?? 0) > 0 && (
          <div
            className={`mt-3 grid gap-2 ${
              post.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
            }`}
            data-testid={`wall-post-media-${post.id}`}
          >
            {post.media.map((url, idx) => {
              // Size each cell to the media's own ratio once known (portrait →
              // portrait slot → little/no side border); fall back to 16:9 while
              // loading. object-contain keeps the image uncropped.
              const ratio = mediaRatios[url];
              const cellStyle = ratio
                ? { aspectRatio: String(ratio), maxHeight: '70vh' }
                : undefined;
              return isVideoUrl(url) ? (
                <video
                  key={`${url}-${idx}`}
                  src={url}
                  controls
                  // The native controls menu has its own download button, which
                  // the contextmenu block can't reach — turn it off.
                  controlsList="nodownload"
                  disablePictureInPicture
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) =>
                    rememberRatio(url, e.currentTarget.videoWidth, e.currentTarget.videoHeight)
                  }
                  style={cellStyle}
                  className={`w-full object-contain rounded-md border border-petal-rule bg-petal-cream-2 ${
                    ratio ? '' : 'aspect-video'
                  }`}
                />
              ) : (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  onClick={() => setLightboxUrl(url)}
                  style={cellStyle}
                  className={`block w-full rounded-md border border-petal-rule bg-petal-cream-2 overflow-hidden focus:outline-none focus:ring-2 focus:ring-petal-rose-deep ${
                    ratio ? '' : 'aspect-video'
                  }`}
                  aria-label="放大檢視照片"
                >
                  <img
                    src={url}
                    alt={`貼文照片 ${idx + 1}`}
                    loading="lazy"
                    onLoad={(e) =>
                      rememberRatio(url, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
                    }
                    className="w-full h-full object-contain"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* The author's payoff: the partner's one-tap answer, right on the card.
            This is what stops 已讀 from being a dead end. */}
        {isOwn && partnerReaction && (
          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-petal-rose-soft/50 px-3 py-1"
            data-testid={`wall-partner-reaction-${post.id}`}
          >
            <span aria-hidden>{partnerReaction.emoji}</span>
            <span className="font-body text-xs text-petal-rose-deep">
              {authState.partnerConnected ? `${nicknames.partner2 || '對方'}給了你一個「${partnerReaction.label}」` : `「${partnerReaction.label}」`}
            </span>
            {post.partner_reaction && (
              <span className="font-body text-[11px] text-petal-muted">
                · {formatShortTime(post.partner_reaction.created_at, tz)}
              </span>
            )}
          </div>
        )}

        {/* Reader side: answering shouldn't require finding words. One tap says
            "I saw it, I'm here" — far better than a silent 已讀. */}
        {!isOwn && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {WALL_REACTIONS.map(({ key, emoji, label }) => {
              const active = post.my_reaction === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleReaction(post, key)}
                  disabled={reactionBusyId === post.id}
                  aria-pressed={active}
                  data-testid={`wall-reaction-${key}-${post.id}`}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-body text-[11px] transition-colors disabled:opacity-50 ${
                    active
                      ? 'bg-petal-rose-soft/50 text-petal-rose-deep'
                      : 'border border-petal-rule text-petal-ink-soft hover:border-petal-rose hover:text-petal-ink'
                  }`}
                >
                  <span aria-hidden>{emoji}</span>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Wraps as a whole (gap-y) rather than breaking a label mid-word: this
            row is at capacity on a phone once the read state joins it. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Did TA see it? Answering that is the difference between "ignored"
              and "hasn't opened the app yet". */}
          {showsReadState && (
            <span
              data-testid={`wall-read-indicator-${post.id}`}
              className={`flex items-center gap-1.5 font-body text-xs whitespace-nowrap ${
                post.partner_read_at ? 'text-petal-sage-deep' : 'text-petal-muted'
              }`}
            >
              {post.partner_read_at ? (
                <>
                  <Eye className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                  已讀 · {formatShortTime(post.partner_read_at, tz)}
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                  對方還沒看到
                </>
              )}
            </span>
          )}

          <button
            type="button"
            onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
            className="flex items-center gap-1.5 text-petal-ink-soft hover:text-petal-ink font-body text-xs whitespace-nowrap"
            data-testid={`wall-post-thread-toggle-${post.id}`}
          >
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            {post.reply_count > 0 ? `${post.reply_count} 則回覆` : '回覆'}
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
          </button>

          {/* Own-post privacy quick toggle. A private post is hidden from the
              partner, so the 匿名公開 (public) option is hidden while private. */}
          {isOwn && (
            <button
              type="button"
              onClick={() => togglePrivacy(post)}
              disabled={privacyBusyId === post.id}
              data-testid={`wall-privacy-toggle-${post.id}`}
              className="flex items-center gap-1.5 text-petal-ink-soft hover:text-petal-ink font-body text-xs whitespace-nowrap disabled:opacity-50"
            >
              {privacyBusyId === post.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : post.is_private ? (
                <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : (
                <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              {post.is_private ? '私密・分享給對方' : '設為私密'}
            </button>
          )}

          {/* Share to 公開問答 (anonymised) — only for shared (non-private) posts */}
          {!post.is_private && (post.public_status === 'published' ? (
            <button
              type="button"
              onClick={() => unshare(post)}
              disabled={sharingId === post.id}
              data-testid={`wall-unshare-${post.id}`}
              className="flex items-center gap-1.5 text-petal-sage-deep hover:text-petal-ink font-body text-xs whitespace-nowrap disabled:opacity-50"
            >
              {sharingId === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />}
              已公開・取消
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShareWarnPost(post)}
              data-testid={`wall-share-${post.id}`}
              className="flex items-center gap-1.5 text-petal-ink-soft hover:text-petal-ink font-body text-xs whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />
              匿名公開
            </button>
          ))}
        </div>

        {isExpanded && (
          <WallPostThread
            postId={post.id}
            currentUserId={userId}
            companionId={authState.user?.selected_therapist ?? null}
            onReplyCountChange={(newCount) => updateReplyCount(post.id, newCount)}
            onError={(message) =>
              showNotification({ type: 'error', title: '發生錯誤', message })
            }
            onNotify={(n) => showNotification(n)}
          />
        )}
      </div>
    );
  };

  // Empty state: a few *short* examples to skim, not one long wall of text.
  // Tapping one opens the composer pre-filled with it.
  const DEMO_COUNT = 3;

  const renderDemoCards = () => {
    const demos = defaultWallExamples.slice(0, DEMO_COUNT);
    if (demos.length === 0) return null;
    return (
      <div className="space-y-3" data-testid="wall-demo-card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {demos.map((demo) => (
            <button
              key={demo.id}
              type="button"
              onClick={() => openComposer({ template: demo })}
              className="text-left bg-petal-cream-2/40 rounded-md p-4 border border-dashed border-petal-rule hover:border-petal-rose hover:bg-petal-cream-2/70 transition-colors"
              data-testid={`wall-demo-use-template-${demo.id}`}
            >
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-petal-sage/30 text-petal-ink-soft font-body text-[10px] uppercase tracking-[0.12em]">
                  範例
                </span>
                <span className="font-body text-[10px] uppercase tracking-[0.1em] text-petal-muted">
                  {demo.mood_tag}
                </span>
              </div>
              <div className="font-display text-sm font-medium text-petal-ink mb-1">
                {demo.title}
              </div>
              <div className="font-body text-xs text-petal-ink-soft leading-relaxed whitespace-pre-wrap line-clamp-4">
                {demo.content}
              </div>
              <div className="mt-3 font-display italic text-xs text-petal-rose-deep">
                用這個開始 →
              </div>
            </button>
          ))}
        </div>
        <p className="font-body text-[11px] text-petal-muted">
          這些只是示範 — 寫了第一則之後就會消失。
          {defaultWallExamples.length > DEMO_COUNT && (
            <>
              {' '}還有 {defaultWallExamples.length - DEMO_COUNT} 則範本，在「新貼文」裡看得到。
            </>
          )}
        </p>
      </div>
    );
  };

  const hasNoRealPosts = !loading && posts.length === 0;

  return (
    <div className="space-y-8">
      <div className="border-b border-petal-rule pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 共享筆記
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.1] md:leading-[1.05] mb-3">
              我們的<em className="not-italic font-light italic text-pink-600">牆</em>
              <span className="align-middle ml-2"><InfoHint viewId="wall" /></span>
            </h2>
            <p className="font-display italic font-light text-base text-petal-muted">
              留下重要的話、心情、需要被理解的事 — 慢慢說。
            </p>
          </div>
          <button
            type="button"
            onClick={() => openComposer()}
            className="bg-petal-ink text-petal-cream px-5 py-2.5 rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors flex items-center gap-2"
            data-testid="wall-new-post-button"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            新貼文
          </button>
        </div>
      </div>

      {showTutorial && (
        <div className="bg-petal-cream-2/60 border border-petal-rule rounded-md p-5 relative">
          <button
            type="button"
            onClick={dismissTutorial}
            className="absolute top-3 right-3 p-1 text-petal-muted hover:text-petal-ink"
            aria-label="關閉說明"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
            <h3 className="font-display text-lg font-medium text-petal-ink">
              「我們的牆」是什麼？
            </h3>
          </div>
          <ul className="font-body text-sm text-petal-ink-soft space-y-1.5 leading-relaxed list-disc list-inside">
            <li>一個自由寫下重要話、心情、需求的空間。</li>
            <li>
              試試用<strong className="text-petal-ink">範本</strong>
              教對方你希望被怎麼對待 — 比直接抱怨更容易被聽見。
            </li>
            <li>
              標記為<strong className="text-petal-ink">「重要」</strong>
              的貼文會 pin 在最上面，提醒彼此。
            </li>
            <li>對方會收到通知，可以在貼文下面回覆形成對話。</li>
          </ul>
          <div className="mt-3 text-right">
            <button
              type="button"
              onClick={dismissTutorial}
              className="font-display italic text-sm text-petal-ink hover:text-petal-rose-deep"
            >
              我懂了 →
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTER_TABS.map((tab) => {
          const isActive = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-colors border ${
                isActive
                  ? 'bg-petal-ink text-petal-cream border-petal-ink'
                  : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
              }`}
              data-testid={`wall-filter-${tab.id}`}
            >
              <span className="text-xs opacity-75">{tab.icon}</span>
              <span className="font-body text-[13px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 font-body text-sm text-petal-muted">
          載入中⋯
        </div>
      ) : hasNoRealPosts ? (
        <div className="space-y-5">
          <div className="text-center py-8">
            <StickyNote
              className="w-10 h-10 text-petal-rose-soft mx-auto mb-3"
              strokeWidth={1.2}
            />
            <p className="font-display italic font-light text-base text-petal-muted">
              還沒有貼文 — 挑一則範例改成你的話，或直接寫下你的第一則。
            </p>
          </div>
          {renderDemoCards()}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-12 font-body text-sm text-petal-muted">
          這個分類下還沒有貼文。
        </div>
      ) : (
        <div className="space-y-6">
          {importantPosts.length > 0 && (
            <div className="space-y-3">
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-rose-deep">
                ⭐ 重要 ({importantPosts.length})
              </div>
              {importantPosts.map(renderPostCard)}
            </div>
          )}
          {generalPosts.length > 0 && (
            <div className="space-y-3">
              {importantPosts.length > 0 && (
                <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted pt-2">
                  最近
                </div>
              )}
              {generalPosts.map(renderPostCard)}
            </div>
          )}
        </div>
      )}

      <WallPostComposer
        isOpen={composerOpen}
        onClose={() => {
          setComposerOpen(false);
          setEditingPost(null);
          setInitialTemplate(null);
        }}
        onSubmit={handleSubmit}
        moodTags={moodTags}
        examples={defaultWallExamples}
        editingPost={editingPost}
        initialTemplate={initialTemplate}
        templatesSeenKey={templatesSeenKey}
      />

      {shareWarnPost && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="wall-share-warning">
          <div className="bg-petal-cream rounded-2xl max-w-md w-full p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-5 h-5 text-petal-rose-deep" />
              <h3 className="text-lg font-serif text-petal-ink">公開到「公開問答」</h3>
            </div>
            <p className="text-sm text-petal-ink-soft leading-relaxed mb-2">
              公開後，這則貼文與底下的回覆會<span className="text-petal-ink font-medium">匿名</span>顯示在「公開問答」，
              <span className="text-petal-ink font-medium">所有人（包含未登入的訪客）都看得到</span>。
            </p>
            <p className="text-sm text-petal-ink-soft leading-relaxed mb-4">
              你們會顯示為「匿名 A / 匿名 B」，不會出現名字。你隨時可以取消公開。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShareWarnPost(null)}
                className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="wall-share-confirm"
                onClick={() => confirmShare(shareWarnPost)}
                disabled={sharingId === shareWarnPost.id}
                className="text-sm px-4 py-2 rounded-full bg-petal-ink text-petal-cream inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
              >
                {sharingId === shareWarnPost.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                確定公開
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
          data-testid="wall-lightbox"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="關閉"
            className="absolute top-4 right-4 w-9 h-9 inline-flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <img
            src={lightboxUrl}
            alt="放大檢視"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default WallView;
