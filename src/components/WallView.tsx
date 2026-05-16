import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import {
  apiService,
  type WallPost,
  type WallPostCategory,
} from '../services/api';
import type { Notification } from './ErrorNotification';
import WallPostComposer, { type WallExample } from './WallPostComposer';
import WallPostThread from './WallPostThread';

interface WallViewProps {
  authState: {
    user: { id: string; nickname?: string } | null;
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

const formatTime = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '剛剛';
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小時前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const WallView: React.FC<WallViewProps> = ({
  authState,
  nicknames,
  defaultWallExamples,
  moodTags,
  showNotification,
}) => {
  const userId = authState.user?.id;
  const tutorialKey = `wall_tutorial_seen_${userId || 'anon'}`;

  const [posts, setPosts] = useState<WallPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<WallFilter>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<WallPost | null>(null);
  const [initialTemplate, setInitialTemplate] = useState<WallExample | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem(tutorialKey);
  });

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
  }) => {
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

  const renderPostCard = (post: WallPost) => {
    const isOwn = post.author_id === userId;
    const isExpanded = expandedPostId === post.id;
    const authorName =
      post.author_nickname ||
      (isOwn ? nicknames.partner1 : nicknames.partner2) ||
      '對方';
    const isImportant = post.category === 'important';

    return (
      <div
        key={post.id}
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
            <span className="font-display text-base font-medium text-petal-ink">
              {authorName}
            </span>
            {post.mood_tag && (
              <span className="font-body text-[11px] text-petal-muted">
                · {post.mood_tag}
              </span>
            )}
            <span className="font-body text-[11px] text-petal-muted">
              · {formatTime(post.created_at)}
            </span>
          </div>
          {isOwn && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => openComposer({ editing: post })}
                className="p-1.5 text-petal-muted hover:text-petal-ink transition-colors"
                aria-label="編輯"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(post)}
                className="p-1.5 text-petal-muted hover:text-petal-rose-deep transition-colors"
                aria-label="刪除"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>

        <div className="font-body text-[15px] text-petal-ink leading-relaxed whitespace-pre-wrap">
          {post.content}
        </div>

        <button
          type="button"
          onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
          className="mt-3 flex items-center gap-1.5 text-petal-ink-soft hover:text-petal-ink font-body text-xs"
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

        {isExpanded && (
          <WallPostThread
            postId={post.id}
            currentUserId={userId}
            onReplyCountChange={(newCount) => updateReplyCount(post.id, newCount)}
            onError={(message) =>
              showNotification({ type: 'error', title: '發生錯誤', message })
            }
          />
        )}
      </div>
    );
  };

  const renderDemoCard = () => {
    const demo = defaultWallExamples[0];
    if (!demo) return null;
    return (
      <div
        className="bg-petal-cream-2/40 rounded-md p-5 border border-dashed border-petal-rule"
        data-testid="wall-demo-card"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-petal-sage/30 text-petal-ink-soft font-body text-[10px] uppercase tracking-[0.12em]">
            範例
          </span>
          <span className="font-display text-base font-medium text-petal-ink">
            {demo.title}
          </span>
        </div>
        <div className="font-body text-sm text-petal-ink-soft leading-relaxed whitespace-pre-wrap line-clamp-6">
          {demo.content}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => openComposer({ template: demo })}
            className="bg-petal-ink text-petal-cream px-4 py-2 rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors"
            data-testid="wall-demo-use-template"
          >
            用這個範本開始
          </button>
          <span className="font-body text-[11px] text-petal-muted">
            這只是示範 — 寫了第一則之後就會消失。
          </span>
        </div>
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
            <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
              我們的<em className="not-italic font-light italic text-pink-600">牆</em>
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
              還沒有貼文 — 看看下面的範例，或寫下你的第一則。
            </p>
          </div>
          {renderDemoCard()}
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
      />
    </div>
  );
};

export default WallView;
