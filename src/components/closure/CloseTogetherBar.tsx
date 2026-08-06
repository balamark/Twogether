import { Sprout, Loader2 } from 'lucide-react';

// Screen 0 — the always-present bar on open (and legacy resolve_pending) events.
// One tap by either partner moves the event into 'closing'. The visual weight
// is deliberately smaller than 送出 so mid-thread it doesn't compete with the
// reply button; the invitation is «when you're both ready».
export default function CloseTogetherBar({
  onStart,
  busy,
}: {
  onStart: () => void;
  busy: boolean;
}) {
  return (
    <div
      data-testid="event-close-together-bar"
      className="bg-petal-sage/15 border border-petal-sage/40 rounded-2xl p-3 flex flex-col sm:flex-row items-center sm:items-start gap-3"
    >
      <div className="flex-1 text-sm text-petal-ink-soft text-center sm:text-left">
        <p className="inline-flex items-center gap-1.5 text-petal-ink">
          <Sprout className="w-4 h-4 text-petal-sage-deep" />
          聊到一段落了嗎？
        </p>
        <p className="text-xs mt-0.5 leading-relaxed">
          一起寫下「下次我願意做的一件小事」，讓這次不是空談。
        </p>
      </div>
      <button
        type="button"
        data-testid="event-close-together-button"
        disabled={busy}
        onClick={onStart}
        className="px-4 py-2 rounded-full bg-petal-sage-deep text-white font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
        一起收尾
      </button>
    </div>
  );
}
