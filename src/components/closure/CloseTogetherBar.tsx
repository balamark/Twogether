import { Sprout, Loader2 } from 'lucide-react';

// The invitation to wrap up. It used to sit permanently under the send row as a
// full warm card, interrupting couples mid-argument with an exit ramp. Now it
// has two forms: a quiet one-line entry during active dialogue (so it stays
// discoverable without competing with 送出), and the fuller invitation only when
// the conversation has actually lulled (`emphasized`), which is when finishing
// up is genuinely the next step.
export default function CloseTogetherBar({
  onStart,
  busy,
  emphasized = false,
}: {
  onStart: () => void;
  busy: boolean;
  emphasized?: boolean;
}) {
  if (!emphasized) {
    // Quiet form — a compact right-aligned cluster: the prompt sits next to its
    // button (not pushed to opposite ends) so they read as one "next step"
    // group, and the button is a soft-filled sage pill that clearly looks
    // tappable — without competing with 送出's solid ink primary.
    return (
      <div
        data-testid="event-close-together-bar"
        className="flex items-center justify-end gap-3 px-1 mt-1"
      >
        <span className="text-xs text-petal-muted font-normal select-none">
          聊到一段落了嗎？
        </span>
        <button
          type="button"
          data-testid="event-close-together-button"
          disabled={busy}
          onClick={onStart}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sprout className="w-3.5 h-3.5" />}
          一起收尾
        </button>
      </div>
    );
  }

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
        className="px-4 py-2 rounded-full bg-emerald-600 text-white font-medium shadow-sm shadow-emerald-600/25 inline-flex items-center gap-2 disabled:opacity-50 hover:bg-emerald-700 active:scale-[0.98] transition-all cursor-pointer"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
        一起收尾
      </button>
    </div>
  );
}
