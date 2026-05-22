import React, { useEffect, useState } from 'react';
import { X, Sparkles, Star } from 'lucide-react';
import type { WallPost, WallPostCategory } from '../services/api';
import { useScrollLock } from '../hooks/useScrollLock';

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
  }) => Promise<void>;
  moodTags: readonly string[];
  examples: WallExample[];
  editingPost?: WallPost | null;
  initialTemplate?: WallExample | null;
}

const MAX_CONTENT = 2000;

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

  useEffect(() => {
    if (!isOpen) return;
    if (editingPost) {
      setContent(editingPost.content);
      setMoodTag(editingPost.mood_tag);
      setCategory(editingPost.category);
      setShowTemplates(false);
    } else if (initialTemplate) {
      setContent(initialTemplate.content);
      setMoodTag(initialTemplate.mood_tag);
      setCategory(initialTemplate.category);
      setShowTemplates(false);
    } else {
      setContent('');
      setMoodTag(null);
      setCategory('general');
      setShowTemplates(true);
    }
    setError(null);
  }, [isOpen, editingPost, initialTemplate]);

  useScrollLock(isOpen);

  if (!isOpen) return null;

  const applyTemplate = (template: WallExample) => {
    setContent(template.content);
    setMoodTag(template.mood_tag);
    setCategory(template.category);
    setShowTemplates(false);
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      setError('內容不能為空');
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
            disabled={submitting || !content.trim()}
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
