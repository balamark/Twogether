import React, { useState, useCallback } from 'react';
import { Heart, Sparkles, FileText, Plus, Filter, Play, Camera } from 'lucide-react';

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
}

const RoleplayView: React.FC<RoleplayViewProps> = ({
  defaultRoleplayScripts,
  customScripts,
  roleplayFilter,
  setRoleplayFilter,
  setShowScriptUploadModal,
  parseScriptContent,
  addIntimateRecord
}) => {
  const [selectedScript, setSelectedScript] = useState<RoleplayScript | null>(null);
  const [showScriptModal, setShowScriptModal] = useState(false);

  const handlePlayScript = useCallback((script: RoleplayScript) => {
    // Parse the script content with proper nickname replacement
    const parsedScript = parseScriptContent(script.script);
    
    setSelectedScript({...script, script: parsedScript});
    setShowScriptModal(true);
    
    // Automatically add intimacy record when script is played
    const time = new Date().toLocaleTimeString('zh-TW', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
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
  }, [parseScriptContent, addIntimateRecord]);

  const allScripts = [...defaultRoleplayScripts, ...customScripts];
  const filteredScripts = roleplayFilter === 'all'
    ? allScripts
    : allScripts.filter(script => script.category === roleplayFilter);

  // Debug logging to help identify filtering issues
  console.log('Filter Debug:', {
    roleplayFilter,
    allScriptsCount: allScripts.length,
    filteredScriptsCount: filteredScripts.length,
    scriptCategories: allScripts.map(s => s.category),
    filteredCategories: filteredScripts.map(s => s.category)
  });

  const featuredScripts = defaultRoleplayScripts.slice(0, 3);

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
                <div className="aspect-video bg-petal-cream-2 rounded-md mb-3 flex items-center justify-center overflow-hidden">
                  <img
                    src={script.image}
                    alt={script.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex';
                    }}
                  />
                  <div className="hidden items-center justify-center text-petal-muted">
                    <Camera className="w-7 h-7" strokeWidth={1.5} />
                  </div>
                </div>
                <h4 className="font-display text-base font-medium tracking-tight text-petal-ink mb-1.5">{script.title}</h4>
                <p className="font-body text-sm text-petal-ink-soft mb-3 line-clamp-2 leading-relaxed">{script.scenario}</p>
                <button
                  onClick={() => handlePlayScript(script)}
                  className="w-full bg-petal-ink text-petal-cream py-2 rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors"
                >
                  <Play className="w-3.5 h-3.5 inline mr-1.5" strokeWidth={1.5} />
                  開始扮演
                </button>
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
                    {script.image && (
                      <img
                        src={script.image}
                        alt={script.title}
                        className="w-14 h-14 object-cover rounded-md flex-shrink-0 border border-petal-rule"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
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
                    <button
                      onClick={() => handlePlayScript(script)}
                      className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                    >
                      <Play className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
                      使用
                    </button>
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
                  <div className="w-28 h-28 bg-petal-cream-2 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center">
                    <img
                      src={script.image}
                      alt={script.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex';
                      }}
                    />
                    <div className="hidden items-center justify-center text-petal-muted">
                      <Camera className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-display text-base font-medium tracking-tight text-petal-ink">{script.title}</h4>
                      <span className="font-body text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-petal-rule text-petal-muted">
                        {script.category === 'romantic' ? '浪漫' : '冒險'}
                      </span>
                    </div>
                    <p className="font-body text-sm text-petal-ink-soft mb-3 leading-relaxed">{script.scenario}</p>
                    <button
                      onClick={() => handlePlayScript(script)}
                      className="bg-petal-ink text-petal-cream px-4 py-1.5 rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 inline mr-1" strokeWidth={1.5} />
                      開始扮演
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Script Modal */}
      {showScriptModal && selectedScript && (
        <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-petal-cream rounded-md shadow-petal max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-petal-rule">
            <div className="p-8">
              <div className="flex justify-between items-end mb-7 pb-5 border-b border-petal-rule">
                <div>
                  <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
                    — 劇本
                  </div>
                  <h3 className="font-display text-2xl font-light tracking-tight text-petal-ink mb-1">
                    {selectedScript.title}
                  </h3>
                  <p className="font-display italic font-light text-sm text-petal-muted">{selectedScript.scenario}</p>
                </div>
                <button
                  onClick={() => setShowScriptModal(false)}
                  className="text-petal-muted hover:text-petal-ink text-2xl font-light leading-none transition-colors"
                >
                  ×
                </button>
              </div>

              <div className="bg-petal-cream-2/40 p-6 rounded-md border border-petal-rule-soft">
                <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-4 flex items-center">
                  <Play className="w-3.5 h-3.5 mr-1.5 text-petal-rose-deep" strokeWidth={1.5} />
                  劇本對話
                </h4>
                <div className="whitespace-pre-line font-body text-petal-ink leading-relaxed text-base">
                  {selectedScript.script || '劇本內容載入中…'}
                </div>
              </div>

              <div className="mt-5 p-4 bg-petal-sage/10 border border-petal-sage/40 rounded-md">
                <p className="font-body text-sm text-petal-sage-deep flex items-center">
                  <Heart className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />
                  已自動記錄一次親密時光到你們的愛情日曆中。
                </p>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setShowScriptModal(false)}
                  className="px-6 py-2 bg-petal-ink text-petal-cream rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
                >
                  關閉
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleplayView; 