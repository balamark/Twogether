import React, { useState, useEffect, useCallback } from 'react';
import {
  Compass,
  Sparkles,
  Loader2,
  UserPlus,
  History,
  ChevronDown,
  Clock,
  Library,
  Check,
} from 'lucide-react';
import {
  apiService,
  type TherapyTopics,
  type TherapyTopicsHistoryEntry,
  type TherapyTopicsPeriod,
  type TherapyTopicSelection,
  type TherapyTopicSelectionStatus,
  type TherapyTopicLibraryEntry,
} from '../services/api';
import type { Notification } from './ErrorNotification';
import { NOT_A_SUBSTITUTE_SHORT } from '../content/positioning';

interface Props {
  authState: { isAuthenticated: boolean; partnerConnected: boolean };
  showNotification: (n: Omit<Notification, 'id'>) => void;
}

const PERIODS: { days: number; label: string }[] = [
  { days: 14, label: '最近兩週' },
  { days: 30, label: '最近 30 天' },
];

const QUIET_REASSURANCE = '最近很平靜，這是好事——但平靜不代表沒有話題可聊。';

const STATUS_OPTIONS: { key: TherapyTopicSelectionStatus; label: string }[] = [
  { key: 'selected', label: '加入諮商' },
  { key: 'saved', label: '先收藏' },
  { key: 'dismissed', label: '不相關' },
];

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

const NOTES_MAX = 500;

// One topic card — shared shape for both AI-suggested topics and the static
// 話題庫, so picking/annotating either feels identical. `onSetStatus`/
// `onSetNotes` resolve to whether the save succeeded (never reject) so this
// component can flash "已儲存" without the caller needing a try/catch here.
//
// `resetKey` identifies which topic/generation this card is showing. The notes
// draft is synced from the prop ONLY when resetKey changes (a different topic,
// or a different generation opened from history) — never on every `notes`
// change. That's deliberate: an optimistic rollback after a failed save flips
// the `notes` prop back, and syncing on `notes` would then wipe the text the
// user still needs to retry with (and could bleed a draft across a history swap).
const TopicCard: React.FC<{
  resetKey: string;
  title: string;
  subtitleLabel: string;
  subtitle: string;
  prompts: string[];
  status: TherapyTopicSelectionStatus | null;
  notes: string | null;
  onSetStatus: (status: TherapyTopicSelectionStatus | null) => void;
  onSetNotes: (notes: string) => Promise<boolean>;
}> = ({ resetKey, title, subtitleLabel, subtitle, prompts, status, notes, onSetStatus, onSetNotes }) => {
  const [notesDraft, setNotesDraft] = useState(notes || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setNotesDraft(notes || '');
    // Intentionally keyed on resetKey only — see the component comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const commitNotes = async () => {
    if (notesDraft === (notes || '')) return;
    setSaving(true);
    const ok = await onSetNotes(notesDraft);
    setSaving(false);
    if (ok) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    }
  };

  return (
    <div className="rounded-xl border border-petal-rule bg-white p-4 space-y-2.5">
      <div className="font-display text-base text-petal-ink">{title}</div>
      <div>
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">{subtitleLabel}</div>
        <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{subtitle}</p>
      </div>
      {prompts.length > 0 && (
        <div>
          <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">可以這樣開始聊</div>
          <ul className="space-y-1">
            {prompts.map((p, i) => (
              <li key={i} className="font-body text-sm text-petal-ink leading-relaxed">・{p}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            // Tapping the active pick again clears it (null) — a mis-tap shouldn't be permanent.
            onClick={() => onSetStatus(status === opt.key ? null : opt.key)}
            data-testid={`therapy-topic-status-${opt.key}`}
            className={`px-3 py-1.5 rounded-full font-body text-xs transition-colors ${
              status === opt.key
                ? 'bg-petal-rose-deep text-white'
                : 'bg-petal-cream-2 text-petal-ink-soft hover:text-petal-ink'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={commitNotes}
          maxLength={NOTES_MAX}
          placeholder="想延伸聊的點，例如你想多聊哪個部分…"
          rows={2}
          data-testid="therapy-topic-notes"
          className="w-full px-3 py-2 rounded-lg border border-petal-rule bg-petal-cream-2/50 focus:border-petal-ink focus:outline-none font-body text-xs text-petal-ink resize-none"
        />
        <div className="h-4 mt-0.5 flex items-center gap-1 font-body text-[11px] text-petal-sage-deep">
          {saving ? '儲存中…' : savedFlash ? (<><Check className="w-3 h-3" /> 已儲存</>) : null}
        </div>
      </div>
    </div>
  );
};

const TherapyTopicsCard: React.FC<Props> = ({ authState, showNotification }) => {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TherapyTopics | null>(null);
  const [inputHash, setInputHash] = useState<string | null>(null);
  const [period, setPeriod] = useState<TherapyTopicsPeriod | null>(null);
  const [selections, setSelections] = useState<Record<number, TherapyTopicSelection>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const [history, setHistory] = useState<TherapyTopicsHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingDate, setViewingDate] = useState<string | null>(null);

  const [library, setLibrary] = useState<TherapyTopicLibraryEntry[]>([]);
  const [librarySelections, setLibrarySelections] = useState<Record<string, TherapyTopicSelection>>({});

  const loadHistory = useCallback(async () => {
    if (!authState.isAuthenticated) return;
    try {
      setHistory(await apiService.getTherapyTopicsHistory());
    } catch {
      // History is a convenience — a failure here shouldn't disrupt the card.
    }
  }, [authState.isAuthenticated]);

  const loadLibrary = useCallback(async () => {
    if (!authState.isAuthenticated) return;
    try {
      const { library, selections } = await apiService.getTherapyTopicLibrary();
      setLibrary(library);
      setLibrarySelections(selections);
    } catch {
      // 話題庫 is a convenience section — a failure here shouldn't block generation.
    }
  }, [authState.isAuthenticated]);

  useEffect(() => {
    loadHistory();
    loadLibrary();
  }, [loadHistory, loadLibrary]);

  const viewHistoric = (entry: TherapyTopicsHistoryEntry) => {
    setData(entry.topics);
    setInputHash(entry.inputHash);
    setPeriod({ days: entry.periodDays, appliedDays: entry.appliedDays, label: entry.periodLabel, eventCount: entry.eventCount ?? 0, quiet: entry.quiet });
    setSelections(entry.selections);
    setViewingId(entry.id);
    setViewingDate(entry.createdAt);
    setNotice(null);
  };

  const generate = async (targetDays: number) => {
    if (!authState.isAuthenticated) {
      showNotification({ type: 'warning', title: '請先登入', message: '登入後即可產生話題建議', duration: 3000 });
      return;
    }
    setLoading(true);
    setNotice(null);
    setData(null);
    setViewingId(null);
    setViewingDate(null);
    try {
      const res = await apiService.getTherapyTopics(targetDays);
      if (res.ok) {
        setData(res.topics);
        setInputHash(res.inputHash);
        setPeriod(res.period);
        setSelections(res.selections);
        loadHistory();
      } else {
        setNotice(res.message);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '話題建議暫時無法產生，請稍後再試';
      const code = (err as { error_code?: string })?.error_code;
      const quota = code === 'AI_DAILY_LIMIT_REACHED';
      showNotification({
        type: quota ? 'warning' : 'error',
        title: quota ? '今日 AI 次數已用完' : '無法產生話題建議',
        message,
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  // A single next-status/notes shape → the optimistically-merged selection. An
  // explicit `status: null` clears the pick; a `notes` string replaces notes.
  const mergeSelection = (
    prev: TherapyTopicSelection | undefined,
    update: { status?: TherapyTopicSelectionStatus | null; notes?: string }
  ): TherapyTopicSelection => ({
    status: 'status' in update ? (update.status ?? null) : (prev?.status ?? null),
    notes: update.notes !== undefined ? update.notes : (prev?.notes ?? null),
    updatedAt: new Date().toISOString(),
  });

  // Unpaired users can browse the 話題庫 but can't persist picks (the couple
  // scope doesn't exist yet). Gate that as a guiding warning with a next step,
  // not a red failure toast — matches the CLAUDE.md three-part-gate convention.
  const guardPaired = (): boolean => {
    if (authState.partnerConnected) return true;
    showNotification({
      type: 'warning',
      title: '配對後就能標記話題',
      message: '和另一半配對後，就能把想聊的話題標記起來、寫下延伸的想法，也讓你們的專屬心理師看得到。',
      duration: 4000,
    });
    return false;
  };

  const updateTopicSelection = async (idx: number, update: { status?: TherapyTopicSelectionStatus | null; notes?: string }): Promise<boolean> => {
    if (!inputHash) return false;
    const prev = selections[idx];
    setSelections((s) => ({ ...s, [idx]: mergeSelection(prev, update) }));
    try {
      await apiService.setTherapyTopicSelection(inputHash, idx, update);
      return true;
    } catch (err) {
      setSelections((s) => ({ ...s, [idx]: prev ?? { status: null, notes: null, updatedAt: '' } }));
      showNotification({ type: 'error', title: '更新失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 3000 });
      return false;
    }
  };

  const updateLibrarySelection = async (topicId: string, update: { status?: TherapyTopicSelectionStatus | null; notes?: string }): Promise<boolean> => {
    if (!guardPaired()) return false;
    const prev = librarySelections[topicId];
    setLibrarySelections((s) => ({ ...s, [topicId]: mergeSelection(prev, update) }));
    try {
      await apiService.setTherapyTopicLibrarySelection(topicId, update);
      return true;
    } catch (err) {
      setLibrarySelections((s) => ({ ...s, [topicId]: prev ?? { status: null, notes: null, updatedAt: '' } }));
      showNotification({ type: 'error', title: '更新失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 3000 });
      return false;
    }
  };

  return (
    <div className="bg-petal-cream border border-petal-sage/40 rounded-2xl p-5 max-w-2xl mx-auto" data-testid="therapy-topics-card">
      <div className="flex items-center gap-2 text-petal-sage-deep mb-1">
        <Compass className="w-5 h-5" strokeWidth={1.5} />
        <h3 className="font-display italic text-lg text-petal-ink">話題建議</h3>
      </div>
      <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-4">
        每次整理事件時，AI 會主動列出 3 到 5 個下次諮商可以聊的話題，附上「為什麼建議」和幾個可以直接照著問的引導——就算最近很平靜，也一樣有話題可聊。
      </p>

      {/* Period selector + generate */}
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <div className="inline-flex rounded-full bg-petal-cream-2 p-0.5" role="tablist" aria-label="期間">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              role="tab"
              aria-selected={days === p.days}
              onClick={() => setDays(p.days)}
              disabled={loading}
              className={`px-3 py-1.5 rounded-full font-body text-xs transition-colors ${
                days === p.days ? 'bg-white text-petal-ink shadow-sm' : 'text-petal-muted hover:text-petal-ink'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => generate(days)}
          disabled={loading}
          data-testid="therapy-topics-generate"
          className="inline-flex items-center gap-1.5 rounded-full bg-petal-rose-deep text-white font-body text-sm font-medium px-4 py-2 shadow-sm hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? '整理中…' : data ? '重新產生' : '產生話題建議'}
        </button>
      </div>

      {/* Past generations — re-open any earlier set without spending an AI credit */}
      {history.length > 0 && (
        <div className="mt-3" data-testid="therapy-topics-history">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            data-testid="therapy-topics-history-toggle"
            className="inline-flex items-center gap-1.5 font-body text-xs text-petal-muted hover:text-petal-ink transition-colors"
          >
            <History className="w-3.5 h-3.5" strokeWidth={1.5} />
            歷史紀錄（{history.length}）
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </button>
          {historyOpen && (
            <ul className="mt-2 space-y-1.5">
              {history.map((h) => {
                const active = viewingId === h.id;
                return (
                  <li key={h.id}>
                    <button
                      onClick={() => viewHistoric(h)}
                      data-testid="therapy-topics-history-item"
                      className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                        active ? 'border-petal-rose-deep bg-petal-rose-soft/20' : 'border-petal-rule bg-white hover:border-petal-ink'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Clock className="w-3.5 h-3.5 text-petal-muted shrink-0" strokeWidth={1.5} />
                        <span className="font-body text-xs text-petal-ink truncate">
                          {h.periodLabel}
                          {typeof h.eventCount === 'number' ? ` · 共 ${h.eventCount} 件` : ''}
                          {h.quiet ? ' · 平靜模式' : ''}
                        </span>
                      </span>
                      <span className="font-body text-[11px] text-petal-muted shrink-0">{formatHistoryDate(h.createdAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-1.5 font-body text-[11px] text-petal-muted leading-relaxed">點開舊建議不會重新產生、也不扣 AI 次數。</p>
        </div>
      )}

      {/* Guiding empty state (not paired) */}
      {notice && (
        <div className="mt-4 rounded-xl border border-petal-rule bg-petal-cream-2 px-4 py-3 flex items-start gap-2.5" data-testid="therapy-topics-notice">
          <UserPlus className="w-4 h-4 text-petal-rose-deep mt-0.5 shrink-0" strokeWidth={1.5} />
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{notice}</p>
        </div>
      )}

      {/* Result */}
      {data && period && (
        <div className="mt-4 space-y-3" data-testid="therapy-topics-result">
          <div className="flex items-center justify-between gap-2">
            <span className="font-body text-xs text-petal-muted flex items-center gap-2 flex-wrap">
              {/* Whenever we widened the lookback (appliedDays > days), eventCount
                  includes older events — say so instead of mislabelling the count
                  as belonging to "最近兩週". */}
              <span>
                {period.appliedDays > period.days
                  ? `已從最近 ${period.appliedDays} 天找出可以聊的方向 · 共 ${period.eventCount} 件`
                  : `${period.label} · 共 ${period.eventCount} 件事件`}
              </span>
              {viewingId && viewingDate && (
                <span data-testid="therapy-topics-historic-badge" className="inline-flex items-center gap-1 rounded-full bg-petal-cream-2 text-petal-ink-soft px-2 py-0.5 text-[11px]">
                  <History className="w-3 h-3" strokeWidth={1.5} />
                  歷史紀錄 · {formatHistoryDate(viewingDate)}
                </span>
              )}
            </span>
          </div>

          {period.quiet && (
            <div className="rounded-xl bg-petal-sage/10 border border-petal-sage/30 px-4 py-3" data-testid="therapy-topics-quiet-banner">
              <p className="font-body text-sm text-petal-ink leading-relaxed">{QUIET_REASSURANCE}</p>
            </div>
          )}
          {data.intro && (
            <p className="font-display italic font-light text-base text-petal-ink leading-relaxed border-l-2 border-petal-sage/50 pl-3">
              {data.intro}
            </p>
          )}

          <div className="space-y-3">
            {data.topics.map((t, idx) => {
              const sel = selections[idx];
              return (
                <TopicCard
                  key={idx}
                  resetKey={`${inputHash ?? 'none'}-${idx}`}
                  title={t.title}
                  subtitleLabel="為什麼會建議這個"
                  subtitle={t.whySuggested}
                  prompts={t.prompts}
                  status={sel?.status ?? null}
                  notes={sel?.notes ?? null}
                  onSetStatus={(status) => { updateTopicSelection(idx, { status }); }}
                  onSetNotes={(notes) => updateTopicSelection(idx, { notes })}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 話題庫 — always available, no generation needed */}
      {library.length > 0 && (
        <div className="mt-6 pt-5 border-t border-petal-rule" data-testid="therapy-topics-library">
          <div className="flex items-center gap-2 text-petal-sage-deep mb-1">
            <Library className="w-4 h-4" strokeWidth={1.5} />
            <h4 className="font-display text-base text-petal-ink">話題庫</h4>
          </div>
          <p className="font-body text-xs text-petal-muted leading-relaxed mb-3">
            不想等 AI 整理？這些是幾個許多伴侶都值得聊聊的方向，隨時可以挑一個開始。
          </p>
          <div className="space-y-3">
            {library.map((t) => {
              const sel = librarySelections[t.id];
              return (
                <TopicCard
                  key={t.id}
                  resetKey={`lib-${t.id}`}
                  title={t.title}
                  subtitleLabel="為什麼值得聊聊"
                  subtitle={t.description}
                  prompts={t.prompts}
                  status={sel?.status ?? null}
                  notes={sel?.notes ?? null}
                  onSetStatus={(status) => { updateLibrarySelection(t.id, { status }); }}
                  onSetNotes={(notes) => updateLibrarySelection(t.id, { notes })}
                />
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 font-body text-xs text-petal-muted leading-relaxed">{NOT_A_SUBSTITUTE_SHORT}</p>
    </div>
  );
};

export default TherapyTopicsCard;
