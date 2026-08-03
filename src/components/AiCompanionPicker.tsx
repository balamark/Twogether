import { useEffect, useState } from 'react';
import { HeartHandshake, Loader2, Star } from 'lucide-react';
import { apiService } from '../services/api';
import { AI_COMPANIONS, DEFAULT_COMPANION_ID, type AiCompanion } from '../utils/aiCompanions';
import { NOT_A_SUBSTITUTE } from '../content/positioning';
import { useScrollLock } from '../hooks/useScrollLock';

// Selectable list of AI 諮商師 companions. Shared by the onboarding modal
// (below) and the Settings「AI 諮商師」section.
export function AiCompanionList({
  selectedId,
  onSelect,
  disabled = false,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2" role="radiogroup" aria-label="選擇 AI 諮商師">
      {AI_COMPANIONS.map((c: AiCompanion) => {
        const selected = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            data-testid={`ai-companion-option-${c.id}`}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left rounded-2xl border p-3 transition ${
              selected
                ? 'border-petal-rose-deep bg-petal-rose/10 shadow-sm'
                : 'border-petal-rule bg-white hover:border-petal-rose'
            } disabled:opacity-50`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>{c.emoji}</span>
              <span className="font-medium text-petal-ink">{c.name}</span>
              {c.recommended && (
                <span className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full bg-petal-rose-deep text-white">
                  <Star className="w-3 h-3" /> 推薦
                </span>
              )}
              <span className="text-xs text-petal-ink-soft">{c.tagline}</span>
              <span
                className={`ml-auto w-4 h-4 rounded-full border-2 shrink-0 ${
                  selected ? 'border-petal-rose-deep bg-petal-rose-deep' : 'border-petal-rule'
                }`}
                aria-hidden
              />
            </div>
            {selected && (
              <div className="mt-2 pl-7">
                <p className="text-sm text-petal-ink-soft leading-relaxed">{c.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {c.styles.map((s) => (
                    <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-petal-sage/20 text-petal-sage-deep">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// One-time onboarding step:「認識你的 AI 諮商師」. Shown when the signed-in
// user hasn't picked a companion yet. Luma is preselected so a single tap on
// 繼續 completes the step; changing later lives in 設定.
export default function AiCompanionOnboarding({
  onDone,
  onDismiss,
}: {
  // Called with the chosen id once saved (or with the server's existing pick
  // if another device already chose — we never overwrite silently).
  onDone: (companionId: string) => void;
  onDismiss: () => void;
}) {
  const [selectedId, setSelectedId] = useState(DEFAULT_COMPANION_ID);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The localStorage auth snapshot can be stale (e.g. companion picked on
  // another device). Confirm with the server before letting the user save,
  // and auto-complete if a choice already exists.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = (await apiService.getCurrentUser()) as {
          user?: { selected_therapist?: string | null };
        };
        const existing = me?.user?.selected_therapist;
        if (!cancelled && existing) onDone(existing);
      } catch {
        // Probe failure is fine — the picker still works.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Without this the page keeps scrolling behind the overlay on iOS, which
  // shifts where taps land inside it.
  useScrollLock(true);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiService.updateAiCompanion(selectedId);
      onDone(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div
        className="bg-petal-cream w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 shadow-petal"
        data-testid="ai-companion-onboarding"
      >
        <div className="flex items-center gap-2 text-petal-rose-deep mb-1">
          <HeartHandshake className="w-5 h-5" />
          <h2 className="font-display text-lg text-petal-ink">認識你的 AI 諮商師</h2>
        </div>
        <p className="text-sm text-petal-ink-soft mb-3">
          選一位之後最常陪你們聊的 AI 諮商師。每一位的溝通風格不同，但都受過同樣的訓練：不選邊站、幫你們把話說開。之後隨時可以在「設定」裡更換。
        </p>
        <p className="text-xs text-petal-muted leading-relaxed mb-4 rounded-xl bg-petal-cream-2 border border-petal-rule px-3 py-2">
          {NOT_A_SUBSTITUTE}
        </p>

        <AiCompanionList selectedId={selectedId} onSelect={setSelectedId} disabled={saving} />

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex items-center justify-between gap-3 mt-4">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm text-petal-muted hover:text-petal-ink px-2 py-2"
            data-testid="ai-companion-skip"
          >
            稍後再說
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            data-testid="ai-companion-continue"
            className="px-6 py-2.5 rounded-full bg-petal-rose-deep text-white font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            繼續
          </button>
        </div>
      </div>
    </div>
  );
}
