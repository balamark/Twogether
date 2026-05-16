import React, { useState, useCallback } from 'react';
import { Heart, Sparkles, FileText, Plus, Filter, Play, Eye, Pencil } from 'lucide-react';
import type { Notification } from './ErrorNotification';

interface RoleplayScript {
  id: string;
  title: string;
  category: 'romantic' | 'adventurous' | 'school' | 'bold';
  scenario: string;
  image?: string;
  script: string;
  isCustom?: boolean;
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
}) => {
  const [selectedScript, setSelectedScript] = useState<RoleplayScript | null>(null);
  const [showScriptModal, setShowScriptModal] = useState(false);
  // Tracks whether the current modal viewing has been "begun" — i.e. user
  // explicitly clicked "開始扮演" and we recorded an intimacy moment. View
  // alone does NOT record; only this transition does.
  const [hasBegun, setHasBegun] = useState(false);

  const handleViewScript = useCallback((script: RoleplayScript) => {
    const parsedScript = parseScriptContent(script.script);
    setSelectedScript({ ...script, script: parsedScript });
    setHasBegun(false);
    setShowScriptModal(true);
  }, [parseScriptContent]);

  const recordRoleplay = useCallback((script: RoleplayScript) => {
    const time = new Date().toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    addIntimateRecord(
      new Date().toISOString().split('T')[0],
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
  }, [addIntimateRecord]);

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
  }, []);

  const allScripts = [...defaultRoleplayScripts, ...customScripts];
  const filteredScripts = roleplayFilter === 'all'
    ? allScripts
    : allScripts.filter(script => script.category === roleplayFilter);

  const featuredScripts = defaultRoleplayScripts.slice(0, 3);

  // Renders either the real thumbnail, or the editorial placeholder if image
  // is missing / fails to load.
  const renderThumb = (script: RoleplayScript, className: string) => {
    if (!script.image) {
      return <ScriptThumbPlaceholder category={script.category} title={script.title} className={className} />;
    }
    return (
      <>
        <img
          src={script.image}
          alt={script.title}
          className={`${className} object-cover`}
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

  return (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 劇本
        </div>
        <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
          角色<em className="not-italic font-light italic text-pink-600">扮演</em>劇本
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          點燃激情，重溫浪漫 — 慢慢來。
        </p>
      </div>

      {/* Category Filter Tabs */}
      <div>
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
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full transition-colors border ${
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

        {/* Featured Scripts */}
        <div className="mb-10">
          <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6 flex items-center">
            <Sparkles className="w-4 h-4 mr-2 text-petal-rose-deep" strokeWidth={1.5} />
            精選<em className="not-italic font-light italic text-pink-600 ml-1">劇本</em>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featuredScripts.map((script, index) => (
              <div key={index} className="bg-white rounded-md p-4 border border-petal-rule hover:border-petal-rose transition-colors">
                <div className="aspect-video bg-petal-cream-2 rounded-md mb-3 overflow-hidden">
                  {renderThumb(script, 'w-full h-full')}
                </div>
                <h4 className="font-display text-base font-medium tracking-tight text-petal-ink mb-1.5">{script.title}</h4>
                <p className="font-body text-sm text-petal-ink-soft mb-3 line-clamp-2 leading-relaxed">{script.scenario}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleViewScript(script)}
                    className="border border-petal-ink text-petal-ink py-2 rounded-md font-display italic text-sm hover:bg-petal-ink hover:text-petal-cream transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 inline mr-1.5" strokeWidth={1.5} />
                    查看
                  </button>
                  <button
                    onClick={() => handleQuickPlay(script)}
                    className="bg-petal-ink text-petal-cream py-2 rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 inline mr-1.5" strokeWidth={1.5} />
                    開始扮演
                  </button>
                </div>
              </div>
            ))}
          </div>
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
              className="bg-petal-ink text-petal-cream px-4 py-1.5 rounded-full font-body text-xs hover:bg-pink-700 transition-colors flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>上傳劇本</span>
            </button>
          </div>

          {customScripts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {customScripts.map((script) => (
                <div key={script.id} className="bg-white border border-petal-rule rounded-md p-4 hover:border-petal-rose transition-colors">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-14 h-14 rounded-md flex-shrink-0 overflow-hidden border border-petal-rule">
                      {renderThumb(script, 'w-full h-full')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-display text-base font-medium tracking-tight text-petal-ink truncate">{script.title}</h4>
                        <span className="px-2 py-0.5 font-body text-[10px] uppercase tracking-[0.1em] rounded-full border border-petal-rule text-petal-muted flex-shrink-0">
                          自訂
                        </span>
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
                          className="border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink px-3 py-1 rounded-full font-body text-xs transition-colors"
                          aria-label={`編輯 ${script.title}`}
                        >
                          <Pencil className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                          編輯
                        </button>
                      )}
                      <button
                        onClick={() => handleViewScript(script)}
                        className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                      >
                        <Eye className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                        查看
                      </button>
                      <button
                        onClick={() => handleQuickPlay(script)}
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
            <p className="font-display italic font-light text-sm text-petal-muted text-center py-4">
              還沒有自訂劇本，點擊上方按鈕開始創作。
            </p>
          )}
        </div>

        {/* All Scripts */}
        <div>
          <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6 flex items-center">
            <Filter className="w-4 h-4 mr-2 text-petal-ink-soft" strokeWidth={1.5} />
            所有<em className="not-italic font-light italic text-pink-600 mx-1">劇本</em>
            <span className="font-display italic font-light text-sm text-petal-muted ml-2">({filteredScripts.length})</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredScripts.map((script, index) => (
              <div key={index} className="bg-white border border-petal-rule rounded-md p-5 hover:border-petal-rose transition-colors">
                <div className="flex items-start space-x-4">
                  <div className="w-28 h-28 rounded-md flex-shrink-0 overflow-hidden border border-petal-rule">
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
                    </div>
                    <p className="font-body text-sm text-petal-ink-soft mb-3 leading-relaxed">{script.scenario}</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewScript(script)}
                        className="bg-petal-ink text-petal-cream px-4 py-1.5 rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 inline mr-1" strokeWidth={1.5} />
                        查看劇本
                      </button>
                      <button
                        onClick={() => handleQuickPlay(script)}
                        className="bg-petal-rose-deep text-petal-cream px-4 py-1.5 rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 inline mr-1" strokeWidth={1.5} />
                        開始扮演
                      </button>
                      {script.isCustom && onEditScript && (
                        <button
                          onClick={() => onEditScript(script)}
                          className="border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink px-4 py-1.5 rounded-md font-body text-sm transition-colors"
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
        </div>
      </div>

      {/* Script Modal — view-only by default; record only on explicit 開始扮演 */}
      {showScriptModal && selectedScript && (
        <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-petal-cream rounded-md shadow-petal max-w-4xl w-full max-h-[90vh] border border-petal-rule flex flex-col">
            <div className="px-8 pt-8 pb-5 border-b border-petal-rule flex justify-between items-end flex-shrink-0">
              <div>
                <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
                  — {selectedScript.isCustom ? '自訂劇本' : '劇本'}
                </div>
                <h3 className="font-display text-2xl font-light tracking-tight text-petal-ink mb-1">
                  {selectedScript.title}
                </h3>
                <p className="font-display italic font-light text-sm text-petal-muted">{selectedScript.scenario}</p>
              </div>
              <button
                onClick={closeModal}
                className="text-petal-muted hover:text-petal-ink text-2xl font-light leading-none transition-colors"
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            <div className="px-8 py-6 overflow-y-auto flex-1">
              <div className="bg-petal-cream-2/40 p-6 rounded-md border border-petal-rule-soft">
                <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-4 flex items-center">
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

            <div className="px-8 py-4 border-t border-petal-rule bg-petal-cream/95 backdrop-blur-sm flex flex-col sm:flex-row justify-end gap-2 flex-shrink-0">
              {selectedScript.isCustom && onEditScript && !hasBegun && (
                <button
                  onClick={() => {
                    onEditScript(selectedScript);
                    closeModal();
                  }}
                  className="px-5 py-2 border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink rounded-md font-body text-sm transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5 inline mr-1.5" strokeWidth={1.5} />
                  編輯這份劇本
                </button>
              )}
              {!hasBegun ? (
                <button
                  onClick={handleBeginRoleplay}
                  className="px-6 py-2 bg-petal-ink text-petal-cream rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
                >
                  <Play className="w-4 h-4 inline mr-1.5" strokeWidth={1.5} />
                  開始扮演 — 記入今晚
                </button>
              ) : (
                <button
                  onClick={closeModal}
                  className="px-6 py-2 bg-petal-ink text-petal-cream rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
                >
                  完成 →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleplayView;
