import { useState } from 'react';
import { conflictPhraseTiers, type ConflictStep } from '../data/conflictSteps';

interface ReplyStepBarProps {
  onInsertPhrase: (phrase: string) => void;
}

// The 8 conflict-repair steps used to sit as one flat overflow row of numbered
// pills on top of the keyboard — a mini-textbook the moment you're least able to
// read one. They're now grouped into three plain-language stages, and only the
// stage you open reveals its steps (progressive disclosure), so the default view
// is three calm lines instead of eight competing tags.
interface Stage {
  key: string;
  title: string;
  hint: string;
  stepKeys: string[];
}

const STAGES: Stage[] = [
  {
    key: 'self',
    title: '先穩住自己',
    hint: '停一下、承認情緒',
    stepKeys: ['pause', 'acknowledge'],
  },
  {
    key: 'deescalate',
    title: '幫彼此降溫',
    hint: '放軟語氣、安撫、給保證',
    stepKeys: ['soften', 'soothe', 'reassure'],
  },
  {
    key: 'reconnect',
    title: '重新靠近',
    hint: '給台階、靠近、溫柔收尾',
    stepKeys: ['step-down', 'tender', 'affirm'],
  },
];

export default function ReplyStepBar({ onInsertPhrase }: ReplyStepBarProps) {
  // Which stage is expanded, and which step within it is showing its phrases.
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const stepFor = (k: string): ConflictStep | undefined =>
    conflictPhraseTiers.find((s) => s.key === k);
  const openStep = openKey ? stepFor(openKey) : undefined;

  return (
    <div data-testid="reply-step-bar">
      <div className="text-xs text-petal-ink-soft mb-2">
        不確定怎麼回？照著三個階段，一步一步靠近彼此：
      </div>

      <div className="space-y-2">
        {STAGES.map((stage, i) => {
          const isStageOpen = openStage === stage.key;
          return (
            <div
              key={stage.key}
              className="rounded-xl border border-petal-rule bg-white/60 overflow-hidden"
              data-testid={`reply-stage-${stage.key}`}
            >
              <button
                type="button"
                onClick={() => {
                  setOpenStage(isStageOpen ? null : stage.key);
                  setOpenKey(null);
                }}
                aria-expanded={isStageOpen}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-petal-sage/10 transition-colors"
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-petal-sage/20 text-petal-sage-deep font-body text-xs font-semibold inline-flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-body text-sm font-medium text-petal-ink leading-tight">
                    {stage.title}
                  </span>
                  <span className="block font-body text-[11px] text-petal-muted mt-0.5">
                    {stage.hint}
                  </span>
                </span>
                <span
                  className={`flex-shrink-0 text-petal-muted transition-transform ${isStageOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                >
                  ▾
                </span>
              </button>

              {isStageOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-petal-rule-soft space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {stage.stepKeys.map((k) => {
                      const step = stepFor(k);
                      if (!step) return null;
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

                  {openStep && stage.stepKeys.includes(openStep.key) && (
                    <div
                      className={`mt-1 p-3 rounded-xl border ${openStep.cardClass}`}
                      data-testid={`reply-step-panel-${openStep.key}`}
                    >
                      <div className="text-sm font-medium text-petal-ink mb-1">{openStep.title}</div>
                      <div className="text-xs text-petal-ink-soft mb-2">{openStep.why}</div>
                      <div className="flex flex-col gap-1.5">
                        {openStep.phrases.map((phrase) => (
                          <button
                            key={phrase}
                            type="button"
                            data-testid="reply-step-phrase"
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
