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
    // Quiet form — a low-weight single line, so it never pulls the eye from the
    // reply the couple is still writing.
    return (
      <div
        data-testid="event-close-together-bar"
        className="flex items-center justify-between gap-3 px-1"
      >
        <p className="text-xs text-petal-muted inline-flex items-center gap-1.5">
          <Sprout className="w-3.5 h-3.5 text-petal-sage-deep" />
          聊到一段落了嗎？
        </p>
        <button
          type="button"
          data-testid="event-close-together-button"
          disabled={busy}
          onClick={onStart}
          className="text-xs px-3 py-1.5 rounded-full border border-petal-sage text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
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
        className="px-4 py-2 rounded-full bg-petal-sage-deeper text-white font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
        一起收尾
      </button>
    </div>
  );
}
