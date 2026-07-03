import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Heart, FileText, Plus, Filter, Play, Eye, Pencil, X, Store, ArrowDownWideNarrow, LayoutGrid, List, Gamepad2, ChevronDown, ArrowUp, ChevronLeft, ChevronRight, Share2, Search } from 'lucide-react';
import type { Notification } from './ErrorNotification';
import { useScrollLock } from '../hooks/useScrollLock';
import { apiService } from '../services/api';
import type { MarketplaceScript } from '../services/api';
import StarRating from './StarRating';
import MarketplaceScriptDetail from './MarketplaceScriptDetail';
import PetalSelect from './PetalSelect';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatYmdInTz, formatDate } from '../utils/datetime';
import { scriptHasUnresolvedGenderTokens } from '../utils/script';

interface RoleplayScript {
  id: string;
  title: string;
  category: 'romantic' | 'adventurous' | 'school' | 'bold';
  scenario: string;
  image?: string;
  script: string;
  isCustom?: boolean;
  isPublic?: boolean;
  createdBy?: string;
  createdAt?: string;
  tags?: string[];
  duration?: string;
  photos?: string[];
}

interface RoleplayViewProps {
  defaultRoleplayScripts: RoleplayScript[];
  customScripts: RoleplayScript[];
  roleplayFilter: string;
  setRoleplayFilter: React.Dispatch<React.SetStateAction<string>>;
  setShowScriptUploadModal: React.Dispatch<React.SetStateAction<boolean>>;
  parseScriptContent: (content: string) => string;
  addIntimateRecord: (
    date: string,
    time: string,
    mood: string,
    notes: string,
    photo?: string,
    description?: string,
    duration?: string,
    location?: string,
    roleplayScript?: string,
    activityType?: string
  ) => void;
  onEditScript?: (script: RoleplayScript) => void;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  favoriteScriptIds: Set<string>;
  onToggleFavorite: (scriptId: string) => void;
  onUnpublishScript?: (scriptId: string) => Promise<void>;
  initialScriptTitle?: string | null;
  onInitialScriptConsumed?: () => void;
  renderGames?: () => React.ReactNode;
}

const CATEGORY_META: Record<RoleplayScript['category'], { label: string; emoji: string; tint: string }> = {
  romantic:    { label: '浪漫', emoji: '💕', tint: 'from-petal-rose-soft to-petal-cream-2' },
  adventurous: { label: '冒險', emoji: '🔥', tint: 'from-petal-rose to-petal-rose-soft' },
  school:      { label: '校園', emoji: '🏫', tint: 'from-petal-sage/40 to-petal-cream-2' },
  bold:        { label: '大膽', emoji: '🧨', tint: 'from-petal-rose-deep/30 to-petal-rose-soft' },
};

// Editorial placeholder shown when a script has no thumbnail. Uses the
// category-tinted cream gradient + the category's small emoji, rendered as
// a quiet card rather than a stark grey box.
const ScriptThumbPlaceholder: React.FC<{
  category: RoleplayScript['category'];
  title: string;
  className?: string;
}> = ({ category, title, className = '' }) => {
  const meta = CATEGORY_META[category];
  return (
    <div className={`relative w-full h-full bg-gradient-to-br ${meta.tint} flex items-center justify-center overflow-hidden ${className}`}>
      <span className="text-2xl opacity-60 saturate-75" aria-hidden>{meta.emoji}</span>
      <span className="absolute bottom-1.5 right-2 font-display italic font-light text-[10px] text-petal-ink-soft/70 truncate max-w-[80%] text-right">
        {title}
      </span>
    </div>
  );
};

type ViewMode = 'grid' | 'list';

// Per-section view mode (grid/list) persisted under its own localStorage key so
// each section — favorites, custom, collection, all, marketplace — remembers its
// own preference independently rather than sharing one global toggle.
function usePersistedViewMode(key: string, fallback: ViewMode = 'grid') {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem(key);
      return v === 'list' || v === 'grid' ? v : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, mode); } catch { /* ignore */ }
  }, [key, mode]);
  return [mode, setMode] as const;
}

// Persisted boolean (collapsed/expanded), so a section the user opens once stays
// open on the next visit. Defaults apply only when nothing is stored yet.
function usePersistedBool(key: string, fallback: boolean) {
  const [val, setVal] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v === '1';
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, val ? '1' : '0'); } catch { /* ignore */ }
  }, [key, val]);
  return [val, setVal] as const;
}

// Small grid/list segmented control shown in each section header.
const ViewToggle: React.FC<{
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  idPrefix: string;
}> = ({ mode, setMode, idPrefix }) => (
  <div className="flex items-center gap-0.5 flex-shrink-0">
    <button
      type="button"
      onClick={() => setMode('grid')}
      data-testid={`${idPrefix}-view-toggle-grid`}
      aria-label="縮圖檢視"
      aria-pressed={mode === 'grid'}
      className={`p-1.5 rounded-md transition-colors ${
        mode === 'grid' ? 'text-petal-ink bg-petal-cream-2' : 'text-petal-muted hover:text-petal-ink'
      }`}
    >
      <LayoutGrid className="w-4 h-4" strokeWidth={1.5} />
    </button>
    <button
      type="button"
      onClick={() => setMode('list')}
      data-testid={`${idPrefix}-view-toggle-list`}
      aria-label="列表檢視"
      aria-pressed={mode === 'list'}
      className={`p-1.5 rounded-md transition-colors ${
        mode === 'list' ? 'text-petal-ink bg-petal-cream-2' : 'text-petal-muted hover:text-petal-ink'
      }`}
    >
      <List className="w-4 h-4" strokeWidth={1.5} />
    </button>
  </div>
);

const RoleplayView: React.FC<RoleplayViewProps> = ({
  defaultRoleplayScripts,
  customScripts,
  roleplayFilter,
  setRoleplayFilter,
  setShowScriptUploadModal,
  parseScriptContent,
  addIntimateRecord,
  onEditScript,
  showNotification,
  favoriteScriptIds,
  onToggleFavorite,
  onUnpublishScript,
  initialScriptTitle,
  onInitialScriptConsumed,
  renderGames,
}) => {
  const tz = useTimezone();
  const [selectedScript, setSelectedScript] = useState<RoleplayScript | null>(null);
  const [showScriptModal, setShowScriptModal] = useState(false);
  // Id of the script currently being shared to the partner's email (disables
  // that card's share button while the request is in flight).
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  // In-modal photo paging for the preview image (arrows / swipe) so users can
  // browse the photo series without opening the fullscreen lightbox.
  const [modalPhotoIndex, setModalPhotoIndex] = useState(0);
  const photoTouchX = useRef<number | null>(null);
  // Tracks whether the current modal viewing has been "begun" — i.e. user
  // explicitly clicked "開始扮演" and we recorded an intimacy moment. View
  // alone does NOT record; only this transition does.
  const [hasBegun, setHasBegun] = useState(false);

  // View mode (grid/list) for the unified 我的劇本 list and the 收藏 section.
  const [mineView, setMineView] = usePersistedViewMode('roleplayView:mine', 'grid');
  // Free-text search across 我的劇本 — title / scenario / tag, case-insensitive.
  const [mineQuery, setMineQuery] = useState('');
  // Tag filter — user-defined script tags can be many, so they're hidden behind
  // a 「查看所有標籤」 toggle and act as an extra filter on top of the chip.
  const [showAllTags, setShowAllTags] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [collectionView, setCollectionView] = usePersistedViewMode('roleplayView:collection', 'grid');
  const [marketplaceView, setMarketplaceView] = usePersistedViewMode('roleplayView:marketplace', 'grid');

  // 收藏劇本 (marketplace favorites) is collapsed by default so the page stays
  // short on mobile; the choice sticks.
  const [collectionOpen, setCollectionOpen] = usePersistedBool('roleplayOpen:collection', false);

  // Anchor for the 收藏 section's own layout.
  const collectionRef = useRef<HTMLDivElement>(null);

  // Floating back-to-top button — shown once the user has scrolled past a screenful.
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Marketplace state — discoverable public scripts shared by other users.
  const [mainTab, setMainTab] = useState<'mine' | 'marketplace' | 'games'>('mine');
  const [marketplaceScripts, setMarketplaceScripts] = useState<MarketplaceScript[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceSort, setMarketplaceSort] = useState<'rating' | 'recent' | 'popular'>('rating');
  const [marketplaceCategory, setMarketplaceCategory] = useState<'all' | RoleplayScript['category']>('all');
  const [marketplaceDetailId, setMarketplaceDetailId] = useState<string | null>(null);
  const [favoritedMarketplace, setFavoritedMarketplace] = useState<MarketplaceScript[]>([]);

  const loadMarketplace = useCallback(async () => {
    setMarketplaceLoading(true);
    try {
      const list = await apiService.getMarketplaceScripts({
        sort: marketplaceSort,
        category: marketplaceCategory === 'all' ? undefined : marketplaceCategory,
        limit: 60,
      });
      setMarketplaceScripts(list);
    } catch (err) {
      showNotification({
        type: 'error',
        title: '無法載入創作市集',
        message: (err as Error)?.message || '請稍後再試',
        duration: 4000,
      });
    } finally {
      setMarketplaceLoading(false);
    }
  }, [marketplaceSort, marketplaceCategory, showNotification]);

  const loadFavoritedMarketplace = useCallback(async () => {
    try {
      const list = await apiService.getFavoritedMarketplaceScripts();
      setFavoritedMarketplace(list);
    } catch {
      // Quiet fail — the section just stays empty.
    }
  }, []);

  useEffect(() => {
    if (mainTab === 'marketplace') loadMarketplace();
  }, [mainTab, loadMarketplace]);

  useEffect(() => {
    loadFavoritedMarketplace();
  }, [loadFavoritedMarketplace, favoriteScriptIds]);

  useScrollLock(showScriptModal && !!selectedScript);

  // Photos available for the open script's lightbox: the full series when set,
  // else the single cover image (legacy scripts / built-ins).
  const lightboxPhotos: string[] = selectedScript
    ? (selectedScript.photos && selectedScript.photos.length > 0
        ? selectedScript.photos
        : selectedScript.image
        ? [selectedScript.image]
        : [])
    : [];

  const showLightboxAt = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const count = lightboxPhotos.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      else if (e.key === 'ArrowRight' && count > 1) setLightboxIndex((i) => (i + 1) % count);
      else if (e.key === 'ArrowLeft' && count > 1) setLightboxIndex((i) => (i - 1 + count) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, lightboxPhotos.length]);

  // Reset the in-modal photo index when a different script's modal opens, and
  // keep it in sync while the lightbox is open so closing returns to the same
  // photo in the preview.
  useEffect(() => { setModalPhotoIndex(0); }, [selectedScript?.id, showScriptModal]);
  useEffect(() => { if (lightboxOpen) setModalPhotoIndex(lightboxIndex); }, [lightboxOpen, lightboxIndex]);

  const onPhotoTouchStart = (e: React.TouchEvent) => { photoTouchX.current = e.changedTouches[0].clientX; };
  // Swipe left → next, right → prev. `apply` gets the direction (+1/-1).
  const onPhotoSwipeEnd = (e: React.TouchEvent, apply: (dir: 1 | -1) => void) => {
    const start = photoTouchX.current;
    photoTouchX.current = null;
    if (start == null || lightboxPhotos.length < 2) return;
    const dx = e.changedTouches[0].clientX - start;
    if (dx <= -40) apply(1);
    else if (dx >= 40) apply(-1);
  };
  const stepModalPhoto = (dir: 1 | -1) =>
    setModalPhotoIndex((i) => (i + dir + lightboxPhotos.length) % lightboxPhotos.length);
  const stepLightbox = (dir: 1 | -1) =>
    setLightboxIndex((i) => (i + dir + lightboxPhotos.length) % lightboxPhotos.length);

  const handleViewScript = useCallback((script: RoleplayScript) => {
    const parsedScript = parseScriptContent(script.script);
    setSelectedScript({ ...script, script: parsedScript });
    setHasBegun(false);
    setShowScriptModal(true);
  }, [parseScriptContent]);

  useEffect(() => {
    if (!initialScriptTitle) return;
    const match = [...defaultRoleplayScripts, ...customScripts].find(
      (s) => s.title === initialScriptTitle
    );
    if (match) {
      handleViewScript(match);
    } else {
      showNotification({
        type: 'warning',
        title: '找不到劇本',
        message: `「${initialScriptTitle}」可能已被刪除或重新命名`,
        duration: 4000,
      });
    }
    onInitialScriptConsumed?.();
  }, [initialScriptTitle, defaultRoleplayScripts, customScripts, handleViewScript, showNotification, onInitialScriptConsumed]);

  const recordRoleplay = useCallback((script: RoleplayScript) => {
    const time = new Date().toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    });
    addIntimateRecord(
      formatYmdInTz(new Date(), tz),
      time,
      '🔥',
      `使用角色扮演劇本：${script.title}`,
      undefined,
      script.scenario,
      script.duration || '15-30分鐘',
      '私人空間',
      script.title,
      'roleplay'
    );
  }, [addIntimateRecord, tz]);

  const handleBeginRoleplay = useCallback(() => {
    if (!selectedScript) return;
    recordRoleplay(selectedScript);
    setHasBegun(true);
  }, [selectedScript, recordRoleplay]);

  const handleQuickPlay = useCallback((script: RoleplayScript) => {
    recordRoleplay(script);
    showNotification({
      type: 'success',
      title: '已開始扮演',
      message: `已將「${script.title}」記入今晚的愛情日曆`,
      duration: 4000,
    });
  }, [recordRoleplay, showNotification]);

  const closeModal = useCallback(() => {
    setShowScriptModal(false);
    setHasBegun(false);
    setLightboxOpen(false);
  }, []);

  // Email the script to the partner to spark their interest. The backend
  // returns a clear message for every outcome (shared / unpaired / opted out),
  // so we surface it directly and pick the toast tone from `success`.
  const handleShareScript = useCallback(async (script: RoleplayScript) => {
    if (sharingId) return;
    setSharingId(script.id);
    try {
      const result = await apiService.shareCustomScript(script.id);
      showNotification({
        type: result?.success ? 'success' : 'info',
        title: result?.success ? '已分享給伴侶' : '尚未分享',
        message: result?.message || '已將劇本分享到伴侶的信箱。',
        duration: 5000,
      });
    } catch (error) {
      showNotification({
        type: 'error',
        title: '分享失敗',
        message: (error as Error)?.message || '無法分享劇本，請稍後再試。',
        duration: 5000,
      });
    } finally {
      setSharingId(null);
    }
  }, [sharingId, showNotification]);

  // A custom script counts as "new" for 7 days after creation, so the couple
  // notices freshly added scripts at a glance.
  const isRecentlyCreated = (createdAt?: string) => {
    if (!createdAt) return false;
    const t = new Date(createdAt).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() - t < 7 * 24 * 60 * 60 * 1000;
  };

  const allScripts = [...defaultRoleplayScripts, ...customScripts];

  // Unified 我的劇本 list: one chip filter (all / category / 我的最愛 / 自訂)
  // plus a free-text search over title / scenario / tags.
  const mineBase =
    roleplayFilter === 'all' ? allScripts
    : roleplayFilter === 'favorites' ? allScripts.filter(s => favoriteScriptIds.has(s.id))
    : roleplayFilter === 'custom' ? customScripts
    : allScripts.filter(s => s.category === roleplayFilter);
  const mineQ = mineQuery.trim().toLowerCase();
  const mineSearched = mineQ
    ? mineBase.filter((s) =>
        s.title?.toLowerCase().includes(mineQ) ||
        s.scenario?.toLowerCase().includes(mineQ) ||
        (s.tags || []).some((t) => t.toLowerCase().includes(mineQ)))
    : mineBase;
  const mineList = activeTag
    ? mineSearched.filter((s) => (s.tags || []).includes(activeTag))
    : mineSearched;

  // Distinct tags across all scripts (for the 查看所有標籤 filter panel).
  const allTags = [...new Set(allScripts.flatMap((s) => s.tags || []))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  // Convert marketplace data shape into the RoleplayScript the play/view
  // handlers expect. Keeps recordRoleplay logic single-sourced.
  const marketplaceToRoleplay = (m: MarketplaceScript): RoleplayScript => ({
    id: m.id,
    title: m.title,
    category: m.category,
    scenario: m.scenario,
    image: m.thumbnailUrl ?? undefined,
    script: m.script,
    isCustom: true,
    isPublic: m.isPublic,
    createdBy: m.authorId,
    createdAt: m.createdAt,
    tags: m.tags,
    duration: m.duration,
  });

  const handleMarketplacePlay = useCallback((m: MarketplaceScript) => {
    const rp = marketplaceToRoleplay(m);
    setMarketplaceDetailId(null);
    handleQuickPlay(rp);
  }, [handleQuickPlay]);

  const FavoriteButton: React.FC<{ scriptId: string; className?: string }> = ({ scriptId, className = '' }) => {
    const isFav = favoriteScriptIds.has(scriptId);
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(scriptId);
        }}
        data-testid={`script-favorite-toggle-${scriptId}`}
        aria-label={isFav ? '取消最愛' : '加入最愛'}
        aria-pressed={isFav}
        className={`inline-flex items-center justify-center rounded-full transition-colors ${className}`}
      >
        <Heart
          className={`w-4 h-4 transition-colors ${isFav ? 'fill-petal-rose-deep text-petal-rose-deep' : 'text-petal-muted hover:text-petal-rose-deep'}`}
          strokeWidth={1.5}
        />
      </button>
    );
  };

  // Renders either the real thumbnail, or the editorial placeholder if image
  // is missing / fails to load. `fit` controls the <img> object-fit. We default
  // to 'contain' so the full image is always visible — never crop images (see
  // CLAUDE.md). The slot background (bg-petal-cream-2) shows behind contained
  // images that don't match the slot's aspect ratio.
  const renderThumb = (script: RoleplayScript, className: string, fit: 'cover' | 'contain' = 'contain') => {
    if (!script.image) {
      return <ScriptThumbPlaceholder category={script.category} title={script.title} className={className} />;
    }
    const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover';
    return (
      <>
        <img
          src={script.image}
          alt={script.title}
          className={`${className} ${fitClass}`}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex';
          }}
        />
        <div className={`hidden ${className}`}>
          <ScriptThumbPlaceholder category={script.category} title={script.title} />
        </div>
      </>
    );
  };

  // Compact text-only row used when viewMode === 'list'. Renders the category emoji
  // as a left-edge marker (no images per the user spec), title + scenario truncated
  // to keep many scripts visible at once, and an actions slot on the right.
  const renderScriptListRow = (opts: {
    key: React.Key;
    testId?: string;
    script: RoleplayScript;
    badge?: React.ReactNode;
    metaLine?: React.ReactNode;
    actions: React.ReactNode;
    onClick?: () => void;
  }) => {
    const meta = CATEGORY_META[opts.script.category];
    return (
      <div
        key={opts.key}
        data-testid={opts.testId}
        onClick={opts.onClick}
        className={`flex items-center gap-3 px-3 py-2.5 bg-white border border-petal-rule rounded-md hover:border-petal-rose transition-colors ${opts.onClick ? 'cursor-pointer' : ''}`}
      >
        <span className="text-base opacity-70 saturate-75 flex-shrink-0" aria-hidden>
          {meta?.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="font-display text-sm font-medium tracking-tight text-petal-ink truncate">
              {opts.script.title}
            </h4>
            {opts.badge}
          </div>
          <p className="font-body text-xs text-petal-ink-soft truncate">
            {opts.script.scenario}
          </p>
          {opts.metaLine}
        </div>
        <div
          className="flex items-center gap-1.5 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {opts.actions}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10">
      {mainTab !== 'games' && (
      <div className="border-b border-petal-rule pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 劇本
        </div>
        <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.1] md:leading-[1.05] mb-3">
          角色<em className="not-italic font-light italic text-pink-600">扮演</em>劇本
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          點燃激情，重溫浪漫 — 慢慢來。
        </p>
      </div>
      )}

      {/* Main tabs — My Scripts vs Marketplace. Icons hide on the narrowest
          phones and labels never wrap, so 「我的劇本」stays on one line. */}
      <div className="flex items-stretch gap-0.5 sm:gap-1 mb-6 border-b border-petal-rule overflow-x-auto">
        {([
          { id: 'mine' as const, label: '我的劇本', icon: <FileText className="w-3.5 h-3.5" strokeWidth={1.5} /> },
          { id: 'marketplace' as const, label: '創作市集', icon: <Store className="w-3.5 h-3.5" strokeWidth={1.5} /> },
          ...(renderGames ? [{ id: 'games' as const, label: '情趣遊戲', icon: <Gamepad2 className="w-3.5 h-3.5" strokeWidth={1.5} /> }] : []),
        ]).map((t) => {
          const isActive = mainTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setMainTab(t.id)}
              data-testid={`roleplay-tab-${t.id}`}
              className={`px-2.5 sm:px-4 py-2.5 font-display text-[15px] sm:text-base tracking-tight whitespace-nowrap transition-colors -mb-px border-b-2 inline-flex items-center gap-1.5 sm:gap-2 ${
                isActive
                  ? 'text-petal-ink border-petal-rose-deep font-medium'
                  : 'text-petal-muted border-transparent hover:text-petal-ink'
              }`}
            >
              <span className="hidden xs:inline-flex">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {mainTab === 'mine' && (
      <div>
        {/* Top controls — upload (moved to the top), search, and view toggle. */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setShowScriptUploadModal(true)}
            data-testid="script-upload-button"
            className="bg-petal-ink text-petal-cream px-4 py-2 rounded-full font-body text-sm hover:bg-pink-700 transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            <span>上傳劇本</span>
          </button>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-petal-muted" strokeWidth={1.5} />
            <input
              type="text"
              value={mineQuery}
              onChange={(e) => setMineQuery(e.target.value)}
              data-testid="custom-script-search"
              placeholder="搜尋劇本（標題、情境、標籤）"
              className="w-full bg-white border border-petal-rule rounded-full pl-9 pr-9 py-2 font-body text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose"
            />
            {mineQuery && (
              <button
                onClick={() => setMineQuery('')}
                data-testid="custom-script-search-clear"
                aria-label="清除搜尋"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-petal-muted hover:text-petal-ink"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
          </div>
          <ViewToggle mode={mineView} setMode={setMineView} idPrefix="roleplay-mine" />
        </div>

        {/* Filter chips — all / categories / 我的最愛 / 自訂, plus a 查看所有標籤
            toggle that reveals user tags as extra filters (they can be many). */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-1.5" data-testid="roleplay-filter-chips">
            {[
              { id: 'all', label: '所有', icon: '🌟' },
              { id: 'romantic', label: '浪漫', icon: '💕' },
              { id: 'adventurous', label: '冒險', icon: '🔥' },
              { id: 'school', label: '校園', icon: '🏫' },
              { id: 'bold', label: '大膽', icon: '🧨' },
              { id: 'favorites', label: '我的最愛', icon: '♥' },
              { id: 'custom', label: '自訂', icon: '📄' },
            ].map(f => {
              const isActive = roleplayFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setRoleplayFilter(f.id)}
                  data-testid={`roleplay-filter-${f.id}`}
                  className={`flex items-center space-x-1.5 px-3 sm:px-3.5 py-1.5 rounded-full transition-colors border min-h-[36px] ${
                    isActive
                      ? 'bg-petal-ink text-petal-cream border-petal-ink'
                      : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
                  }`}
                >
                  <span className="text-xs opacity-75 saturate-75">{f.icon}</span>
                  <span className="font-body text-[13px] font-medium">{f.label}</span>
                </button>
              );
            })}
            {allTags.length > 0 && (
              <button
                onClick={() => setShowAllTags((v) => !v)}
                data-testid="roleplay-tags-toggle"
                aria-expanded={showAllTags}
                className={`flex items-center gap-1 px-3 sm:px-3.5 py-1.5 rounded-full transition-colors border min-h-[36px] font-body text-[13px] font-medium ${
                  activeTag
                    ? 'bg-petal-rose-deep text-petal-cream border-petal-rose-deep'
                    : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
                }`}
              >
                {activeTag ? `#${activeTag}` : '查看所有標籤'}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllTags ? '' : '-rotate-90'}`} strokeWidth={1.5} />
              </button>
            )}
          </div>

          {/* Active tag pill (when the panel is collapsed) — quick clear. */}
          {activeTag && !showAllTags && (
            <div className="mt-2">
              <button
                onClick={() => setActiveTag(null)}
                data-testid="roleplay-tag-clear"
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-petal-rose-deep text-petal-cream text-xs font-body"
              >
                #{activeTag}
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </div>
          )}

          {/* Expandable tag panel — click a tag to filter; click again to clear. */}
          {showAllTags && (
            <div className="mt-3 flex flex-wrap gap-1.5 p-3 rounded-md border border-petal-rule bg-petal-cream-2/40" data-testid="roleplay-tags-panel">
              {allTags.map((tag) => {
                const active = activeTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(active ? null : tag)}
                    data-testid="roleplay-tag-chip"
                    className={`px-2.5 py-1 rounded-full border text-xs font-body transition-colors ${
                      active
                        ? 'bg-petal-ink text-petal-cream border-petal-ink'
                        : 'bg-white text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Unified script list — filtered by the active chip + search. Custom
            scripts keep 編輯/分享/查看/開始; default scripts keep 查看/開始. Both
            grid and list views are preserved. */}
        {mineList.length === 0 ? (
          <p data-testid="roleplay-empty" className="font-display italic font-light text-sm text-petal-muted text-center py-10">
            {mineQuery
              ? `找不到符合「${mineQuery}」的劇本。`
              : roleplayFilter === 'custom'
                ? '還沒有自訂劇本，點擊上方「上傳劇本」開始創作。'
                : roleplayFilter === 'favorites'
                  ? '還沒有最愛的劇本，點擊卡片上的愛心加入最愛。'
                  : '沒有符合的劇本。'}
          </p>
        ) : mineView === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mineList.map((script, index) => (
              <div
                key={script.id ?? index}
                data-testid={script.isCustom ? `script-card-custom-${script.id}` : undefined}
                className="bg-white border border-petal-rule rounded-md p-4 hover:border-petal-rose transition-colors"
              >
                <div className="flex items-start gap-3 sm:gap-4 mb-2">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-36 md:h-36 rounded-md flex-shrink-0 overflow-hidden border border-petal-rule bg-petal-cream-2">
                    {renderThumb(script, 'w-full h-full')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <h4 className="font-display text-base font-medium tracking-tight text-petal-ink truncate">{script.title}</h4>
                        <span className="flex-shrink-0 font-body text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-petal-rule text-petal-muted">
                          {CATEGORY_META[script.category]?.label ?? script.category}
                        </span>
                        {script.isCustom && (
                          <span data-testid="script-card-custom-badge" className="flex-shrink-0 font-body text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-petal-rose-soft bg-petal-rose-soft/40 text-petal-rose-deep">自訂</span>
                        )}
                        {script.isCustom && isRecentlyCreated(script.createdAt) && (
                          <span data-testid={`script-new-badge-${script.id}`} className="flex-shrink-0 px-1.5 py-0.5 font-body text-[10px] font-medium uppercase tracking-[0.1em] rounded-full bg-petal-rose-deep text-petal-cream">New</span>
                        )}
                      </div>
                      <FavoriteButton scriptId={script.id} className="flex-shrink-0 w-7 h-7 hover:bg-petal-cream-2" />
                    </div>
                    <p className="font-body text-sm text-petal-ink-soft mt-1 leading-relaxed line-clamp-2">{script.scenario}</p>
                    {script.isCustom && script.createdAt && (
                      <p data-testid={`script-created-date-${script.id}`} className="font-body text-[11px] text-petal-muted mt-1">
                        建立於 {formatDate(script.createdAt, tz, { year: 'numeric', month: 'numeric', day: 'numeric', withWeekday: false })}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end flex-wrap gap-1.5 mt-3">
                  {script.isCustom && onEditScript && (
                    <button
                      onClick={() => onEditScript(script)}
                      data-testid={`script-edit-button-${script.id}`}
                      className="border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink px-3 py-1 rounded-full font-body text-xs transition-colors"
                      aria-label={`編輯 ${script.title}`}
                    >
                      <Pencil className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                      編輯
                    </button>
                  )}
                  {script.isCustom && (
                    <button
                      onClick={() => handleShareScript(script)}
                      disabled={sharingId === script.id}
                      data-testid={`script-card-custom-share-button-${script.id}`}
                      className="border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink px-3 py-1 rounded-full font-body text-xs transition-colors disabled:opacity-50"
                      aria-label={`分享 ${script.title} 給伴侶`}
                    >
                      <Share2 className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                      {sharingId === script.id ? '分享中' : '分享'}
                    </button>
                  )}
                  <button
                    onClick={() => handleViewScript(script)}
                    data-testid={script.isCustom ? `script-card-custom-view-button-${script.id}` : `script-list-view-button-${index}`}
                    className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                  >
                    <Eye className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                    查看
                  </button>
                  <button
                    onClick={() => handleQuickPlay(script)}
                    data-testid={script.isCustom ? `script-card-custom-play-button-${script.id}` : `script-list-play-button-${index}`}
                    className="bg-petal-rose-deep text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                  >
                    <Play className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                    開始
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {mineList.map((script, index) =>
              renderScriptListRow({
                key: script.id ?? index,
                testId: script.isCustom ? `script-card-custom-${script.id}` : undefined,
                script,
                badge: (
                  <>
                    <span className="font-body text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-petal-rule text-petal-muted flex-shrink-0">
                      {CATEGORY_META[script.category]?.label ?? script.category}
                    </span>
                    {script.isCustom && (
                      <span data-testid="script-card-custom-badge" className="font-body text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-petal-rose-soft bg-petal-rose-soft/40 text-petal-rose-deep flex-shrink-0">自訂</span>
                    )}
                    {script.isCustom && isRecentlyCreated(script.createdAt) && (
                      <span data-testid={`script-new-badge-${script.id}`} className="px-1.5 py-0.5 font-body text-[10px] font-medium uppercase tracking-[0.1em] rounded-full bg-petal-rose-deep text-petal-cream flex-shrink-0">New</span>
                    )}
                  </>
                ),
                actions: (
                  <>
                    <span className="hidden sm:inline-flex">
                      <FavoriteButton scriptId={script.id} className="w-7 h-7 hover:bg-petal-cream-2" />
                    </span>
                    {script.isCustom && onEditScript && (
                      <button
                        onClick={() => onEditScript(script)}
                        data-testid={`script-edit-button-${script.id}`}
                        className="hidden sm:inline-flex border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink px-3 py-1 rounded-full font-body text-xs transition-colors"
                        aria-label={`編輯 ${script.title}`}
                      >
                        <Pencil className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                        編輯
                      </button>
                    )}
                    {script.isCustom && (
                      <button
                        onClick={() => handleShareScript(script)}
                        disabled={sharingId === script.id}
                        data-testid={`script-card-custom-share-button-${script.id}`}
                        className="hidden sm:inline-flex border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink px-3 py-1 rounded-full font-body text-xs transition-colors disabled:opacity-50"
                        aria-label={`分享 ${script.title} 給伴侶`}
                      >
                        <Share2 className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                        {sharingId === script.id ? '分享中' : '分享'}
                      </button>
                    )}
                    <button
                      onClick={() => handleViewScript(script)}
                      data-testid={script.isCustom ? `script-card-custom-view-button-${script.id}` : `script-list-view-button-${index}`}
                      className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                    >
                      <Eye className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                      查看
                    </button>
                    <button
                      onClick={() => handleQuickPlay(script)}
                      data-testid={script.isCustom ? `script-card-custom-play-button-${script.id}` : `script-list-play-button-${index}`}
                      className="hidden sm:inline-flex bg-petal-rose-deep text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                    >
                      <Play className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                      開始
                    </button>
                  </>
                ),
              })
            )}
          </div>
        )}

        {/* Favorited from Marketplace — collapsed by default (can hold many). */}
        {favoritedMarketplace.length > 0 && (
          <div ref={collectionRef} className="mb-10 scroll-mt-20" data-testid="roleplay-marketplace-favorites-section">
            <div className="flex items-center justify-between gap-2 mb-6">
              <button
                type="button"
                onClick={() => setCollectionOpen((o) => !o)}
                data-testid="roleplay-collection-toggle"
                aria-expanded={collectionOpen}
                className="flex items-center min-w-0 group"
              >
                <ChevronDown
                  className={`w-5 h-5 mr-1 text-petal-muted flex-shrink-0 transition-transform ${collectionOpen ? '' : '-rotate-90'}`}
                  strokeWidth={1.5}
                />
                <Heart className="w-4 h-4 mr-2 text-petal-rose-deep fill-petal-rose-deep flex-shrink-0" strokeWidth={1.5} />
                <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink truncate group-hover:text-petal-rose-deep transition-colors">
                  收藏<em className="not-italic font-light italic text-pink-600 mx-1">劇本</em>
                  <span className="font-display italic font-light text-sm text-petal-muted ml-1">({favoritedMarketplace.length})</span>
                </h3>
              </button>
              {collectionOpen && (
                <ViewToggle mode={collectionView} setMode={setCollectionView} idPrefix="roleplay-collection" />
              )}
            </div>
            {!collectionOpen ? null : collectionView === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {favoritedMarketplace.map((m) => (
                  <div
                    key={m.id}
                    data-testid={`marketplace-favorite-card-${m.id}`}
                    className="bg-white border border-petal-rule rounded-md p-4 hover:border-petal-rose transition-colors cursor-pointer"
                    onClick={() => setMarketplaceDetailId(m.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-14 h-14 rounded-md flex-shrink-0 overflow-hidden border border-petal-rule">
                        {renderThumb(marketplaceToRoleplay(m), 'w-full h-full')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-display text-base font-medium tracking-tight text-petal-ink truncate">{m.title}</h4>
                          {!m.isPublic && (
                            <span className="text-[10px] text-petal-muted italic flex-shrink-0">作者已停止分享</span>
                          )}
                        </div>
                        <p className="font-body text-xs text-petal-muted mt-0.5">by {m.authorName}</p>
                        <p className="font-body text-sm text-petal-ink-soft mt-1 line-clamp-2 leading-relaxed">{m.scenario}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <StarRating value={m.avgStars} count={m.ratingCount} showCount size={12} />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleMarketplacePlay(m); }}
                              data-testid={`marketplace-favorite-play-${m.id}`}
                              className="bg-petal-rose-deep text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                            >
                              <Play className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                              開始
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {favoritedMarketplace.map((m) =>
                  renderScriptListRow({
                    key: m.id,
                    testId: `marketplace-favorite-card-${m.id}`,
                    script: marketplaceToRoleplay(m),
                    onClick: () => setMarketplaceDetailId(m.id),
                    metaLine: (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-body text-[11px] text-petal-muted truncate">by {m.authorName}</span>
                        <StarRating value={m.avgStars} count={m.ratingCount} showCount size={11} />
                      </div>
                    ),
                    badge: !m.isPublic ? (
                      <span className="text-[10px] text-petal-muted italic flex-shrink-0">作者已停止分享</span>
                    ) : undefined,
                    actions: (
                      <>
                        <span className="hidden sm:inline-flex">
                          <FavoriteButton scriptId={m.id} className="w-7 h-7 hover:bg-petal-cream-2" />
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMarketplaceDetailId(m.id); }}
                          data-testid={`marketplace-favorite-view-${m.id}`}
                          className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                        >
                          <Eye className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                          查看
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleMarketplacePlay(m); }}
                          data-testid={`marketplace-favorite-play-${m.id}`}
                          className="hidden sm:inline-flex bg-petal-rose-deep text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                        >
                          <Play className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                          開始
                        </button>
                      </>
                    ),
                  })
                )}
              </div>
            )}
          </div>
        )}

      </div>
      )}

      {mainTab === 'marketplace' && (
        <div data-testid="roleplay-marketplace-tab">
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <PetalSelect
              value={marketplaceSort}
              onChange={(v) => setMarketplaceSort(v as 'rating' | 'recent' | 'popular')}
              testId="marketplace-sort"
              optionTestIdPrefix="marketplace-sort"
              ariaLabel="排序方式"
              icon={<ArrowDownWideNarrow className="w-3.5 h-3.5 text-petal-muted" strokeWidth={1.5} />}
              options={[
                { value: 'rating', label: '評分最高' },
                { value: 'popular', label: '最熱門' },
                { value: 'recent', label: '最新' },
              ]}
            />
            <PetalSelect
              value={marketplaceCategory}
              onChange={(v) => setMarketplaceCategory(v as typeof marketplaceCategory)}
              testId="marketplace-category"
              optionTestIdPrefix="marketplace-category"
              ariaLabel="分類篩選"
              icon={<Filter className="w-3.5 h-3.5 text-petal-muted" strokeWidth={1.5} />}
              options={[
                { value: 'all', label: '全部分類' },
                { value: 'romantic', label: '浪漫' },
                { value: 'adventurous', label: '冒險' },
                { value: 'school', label: '校園' },
                { value: 'bold', label: '大膽' },
              ]}
            />
            <div className="ml-auto">
              <ViewToggle mode={marketplaceView} setMode={setMarketplaceView} idPrefix="roleplay-marketplace" />
            </div>
          </div>

          {marketplaceLoading ? (
            <p className="font-display italic font-light text-sm text-petal-muted text-center py-10">
              載入中…
            </p>
          ) : marketplaceScripts.length === 0 ? (
            <p className="font-display italic font-light text-sm text-petal-muted text-center py-10">
              目前還沒有公開劇本，第一個發布的就是你！
            </p>
          ) : (
            marketplaceView === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="marketplace-grid">
                {marketplaceScripts.map((m) => (
                  <div
                    key={m.id}
                    data-testid={`marketplace-card-${m.id}`}
                    className="bg-white border border-petal-rule rounded-md p-4 hover:border-petal-rose transition-colors cursor-pointer flex flex-col"
                    onClick={() => setMarketplaceDetailId(m.id)}
                  >
                    <div className="relative aspect-video bg-petal-cream-2 rounded-md mb-3 overflow-hidden">
                      {renderThumb(marketplaceToRoleplay(m), 'w-full h-full', 'contain')}
                    </div>
                    <h4 className="font-display text-base font-medium tracking-tight text-petal-ink mb-1 truncate">
                      {m.title}
                    </h4>
                    <p className="font-body text-xs text-petal-muted mb-1.5">by {m.authorName}</p>
                    <p className="font-body text-sm text-petal-ink-soft mb-3 line-clamp-2 leading-relaxed flex-1">
                      {m.scenario}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <StarRating value={m.avgStars} count={m.ratingCount} showCount size={13} />
                      <div className="flex items-center gap-1.5">
                        <FavoriteButton scriptId={m.id} className="w-7 h-7 hover:bg-petal-cream-2" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleMarketplacePlay(m); }}
                          data-testid={`marketplace-play-${m.id}`}
                          className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                        >
                          <Play className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                          玩
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5" data-testid="marketplace-grid">
                {marketplaceScripts.map((m) =>
                  renderScriptListRow({
                    key: m.id,
                    testId: `marketplace-card-${m.id}`,
                    script: marketplaceToRoleplay(m),
                    onClick: () => setMarketplaceDetailId(m.id),
                    metaLine: (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-body text-[11px] text-petal-muted truncate">by {m.authorName}</span>
                        <StarRating value={m.avgStars} count={m.ratingCount} showCount size={11} />
                      </div>
                    ),
                    actions: (
                      <>
                        <FavoriteButton scriptId={m.id} className="w-7 h-7 hover:bg-petal-cream-2" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleMarketplacePlay(m); }}
                          data-testid={`marketplace-play-${m.id}`}
                          className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                        >
                          <Play className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                          玩
                        </button>
                      </>
                    ),
                  })
                )}
              </div>
            )
          )}
        </div>
      )}

      {mainTab === 'games' && renderGames && (
        <div data-testid="roleplay-tab-games-panel">
          {renderGames()}
        </div>
      )}

      {marketplaceDetailId && (
        <MarketplaceScriptDetail
          scriptId={marketplaceDetailId}
          onClose={() => setMarketplaceDetailId(null)}
          onPlay={(m) => handleMarketplacePlay(m)}
          onToggleFavorite={async (id) => {
            await onToggleFavorite(id);
            await loadFavoritedMarketplace();
          }}
          onUnpublish={onUnpublishScript ? async (id) => {
            await onUnpublishScript(id);
            // Reflect the new private state everywhere it was listed.
            await loadMarketplace();
            await loadFavoritedMarketplace();
          } : undefined}
          showNotification={showNotification}
          parseContent={parseScriptContent}
        />
      )}

      {/* Script Modal — view-only by default; record only on explicit 開始扮演 */}
      {showScriptModal && selectedScript && (
        <>
        <div
          data-testid="roleplay-modal"
          className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div
            className="relative bg-petal-cream rounded-md shadow-petal max-w-4xl w-full max-h-[min(90vh,calc(100dvh-80px))] border border-petal-rule overflow-y-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="relative aspect-video w-full bg-petal-cream-2 overflow-hidden border-b border-petal-rule"
              data-testid="roleplay-modal-thumb"
              onTouchStart={onPhotoTouchStart}
              onTouchEnd={(e) => onPhotoSwipeEnd(e, stepModalPhoto)}
            >
              {lightboxPhotos.length > 0 ? (
                <img
                  src={lightboxPhotos[modalPhotoIndex]}
                  alt={`${selectedScript.title} ${modalPhotoIndex + 1}`}
                  onClick={() => showLightboxAt(modalPhotoIndex)}
                  className="w-full h-full object-contain cursor-zoom-in"
                  data-testid="roleplay-modal-photo"
                />
              ) : (
                renderThumb(selectedScript, 'w-full h-full', 'contain')
              )}
              {lightboxPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); stepModalPhoto(-1); }}
                    data-testid="roleplay-modal-photo-prev"
                    aria-label="上一張"
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm border border-petal-rule shadow-sm text-petal-ink hover:bg-white transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); stepModalPhoto(1); }}
                    data-testid="roleplay-modal-photo-next"
                    aria-label="下一張"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm border border-petal-rule shadow-sm text-petal-ink hover:bg-white transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                  <span
                    className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-petal-ink/70 text-petal-cream text-xs font-body"
                    data-testid="roleplay-modal-photo-count"
                  >
                    {modalPhotoIndex + 1} / {lightboxPhotos.length}
                  </span>
                </>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); closeModal(); }}
                data-testid="roleplay-modal-close-button"
                aria-label="關閉"
                className="absolute top-3 left-3 w-9 h-9 inline-flex items-center justify-center rounded-full bg-white/85 backdrop-blur-sm border border-petal-rule shadow-sm text-petal-ink hover:bg-white transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <span
                className="absolute top-3 right-3"
                onClick={(e) => e.stopPropagation()}
              >
                <FavoriteButton
                  scriptId={selectedScript.id}
                  className="w-9 h-9 bg-white/85 backdrop-blur-sm border border-petal-rule shadow-sm hover:bg-white"
                />
              </span>
            </div>
            <div className="px-5 sm:px-8 pt-5 sm:pt-6 pb-4 sm:pb-5 border-b border-petal-rule">
              <div className="font-body text-xs sm:text-[11px] font-medium uppercase tracking-[0.08em] sm:tracking-[0.16em] text-petal-muted mb-2">
                — {selectedScript.isCustom ? '自訂劇本' : '劇本'}
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-light tracking-tight text-petal-ink mb-1">
                {selectedScript.title}
              </h3>
              <p className="font-display italic font-light text-sm text-petal-muted">{selectedScript.scenario}</p>
            </div>

            <div className="px-5 sm:px-8 py-5 sm:py-6">
              <div className="bg-petal-cream-2/40 p-4 sm:p-6 rounded-md border border-petal-rule-soft">
                <h4 className="font-body text-xs sm:text-[11px] font-medium uppercase tracking-[0.08em] sm:tracking-[0.14em] text-petal-muted mb-4 flex items-center">
                  <Play className="w-3.5 h-3.5 mr-1.5 text-petal-rose-deep" strokeWidth={1.5} />
                  劇本對話
                </h4>
                <div className="whitespace-pre-line font-body text-petal-ink leading-relaxed text-base">
                  {selectedScript.script || '劇本內容載入中…'}
                </div>
              </div>

              {scriptHasUnresolvedGenderTokens(selectedScript.script || '') && (
                <div
                  data-testid="script-gender-hint"
                  className="mt-4 p-3 bg-petal-cream-2/60 border border-petal-rule rounded-md"
                >
                  <p className="font-body text-sm text-petal-ink-soft">
                    此劇本包含男女角色（[男]／[女]）。請你和另一半先到「設定」選擇性別，劇本就會自動帶入你們的暱稱。
                  </p>
                </div>
              )}

              {hasBegun && (
                <div className="mt-5 p-4 bg-petal-sage/10 border border-petal-sage/40 rounded-md">
                  <p className="font-body text-sm text-petal-sage-deep flex items-center">
                    <Heart className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />
                    已記錄一次親密時光到你們的愛情日曆中。
                  </p>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-10 px-5 sm:px-8 py-4 border-t border-petal-rule bg-petal-cream/95 backdrop-blur-sm flex flex-col sm:flex-row justify-end gap-2 safe-pb">
              {selectedScript.isCustom && onEditScript && !hasBegun && (
                <button
                  onClick={() => {
                    // selectedScript.script holds the parsed display text —
                    // edit the stored original so placeholder tokens survive.
                    const original = customScripts.find((s) => s.id === selectedScript.id) ?? selectedScript;
                    onEditScript(original);
                    closeModal();
                  }}
                  data-testid="roleplay-modal-edit-button"
                  className="px-5 py-2 border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink rounded-md font-body text-sm transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5 inline mr-1.5" strokeWidth={1.5} />
                  編輯這份劇本
                </button>
              )}
              {!hasBegun ? (
                <button
                  onClick={handleBeginRoleplay}
                  data-testid="roleplay-modal-begin-button"
                  className="px-6 py-2 bg-petal-ink text-petal-cream rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
                >
                  <Play className="w-4 h-4 inline mr-1.5" strokeWidth={1.5} />
                  開始扮演 — 記入今晚
                </button>
              ) : (
                <button
                  onClick={closeModal}
                  data-testid="roleplay-modal-finish-button"
                  className="px-6 py-2 bg-petal-ink text-petal-cream rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
                >
                  完成 →
                </button>
              )}
            </div>
          </div>
        </div>
        {lightboxOpen && lightboxPhotos.length > 0 && (
          <div
            data-testid="roleplay-modal-lightbox"
            className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center overflow-hidden overscroll-contain p-3 sm:p-8"
            onClick={() => setLightboxOpen(false)}
            onTouchStart={onPhotoTouchStart}
            onTouchEnd={(e) => onPhotoSwipeEnd(e, stepLightbox)}
            role="dialog"
            aria-modal="true"
            aria-label="放大查看劇本照片"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
              data-testid="roleplay-modal-lightbox-close"
              aria-label="關閉放大檢視"
              className="fixed top-4 right-4 w-10 h-10 inline-flex items-center justify-center rounded-full bg-white/90 text-petal-ink hover:bg-white shadow-sm z-10"
            >
              <X className="w-5 h-5" strokeWidth={1.5} />
            </button>

            {lightboxPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i - 1 + lightboxPhotos.length) % lightboxPhotos.length); }}
                  data-testid="roleplay-modal-lightbox-prev"
                  aria-label="上一張"
                  className="fixed left-3 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center rounded-full bg-white/90 text-petal-ink hover:bg-white shadow-sm z-10"
                >
                  <ChevronLeft className="w-6 h-6" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i + 1) % lightboxPhotos.length); }}
                  data-testid="roleplay-modal-lightbox-next"
                  aria-label="下一張"
                  className="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center rounded-full bg-white/90 text-petal-ink hover:bg-white shadow-sm z-10"
                >
                  <ChevronRight className="w-6 h-6" strokeWidth={1.5} />
                </button>
                <span
                  data-testid="roleplay-modal-lightbox-counter"
                  className="fixed bottom-5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/90 text-petal-ink text-sm font-body z-10"
                >
                  {lightboxIndex + 1} / {lightboxPhotos.length}
                </span>
              </>
            )}

            <img
              src={lightboxPhotos[lightboxIndex]}
              alt={`${selectedScript.title} ${lightboxIndex + 1}`}
              onClick={(e) => e.stopPropagation()}
              // Fit the whole image within the viewport on any screen — never
              // crop or overflow. max-h/max-w + object-contain letterboxes it.
              className="block max-h-full max-w-full w-auto h-auto object-contain cursor-default"
              data-testid="roleplay-modal-lightbox-image"
            />
          </div>
        )}
        </>
      )}

      {/* Floating back-to-top — long script lists mean a lot of scrolling. */}
      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          data-testid="roleplay-back-to-top"
          aria-label="回到最上面"
          className="fixed bottom-6 right-4 sm:bottom-8 sm:right-8 z-40 w-11 h-11 inline-flex items-center justify-center rounded-full bg-petal-ink text-petal-cream shadow-petal border border-petal-ink/10 hover:bg-pink-700 transition-colors safe-pb"
        >
          <ArrowUp className="w-5 h-5" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
};

export default RoleplayView;
