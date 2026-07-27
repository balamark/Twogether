import { useState, useEffect, useMemo } from 'react';
import { X, Trash2, FileDown } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { Button } from './ui/Button';
import { detectScriptSpeakers, applySpeakerAssignments, isVideoUrl, VIDEO_MAX_BYTES } from '../utils/script';
import { apiService } from '../services/api';
import type { RoleplayScript } from '../App';

type ScriptCategory = 'romantic' | 'adventurous' | 'school' | 'bold';

// A create-mode draft preserved when the free-tier script cap blocks an upload,
// so the form can be restored after the user goes premium.
export interface PendingScriptDraft {
  title: string;
  category: ScriptCategory;
  scenario: string;
  location: string;
  content: string;
  tags: string;
  isPublic: boolean;
  photos: File[];
}

// Suggested 場景地點 values (free text still allowed via the datalist input).
const COMMON_LOCATIONS = [
  '家裡', '臥室', '飯店', '教室', '辦公室', '公園', '車上', '海邊', '餐廳', '電影院',
];

// Per-script photo cap — mirrors MAX_SCRIPT_PHOTOS in routes/custom-scripts.js.
export const MAX_SCRIPT_PHOTOS = 30;

interface ScriptUploadModalProps {
  /** When set, the form opens in edit mode and pre-fills from this script. */
  editingScript: RoleplayScript | null;
  /** In create mode, restores a draft preserved from a cap-blocked upload. */
  pendingScriptDraft: PendingScriptDraft | null;
  /** Closes the modal, clears any editing target, and discards any draft. */
  onClose: () => void;
  addCustomScript: (
    title: string,
    category: ScriptCategory,
    scenario: string,
    content: string,
    tags?: string[],
    photos?: File[],
    isPublic?: boolean,
    location?: string,
  ) => void;
  updateCustomScript: (
    id: string,
    updates: {
      title: string;
      category: ScriptCategory;
      scenario: string;
      location?: string;
      content: string;
      tags: string[];
      photos?: File[];
      existingPhotos?: string[];
      isPublic?: boolean;
    },
  ) => void;
  /** Deletes the script being edited (edit mode only). */
  onDeleteScript: (id: string) => void;
  /**
   * Free user tapped a Premium-only affordance (AI 角色辨識): preserve the
   * in-progress draft and send them to the Upgrade view with a reason.
   */
  onRequireUpgrade?: (draft: PendingScriptDraft, reason: string) => void;
}

// Script Upload Modal Component — supports create AND edit. When editingScript
// is set, the form pre-fills from it and submit dispatches updateCustomScript.
//
// Defined at module scope (not inside App) so its identity is stable across App
// re-renders. A nested definition would change identity on every render, causing
// React to unmount + remount it and wipe the in-progress form. See issue #41.
const ScriptUploadModal = ({
  editingScript,
  pendingScriptDraft,
  onClose,
  addCustomScript,
  updateCustomScript,
  onDeleteScript,
  onRequireUpgrade,
}: ScriptUploadModalProps) => {
  const isEditMode = editingScript !== null;
  // Two-step delete confirm (no blocking window.confirm): first click arms it.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // In create mode, restore a draft preserved from a previous cap-blocked
  // upload (pendingScriptDraft) so the user resumes exactly where they left
  // off after going premium. Edit mode always wins from editingScript.
  const draft = isEditMode ? null : pendingScriptDraft;
  const [scriptData, setScriptData] = useState(() => ({
    title: editingScript?.title ?? draft?.title ?? '',
    category: (editingScript?.category ?? draft?.category ?? 'romantic') as ScriptCategory,
    scenario: editingScript?.scenario ?? draft?.scenario ?? '',
    location: editingScript?.location ?? draft?.location ?? '',
    content: editingScript?.script ?? draft?.content ?? '',
    tags: editingScript?.tags ? editingScript.tags.join(', ') : (draft?.tags ?? '')
  }));
  // New scripts default to public (the Marketplace product requirement).
  // Editing reflects the existing flag — falling back to true if the script
  // pre-dates the column (legacy rows show as private in the API).
  const [isPublic, setIsPublic] = useState<boolean>(
    isEditMode ? (editingScript?.isPublic ?? false) : (draft?.isPublic ?? true)
  );
  // Photo series: URLs already saved (edit mode) the user can keep/remove, plus
  // newly-picked File objects. Combined they form the ordered series (cover
  // first), capped at MAX_SCRIPT_PHOTOS.
  const [existingPhotos, setExistingPhotos] = useState<string[]>(
    isEditMode
      ? (editingScript?.photos && editingScript.photos.length > 0
          ? editingScript.photos
          : editingScript?.image
          ? [editingScript.image]
          : [])
      : [],
  );
  const [newPhotos, setNewPhotos] = useState<File[]>(draft?.photos ?? []);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState<string[]>([]);
  const photoCount = existingPhotos.length + newPhotos.length;
  // Speaker names detected in the pasted content (e.g.「小明：對白」). The
  // user can map each one to 男/女 — mapped names become [男]/[女] tokens on
  // submit so display-time parsing swaps in the couple's nicknames by gender.
  const detectedSpeakers = useMemo(
    () => detectScriptSpeakers(scriptData.content),
    [scriptData.content]
  );
  const [speakerAssignments, setSpeakerAssignments] = useState<Record<string, 'male' | 'female' | 'keep'>>({});
  // Google Docs import: paste a share link → server fetches the public doc's
  // plain text and fills the content field. Status is shown inline.
  const [gdocUrl, setGdocUrl] = useState('');
  const [gdocStatus, setGdocStatus] = useState<
    { state: 'idle' } | { state: 'loading' } | { state: 'error' | 'success'; message: string }
  >({ state: 'idle' });
  useScrollLock(true);

  // AI role detection (Premium): asks the backend to infer each detected
  // speaker's gender and pre-fills the assignment buttons. Free users get an
  // inline upgrade prompt (state 'premium') instead of a generic error.
  const [aiStatus, setAiStatus] = useState<
    | { state: 'idle' }
    | { state: 'loading' }
    | { state: 'error' | 'success' | 'premium'; message: string }
  >({ state: 'idle' });

  const currentDraft = (): PendingScriptDraft => ({
    title: scriptData.title,
    category: scriptData.category,
    scenario: scriptData.scenario,
    location: scriptData.location,
    content: scriptData.content,
    tags: scriptData.tags,
    isPublic,
    photos: newPhotos,
  });

  const handleAiParseRoles = async () => {
    if (!scriptData.content.trim() || aiStatus.state === 'loading') return;
    setAiStatus({ state: 'loading' });
    try {
      const roles = await apiService.aiParseScriptRoles(scriptData.content);
      const next: Record<string, 'male' | 'female'> = {};
      for (const role of roles) {
        if ((role.gender === 'male' || role.gender === 'female') && detectedSpeakers.includes(role.name)) {
          next[role.name] = role.gender;
        }
      }
      const applied = Object.keys(next).length;
      if (applied === 0) {
        setAiStatus({ state: 'error', message: 'AI 無法從內容判斷角色性別，請直接點選下方的男／女按鈕手動指定。' });
        return;
      }
      setSpeakerAssignments((prev) => ({ ...prev, ...next }));
      setAiStatus({ state: 'success', message: `AI 已辨識 ${applied} 個角色的性別，請確認下方的角色對應（可再調整）。` });
    } catch (error) {
      const err = error as Error & { error_code?: string };
      if (err.error_code === 'AI_ROLE_PARSE_PREMIUM_ONLY') {
        setAiStatus({ state: 'premium', message: err.message });
      } else {
        setAiStatus({ state: 'error', message: err.message || 'AI 角色辨識暫時無法使用，請稍後再試。' });
      }
    }
  };

  const handleGdocImport = async () => {
    if (!gdocUrl.trim() || gdocStatus.state === 'loading') return;
    setGdocStatus({ state: 'loading' });
    try {
      const { content, suggestedTitle } = await apiService.importGoogleDoc(gdocUrl.trim());
      setScriptData((prev) => ({
        ...prev,
        content,
        // Only fill the title from the doc when the user hasn't typed one.
        title: prev.title.trim() ? prev.title : (suggestedTitle ?? ''),
      }));
      setGdocStatus({ state: 'success', message: '已匯入文件內容，請確認下方劇本內容與角色對應。' });
    } catch (error) {
      setGdocStatus({
        state: 'error',
        message: (error as Error)?.message || '無法匯入 Google 文件，請稍後再試',
      });
    }
  };

  useEffect(() => {
    const urls = newPhotos.map((f) => URL.createObjectURL(f));
    setNewPhotoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [newPhotos]);

  const handleAddPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-picking the same file
    if (picked.length === 0) return;
    // Per-type size caps: videos may be larger than images (stored raw).
    const oversizeVideo = picked.find((f) => f.type.startsWith('video/') && f.size > VIDEO_MAX_BYTES);
    if (oversizeVideo) {
      alert(`影片大小不能超過 ${Math.round(VIDEO_MAX_BYTES / (1024 * 1024))}MB，請壓縮或改用較短的片段後再試。`);
      return;
    }
    const oversizeImage = picked.find((f) => !f.type.startsWith('video/') && f.size > 5 * 1024 * 1024);
    if (oversizeImage) {
      alert('每張照片大小不能超過 5MB');
      return;
    }
    const room = MAX_SCRIPT_PHOTOS - photoCount;
    if (room <= 0) {
      alert(`每個劇本最多只能上傳 ${MAX_SCRIPT_PHOTOS} 張照片`);
      return;
    }
    if (picked.length > room) {
      alert(`最多再加 ${room} 張（每個劇本上限 ${MAX_SCRIPT_PHOTOS} 張），已自動取前 ${room} 張`);
    }
    setNewPhotos((prev) => [...prev, ...picked.slice(0, room)]);
  };

  const removeExistingPhoto = (idx: number) =>
    setExistingPhotos((prev) => prev.filter((_, i) => i !== idx));
  const removeNewPhoto = (idx: number) =>
    setNewPhotos((prev) => prev.filter((_, i) => i !== idx));

  // Has the user entered/changed anything worth protecting? For new scripts
  // any non-empty field (or a chosen thumbnail / opted-out sharing) counts;
  // for edits we compare against the script being edited.
  const isDirty = () => {
    if (newPhotos.length > 0) return true;
    if (isEditMode && editingScript) {
      const originalPhotos =
        editingScript.photos && editingScript.photos.length > 0
          ? editingScript.photos
          : editingScript.image
          ? [editingScript.image]
          : [];
      return (
        scriptData.title !== (editingScript.title ?? '') ||
        scriptData.category !== (editingScript.category ?? 'romantic') ||
        scriptData.scenario !== (editingScript.scenario ?? '') ||
        scriptData.location !== (editingScript.location ?? '') ||
        scriptData.content !== (editingScript.script ?? '') ||
        scriptData.tags !== (editingScript.tags ? editingScript.tags.join(', ') : '') ||
        existingPhotos.length !== originalPhotos.length ||
        isPublic !== (editingScript.isPublic ?? false)
      );
    }
    return (
      scriptData.title.trim() !== '' ||
      scriptData.scenario.trim() !== '' ||
      scriptData.location.trim() !== '' ||
      scriptData.content.trim() !== '' ||
      scriptData.tags.trim() !== '' ||
      scriptData.category !== 'romantic' ||
      isPublic !== true
    );
  };

  // Guard accidental dismissal (✕ or 取消) — losing a half-written script with
  // no warning is the worst-case UX here. Confirmed dismissal discards any
  // cap-preserved draft too (handled App-side via onClose).
  const closeAndReset = () => {
    if (isDirty() && !window.confirm('你有尚未儲存的變更，確定要關閉嗎？變更將不會保存。')) {
      return;
    }
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tags = scriptData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    // Rewrite gender-assigned speaker names to [男]/[女] tokens; names left
    // as「保留原名」(or unassigned) are stored verbatim.
    const genderAssignments: Record<string, 'male' | 'female'> = {};
    for (const speaker of detectedSpeakers) {
      const assigned = speakerAssignments[speaker];
      if (assigned === 'male' || assigned === 'female') genderAssignments[speaker] = assigned;
    }
    const content = applySpeakerAssignments(scriptData.content, genderAssignments);
    if (isEditMode && editingScript) {
      await updateCustomScript(editingScript.id, {
        title: scriptData.title,
        category: scriptData.category,
        scenario: scriptData.scenario,
        location: scriptData.location.trim(),
        content,
        tags,
        photos: newPhotos.length > 0 ? newPhotos : undefined,
        // Always send the kept set so removals take effect server-side.
        existingPhotos,
        isPublic,
      });
    } else {
      await addCustomScript(
        scriptData.title,
        scriptData.category,
        scriptData.scenario,
        content,
        tags,
        newPhotos.length > 0 ? newPhotos : undefined,
        isPublic,
        scriptData.location.trim() || undefined,
      );
    }
  };

  // The submit button had no in-flight lock — a double-click created duplicate
  // scripts (and duplicate +200 coin grants on create).
  const { run: submitScript, pending: submittingScript } = useAsyncAction(handleSubmit);

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
              onClick={closeAndReset}
              className="text-petal-muted hover:text-petal-ink transition-colors"
              aria-label="關閉"
            >
              <X className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>

          <div className="mb-5 p-4 bg-petal-cream-2/50 border border-petal-rule-soft rounded-md">
            <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">劇本格式說明</h4>
            <ul className="font-body text-sm text-petal-ink-soft space-y-1 leading-relaxed">
              <li>• 使用 [男]／[女]（或 [他]／[她]）代表男女角色，會依你們在「設定」中的性別自動帶入暱稱</li>
              <li>• 使用 [partner1] 代表自己、[partner2] 代表另一半</li>
              <li>• 每行對話格式：角色名: 對話內容</li>
              <li>• 貼上含角色名的劇本時，可在下方將每個角色指定為男／女</li>
            </ul>
          </div>

        <form onSubmit={submitScript} className="space-y-4">
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
            <label htmlFor="script-location" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
              場景地點（選填）
            </label>
            <input
              id="script-location"
              name="script-location"
              type="text"
              list="script-location-options"
              maxLength={50}
              value={scriptData.location}
              onChange={(e) => setScriptData(prev => ({ ...prev, location: e.target.value }))}
              data-testid="script-location-input"
              className="w-full px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
              placeholder="例如：教室、辦公室、飯店…（可自由輸入）"
            />
            <datalist id="script-location-options">
              {COMMON_LOCATIONS.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="script-gdoc-url" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
              從 Google 文件匯入（選填）
            </label>
            <div className="flex gap-2">
              <input
                id="script-gdoc-url"
                name="script-gdoc-url"
                type="url"
                value={gdocUrl}
                onChange={(e) => {
                  setGdocUrl(e.target.value);
                  if (gdocStatus.state !== 'idle') setGdocStatus({ state: 'idle' });
                }}
                data-testid="script-gdoc-url-input"
                className="flex-1 px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
                placeholder="貼上 docs.google.com/document/d/… 分享連結"
              />
              <button
                type="button"
                onClick={handleGdocImport}
                disabled={!gdocUrl.trim() || gdocStatus.state === 'loading'}
                data-testid="script-gdoc-import-button"
                className="px-4 py-2.5 border border-petal-rule rounded-md font-body text-sm text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
              >
                <FileDown className="w-4 h-4" strokeWidth={1.5} />
                {gdocStatus.state === 'loading' ? '匯入中…' : '匯入'}
              </button>
            </div>
            {gdocStatus.state === 'error' && (
              <p className="mt-1.5 font-body text-xs text-red-600" data-testid="script-gdoc-error">
                {gdocStatus.message}
              </p>
            )}
            {gdocStatus.state === 'success' && (
              <p className="mt-1.5 font-body text-xs text-petal-sage-deep" data-testid="script-gdoc-success">
                {gdocStatus.message}
              </p>
            )}
            <p className="mt-1.5 font-display italic font-light text-xs text-petal-muted">
              文件需開啟「知道連結的任何人皆可檢視」權限。
            </p>
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

          {detectedSpeakers.length > 0 && (
            <div className="p-4 bg-petal-cream-2/40 border border-petal-rule-soft rounded-md" data-testid="speaker-assignment-panel">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted">
                  角色對應
                </h4>
                <button
                  type="button"
                  onClick={handleAiParseRoles}
                  disabled={aiStatus.state === 'loading'}
                  data-testid="ai-parse-roles-button"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-petal-rose-deep/50 text-petal-rose-deep hover:bg-petal-rose-soft font-body text-xs transition-colors disabled:opacity-50"
                >
                  ✨ {aiStatus.state === 'loading' ? 'AI 辨識中…' : 'AI 智慧辨識'}
                  <span className="px-1.5 py-0.5 rounded-full bg-petal-rose-deep text-petal-cream text-[9px] font-medium uppercase tracking-wide">
                    Premium
                  </span>
                </button>
              </div>
              <p className="font-display italic font-light text-xs text-petal-muted mb-3 leading-relaxed">
                偵測到以下角色。指定男／女後，劇本會依你們的性別自動帶入暱稱；「保留原名」則照原文顯示。
              </p>
              {aiStatus.state === 'success' && (
                <p className="mb-3 font-body text-xs text-petal-sage-deep" data-testid="ai-parse-roles-success">
                  {aiStatus.message}
                </p>
              )}
              {aiStatus.state === 'error' && (
                <p className="mb-3 font-body text-xs text-red-600" data-testid="ai-parse-roles-error">
                  {aiStatus.message}
                </p>
              )}
              {aiStatus.state === 'premium' && (
                <div
                  className="mb-3 p-3 rounded-md border border-petal-rose-deep/40 bg-petal-rose-soft/40"
                  data-testid="ai-parse-roles-premium-prompt"
                >
                  <p className="font-body text-xs text-petal-ink leading-relaxed mb-2">{aiStatus.message}</p>
                  {onRequireUpgrade && (
                    <button
                      type="button"
                      data-testid="ai-parse-roles-upgrade-button"
                      onClick={() => onRequireUpgrade(currentDraft(), aiStatus.message)}
                      className="px-3.5 py-1.5 rounded-md bg-petal-ink text-petal-cream font-body text-xs hover:bg-pink-700 transition-colors"
                    >
                      升級 Premium →（草稿會保留）
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {detectedSpeakers.map((speaker, idx) => {
                  const current = speakerAssignments[speaker] ?? 'keep';
                  const options = [
                    { value: 'male' as const, label: '男' },
                    { value: 'female' as const, label: '女' },
                    { value: 'keep' as const, label: '保留原名' },
                  ];
                  return (
                    <div key={speaker} className="flex items-center justify-between gap-3" data-testid={`speaker-row-${idx}`}>
                      <span className="font-body text-sm text-petal-ink truncate" title={speaker}>{speaker}</span>
                      <div className="flex gap-1 flex-shrink-0">
                        {options.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            data-testid={`speaker-${idx}-${opt.value}`}
                            onClick={() => setSpeakerAssignments((prev) => ({ ...prev, [speaker]: opt.value }))}
                            className={`px-3 py-1.5 rounded-md font-body text-xs border transition-colors ${
                              current === opt.value
                                ? 'bg-petal-ink text-petal-cream border-petal-ink'
                                : 'bg-white text-petal-ink-soft border-petal-rule hover:border-petal-ink'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
              劇本封面照片／影片（選填，最多 {MAX_SCRIPT_PHOTOS} 個，照片每張最大 5MB、影片最大 {Math.round(VIDEO_MAX_BYTES / (1024 * 1024))}MB）
              <span className="ml-1 normal-case tracking-normal text-petal-muted/80">· 第一個為封面，可用短影片</span>
            </label>
            <input
              id="script-thumbnail"
              name="photos"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              multiple
              onChange={handleAddPhotos}
              disabled={photoCount >= MAX_SCRIPT_PHOTOS}
              data-testid="script-photos-input"
              className="w-full text-sm text-petal-ink-soft file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-body file:text-xs file:bg-petal-cream-2 file:text-petal-ink hover:file:bg-petal-rose-soft hover:file:text-petal-rose-deep disabled:opacity-50"
            />

            {(existingPhotos.length > 0 || newPhotos.length > 0) && (
              <div className="mt-3 grid grid-cols-4 sm:grid-cols-5 gap-2" data-testid="script-photos-grid">
                {existingPhotos.map((url, idx) => {
                  const isCover = idx === 0;
                  const isVideo = isVideoUrl(url);
                  return (
                    <div key={`ex-${url}-${idx}`} className="relative aspect-square rounded-md overflow-hidden border border-petal-rule bg-petal-cream-2">
                      {isVideo ? (
                        <video src={url} className="w-full h-full object-cover" muted loop playsInline autoPlay />
                      ) : (
                        <img src={url} alt={`photo ${idx + 1}`} className="w-full h-full object-cover" />
                      )}
                      {isVideo && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-body">影片</span>
                      )}
                      {isCover && (
                        <span className="absolute bottom-0 inset-x-0 bg-petal-ink/70 text-petal-cream text-[10px] text-center py-0.5">封面</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeExistingPhoto(idx)}
                        aria-label="移除照片"
                        className="absolute top-1 right-1 w-5 h-5 inline-flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X className="w-3 h-3" strokeWidth={2} />
                      </button>
                    </div>
                  );
                })}
                {newPhotoPreviews.map((url, idx) => {
                  const isCover = existingPhotos.length === 0 && idx === 0;
                  const isVideo = newPhotos[idx]?.type.startsWith('video/');
                  return (
                    <div key={`new-${idx}`} className="relative aspect-square rounded-md overflow-hidden border border-petal-rule bg-petal-cream-2">
                      {isVideo ? (
                        <video src={url} className="w-full h-full object-cover" muted loop playsInline autoPlay />
                      ) : (
                        <img src={url} alt={existingPhotos.length === 0 && idx === 0 ? 'thumbnail preview' : `new photo ${idx + 1}`} className="w-full h-full object-cover" />
                      )}
                      {isVideo && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-body">影片</span>
                      )}
                      {isCover && (
                        <span className="absolute bottom-0 inset-x-0 bg-petal-ink/70 text-petal-cream text-[10px] text-center py-0.5">封面</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeNewPhoto(idx)}
                        aria-label="移除照片"
                        className="absolute top-1 right-1 w-5 h-5 inline-flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X className="w-3 h-3" strokeWidth={2} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-2 font-display italic font-light text-xs text-petal-muted">
              {photoCount > 0
                ? `已選 ${photoCount} / ${MAX_SCRIPT_PHOTOS} 個 · 影片封面會靜音循環播放，點開可看全部照片與影片`
                : '未上傳時，會使用編輯式預設圖。第一個放影片，封面就會動起來。'}
            </p>
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
                onClick={closeAndReset}
                className="px-5 py-3 border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink rounded-md font-body text-sm transition-colors"
              >
                取消
              </button>
            )}
            <Button
              type="submit"
              loading={submittingScript}
              loadingText={isEditMode ? '保存中…' : '上傳中…'}
              data-testid="script-upload-submit-button"
              className="flex-1 py-3 text-base"
            >
              {isEditMode ? '保存修改 →' : '上傳劇本 (+200 金幣)'}
            </Button>
          </div>
          {isEditMode && editingScript && (
            <div className="pt-3 mt-2 border-t border-petal-rule">
              {confirmingDelete ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-sm text-red-700">確定要刪除這個劇本嗎？此動作無法復原。</span>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="px-4 py-2 border border-petal-rule text-petal-ink-soft rounded-md font-body text-sm hover:border-petal-ink transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      data-testid="script-delete-confirm-button"
                      onClick={() => onDeleteScript(editingScript.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded-md font-body text-sm hover:bg-red-700 transition-colors"
                    >
                      確認刪除
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="script-delete-button"
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-1.5 text-red-600 hover:text-red-700 font-body text-sm transition-colors"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  刪除這個劇本
                </button>
              )}
            </div>
          )}
        </form>
        </div>
      </div>
    </div>
  );
};

export default ScriptUploadModal;
