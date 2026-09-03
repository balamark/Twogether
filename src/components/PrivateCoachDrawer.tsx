import { HandHeart, Loader2, Lock, X } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import ReplyStepBar from './ReplyStepBar';

// The private half of Sophie: a backstage wingman only the writer sees. It never
// posts anything to the shared thread — everything here lands in the writer's own
// draft box for them to edit and send. Kept in its own bottom sheet so the input
// bar stays calm: the writer opens it only when they're stuck on what to say.
interface PrivateCoachDrawerProps {
  open: boolean;
  onClose: () => void;
  companionName: string;
  // Insert a chosen sample phrase into the draft (append, never replace).
  onInsertPhrase: (phrase: string) => void;
  // 接住TA的情緒 reads the partner's last message, so it only exists on shared
  // events. Omitted (undefined) hides that section for a solo note.
  onRequestAcceptance?: () => void;
  accepting?: boolean;
}

export default function PrivateCoachDrawer({
  open,
  onClose,
  companionName,
  onInsertPhrase,
  onRequestAcceptance,
  accepting,
}: PrivateCoachDrawerProps) {
  useScrollLock(open);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      data-testid="private-coach-drawer"
    >
      <button
        type="button"
        aria-label="關閉"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative w-full sm:max-w-lg bg-petal-cream rounded-t-3xl sm:rounded-3xl max-h-[85dvh] overflow-y-auto overscroll-contain safe-pb shadow-xl">
        {/* Grab handle (mobile bottom-sheet affordance) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <span className="h-1 w-10 rounded-full bg-petal-rule" />
        </div>

        <div className="sticky top-0 bg-petal-cream/95 backdrop-blur-sm px-5 pt-3 pb-3 border-b border-petal-rule z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-serif text-lg text-petal-ink flex items-center gap-1.5">
                <span aria-hidden>💡</span>
                {companionName} 私下幫你想
              </h3>
              <p className="text-[11px] text-petal-ink-soft mt-0.5 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" strokeWidth={1.75} />
                只有你看得到，選好的句子會放進你的輸入框，你再決定要不要送出。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉"
              className="flex-shrink-0 text-petal-ink-soft hover:text-petal-ink -m-1 p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 接住TA的情緒 — only on shared events (needs the partner's last message). */}
          {onRequestAcceptance && (
            <section>
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
                — 對方剛說了讓你難受的話？
              </div>
              <div className="bg-petal-rose/10 border border-petal-rose/30 rounded-xl p-3.5">
                <p className="text-sm text-petal-ink-soft leading-relaxed mb-3">
                  先別急著解釋或解決。讓 {companionName} 教你怎麼「接住」TA的情緒——被接住的那一刻，對話才真的開始。
                </p>
                <button
                  type="button"
                  data-testid="event-acceptance-button"
                  onClick={onRequestAcceptance}
                  disabled={accepting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-petal-rose text-petal-rose-deep font-medium bg-white hover:bg-petal-rose hover:text-white transition-colors disabled:opacity-50"
                >
                  {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandHeart className="w-4 h-4" />}
                  <span>如何接住TA的情緒</span>
                </button>
              </div>
            </section>
          )}

          {/* The 8-step guide, grouped into 3 calm stages. */}
          <section>
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
              — 找不到話說？照著步驟挑一句
            </div>
            <ReplyStepBar onInsertPhrase={onInsertPhrase} />
          </section>
        </div>
      </div>
    </div>
  );
}
