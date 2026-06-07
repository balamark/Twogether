import React, { useState, useCallback, useEffect } from 'react';
import { Heart, Sparkles, FileText, Plus, Filter, Play, Eye, Pencil, X, Store, ArrowDownWideNarrow, LayoutGrid, List } from 'lucide-react';
import type { Notification } from './ErrorNotification';
import { useScrollLock } from '../hooks/useScrollLock';
import { apiService } from '../services/api';
import type { MarketplaceScript } from '../services/api';
import StarRating from './StarRating';
import MarketplaceScriptDetail from './MarketplaceScriptDetail';
import PetalSelect from './PetalSelect';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatYmdInTz } from '../utils/datetime';

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
  initialScriptTitle?: string | null;
  onInitialScriptConsumed?: () => void;
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
  initialScriptTitle,
  onInitialScriptConsumed,
}) => {
  const tz = useTimezone();
  const [selectedScript, setSelectedScript] = useState<RoleplayScript | null>(null);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Tracks whether the current modal viewing has been "begun" — i.e. user
  // explicitly clicked "開始扮演" and we recorded an intimacy moment. View
  // alone does NOT record; only this transition does.
  const [hasBegun, setHasBegun] = useState(false);

  // View mode — grid (thumbnails) vs list (compact text rows). Persisted across visits.
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('roleplayViewMode') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  useEffect(() => {
    try { localStorage.setItem('roleplayViewMode', viewMode); } catch { /* ignore */ }
  }, [viewMode]);

  // Marketplace state — discoverable public scripts shared by other users.
  const [mainTab, setMainTab] = useState<'mine' | 'marketplace'>('mine');
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

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen]);

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

  const allScripts = [...defaultRoleplayScripts, ...customScripts];
  const filteredScripts = roleplayFilter === 'all'
    ? allScripts
    : allScripts.filter(script => script.category === roleplayFilter);

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

  // 我的最愛 — pulls from both default and custom scripts. Falls back to the
  // original top-3 featured selection when the couple has no favorites yet,
  // so the top section never goes empty.
  const favoriteScripts = allScripts.filter(s => favoriteScriptIds.has(s.id));
  const hasFavorites = favoriteScripts.length > 0;
  const topScripts = hasFavorites ? favoriteScripts : defaultRoleplayScripts.slice(0, 3);
  const topSectionTitle = hasFavorites ? '我的最愛' : '精選';

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

      {/* Main tabs — My Scripts vs Marketplace */}
      <div className="flex items-center justify-between gap-2 mb-6 border-b border-petal-rule">
        <div className="flex gap-1">
          {([
            { id: 'mine' as const, label: '我的劇本', icon: <FileText className="w-3.5 h-3.5" strokeWidth={1.5} /> },
            { id: 'marketplace' as const, label: '創作市集', icon: <Store className="w-3.5 h-3.5" strokeWidth={1.5} /> },
          ]).map((t) => {
            const isActive = mainTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setMainTab(t.id)}
                data-testid={`roleplay-tab-${t.id}`}
                className={`px-4 py-2.5 font-display text-base tracking-tight transition-colors -mb-px border-b-2 inline-flex items-center gap-2 ${
                  isActive
                    ? 'text-petal-ink border-petal-rose-deep font-medium'
                    : 'text-petal-muted border-transparent hover:text-petal-ink'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 pb-1.5">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            data-testid="roleplay-view-toggle-grid"
            aria-label="縮圖檢視"
            aria-pressed={viewMode === 'grid'}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'grid'
                ? 'text-petal-ink bg-petal-cream-2'
                : 'text-petal-muted hover:text-petal-ink'
            }`}
          >
            <LayoutGrid className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            data-testid="roleplay-view-toggle-list"
            aria-label="列表檢視"
            aria-pressed={viewMode === 'list'}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'list'
                ? 'text-petal-ink bg-petal-cream-2'
                : 'text-petal-muted hover:text-petal-ink'
            }`}
          >
            <List className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {mainTab === 'mine' && (
      <div>
        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-1.5 mb-8">
          {[
            { id: 'all', label: '全部', icon: '🌟' },
            { id: 'romantic', label: '浪漫', icon: '💕' },
            { id: 'adventurous', label: '冒險', icon: '🔥' },
            { id: 'school', label: '校園', icon: '🏫' },
            { id: 'bold', label: '大膽', icon: '🧨' }
          ].map(category => {
            const isActive = roleplayFilter === category.id;
            return (
              <button
                key={category.id}
                onClick={() => setRoleplayFilter(category.id)}
                className={`flex items-center space-x-1.5 px-3 sm:px-3.5 py-1.5 rounded-full transition-colors border min-h-[36px] ${
                  isActive
                    ? 'bg-petal-ink text-petal-cream border-petal-ink'
                    : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
                }`}
              >
                <span className="text-xs opacity-75 saturate-75">{category.icon}</span>
                <span className="font-body text-[13px] font-medium">{category.label}</span>
              </button>
            );
          })}
        </div>

        {/* Top section — favorites if any, else fallback featured */}
        <div className="mb-10" data-testid={hasFavorites ? 'roleplay-favorites-section' : 'roleplay-featured-section'}>
          <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6 flex items-center">
            {hasFavorites ? (
              <Heart className="w-4 h-4 mr-2 text-petal-rose-deep fill-petal-rose-deep" strokeWidth={1.5} />
            ) : (
              <Sparkles className="w-4 h-4 mr-2 text-petal-rose-deep" strokeWidth={1.5} />
            )}
            {topSectionTitle}<em className="not-italic font-light italic text-pink-600 ml-1">劇本</em>
          </h3>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {topScripts.map((script, index) => (
                <div key={script.id ?? index} className="bg-white rounded-md p-4 border border-petal-rule hover:border-petal-rose transition-colors">
                  <div className="relative aspect-video bg-petal-cream-2 rounded-md mb-3 overflow-hidden">
                    {renderThumb(script, 'w-full h-full', 'contain')}
                    <FavoriteButton
                      scriptId={script.id}
                      className="absolute top-2 right-2 w-8 h-8 bg-white/85 backdrop-blur-sm border border-petal-rule shadow-sm hover:bg-white"
                    />
                  </div>
                  <h4 className="font-display text-base font-medium tracking-tight text-petal-ink mb-1.5">{script.title}</h4>
                  <p className="font-body text-sm text-petal-ink-soft mb-3 line-clamp-2 leading-relaxed">{script.scenario}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleViewScript(script)}
                      data-testid={`script-featured-view-button-${index}`}
                      className="border border-petal-ink text-petal-ink py-2 rounded-md font-display italic text-sm hover:bg-petal-ink hover:text-petal-cream transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 inline mr-1.5" strokeWidth={1.5} />
                      查看
                    </button>
                    <button
                      onClick={() => handleQuickPlay(script)}
                      data-testid={`script-featured-play-button-${index}`}
                      className="bg-petal-ink text-petal-cream py-2 rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 inline mr-1.5" strokeWidth={1.5} />
                      開始扮演
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {topScripts.map((script, index) =>
                renderScriptListRow({
                  key: script.id ?? index,
                  script,
                  actions: (
                    <>
                      <span className="hidden sm:inline-flex">
                        <FavoriteButton scriptId={script.id} className="w-7 h-7 hover:bg-petal-cream-2" />
                      </span>
                      <button
                        onClick={() => handleViewScript(script)}
                        data-testid={`script-featured-view-button-${index}`}
                        className="border border-petal-ink text-petal-ink px-3 py-1 rounded-full font-body text-xs hover:bg-petal-ink hover:text-petal-cream transition-colors"
                      >
                        <Eye className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                        查看
                      </button>
                      <button
                        onClick={() => handleQuickPlay(script)}
                        data-testid={`script-featured-play-button-${index}`}
                        className="hidden sm:inline-flex bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
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

        {/* Custom Scripts Upload */}
        <div className="mb-10 p-5 bg-petal-cream-2/40 rounded-md border border-petal-rule">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-xl font-medium tracking-tight text-petal-ink flex items-center">
              <FileText className="w-4 h-4 mr-2 text-petal-ink-soft" strokeWidth={1.5} />
              自訂<em className="not-italic font-light italic text-pink-600 mx-1">劇本</em>
              <span className="font-display italic font-light text-sm text-petal-muted ml-2">({customScripts.length})</span>
            </h3>
            <button
              onClick={() => setShowScriptUploadModal(true)}
              data-testid="script-upload-button"
              className="bg-petal-ink text-petal-cream px-4 py-1.5 rounded-full font-body text-xs hover:bg-pink-700 transition-colors flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>上傳劇本</span>
            </button>
          </div>

          {customScripts.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {customScripts.map((script) => (
                  <div key={script.id} data-testid={`script-card-custom-${script.id}`} className="bg-white border border-petal-rule rounded-md p-4 hover:border-petal-rose transition-colors">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-14 h-14 rounded-md flex-shrink-0 overflow-hidden border border-petal-rule">
                        {renderThumb(script, 'w-full h-full')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-display text-base font-medium tracking-tight text-petal-ink truncate">{script.title}</h4>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span data-testid="script-card-custom-badge" className="px-2 py-0.5 font-body text-[10px] uppercase tracking-[0.1em] rounded-full border border-petal-rule text-petal-muted">
                              自訂
                            </span>
                            <FavoriteButton scriptId={script.id} className="w-7 h-7 hover:bg-petal-cream-2" />
                          </div>
                        </div>
                        <p className="font-body text-sm text-petal-ink-soft mt-1 leading-relaxed">{script.scenario}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-1.5 text-xs text-petal-muted flex-wrap">
                        {script.tags?.map((tag, tagIndex) => (
                          <span key={tagIndex} className="font-body bg-petal-cream-2 px-2 py-0.5 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {onEditScript && (
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
                        <button
                          onClick={() => handleViewScript(script)}
                          data-testid={`script-card-custom-view-button-${script.id}`}
                          className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                        >
                          <Eye className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                          查看
                        </button>
                        <button
                          onClick={() => handleQuickPlay(script)}
                          data-testid={`script-card-custom-play-button-${script.id}`}
                          className="bg-petal-rose-deep text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                        >
                          <Play className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                          開始
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {customScripts.map((script) =>
                  renderScriptListRow({
                    key: script.id,
                    testId: `script-card-custom-${script.id}`,
                    script,
                    badge: (
                      <span data-testid="script-card-custom-badge" className="px-2 py-0.5 font-body text-[10px] uppercase tracking-[0.1em] rounded-full border border-petal-rule text-petal-muted flex-shrink-0">
                        自訂
                      </span>
                    ),
                    actions: (
                      <>
                        <span className="hidden sm:inline-flex">
                          <FavoriteButton scriptId={script.id} className="w-7 h-7 hover:bg-petal-cream-2" />
                        </span>
                        {onEditScript && (
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
                        <button
                          onClick={() => handleViewScript(script)}
                          data-testid={`script-card-custom-view-button-${script.id}`}
                          className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                        >
                          <Eye className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                          查看
                        </button>
                        <button
                          onClick={() => handleQuickPlay(script)}
                          data-testid={`script-card-custom-play-button-${script.id}`}
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
            )
          ) : (
            <p className="font-display italic font-light text-sm text-petal-muted text-center py-4">
              還沒有自訂劇本，點擊上方按鈕開始創作。
            </p>
          )}
        </div>

        {/* Favorited from Marketplace */}
        {favoritedMarketplace.length > 0 && (
          <div className="mb-10" data-testid="roleplay-marketplace-favorites-section">
            <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6 flex items-center">
              <Heart className="w-4 h-4 mr-2 text-petal-rose-deep fill-petal-rose-deep" strokeWidth={1.5} />
              收藏<em className="not-italic font-light italic text-pink-600 mx-1">劇本</em>
              <span className="font-display italic font-light text-sm text-petal-muted ml-2">({favoritedMarketplace.length})</span>
            </h3>
            {viewMode === 'grid' ? (
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

        {/* All Scripts */}
        <div>
          <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6 flex items-center">
            <Filter className="w-4 h-4 mr-2 text-petal-ink-soft" strokeWidth={1.5} />
            所有<em className="not-italic font-light italic text-pink-600 mx-1">劇本</em>
            <span className="font-display italic font-light text-sm text-petal-muted ml-2">({filteredScripts.length})</span>
          </h3>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {filteredScripts.map((script, index) => (
                <div key={index} className="bg-white border border-petal-rule rounded-md p-4 sm:p-5 hover:border-petal-rose transition-colors">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-md flex-shrink-0 overflow-hidden border border-petal-rule">
                      {renderThumb(script, 'w-full h-full')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-display text-base font-medium tracking-tight text-petal-ink">{script.title}</h4>
                        <span className="font-body text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-petal-rule text-petal-muted">
                          {CATEGORY_META[script.category]?.label ?? script.category}
                        </span>
                        {script.isCustom && (
                          <span className="font-body text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-petal-rose-soft bg-petal-rose-soft/40 text-petal-rose-deep">
                            自訂
                          </span>
                        )}
                        <FavoriteButton scriptId={script.id} className="ml-auto w-7 h-7 hover:bg-petal-cream-2" />
                      </div>
                      <p className="font-body text-sm text-petal-ink-soft mb-3 leading-relaxed line-clamp-2 sm:line-clamp-none">{script.scenario}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleViewScript(script)}
                          data-testid={`script-list-view-button-${index}`}
                          className="bg-petal-ink text-petal-cream px-4 py-2 sm:py-1.5 rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors min-h-[40px] sm:min-h-0"
                        >
                          <Eye className="w-3.5 h-3.5 inline mr-1" strokeWidth={1.5} />
                          查看劇本
                        </button>
                        <button
                          onClick={() => handleQuickPlay(script)}
                          data-testid={`script-list-play-button-${index}`}
                          className="bg-petal-rose-deep text-petal-cream px-4 py-2 sm:py-1.5 rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors min-h-[40px] sm:min-h-0"
                        >
                          <Play className="w-3.5 h-3.5 inline mr-1" strokeWidth={1.5} />
                          開始扮演
                        </button>
                        {script.isCustom && onEditScript && (
                          <button
                            onClick={() => onEditScript(script)}
                            data-testid={`script-list-edit-button-${script.id}`}
                            className="border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink px-4 py-2 sm:py-1.5 rounded-md font-body text-sm transition-colors min-h-[40px] sm:min-h-0"
                          >
                            <Pencil className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                            編輯
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredScripts.map((script, index) =>
                renderScriptListRow({
                  key: script.id ?? index,
                  script,
                  badge: (
                    <>
                      <span className="font-body text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-petal-rule text-petal-muted flex-shrink-0">
                        {CATEGORY_META[script.category]?.label ?? script.category}
                      </span>
                      {script.isCustom && (
                        <span className="font-body text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-petal-rose-soft bg-petal-rose-soft/40 text-petal-rose-deep flex-shrink-0">
                          自訂
                        </span>
                      )}
                    </>
                  ),
                  actions: (
                    <>
                      <span className="hidden sm:inline-flex">
                        <FavoriteButton scriptId={script.id} className="w-7 h-7 hover:bg-petal-cream-2" />
                      </span>
                      <button
                        onClick={() => handleViewScript(script)}
                        data-testid={`script-list-view-button-${index}`}
                        className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                      >
                        <Eye className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                        查看
                      </button>
                      <button
                        onClick={() => handleQuickPlay(script)}
                        data-testid={`script-list-play-button-${index}`}
                        className="hidden sm:inline-flex bg-petal-rose-deep text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                      >
                        <Play className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                        開始
                      </button>
                      {script.isCustom && onEditScript && (
                        <button
                          onClick={() => onEditScript(script)}
                          data-testid={`script-list-edit-button-${script.id}`}
                          className="hidden sm:inline-flex border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink px-3 py-1 rounded-full font-body text-xs transition-colors"
                        >
                          <Pencil className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                          編輯
                        </button>
                      )}
                    </>
                  ),
                })
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {mainTab === 'marketplace' && (
        <div data-testid="roleplay-marketplace-tab">
          <div className="flex flex-wrap gap-2 mb-6">
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
            viewMode === 'grid' ? (
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

      {marketplaceDetailId && (
        <MarketplaceScriptDetail
          scriptId={marketplaceDetailId}
          onClose={() => setMarketplaceDetailId(null)}
          onPlay={(m) => handleMarketplacePlay(m)}
          onToggleFavorite={async (id) => {
            await onToggleFavorite(id);
            await loadFavoritedMarketplace();
          }}
          showNotification={showNotification}
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
              className={`relative aspect-video w-full bg-petal-cream-2 overflow-hidden border-b border-petal-rule ${selectedScript.image ? 'cursor-zoom-in' : ''}`}
              onClick={() => { if (selectedScript.image) setLightboxOpen(true); }}
              data-testid="roleplay-modal-thumb"
            >
              {renderThumb(selectedScript, 'w-full h-full', 'contain')}
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
                    onEditScript(selectedScript);
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
        {lightboxOpen && selectedScript.image && (
          <div
            data-testid="roleplay-modal-lightbox"
            className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center overflow-auto overscroll-contain p-4 sm:p-8"
            onClick={() => setLightboxOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="放大查看劇本縮圖"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
              data-testid="roleplay-modal-lightbox-close"
              aria-label="關閉放大檢視"
              className="fixed top-4 right-4 w-10 h-10 inline-flex items-center justify-center rounded-full bg-white/90 text-petal-ink hover:bg-white shadow-sm"
            >
              <X className="w-5 h-5" strokeWidth={1.5} />
            </button>
            <img
              src={selectedScript.image}
              alt={selectedScript.title}
              onClick={(e) => e.stopPropagation()}
              className="block max-w-none cursor-default"
              data-testid="roleplay-modal-lightbox-image"
            />
          </div>
        )}
        </>
      )}
    </div>
  );
};

export default RoleplayView;
