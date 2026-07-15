import React, { useEffect, useState } from 'react';
import { X, Sparkles, Star, ImagePlus } from 'lucide-react';
import type { WallPost, WallPostCategory } from '../services/api';
import { useScrollLock } from '../hooks/useScrollLock';
import { isVideoUrl, VIDEO_MAX_BYTES } from '../utils/script';

export interface WallExample {
  id: string;
  title: string;
  content: string;
  mood_tag: string;
  category: WallPostCategory;
}

interface WallPostComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: {
    content: string;
    mood_tag: string | null;
    category: WallPostCategory;
    media: File[];
    // Present in edit mode: URLs of existing media the user chose to keep.
    existingMedia?: string[];
  }) => Promise<void>;
  moodTags: readonly string[];
  examples: WallExample[];
  editingPost?: WallPost | null;
  initialTemplate?: WallExample | null;
}

const MAX_CONTENT = 2000;
// Max photos/videos per post. Kept in sync with WALL_MAX_MEDIA in routes/wall.js.
const WALL_MAX_MEDIA = 4;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const WallPostComposer: React.FC<WallPostComposerProps> = ({
  isOpen,
  onClose,
  onSubmit,
  moodTags,
  examples,
  editingPost = null,
  initialTemplate = null,
}) => {
  const [content, setContent] = useState('');
  const [moodTag, setMoodTag] = useState<string | null>(null);
  const [category, setCategory] = useState<WallPostCategory>('general');
  const [showTemplates, setShowTemplates] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Media: `existingMedia` are URLs already on the post (edit mode) the user can
  // remove; `newMedia` are freshly picked File objects to upload.
  const [existingMedia, setExistingMedia] = useState<string[]>([]);
  const [newMedia, setNewMedia] = useState<File[]>([]);
  const [newMediaPreviews, setNewMediaPreviews] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingPost) {
      setContent(editingPost.content);
      setMoodTag(editingPost.mood_tag);
      setCategory(editingPost.category);
      setExistingMedia(editingPost.media ?? []);
      setShowTemplates(false);
    } else if (initialTemplate) {
      setContent(initialTemplate.content);
      setMoodTag(initialTemplate.mood_tag);
      setCategory(initialTemplate.category);
      setExistingMedia([]);
      setShowTemplates(false);
    } else {
      setContent('');
      setMoodTag(null);
      setCategory('general');
      setExistingMedia([]);
      setShowTemplates(true);
    }
    setNewMedia([]);
    setError(null);
  }, [isOpen, editingPost, initialTemplate]);

  // Object URLs for local previews; revoke on change to avoid leaks.
  useEffect(() => {
    const urls = newMedia.map((f) => URL.createObjectURL(f));
    setNewMediaPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [newMedia]);

  useScrollLock(isOpen);

  if (!isOpen) return null;

  const mediaCount = existingMedia.length + newMedia.length;

  const applyTemplate = (template: WallExample) => {
    setContent(template.content);
    setMoodTag(template.mood_tag);
    setCategory(template.category);
    setShowTemplates(false);
  };

  const handleAddMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-picking the same file
    if (picked.length === 0) return;
    // Per-type size caps: videos may be larger than images (stored raw).
    const oversizeVideo = picked.find((f) => f.type.startsWith('video/') && f.size > VIDEO_MAX_BYTES);
    if (oversizeVideo) {
      setError(`影片大小不能超過 ${Math.round(VIDEO_MAX_BYTES / (1024 * 1024))}MB，請壓縮或改用較短的片段後再試。`);
      return;
    }
    const oversizeImage = picked.find((f) => !f.type.startsWith('video/') && f.size > IMAGE_MAX_BYTES);
    if (oversizeImage) {
      setError(`每張照片大小不能超過 ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))}MB，請壓縮後再試。`);
      return;
    }
    const room = WALL_MAX_MEDIA - mediaCount;
    if (room <= 0) {
      setError(`每則貼文最多只能上傳 ${WALL_MAX_MEDIA} 張照片或影片`);
      return;
    }
    setError(null);
    setNewMedia((prev) => [...prev, ...picked.slice(0, room)]);
  };

  const removeExistingMedia = (idx: number) =>
    setExistingMedia((prev) => prev.filter((_, i) => i !== idx));
  const removeNewMedia = (idx: number) =>
    setNewMedia((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!content.trim() && mediaCount === 0) {
      setError('請輸入內容，或至少上傳一張照片或影片');
      return;
    }
    if (content.length > MAX_CONTENT) {
      setError(`內容不能超過 ${MAX_CONTENT} 字`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        content: content.trim(),
        mood_tag: moodTag,
        category,
        media: newMedia,
        // In edit mode always send the kept list so removals are applied.
        ...(editingPost ? { existingMedia } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '發布失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-petal-ink/40 backdrop-blur-sm px-4 py-8 overflow-y-auto"
      onClick={onClose}
      data-testid="wall-composer-backdrop"
    >
      <div
        className="bg-petal-cream w-full max-w-2xl rounded-2xl shadow-xl border border-petal-rule my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-petal-rule">
          <h2 className="font-display text-2xl font-light tracking-tight text-petal-ink">
            {editingPost ? '編輯貼文' : '新貼文'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-petal-cream-2 transition-colors"
            aria-label="關閉"
          >
            <X className="w-5 h-5 text-petal-ink-soft" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!editingPost && examples.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowTemplates((v) => !v)}
                className="flex items-center text-petal-ink-soft hover:text-petal-ink font-body text-[11px] uppercase tracking-[0.18em] mb-3"
              >
                <Sparkles className="w-3.5 h-3.5 mr-2 text-petal-rose-deep" strokeWidth={1.5} />
                從範本開始 ({examples.length})
                <span className="ml-2 text-[10px]">{showTemplates ? '▾' : '▸'}</span>
              </button>
              {showTemplates && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {examples.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="text-left bg-white border border-petal-rule rounded-md p-3 hover:border-petal-rose transition-colors"
                      data-testid={`wall-template-${tpl.id}`}
                    >
                      <div className="font-display text-sm font-medium text-petal-ink mb-1">
                        {tpl.title}
                      </div>
                      <div className="font-body text-xs text-petal-ink-soft line-clamp-3 leading-relaxed">
                        {tpl.content}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="font-body text-[10px] uppercase tracking-[0.1em] text-petal-muted">
                          {tpl.mood_tag}
                        </span>
                        {tpl.category === 'important' && (
                          <span className="font-body text-[10px] uppercase tracking-[0.1em] text-petal-rose-deep">
                            重要
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2 block">
              想說的話
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={MAX_CONTENT}
              rows={8}
              placeholder="把想說的、想念的、需要的，留在這裡⋯"
              className="w-full bg-white border border-petal-rule rounded-md px-4 py-3 font-body text-sm text-petal-ink placeholder:text-petal-muted leading-relaxed focus:outline-none focus:border-petal-rose-deep resize-y"
              data-testid="wall-composer-content"
            />
            <div className="mt-1 text-right font-body text-[11px] text-petal-muted">
              {content.length} / {MAX_CONTENT}
            </div>
          </div>

          <div>
            <label className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2 block">
              照片／影片（可選，最多 {WALL_MAX_MEDIA} 個）
            </label>
            <label
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border border-petal-rule font-body text-xs text-petal-ink-soft transition-colors ${
                mediaCount >= WALL_MAX_MEDIA
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer hover:border-petal-rose-deep hover:text-petal-ink'
              }`}
            >
              <ImagePlus className="w-4 h-4" strokeWidth={1.5} />
              新增照片／影片
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                multiple
                onChange={handleAddMedia}
                disabled={mediaCount >= WALL_MAX_MEDIA}
                className="hidden"
                data-testid="wall-composer-media-input"
              />
            </label>
            <p className="mt-1 font-body text-[11px] text-petal-muted">
              照片每張最大 {Math.round(IMAGE_MAX_BYTES / (1024 * 1024))}MB、影片最大 {Math.round(VIDEO_MAX_BYTES / (1024 * 1024))}MB
            </p>

            {mediaCount > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2" data-testid="wall-composer-media-grid">
                {existingMedia.map((url, idx) => (
                  <div
                    key={`ex-${url}-${idx}`}
                    className="relative aspect-square rounded-md overflow-hidden border border-petal-rule bg-petal-cream-2"
                  >
                    {isVideoUrl(url) ? (
                      <video src={url} className="w-full h-full object-contain" muted loop playsInline autoPlay />
                    ) : (
                      <img src={url} alt={`附件 ${idx + 1}`} className="w-full h-full object-contain" />
                    )}
                    {isVideoUrl(url) && (
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-body">影片</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeExistingMedia(idx)}
                      aria-label="移除"
                      className="absolute top-1 right-1 w-5 h-5 inline-flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <X className="w-3 h-3" strokeWidth={2} />
                    </button>
                  </div>
                ))}
                {newMediaPreviews.map((url, idx) => {
                  const isVideo = newMedia[idx]?.type.startsWith('video/');
                  return (
                    <div
                      key={`new-${idx}`}
                      className="relative aspect-square rounded-md overflow-hidden border border-petal-rule bg-petal-cream-2"
                    >
                      {isVideo ? (
                        <video src={url} className="w-full h-full object-contain" muted loop playsInline autoPlay />
                      ) : (
                        <img src={url} alt={`新附件 ${idx + 1}`} className="w-full h-full object-contain" />
                      )}
                      {isVideo && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-body">影片</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeNewMedia(idx)}
                        aria-label="移除"
                        className="absolute top-1 right-1 w-5 h-5 inline-flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X className="w-3 h-3" strokeWidth={2} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2 block">
              心情標籤（可選）
            </label>
            <div className="flex flex-wrap gap-1.5">
              {moodTags.map((tag) => {
                const active = moodTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setMoodTag(active ? null : tag)}
                    className={`px-3 py-1 rounded-full border font-body text-[12px] transition-colors ${
                      active
                        ? 'bg-petal-ink text-petal-cream border-petal-ink'
                        : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2 block">
              類別
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCategory('general')}
                className={`p-3 rounded-md border text-left transition-colors ${
                  category === 'general'
                    ? 'bg-petal-cream-2 border-petal-ink'
                    : 'bg-white border-petal-rule hover:border-petal-ink'
                }`}
              >
                <div className="font-display text-sm font-medium text-petal-ink">一般</div>
                <div className="font-body text-[11px] text-petal-muted mt-0.5">
                  日常筆記、想念、心情
                </div>
              </button>
              <button
                type="button"
                onClick={() => setCategory('important')}
                className={`p-3 rounded-md border text-left transition-colors ${
                  category === 'important'
                    ? 'bg-petal-rose-soft/40 border-petal-rose-deep'
                    : 'bg-white border-petal-rule hover:border-petal-rose-deep'
                }`}
              >
                <div className="font-display text-sm font-medium text-petal-ink flex items-center">
                  <Star className="w-3.5 h-3.5 mr-1 text-petal-rose-deep" strokeWidth={1.5} />
                  重要
                </div>
                <div className="font-body text-[11px] text-petal-muted mt-0.5">
                  會 pin 在最上面，提醒彼此
                </div>
              </button>
            </div>
          </div>

          {error && (
            <div className="text-petal-rose-deep font-body text-sm">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-petal-rule">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-md font-display italic text-sm text-petal-ink-soft hover:text-petal-ink transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || (!content.trim() && mediaCount === 0)}
            className="bg-petal-ink text-petal-cream px-5 py-2 rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="wall-composer-submit"
          >
            {submitting ? '送出中…' : editingPost ? '儲存' : '發布'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WallPostComposer;
