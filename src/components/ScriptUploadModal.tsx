import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import type { RoleplayScript } from '../App';

type ScriptCategory = 'romantic' | 'adventurous' | 'school' | 'bold';

interface ScriptUploadModalProps {
  /** When set, the form opens in edit mode and pre-fills from this script. */
  editingScript: RoleplayScript | null;
  /** Closes the modal and clears any editing target. */
  onClose: () => void;
  addCustomScript: (
    title: string,
    category: ScriptCategory,
    scenario: string,
    content: string,
    tags?: string[],
    thumbnail?: File,
    isPublic?: boolean,
  ) => void;
  updateCustomScript: (
    id: string,
    updates: {
      title: string;
      category: ScriptCategory;
      scenario: string;
      content: string;
      tags: string[];
      thumbnail?: File;
      isPublic?: boolean;
    },
  ) => void;
}

// Script Upload Modal Component — supports create AND edit. When editingScript
// is set, the form pre-fills from it and submit dispatches updateCustomScript.
//
// Defined at module scope (not inside App) so its identity is stable across App
// re-renders. A nested definition would change identity on every render, causing
// React to unmount + remount it and wipe the in-progress form. See issue #41.
const ScriptUploadModal = ({
  editingScript,
  onClose,
  addCustomScript,
  updateCustomScript,
}: ScriptUploadModalProps) => {
  const isEditMode = editingScript !== null;
  const [scriptData, setScriptData] = useState(() => ({
    title: editingScript?.title ?? '',
    category: (editingScript?.category ?? 'romantic') as ScriptCategory,
    scenario: editingScript?.scenario ?? '',
    content: editingScript?.script ?? '',
    tags: editingScript?.tags ? editingScript.tags.join(', ') : ''
  }));
  // New scripts default to public (the Marketplace product requirement).
  // Editing reflects the existing flag — falling back to true if the script
  // pre-dates the column (legacy rows show as private in the API).
  const [isPublic, setIsPublic] = useState<boolean>(
    isEditMode ? (editingScript?.isPublic ?? false) : true
  );
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  useScrollLock(true);

  useEffect(() => {
    if (!thumbnail) {
      setThumbnailPreview(null);
      return;
    }
    const url = URL.createObjectURL(thumbnail);
    setThumbnailPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnail]);

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > 5 * 1024 * 1024) {
      alert('縮圖大小不能超過 5MB');
      e.target.value = '';
      return;
    }
    setThumbnail(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = scriptData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    if (isEditMode && editingScript) {
      updateCustomScript(editingScript.id, {
        title: scriptData.title,
        category: scriptData.category,
        scenario: scriptData.scenario,
        content: scriptData.content,
        tags,
        thumbnail: thumbnail ?? undefined,
        isPublic,
      });
    } else {
      addCustomScript(
        scriptData.title,
        scriptData.category,
        scriptData.scenario,
        scriptData.content,
        tags,
        thumbnail ?? undefined,
        isPublic,
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-petal-cream rounded-md shadow-petal max-w-2xl w-full max-h-[90vh] overflow-y-auto overscroll-contain border border-petal-rule">
        <div className="p-7">
          <div className="flex justify-between items-end mb-6 pb-5 border-b border-petal-rule">
            <div>
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
                — {isEditMode ? '編輯' : '上傳'}
              </div>
              {isEditMode ? (
                <h3 className="font-display text-2xl font-light tracking-tight text-petal-ink">
                  編輯<em className="not-italic font-light italic text-pink-600">自訂劇本</em>
                </h3>
              ) : (
                <h3 className="font-display text-2xl font-light tracking-tight text-petal-ink">
                  上傳自訂劇本
                </h3>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-petal-muted hover:text-petal-ink transition-colors"
              aria-label="關閉"
            >
              <X className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>

          <div className="mb-5 p-4 bg-petal-cream-2/50 border border-petal-rule-soft rounded-md">
            <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">劇本格式說明</h4>
            <ul className="font-body text-sm text-petal-ink-soft space-y-1 leading-relaxed">
              <li>• 使用 [男] 或 [partner1] 代表第一個伴侶</li>
              <li>• 使用 [女] 或 [partner2] 代表第二個伴侶</li>
              <li>• 每行對話格式：角色名: 對話內容</li>
              <li>• 系統會自動替換為你們的暱稱</li>
            </ul>
          </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="script-title" className="block text-sm font-medium text-gray-700 mb-2">
                劇本標題
              </label>
              <input
                id="script-title"
                name="script-title"
                type="text"
                value={scriptData.title}
                onChange={(e) => setScriptData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
                placeholder="例如：浪漫晚餐"
                required
              />
            </div>

            <div>
              <label htmlFor="script-category" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
                類別
              </label>
              <select
                id="script-category"
                name="script-category"
                value={scriptData.category}
                onChange={(e) => setScriptData(prev => ({ ...prev, category: e.target.value as ScriptCategory }))}
                className="w-full px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
                required
              >
                <option value="romantic">浪漫</option>
                <option value="adventurous">冒險</option>
                <option value="school">校園</option>
                <option value="bold">大膽</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="script-scenario" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
              情境描述
            </label>
            <input
              id="script-scenario"
              name="script-scenario"
              type="text"
              value={scriptData.scenario}
              onChange={(e) => setScriptData(prev => ({ ...prev, scenario: e.target.value }))}
              className="w-full px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
              placeholder="簡短描述這個劇本的情境"
              required
            />
          </div>

          <div>
            <label htmlFor="script-content" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
              劇本內容
            </label>
            <textarea
              id="script-content"
              name="script-content"
              value={scriptData.content}
              onChange={(e) => setScriptData(prev => ({ ...prev, content: e.target.value }))}
              className="w-full px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white leading-relaxed"
              placeholder="[男]: 今晚的月色真美&#10;[女]: 是啊，就像你的眼睛一樣..."
              rows={10}
              required
            />
            <div className={`mt-1 font-body text-[11px] text-right ${scriptData.content.length > 50000 ? 'text-red-500 font-medium' : 'text-petal-muted'}`}>
              {scriptData.content.length.toLocaleString()} / 50,000 字
              {scriptData.content.length > 50000 && ` · 超出 ${(scriptData.content.length - 50000).toLocaleString()} 字`}
            </div>
          </div>

          <div>
            <label htmlFor="script-tags" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
              標籤 (用逗號分隔)
            </label>
            <input
              id="script-tags"
              name="script-tags"
              type="text"
              value={scriptData.tags}
              onChange={(e) => setScriptData(prev => ({ ...prev, tags: e.target.value }))}
              className="w-full px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
              placeholder="浪漫, 晚餐, 月光"
            />
          </div>

          <div>
            <label htmlFor="script-thumbnail" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
              縮圖（選填，最大 5MB）{isEditMode && editingScript?.image ? ' · 上傳新圖以替換' : ''}
            </label>
            <input
              id="script-thumbnail"
              name="script-thumbnail"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleThumbnailChange}
              className="w-full text-sm text-petal-ink-soft file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-body file:text-xs file:bg-petal-cream-2 file:text-petal-ink hover:file:bg-petal-rose-soft hover:file:text-petal-rose-deep"
            />
            {/* Preview: new file beats existing image, else show existing image in edit mode. */}
            {thumbnailPreview ? (
              <img
                src={thumbnailPreview}
                alt="thumbnail preview"
                className="mt-3 w-24 h-24 object-cover rounded-md border border-petal-rule"
              />
            ) : isEditMode && editingScript?.image ? (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={editingScript.image}
                  alt="current thumbnail"
                  className="w-24 h-24 object-cover rounded-md border border-petal-rule"
                />
                <span className="font-display italic font-light text-xs text-petal-muted">
                  目前的縮圖
                </span>
              </div>
            ) : null}
            {!isEditMode && (
              <p className="mt-2 font-display italic font-light text-xs text-petal-muted">
                未上傳縮圖時，會使用編輯式預設圖。
              </p>
            )}
          </div>

          <div className="p-4 bg-petal-cream-2/40 border border-petal-rule-soft rounded-md">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                data-testid="script-public-toggle"
                className="mt-1 w-4 h-4 accent-petal-rose-deep"
              />
              <div className="flex-1">
                <div className="font-body text-sm font-medium text-petal-ink">
                  分享到創作市集
                </div>
                <p className="font-display italic font-light text-xs text-petal-muted mt-0.5 leading-relaxed">
                  開啟後，其他使用者可以在創作市集看到、評分、收藏這個劇本。
                </p>
              </div>
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            {isEditMode && (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink rounded-md font-body text-sm transition-colors"
              >
                取消
              </button>
            )}
            <button
              type="submit"
              data-testid="script-upload-submit-button"
              className="flex-1 bg-petal-ink text-petal-cream py-3 rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
            >
              {isEditMode ? '保存修改 →' : '上傳劇本 (+200 金幣)'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};

export default ScriptUploadModal;
