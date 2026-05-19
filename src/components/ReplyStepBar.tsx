import { useState } from 'react';
import { conflictPhraseTiers, type ConflictStep } from '../data/conflictSteps';

interface ReplyStepBarProps {
  onInsertPhrase: (phrase: string) => void;
}

// Compact step-bar that surfaces the 8-step conflict-resolution guide above the
// reply textarea. Tap a step pill → reveals its 3 sample phrases + a short
// "why" note. Tap a phrase → inserts it into the textarea via the parent.
export default function ReplyStepBar({ onInsertPhrase }: ReplyStepBarProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const openStep: ConflictStep | undefined = openKey
    ? conflictPhraseTiers.find((s) => s.key === openKey)
    : undefined;

  return (
    <div className="mb-3" data-testid="reply-step-bar">
      <div className="text-xs text-petal-ink-soft mb-1.5">不確定怎麼回？先看看建議的步驟：</div>
      <div className="flex flex-wrap gap-1.5">
        {conflictPhraseTiers.map((step) => {
          const isOpen = openKey === step.key;
          return (
            <button
              key={step.key}
              type="button"
              data-testid={`reply-step-pill-${step.key}`}
              onClick={() => setOpenKey(isOpen ? null : step.key)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                isOpen
                  ? 'bg-petal-ink text-petal-cream border-petal-ink'
                  : 'bg-white text-petal-ink border-petal-rule hover:bg-petal-sage/20'
              }`}
            >
              <span className="mr-1">{step.dot}</span>
              {step.badge}
            </button>
          );
        })}
      </div>

      {openStep && (
        <div
          className={`mt-2 p-3 rounded-xl border ${openStep.cardClass}`}
          data-testid={`reply-step-panel-${openStep.key}`}
        >
          <div className="text-sm font-medium text-petal-ink mb-1">{openStep.title}</div>
          <div className="text-xs text-petal-ink-soft mb-2">{openStep.why}</div>
          <div className="flex flex-col gap-1.5">
            {openStep.phrases.map((phrase) => (
              <button
                key={phrase}
                type="button"
                data-testid={`reply-step-phrase`}
                onClick={() => {
                  onInsertPhrase(phrase);
                  setOpenKey(null);
                }}
                className="text-left text-sm px-3 py-1.5 rounded-lg bg-white/70 border border-white text-petal-ink hover:bg-white"
              >
                {phrase}
              </button>
            ))}
          </div>
          <div className="text-xs text-petal-ink-soft mt-2 italic">{openStep.note}</div>
        </div>
      )}
    </div>
  );
}
