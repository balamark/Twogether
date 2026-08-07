import { Sparkles, X } from 'lucide-react';

// Screen 2a — three AI-suggested options for the current field. Picking one
// fills the textarea (owning composer stays in control); each stays editable.
// Deliberately never auto-selects — "not deciding for you" is the whole point.
export default function AssistOptions({
  options,
  onPick,
  onDismiss,
}: {
  options: string[];
  onPick: (text: string) => void;
  onDismiss: () => void;
}) {
  if (!options.length) return null;
  return (
    <div className="bg-white border border-petal-sage/40 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-petal-ink-soft inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-petal-sage-deep" />
          參考幾個寫法（可以直接改）
        </p>
        <button
          type="button"
          aria-label="收起"
          onClick={onDismiss}
          className="text-petal-ink-soft hover:text-petal-ink"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {options.map((opt, i) => (
          <li key={`${i}-${opt}`}>
            <button
              type="button"
              data-testid={`closure-assist-option-${i}`}
              onClick={() => onPick(opt)}
              className="w-full text-left text-sm text-petal-ink bg-petal-cream border border-petal-rule rounded-lg px-3 py-2 hover:bg-petal-sage/20"
            >
              {opt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
