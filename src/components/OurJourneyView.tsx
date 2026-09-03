import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Sparkles, Plus, X, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import type { AuthState, IntimateRecord, JourneyMilestone, Notification } from '../App';

interface OurJourneyViewProps {
  journeyMilestones: JourneyMilestone[];
  intimateRecords: IntimateRecord[];
  setCurrentView: React.Dispatch<React.SetStateAction<string>>;
  authState: AuthState;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
}

// 我們的故事 — the couple's shared memory bank, not just a list of dates.
//
// The base timeline (相遇/初吻/…) comes from App state and is edited in 設定; on
// top of that this view adds a *story* layer the couple owns directly:
//   • add their own milestones (孩子出生, 第一次旅行, 那次差點分開…)
//   • put a photo on any milestone
//   •「當時，我喜歡你的一個地方」 and「現在回頭看，我才發現…」
// so a milestone becomes a memory with feeling attached, not a bare marker.
//
// There is no journey backend, so the story layer is persisted per-user in
// localStorage (photos downscaled first to stay under the quota). It's a
// device-local keepsake — the same trade-off as 重新認識你.

interface StoryExtras {
  photo?: string; // downscaled JPEG data URL
  likedThen?: string; // 當時，我喜歡你的一個地方
  realizeNow?: string; // 現在回頭看，我才發現…
}

interface StoryMilestone extends StoryExtras {
  id: string;
  emoji: string;
  title: string;
  date: string;
  place?: string;
  description: string;
}

interface JourneyStore {
  added: StoryMilestone[];
  // Extras layered onto *base* milestones (keyed by their id).
  enrich: Record<string, StoryExtras>;
}

// Emoji + a suggested title for the add/edit form. 「其他」 keeps the marker
// generic so anything the presets don't cover still has a home.
const MILESTONE_PRESETS: { emoji: string; label: string }[] = [
  { emoji: '💕', label: '相遇' },
  { emoji: '🌹', label: '開始交往' },
  { emoji: '💋', label: '初吻' },
  { emoji: '💍', label: '求婚' },
  { emoji: '👰', label: '結婚' },
  { emoji: '🏠', label: '搬到一起' },
  { emoji: '👶', label: '孩子出生' },
  { emoji: '✈️', label: '第一次旅行' },
  { emoji: '🎂', label: '週年紀念' },
  { emoji: '🐾', label: '養了寵物' },
  { emoji: '🌧️', label: '一起走過的低潮' },
  { emoji: '✦', label: '其他' },
];

const baseEmoji = (type: JourneyMilestone['type']): string =>
  type === 'meeting' ? '💕' :
  type === 'first_date' ? '🌹' :
  type === 'first_kiss' ? '💋' :
  type === 'first_sex' ? '💋' :
  type === 'marriage' ? '👫' :
  type === 'child_born' ? '👶' :
  '✦';

const storageKey = (userId?: string) => `tw:journey:${userId || 'anon'}`;

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const todayISO = () => new Date().toISOString().slice(0, 10);

// Downscale an image to a small JPEG data URL so a handful fit inside the
// ~5MB localStorage budget (there is no journey media backend). Rejects if the
// browser can't decode the file, so the caller can tell the user.
const fileToDownscaledDataUrl = (file: File, maxDim = 1000, quality = 0.78): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no-canvas')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode-failed')); };
    img.src = url;
  });

// ── Add / edit form (modal) ──────────────────────────────────────────────────
interface EditorState {
  mode: 'add' | 'edit' | 'enrich';
  // The working draft. For 'enrich' (a base milestone) only the extras are
  // editable; core fields are shown read-only.
  draft: StoryMilestone;
  readOnlyCore?: boolean;
}

const MilestoneEditor: React.FC<{
  state: EditorState;
  onClose: () => void;
  onSave: (m: StoryMilestone) => void;
  onDelete?: () => void;
  onPhotoError: () => void;
}> = ({ state, onClose, onSave, onDelete, onPhotoError }) => {
  const [draft, setDraft] = useState<StoryMilestone>(state.draft);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useScrollLock(true);

  const set = (patch: Partial<StoryMilestone>) => setDraft((d) => ({ ...d, ...patch }));

  const pickPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      set({ photo: dataUrl });
    } catch {
      onPhotoError();
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const canSave = draft.title.trim().length > 0 && !!draft.date;
  const ro = state.readOnlyCore;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-petal-cream w-full sm:max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-petal flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="milestone-editor"
      >
        <div className="flex items-center justify-between gap-3 p-4 border-b border-petal-rule">
          <h3 className="font-display text-lg text-petal-ink">
            {state.mode === 'add' ? '新增一段回憶' : state.mode === 'enrich' ? '加上照片與回憶' : '編輯這段回憶'}
          </h3>
          <button onClick={onClose} className="p-1.5 text-petal-muted hover:text-petal-ink rounded-full hover:bg-petal-cream-2" aria-label="關閉">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {!ro && (
            <>
              <div>
                <label className="block font-body text-[12px] text-petal-muted mb-1.5">這是什麼時刻？</label>
                <div className="flex flex-wrap gap-1.5">
                  {MILESTONE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => set({ emoji: p.emoji, title: draft.title.trim() ? draft.title : p.label })}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-body text-[13px] transition-colors ${
                        draft.emoji === p.emoji ? 'bg-petal-ink text-petal-cream border-petal-ink' : 'border-petal-rule text-petal-ink-soft hover:border-petal-ink'
                      }`}
                    >
                      <span aria-hidden>{p.emoji}</span> {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-body text-[12px] text-petal-muted mb-1.5">標題</label>
                <input
                  value={draft.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="例如：山出生的那天"
                  data-testid="milestone-title"
                  className="w-full rounded-xl border border-petal-rule bg-white px-3 py-2 font-body text-sm text-petal-ink focus:border-petal-rose-deep focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-body text-[12px] text-petal-muted mb-1.5">日期</label>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(e) => set({ date: e.target.value })}
                    data-testid="milestone-date"
                    className="w-full rounded-xl border border-petal-rule bg-white px-3 py-2 font-body text-sm text-petal-ink focus:border-petal-rose-deep focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-body text-[12px] text-petal-muted mb-1.5">地點（可留白）</label>
                  <input
                    value={draft.place ?? ''}
                    onChange={(e) => set({ place: e.target.value })}
                    placeholder="例如：台北"
                    className="w-full rounded-xl border border-petal-rule bg-white px-3 py-2 font-body text-sm text-petal-ink focus:border-petal-rose-deep focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-body text-[12px] text-petal-muted mb-1.5">當時發生了什麼？</label>
                <textarea
                  value={draft.description}
                  onChange={(e) => set({ description: e.target.value })}
                  rows={2}
                  placeholder="用一兩句話記下那一天。"
                  className="w-full rounded-xl border border-petal-rule bg-white px-3 py-2 font-body text-sm text-petal-ink focus:border-petal-rose-deep focus:outline-none resize-none"
                />
              </div>
            </>
          )}

          {ro && (
            <div className="rounded-xl bg-petal-cream-2/50 border border-petal-rule px-3 py-2.5">
              <div className="font-display text-sm text-petal-ink">{draft.emoji} {draft.title}</div>
              {draft.date && <div className="font-body text-[12px] text-petal-muted mt-0.5">{draft.date.slice(0, 10)}</div>}
            </div>
          )}

          {/* Photo */}
          <div>
            <label className="block font-body text-[12px] text-petal-muted mb-1.5">一張照片（可留白）</label>
            {draft.photo ? (
              <div className="relative">
                {/* Full image, never cropped (project image rule): contained in a
                    neutral slot so any aspect ratio is letterboxed, not cut. */}
                <div className="aspect-video w-full rounded-xl bg-petal-cream-2 overflow-hidden flex items-center justify-center">
                  <img src={draft.photo} alt="" className="w-full h-full object-contain" />
                </div>
                <button
                  type="button"
                  onClick={() => set({ photo: undefined })}
                  className="absolute top-2 right-2 rounded-full bg-black/50 text-white p-1.5 hover:bg-black/70"
                  aria-label="移除照片"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                data-testid="milestone-photo-pick"
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-petal-rose-soft bg-white px-3 py-4 font-body text-sm text-petal-muted hover:border-petal-rose-deep transition-colors disabled:opacity-50"
              >
                <ImagePlus className="w-4 h-4" strokeWidth={1.5} /> {photoBusy ? '處理中…' : '加一張照片'}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickPhoto(e.target.files?.[0])}
            />
          </div>

          {/* Reflections */}
          <div>
            <label className="flex items-center gap-1.5 font-body text-[12px] text-petal-rose-deep mb-1.5">
              <Heart className="w-3.5 h-3.5" strokeWidth={1.5} /> 當時，我喜歡你的一個地方
            </label>
            <textarea
              value={draft.likedThen ?? ''}
              onChange={(e) => set({ likedThen: e.target.value })}
              rows={2}
              data-testid="milestone-liked-then"
              placeholder="那時候的你，最讓我心動的是…"
              className="w-full rounded-xl border border-petal-rule bg-white px-3 py-2 font-body text-sm text-petal-ink focus:border-petal-rose-deep focus:outline-none resize-none"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 font-body text-[12px] text-petal-sage-deeper mb-1.5">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} /> 現在回頭看，我才發現…
            </label>
            <textarea
              value={draft.realizeNow ?? ''}
              onChange={(e) => set({ realizeNow: e.target.value })}
              rows={2}
              data-testid="milestone-realize-now"
              placeholder="經過這些年，我對那一天有了不一樣的看法…"
              className="w-full rounded-xl border border-petal-rule bg-white px-3 py-2 font-body text-sm text-petal-ink focus:border-petal-rose-deep focus:outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 border-t border-petal-rule">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 font-body text-sm text-petal-muted hover:text-red-600 transition-colors"
              data-testid="milestone-delete"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.5} /> 刪除
            </button>
          )}
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!canSave}
            data-testid="milestone-save"
            className="ml-auto rounded-full bg-petal-rose-deep px-6 py-2.5 font-body text-sm font-medium text-white hover:bg-petal-rose transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Card ─────────────────────────────────────────────────────────────────────
interface RenderMilestone extends StoryExtras {
  id: string;
  emoji: string;
  title: string;
  date: string;
  place?: string;
  description: string;
  count?: number;
  recordId?: number;
  source: 'base' | 'added';
}

const OurJourneyView = ({ journeyMilestones, intimateRecords, setCurrentView, authState, showNotification }: OurJourneyViewProps) => {
  const userId = authState.user?.id;
  const [store, setStore] = useState<JourneyStore>({ added: [], enrich: {} });
  const [editor, setEditor] = useState<EditorState | null>(null);

  // Load the device-local story layer once per user.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as JourneyStore;
        setStore({ added: parsed.added ?? [], enrich: parsed.enrich ?? {} });
      } else {
        setStore({ added: [], enrich: {} });
      }
    } catch {
      setStore({ added: [], enrich: {} });
    }
  }, [userId]);

  const persist = (next: JourneyStore): boolean => {
    setStore(next);
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
      return true;
    } catch {
      // Almost always the ~5MB quota, blown by a photo. Tell the user exactly
      // what happened and what to do — don't fail silently.
      showNotification({
        type: 'warning',
        title: '照片太多，存不下了',
        message: '這台裝置的相片空間快滿了。可以先移除一張舊照片，或這則先不放照片再儲存。',
      });
      return false;
    }
  };

  // Merge the read-only base timeline with the couple's own added milestones,
  // each carrying its extras (photo / reflections).
  const milestones: RenderMilestone[] = useMemo(() => {
    const base: RenderMilestone[] = journeyMilestones
      .filter((m) => m.date || m.place)
      .map((m) => ({
        id: m.id,
        emoji: baseEmoji(m.type),
        title: m.title,
        date: m.date,
        place: m.place,
        description: m.description,
        count: m.count,
        recordId: m.recordId,
        source: 'base' as const,
        ...(store.enrich[m.id] ?? {}),
      }));
    const added: RenderMilestone[] = store.added.map((m) => ({
      ...m,
      source: 'added' as const,
    }));
    return [...base, ...added].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return da - db;
    });
  }, [journeyMilestones, store]);

  const openAdd = () =>
    setEditor({
      mode: 'add',
      draft: { id: uid(), emoji: '✦', title: '', date: todayISO(), place: '', description: '' },
    });

  const openEditFor = (m: RenderMilestone) => {
    if (m.source === 'added') {
      const found = store.added.find((a) => a.id === m.id);
      if (found) setEditor({ mode: 'edit', draft: { ...found } });
    } else {
      // Base milestone: core fields are owned by 設定, so only its extras
      // (photo / reflections) are editable here.
      setEditor({
        mode: 'enrich',
        readOnlyCore: true,
        draft: {
          id: m.id,
          emoji: m.emoji,
          title: m.title,
          date: m.date,
          place: m.place,
          description: m.description,
          ...(store.enrich[m.id] ?? {}),
        },
      });
    }
  };

  const saveFromEditor = (m: StoryMilestone) => {
    if (!editor) return;
    const extras: StoryExtras = {
      ...(m.photo ? { photo: m.photo } : {}),
      ...(m.likedThen?.trim() ? { likedThen: m.likedThen.trim() } : {}),
      ...(m.realizeNow?.trim() ? { realizeNow: m.realizeNow.trim() } : {}),
    };
    let next: JourneyStore;
    if (editor.mode === 'enrich') {
      next = { ...store, enrich: { ...store.enrich, [m.id]: extras } };
    } else {
      const clean: StoryMilestone = {
        id: m.id,
        emoji: m.emoji,
        title: m.title.trim(),
        date: m.date,
        place: m.place?.trim() || undefined,
        description: m.description.trim(),
        ...extras,
      };
      const exists = store.added.some((a) => a.id === m.id);
      const added = exists ? store.added.map((a) => (a.id === m.id ? clean : a)) : [...store.added, clean];
      next = { ...store, added };
    }
    if (persist(next)) setEditor(null);
  };

  const deleteFromEditor = () => {
    if (!editor) return;
    const id = editor.draft.id;
    const next: JourneyStore = {
      added: store.added.filter((a) => a.id !== id),
      enrich: Object.fromEntries(Object.entries(store.enrich).filter(([k]) => k !== id)),
    };
    persist(next);
    setEditor(null);
  };

  const handleRecordClick = (m: RenderMilestone) => {
    if (m.recordId) setCurrentView('calendar');
  };

  return (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
              — 我們的故事
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
              我們的<em className="not-italic font-light italic text-pink-600">故事</em>
            </h2>
            <p className="font-display italic font-light text-base text-petal-muted">
              一起走過的每個重要時刻，加上照片和回憶，慢慢變成只屬於你們的記憶庫。
            </p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            data-testid="journey-add-milestone"
            className="inline-flex items-center gap-1.5 rounded-full bg-petal-ink px-4 py-2 font-body text-sm font-medium text-petal-cream hover:bg-petal-ink/85 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} /> 新增一段回憶
          </button>
        </div>
      </div>

      <div>
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-petal-rule"></div>

          <div className="space-y-8">
            {milestones.map((milestone) => (
              <div key={`${milestone.source}-${milestone.id}`} className="relative flex items-start space-x-6">
                {/* Timeline Node */}
                <div className="w-12 h-12 rounded-full bg-petal-cream border border-petal-rose-soft flex items-center justify-center relative z-10 text-base">
                  {milestone.emoji}
                </div>

                {/* Content */}
                <div className="flex-1 bg-white border border-petal-rule rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-medium tracking-tight text-petal-ink">{milestone.title}</h3>
                      <p className="font-display italic font-light text-sm text-petal-muted mt-0.5">
                        {milestone.date ? milestone.date.slice(0, 10) : (milestone.place ? '—' : '')}
                      </p>
                      {milestone.place && (
                        <p className="font-body text-xs text-petal-muted">地點：{milestone.place}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {milestone.count && (
                        <span className="font-display italic font-light text-xs text-petal-rose-deep border border-petal-rose-soft px-2.5 py-0.5 rounded-full whitespace-nowrap">
                          第 {milestone.count} 次
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditFor(milestone)}
                        data-testid={`journey-edit-${milestone.id}`}
                        className="p-1.5 text-petal-muted hover:text-petal-ink rounded-full hover:bg-petal-cream-2 transition-colors"
                        aria-label={milestone.source === 'added' ? '編輯' : '加上照片與回憶'}
                      >
                        <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>

                  {milestone.description && (
                    <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-3">{milestone.description}</p>
                  )}

                  {milestone.photo && (
                    <div className="aspect-video w-full rounded-xl bg-petal-cream-2 overflow-hidden flex items-center justify-center mb-3">
                      <img src={milestone.photo} alt="" className="w-full h-full object-contain" />
                    </div>
                  )}

                  {(milestone.likedThen || milestone.realizeNow) && (
                    <div className="space-y-2.5 mb-3">
                      {milestone.likedThen && (
                        <div className="rounded-xl bg-petal-rose-soft/20 border border-petal-rose-soft/60 px-3.5 py-2.5">
                          <div className="flex items-center gap-1.5 font-body text-[11px] text-petal-rose-deep mb-1">
                            <Heart className="w-3 h-3" strokeWidth={1.5} /> 當時，我喜歡你的一個地方
                          </div>
                          <p className="font-display italic font-light text-sm text-petal-ink leading-relaxed">{milestone.likedThen}</p>
                        </div>
                      )}
                      {milestone.realizeNow && (
                        <div className="rounded-xl bg-petal-sage/10 border border-petal-sage/30 px-3.5 py-2.5">
                          <div className="flex items-center gap-1.5 font-body text-[11px] text-petal-sage-deeper mb-1">
                            <Sparkles className="w-3 h-3" strokeWidth={1.5} /> 現在回頭看，我才發現…
                          </div>
                          <p className="font-display italic font-light text-sm text-petal-ink leading-relaxed">{milestone.realizeNow}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {milestone.recordId && (
                    <button
                      onClick={() => handleRecordClick(milestone)}
                      className="inline-flex items-center font-body text-xs text-petal-ink-soft hover:text-petal-rose-deep transition-colors"
                    >
                      <Heart className="w-3 h-3 mr-1" strokeWidth={1.5} />
                      查看詳細記錄 →
                    </button>
                  )}
                </div>
              </div>
            ))}

            {milestones.length === 0 && (
              <div className="relative flex items-start space-x-6">
                <div className="w-12 h-12 rounded-full bg-petal-cream border border-dashed border-petal-rose-soft flex items-center justify-center relative z-10 text-base">✦</div>
                <div className="flex-1 rounded-2xl border border-dashed border-petal-rose-soft bg-petal-cream-2/40 p-5">
                  <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-3">
                    你們的故事從哪一天開始的？先放上一個重要時刻——相遇、第一次旅行、孩子出生……加上一張照片和一句「當時我喜歡你的地方」，慢慢累積成你們的記憶庫。
                  </p>
                  <button
                    type="button"
                    onClick={openAdd}
                    className="inline-flex items-center gap-1.5 rounded-full bg-petal-rose-deep px-4 py-2 font-body text-sm font-medium text-white hover:bg-petal-rose transition-colors"
                  >
                    <Plus className="w-4 h-4" strokeWidth={1.5} /> 新增第一段回憶
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Future Milestones Preview */}
          <div className="mt-8 p-6 bg-petal-cream-2/40 rounded-md border border-dashed border-petal-rose-soft">
            <h3 className="font-display text-lg font-medium tracking-tight text-petal-ink mb-4 flex items-center">
              <Sparkles className="w-4 h-4 mr-2 text-petal-rose-deep" strokeWidth={1.5} />
              即將到來的里程碑
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { count: 10, achieved: intimateRecords.length >= 10 },
                { count: 20, achieved: intimateRecords.length >= 20 },
                { count: 50, achieved: intimateRecords.length >= 50 },
                { count: 100, achieved: intimateRecords.length >= 100 }
              ].map(({ count, achieved }) => (
                <div key={count} className={`p-4 rounded-lg border-2 ${
                  achieved
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-white'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">第 {count} 次親密時光</span>
                    {achieved ? (
                      <span className="text-green-600 font-bold">✓ 已達成</span>
                    ) : (
                      <span className="text-gray-500">
                        還需 {count - intimateRecords.length} 次
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {editor && (
        <MilestoneEditor
          state={editor}
          onClose={() => setEditor(null)}
          onSave={saveFromEditor}
          onDelete={editor.mode === 'edit' ? deleteFromEditor : undefined}
          onPhotoError={() =>
            showNotification({
              type: 'error',
              title: '這張照片讀不進來',
              message: '可能是格式不支援。換一張 JPG 或 PNG 照片再試試看。',
            })
          }
        />
      )}
    </div>
  );
};

export default OurJourneyView;
