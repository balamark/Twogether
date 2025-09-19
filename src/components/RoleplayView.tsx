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

  const featuredScripts = defaultRoleplayScripts.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-red-500 to-pink-600 text-white p-6 rounded-2xl">
        <h2 className="text-2xl font-bold mb-2">角色扮演劇本</h2>
        <p className="text-red-100">點燃激情，重溫浪漫</p>
      </div>

      {/* Category Filter Tabs */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { id: 'all', label: '全部', icon: '🌟' },
            { id: 'romantic', label: '浪漫', icon: '💕' },
            { id: 'adventurous', label: '冒險', icon: '🔥' },
            { id: 'school', label: '校園', icon: '🏫' },
            { id: 'bold', label: '大膽', icon: '🧨' }
          ].map(category => (
            <button
              key={category.id}
              onClick={() => setRoleplayFilter(category.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all ${
                roleplayFilter === category.id
                  ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-pink-50 hover:text-pink-600'
              }`}
            >
              <span>{category.icon}</span>
              <span className="font-medium">{category.label}</span>
            </button>
          ))}
        </div>

        {/* Featured Scripts */}
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-pink-500" />
            精選劇本
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featuredScripts.map((script, index) => (
              <div key={index} className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-lg p-4 border-2 border-pink-200">
                <div className="aspect-video bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                  <img 
                    src={script.image} 
                    alt={script.title}
                    className="w-full h-full object-cover rounded-lg"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex';
                    }}
                  />
                  <div className="hidden items-center justify-center text-gray-400">
                    <Camera className="w-8 h-8" />
                  </div>
                </div>
                <h4 className="font-bold text-gray-800 mb-2">{script.title}</h4>
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{script.scenario}</p>
                <button
                  onClick={() => handlePlayScript(script)}
                  className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white py-2 rounded-lg font-medium hover:shadow-lg transition-all"
                >
                  <Play className="w-4 h-4 inline mr-2" />
                  開始扮演
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Scripts Upload */}
        <div className="mb-8 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-blue-500" />
              自訂劇本 ({customScripts.length})
            </h3>
            <button
              onClick={() => setShowScriptUploadModal(true)}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>上傳劇本</span>
            </button>
          </div>
          
          {customScripts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customScripts.map((script) => (
                <div key={script.id} className="bg-white border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-bold text-gray-800">{script.title}</h4>
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-600">
                      自訂
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{script.scenario}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      {script.tags?.map((tag, tagIndex) => (
                        <span key={tagIndex} className="bg-gray-100 px-2 py-1 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => handlePlayScript(script)}
                      className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-3 py-1 rounded text-sm font-medium hover:shadow-lg transition-all"
                    >
                      <Play className="w-3 h-3 inline mr-1" />
                      使用
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">
              還沒有自訂劇本，點擊上方按鈕開始創作！
            </p>
          )}
        </div>

        {/* All Scripts */}
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <Filter className="w-5 h-5 mr-2 text-purple-500" />
            所有劇本 ({filteredScripts.length + customScripts.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredScripts.map((script, index) => (
              <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-all">
                <div className="flex items-start space-x-4">
                  <div className="w-20 h-20 bg-gray-200 rounded-lg flex-shrink-0 flex items-center justify-center">
                    <img 
                      src={script.image} 
                      alt={script.title}
                      className="w-full h-full object-cover rounded-lg"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex';
                      }}
                    />
                    <div className="hidden items-center justify-center text-gray-400">
                      <Camera className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h4 className="font-bold text-gray-800">{script.title}</h4>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        script.category === 'romantic' 
                          ? 'bg-pink-100 text-pink-600' 
                          : 'bg-purple-100 text-purple-600'
                      }`}>
                        {script.category === 'romantic' ? '浪漫' : '冒險'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{script.scenario}</p>
                    <button
                      onClick={() => handlePlayScript(script)}
                      className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:shadow-lg transition-all"
                    >
                      <Play className="w-4 h-4 inline mr-1" />
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-800">{selectedScript.title}</h3>
                  <p className="text-gray-600">{selectedScript.scenario}</p>
                </div>
                <button
                  onClick={() => setShowScriptModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="bg-gradient-to-r from-pink-50 to-purple-50 p-6 rounded-lg">
                <h4 className="font-semibold text-gray-800 mb-4 flex items-center">
                  <Play className="w-5 h-5 mr-2 text-pink-500" />
                  劇本對話：
                </h4>
                <div className="whitespace-pre-line text-gray-700 leading-relaxed text-lg">
                  {selectedScript.script || '劇本內容載入中...'}
                </div>
              </div>

              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 flex items-center">
                  <Heart className="w-4 h-4 mr-2" />
                  已自動記錄一次親密時光到你們的愛情日曆中！
                </p>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setShowScriptModal(false)}
                  className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg hover:shadow-lg"
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