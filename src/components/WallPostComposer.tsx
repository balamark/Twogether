import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Star, ImagePlus, Lock, Plus } from 'lucide-react';
import { apiService, type WallPost, type WallPostCategory } from '../services/api';
import { useScrollLock } from '../hooks/useScrollLock';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { isVideoUrl, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES, mediaLimitMb } from '../utils/script';

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
    is_private: boolean;
    // Present in edit mode: URLs of existing media the user chose to keep.
    existingMedia?: string[];
  }) => Promise<void>;
  moodTags: readonly string[];
  examples: WallExample[];
  editingPost?: WallPost | null;
  initialTemplate?: WallExample | null;
  /**
   * localStorage key used to remember that the user already knows about the
   * 「從範本開始」 section. Once set, the section opens collapsed (one line)
   * instead of pushing the writing area down every single time.
   */
  templatesSeenKey?: string;
}

// Whether this user has already met the 「從範本開始」 section. Once they have
// (collapsed it, used a template, or published a post), the section opens
// collapsed to a single line so the writing area stays at the top.
const hasSeenTemplates = (key?: string) => {
  if (typeof window === 'undefined' || !key) return false;
  return !!localStorage.getItem(key);
};

const rememberTemplatesSeen = (key: string | undefined, seen: boolean) => {
  if (typeof window === 'undefined' || !key) return;
  if (seen) localStorage.setItem(key, '1');
  else localStorage.removeItem(key);
};

const MAX_CONTENT = 6000;
// Max photos/videos per post. Kept in sync with WALL_MAX_MEDIA in routes/wall.js.
const WALL_MAX_MEDIA = 4;

const WallPostComposer: React.FC<WallPostComposerProps> = ({
  isOpen,
  onClose,
  onSubmit,
  moodTags,
  examples,
  editingPost = null,
  initialTemplate = null,
  templatesSeenKey,
}) => {
  const [content, setContent] = useState('');
  const [moodTag, setMoodTag] = useState<string | null>(null);
  const [category, setCategory] = useState<WallPostCategory>('general');
  const [showTemplates, setShowTemplates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Media: `existingMedia` are URLs already on the post (edit mode) the user can
  // remove; `newMedia` are freshly picked File objects to upload.
  const [existingMedia, setExistingMedia] = useState<string[]>([]);
  const [newMedia, setNewMedia] = useState<File[]>([]);
  const [newMediaPreviews, setNewMediaPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Privacy: when on, only the author can see this post.
  const [isPrivate, setIsPrivate] = useState(false);
  // Custom mood tags: the couple's previously-used non-preset tags, plus an
  // inline field to type a brand new one.
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const markTemplatesSeen = (seen: boolean) => rememberTemplatesSeen(templatesSeenKey, seen);

  useEffect(() => {
    if (!isOpen) return;
    if (editingPost) {
      setContent(editingPost.content);
      setMoodTag(editingPost.mood_tag);
      setCategory(editingPost.category);
      setExistingMedia(editingPost.media ?? []);
      setIsPrivate(editingPost.is_private ?? false);
      setShowTemplates(false);
    } else if (initialTemplate) {
      setContent(initialTemplate.content);
      setMoodTag(initialTemplate.mood_tag);
      setCategory(initialTemplate.category);
      setExistingMedia([]);
      setIsPrivate(false);
      setShowTemplates(false);
    } else {
      setContent('');
      setMoodTag(null);
      setCategory('general');
      setExistingMedia([]);
      setIsPrivate(false);
      setShowTemplates(!hasSeenTemplates(templatesSeenKey));
    }
    setNewMedia([]);
    setShowCustomInput(false);
    setCustomInput('');
    setError(null);
  }, [isOpen, editingPost, initialTemplate, templatesSeenKey]);

  // Load the couple's remembered custom mood tags when the composer opens.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    apiService.getWallCustomMoodTags().then((tags) => {
      if (!cancelled) setCustomTags(tags);
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  // Object URLs for local previews; revoke on change to avoid leaks.
  useEffect(() => {
    const urls = newMedia.map((f) => URL.createObjectURL(f));
    setNewMediaPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [newMedia]);

  useScrollLock(isOpen);

  // useAsyncAction gives a synchronous ref lock (no double-submit) plus the
  // `submitting` flag the button already relied on. Declared before the early
  // return below so the Hook is called unconditionally on every render.
  const { run: handleSubmit, pending: submitting } = useAsyncAction(async () => {
    const totalMedia = existingMedia.length + newMedia.length;
    if (!content.trim() && totalMedia === 0) {
      setError('請輸入內容，或至少上傳一張照片或影片');
      return;
    }
    if (content.length > MAX_CONTENT) {
      setError(`內容不能超過 ${MAX_CONTENT} 字`);
      return;
    }
    setError(null);
    try {
      await onSubmit({
        content: content.trim(),
        mood_tag: moodTag,
        category,
        media: newMedia,
        is_private: isPrivate,
        // In edit mode always send the kept list so removals are applied.
        ...(editingPost ? { existingMedia } : {}),
      });
      // They've written one — no need to pitch the templates panel again.
      markTemplatesSeen(true);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '發布失敗，請稍後再試');
    }
  });

  if (!isOpen) return null;

  const mediaCount = existingMedia.length + newMedia.length;
  const atMediaCap = mediaCount >= WALL_MAX_MEDIA;

  const presetSet = new Set(moodTags);
  // Custom chips = remembered tags + the current selection if it's a custom one
  // (so an edited post's custom tag always shows as selected), de-duped.
  const customChips = Array.from(
    new Set([
      ...customTags,
      ...(moodTag && !presetSet.has(moodTag) ? [moodTag] : []),
    ])
  );

  const applyTemplate = (template: WallExample) => {
    setContent(template.content);
    setMoodTag(template.mood_tag);
    setCategory(template.category);
    setShowTemplates(false);
    markTemplatesSeen(true);
  };

  // Collapsing means "I know where these are" — remembered, so next time the
  // composer opens straight into writing. Expanding again undoes that.
  const toggleTemplates = () => {
    const next = !showTemplates;
    setShowTemplates(next);
    markTemplatesSeen(!next);
  };

  const applyCustomTag = () => {
    const tag = customInput.trim().slice(0, 32);
    if (!tag) {
      setShowCustomInput(false);
      return;
    }
    setMoodTag(tag);
    if (!presetSet.has(tag) && !customTags.includes(tag)) {
      setCustomTags((prev) => [tag, ...prev]);
    }
    setCustomInput('');
    setShowCustomInput(false);
  };

  const handleAddMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-picking the same file
    if (picked.length === 0) return;
    // Per-type size caps: videos may be larger than images (stored raw).
    const oversizeVideo = picked.find((f) => f.type.startsWith('video/') && f.size > VIDEO_MAX_BYTES);
    if (oversizeVideo) {
      setError(`影片大小不能超過 ${mediaLimitMb(VIDEO_MAX_BYTES)}MB，請壓縮或改用較短的片段後再試。`);
      return;
    }
    const oversizeImage = picked.find((f) => !f.type.startsWith('video/') && f.size > IMAGE_MAX_BYTES);
    if (oversizeImage) {
      setError(`每張照片大小不能超過 ${mediaLimitMb(IMAGE_MAX_BYTES)}MB，請壓縮後再試。`);
      return;
    }
    const room = WALL_MAX_MEDIA - mediaCount;
    if (room <= 0) {
      setError(`每則貼文最多 ${WALL_MAX_MEDIA} 個，先移除一個才能再加。`);
      return;
    }
    setError(null);
    // Taking only what fits used to happen silently — the extra files just
    // vanished with no explanation. Say which ones didn't make it.
    if (picked.length > room) {
      const dropped = picked.slice(room).map((f) => f.name).join('、');
      setError(`每則貼文最多 ${WALL_MAX_MEDIA} 個，這次只加入了前 ${room} 個。未加入：${dropped}`);
    }
    setNewMedia((prev) => [...prev, ...picked.slice(0, room)]);
  };

  const removeExistingMedia = (idx: number) =>
    setExistingMedia((prev) => prev.filter((_, i) => i !== idx));
  const removeNewMedia = (idx: number) =>
    setNewMedia((prev) => prev.filter((_, i) => i !== idx));

  return (
    // The backdrop must NOT be the scroll container. A `position: fixed`
    // element that scrolls its own content is the shape iOS Safari gets wrong:
    // while `useScrollLock` pins the body with `position: fixed`, WebKit paints
    // fixed content against the layout viewport but hit-tests it against the
    // visual viewport, so taps land offset from the finger. Scrolling an
    // ordinary inner panel instead (the pattern every other modal here uses —
    // see CalendarView.tsx / EventDetail.tsx) removes that failure mode.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-petal-ink/40 backdrop-blur-sm px-4 py-8"
      // Only a tap on the backdrop itself closes; taps inside the panel bubble
      // up here too, and losing a half-written post to a stray tap is the worst
      // outcome in this modal.
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="wall-composer-backdrop"
    >
      <div
        className="bg-petal-cream w-full max-w-2xl rounded-2xl shadow-xl border border-petal-rule max-h-[min(90vh,calc(100dvh-80px))] overflow-y-auto overscroll-contain safe-pb"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-petal-rule">
          <h2 className="font-display text-2xl font-light tracking-tight text-petal-ink">
            {editingPost ? '編輯貼文' : '新貼文'}
          </h2>
          <button
            onClick={onClose}
            className="p-2.5 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md hover:bg-petal-cream-2 transition-colors"
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
                onClick={toggleTemplates}
                aria-expanded={showTemplates}
                data-testid="wall-composer-templates-toggle"
                className={`flex items-center text-petal-ink-soft hover:text-petal-ink font-body text-[11px] uppercase tracking-[0.18em] ${
                  showTemplates ? 'mb-3' : ''
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 mr-2 text-petal-rose-deep" strokeWidth={1.5} />
                {showTemplates ? '從範本開始' : '沒靈感？看看範本'} ({examples.length})
                <span className="ml-2 text-[10px]">{showTemplates ? '▾' : '▸'}</span>
              </button>
              {showTemplates && (
                <>
                {/* Capped + scrollable: even fully expanded, the templates
                    never push 「想說的話」 off the screen. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
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
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={toggleTemplates}
                    data-testid="wall-composer-templates-dismiss"
                    className="font-body text-[11px] text-petal-muted hover:text-petal-ink underline underline-offset-2"
                  >
                    我自己寫就好，下次別自動展開
                  </button>
                </div>
                </>
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
            <div className="mt-1 flex items-center justify-between font-body text-[11px] text-petal-muted">
              <span>支援 Markdown（**粗體**、# 標題、- 清單、[連結]）</span>
              <span>{content.length} / {MAX_CONTENT}</span>
            </div>
          </div>

          <div>
            <label className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2 block">
              照片／影片（可選，最多 {WALL_MAX_MEDIA} 個）
            </label>
            {/* A real button driving the input via ref, not a <label> wrapping
                a `display: none` input. The nested-label form re-dispatches the
                click onto the hidden input, and WebKit can drop the user
                activation on that second dispatch — which makes the file picker
                silently never open. CalendarView.tsx uses this same pattern. */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={atMediaCap}
              data-testid="wall-composer-media-button"
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-md border border-petal-rule font-body text-sm text-petal-ink-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:border-petal-rose-deep enabled:hover:text-petal-ink"
            >
              <ImagePlus className="w-4 h-4" strokeWidth={1.5} />
              新增照片／影片
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              multiple
              onChange={handleAddMedia}
              disabled={atMediaCap}
              className="hidden"
              data-testid="wall-composer-media-input"
            />
            <p className="mt-1 font-body text-[11px] text-petal-muted">
              {atMediaCap && `已達 ${WALL_MAX_MEDIA} 個上限，先移除一個才能再加。`}
              {atMediaCap && <br />}
              {`照片每張最大 ${mediaLimitMb(IMAGE_MAX_BYTES)}MB、影片最大 ${mediaLimitMb(VIDEO_MAX_BYTES)}MB`}
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
                      className="absolute top-1 right-1 w-8 h-8 inline-flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <X className="w-4 h-4" strokeWidth={2} />
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
                        className="absolute top-1 right-1 w-8 h-8 inline-flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X className="w-4 h-4" strokeWidth={2} />
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
              {[...moodTags, ...customChips].map((tag) => {
                const active = moodTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setMoodTag(active ? null : tag)}
                    className={`px-3.5 py-2 min-h-[40px] rounded-full border font-body text-[13px] transition-colors ${
                      active
                        ? 'bg-petal-ink text-petal-cream border-petal-ink'
                        : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}

              {showCustomInput ? (
                <input
                  autoFocus
                  type="text"
                  value={customInput}
                  maxLength={32}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onBlur={applyCustomTag}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyCustomTag();
                    } else if (e.key === 'Escape') {
                      setShowCustomInput(false);
                      setCustomInput('');
                    }
                  }}
                  placeholder="自訂心情…"
                  data-testid="wall-composer-custom-mood-input"
                  className="px-3.5 py-2 min-h-[40px] rounded-full border border-petal-ink bg-white font-body text-[13px] text-petal-ink placeholder:text-petal-muted focus:outline-none w-32"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCustomInput(true)}
                  data-testid="wall-composer-custom-mood-add"
                  className="inline-flex items-center gap-1 px-3.5 py-2 min-h-[40px] rounded-full border border-dashed border-petal-rule font-body text-[13px] text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors"
                >
                  <Plus className="w-3 h-3" strokeWidth={2} />
                  自訂
                </button>
              )}
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

          <div>
            <button
              type="button"
              onClick={() => setIsPrivate((v) => !v)}
              data-testid="wall-composer-private-toggle"
              className={`w-full flex items-center justify-between p-3 rounded-md border text-left transition-colors ${
                isPrivate
                  ? 'bg-petal-cream-2 border-petal-ink'
                  : 'bg-white border-petal-rule hover:border-petal-ink'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 mt-0.5 text-petal-ink-soft" strokeWidth={1.5} />
                <div>
                  <div className="font-display text-sm font-medium text-petal-ink">只有我看得到（私密）</div>
                  <div className="font-body text-[11px] text-petal-muted mt-0.5">
                    {isPrivate ? '對方看不到這則貼文，也不會收到通知。' : '關閉時，貼文會分享給對方。'}
                  </div>
                </div>
              </div>
              <span
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  isPrivate ? 'bg-petal-ink' : 'bg-petal-rule'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    isPrivate ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
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
