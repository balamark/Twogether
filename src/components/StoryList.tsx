import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Crown, ThumbsUp, HeartHandshake, Wrench, MessageCircle, Eye, PenLine, Loader2, X, BookOpen, FileText } from 'lucide-react';
import { apiService, type StorySummary, type StoryKind } from '../services/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatRelativeOrDate } from '../utils/datetime';
import { CURATED_READINGS } from '../content/curatedReadings';
import CuratedReadingCard from './CuratedReadingCard';

// 好文 · 故事 archive list: pinned editorial reading + 本週精選 shelf + search +
// kind filter (all/article/story) + sort + paginated cards. Publicly readable;
// writing goes through the parent's onCompose.

type SortKey = 'latest' | 'helpful' | 'most_read';
type KindFilter = 'all' | 'article' | 'story';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'latest', label: '最新' },
  { key: 'helpful', label: '最有幫助' },
  { key: 'most_read', label: '最多人讀' },
];

const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'article', label: '好文' },
  { key: 'story', label: '故事' },
];

// Small pill marking whether a card is a shared article or a guided story.
function KindBadge({ kind }: { kind: StoryKind }) {
  const isArticle = kind === 'article';
  const Icon = isArticle ? FileText : BookOpen;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
        isArticle ? 'bg-petal-rose/15 text-petal-rose-deep' : 'bg-petal-sage/20 text-petal-ink'
      }`}
    >
      <Icon className="w-3 h-3" strokeWidth={1.5} />
      {isArticle ? '好文' : '故事'}
    </span>
  );
}

function StoryCard({ story, onOpen, featured = false }: { story: StorySummary; onOpen: () => void; featured?: boolean }) {
  const tz = useTimezone();
  const totalVotes = story.votes.helpful + story.votes.resonate + story.votes.repair_worked;
  return (
    <button
      type="button"
      data-testid="story-card"
      onClick={onOpen}
      className={`w-full text-left rounded-2xl border p-4 transition bg-white hover:border-petal-rose ${
        featured ? 'border-petal-rose/60 shadow-petal' : 'border-petal-rule-soft'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-petal-ink leading-snug">{story.title}</h3>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <KindBadge kind={story.kind} />
          {featured && <Crown className="w-4 h-4 text-amber-500" />}
        </div>
      </div>
      <p className="text-sm text-petal-ink-soft mt-1.5 leading-relaxed line-clamp-2">{story.preview}</p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {story.tags.map((t) => (
          <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-petal-sage/20 text-petal-ink">{t}</span>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2.5 text-[11px] text-petal-muted">
        <span>{story.authorName}</span>
        <span>{formatRelativeOrDate(story.createdAt, tz, { month: 'short', day: 'numeric' })}</span>
        <span className="inline-flex items-center gap-0.5"><ThumbsUp className="w-3 h-3" />{totalVotes}</span>
        <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-3 h-3" />{story.commentCount}</span>
        <span className="inline-flex items-center gap-0.5"><Eye className="w-3 h-3" />{story.viewCount}</span>
      </div>
    </button>
  );
}

export default function StoryList({
  onOpenStory,
  onCompose,
}: {
  onOpenStory: (id: string) => void;
  onCompose: () => void;
}) {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [featured, setFeatured] = useState<StorySummary[]>([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('latest');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (query: string, sortKey: SortKey, kind: KindFilter, pageNum: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const data = await apiService.getStories({
        q: query || undefined,
        sort: sortKey,
        kind: kind === 'all' ? undefined : kind,
        page: pageNum,
      });
      setStories((prev) => (append ? [...prev, ...data.stories] : data.stories));
      setHasMore(data.hasMore);
      if (!append) setFeatured(data.featured || []);
    } catch {
      if (!append) { setStories([]); setFeatured([]); }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load('', 'latest', 'all', 1, false);
  }, [load]);

  const search = (nextQ: string) => {
    setQ(nextQ);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(nextQ.trim(), sort, kindFilter, 1, false);
    }, 350);
  };

  const changeSort = (key: SortKey) => {
    setSort(key);
    setPage(1);
    load(q.trim(), key, kindFilter, 1, false);
  };

  const changeKind = (key: KindFilter) => {
    setKindFilter(key);
    setPage(1);
    load(q.trim(), sort, key, 1, false);
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load(q.trim(), sort, kindFilter, next, true);
  };

  const searching = q.trim().length > 0;
  // Pinned editorial reading shows on the default view (not while searching,
  // and hidden when the user has filtered to guided stories only).
  const showCurated = !searching && kindFilter !== 'story' && CURATED_READINGS.length > 0;

  return (
    <div className="space-y-4">
      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-petal-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            data-testid="story-search"
            value={q}
            onChange={(e) => search(e.target.value)}
            placeholder="搜尋好文或故事（主題、關鍵字⋯）"
            className="w-full pl-9 pr-8 py-2 rounded-full border border-petal-rule bg-white text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep"
          />
          {searching && (
            <button
              type="button"
              aria-label="清除搜尋"
              onClick={() => search('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-petal-muted hover:text-petal-ink"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              data-testid={`story-sort-${s.key}`}
              onClick={() => changeSort(s.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                sort === s.key
                  ? 'bg-petal-ink text-petal-cream border-petal-ink'
                  : 'text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kind filter: all / articles / stories */}
      <div className="flex gap-1.5" data-testid="story-kind-filter">
        {KIND_FILTERS.map((k) => (
          <button
            key={k.key}
            type="button"
            data-testid={`story-kind-${k.key}`}
            onClick={() => changeKind(k.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition inline-flex items-center gap-1 ${
              kindFilter === k.key
                ? 'bg-petal-rose-deep text-white border-petal-rose-deep'
                : 'text-petal-ink-soft border-petal-rule hover:border-petal-rose-deep hover:text-petal-ink'
            }`}
          >
            {k.key === 'article' && <FileText className="w-3 h-3" strokeWidth={1.5} />}
            {k.key === 'story' && <BookOpen className="w-3 h-3" strokeWidth={1.5} />}
            {k.label}
          </button>
        ))}
      </div>

      {/* Pinned editorial reading (moved here from 好好說話) */}
      {showCurated && (
        <div className="space-y-2" data-testid="story-curated">
          {CURATED_READINGS.map((r) => (
            <CuratedReadingCard key={r.id} reading={r} />
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-petal-rose-deep" /></div>
      ) : (
        <>
          {/* 本週精選 */}
          {!searching && featured.length > 0 && (
            <div data-testid="story-featured" className="space-y-2">
              <div className="flex items-center gap-1.5 text-petal-ink">
                <Crown className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium">本週精選</span>
                <span className="text-[11px] text-petal-muted">最近 7 天最被肯定的故事</span>
              </div>
              <div className="space-y-2">
                {featured.map((s) => (
                  <StoryCard key={`f-${s.id}`} story={s} featured onOpen={() => onOpenStory(s.id)} />
                ))}
              </div>
              <div className="border-b border-petal-rule-soft pt-1" />
            </div>
          )}

          {/* List / empty states */}
          {stories.length === 0 ? (
            searching ? (
              <div className="py-10 text-center text-petal-ink-soft" data-testid="story-search-empty">
                <p className="text-sm">找不到和「{q.trim()}」有關的好文或故事。</p>
                <button
                  type="button"
                  onClick={() => search('')}
                  className="mt-3 px-4 py-2 rounded-full border border-petal-rule text-sm text-petal-ink hover:bg-petal-sage/20"
                >
                  清除搜尋
                </button>
              </div>
            ) : (
              <div className="bg-white border border-petal-rule-soft rounded-2xl p-8 text-center" data-testid="story-empty-state">
                <PenLine className="w-8 h-8 mx-auto mb-3 text-petal-rose-deep" />
                <p className="text-petal-ink font-medium">
                  {kindFilter === 'article'
                    ? '讀到一篇對關係有幫助的好文？分享給其他伴侶'
                    : '你們走過的難關，可能正是另一對伴侶需要的地圖'}
                </p>
                <p className="text-xs text-petal-ink-soft mt-1.5 leading-relaxed max-w-sm mx-auto">
                  {kindFilter === 'article'
                    ? '把好文章純文字貼上、附上出處，就能分享給大家。也可以依引導模板寫下你們自己的真實故事。'
                    : '依引導模板寫下一段真實經歷：發生了什麼、怎麼修復、學到什麼；或分享一篇你讀到的好文。內容會匿名發表（除非你選擇顯示暱稱），幫助遇到同樣狀況的人。'}
                </p>
                <button
                  type="button"
                  data-testid="story-empty-compose"
                  onClick={onCompose}
                  className="mt-4 px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition"
                >
                  {kindFilter === 'article' ? '分享第一篇好文' : '分享你的第一則故事'}
                </button>
                {/* Static sample so an empty archive still shows what a story looks like */}
                <div className="mt-5 text-left bg-petal-cream-2 border border-petal-rule rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-petal-ink">車站接送吵架後的修復</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-petal-rose/20 text-petal-ink">範例</span>
                  </div>
                  <p className="text-xs text-petal-ink-soft mt-1 leading-relaxed">
                    他遲到四十分鐘還先怪我生氣⋯⋯冷戰兩天後，一句「我知道讓你等很久，你一定很難受」成了轉捩點。
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-2">
              {stories.map((s) => (
                <StoryCard key={s.id} story={s} onOpen={() => onOpenStory(s.id)} />
              ))}
            </div>
          )}

          {hasMore && (
            <div className="text-center">
              <button
                type="button"
                data-testid="story-load-more"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 rounded-full border border-petal-rule text-sm text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                載入更多
              </button>
            </div>
          )}

          {/* Persistent compose CTA under the list */}
          {stories.length > 0 && (
            <div className="text-center pt-2">
              <button
                type="button"
                data-testid="story-compose-cta"
                onClick={onCompose}
                className="px-5 py-2.5 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-2"
              >
                <HeartHandshake className="w-4 h-4" />
                分享你的故事
              </button>
              <p className="text-[11px] text-petal-muted mt-1.5 inline-flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                把你們最難的時刻，變成幫助其他伴侶的智慧
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
