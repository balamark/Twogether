import { useState } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import AiQuotaHint from '../AiQuotaHint';
import AssistOptions from './AssistOptions';
import type { AiUsageToday, ClosureAssistField } from '../../services/api';

// Batch 1's minimums mirror routes/event-closure.js MIN/MAX_COMMITMENT_CHARS.
const MIN_CHARS = 4;
const MAX_CHARS = 200;

// Screen 2 ① and ② — commitment textarea plus the optional 共同決定 line,
// each with 幫我想一個 + AiQuotaHint. Composer owns the local draft state and
// only bubbles up on submit; assist calls come back through onAssist so the
// panel can surface quota/error via showNotification without this component
// knowing about toasts.
export default function CommitmentComposer({
  initialCommitment,
  initialDecision,
  partnerNickname,
  quota,
  onAssist,
  onSubmit,
  onSkip,
  busy,
  assisting,
}: {
  initialCommitment: string;
  initialDecision: string;
  partnerNickname?: string;
  quota: AiUsageToday | null;
  onAssist: (field: ClosureAssistField) => Promise<string[]>;
  onSubmit: (commitment: string, decision: string | null) => Promise<void>;
  onSkip: () => void;
  busy: boolean;
  assisting: ClosureAssistField | null;
}) {
  const [commitment, setCommitment] = useState(initialCommitment);
  const [decision, setDecision] = useState(initialDecision);
  const [commitmentAssist, setCommitmentAssist] = useState<string[]>([]);
  const [decisionAssist, setDecisionAssist] = useState<string[]>([]);

  const trimmed = commitment.trim();
  const commitmentValid = trimmed.length >= MIN_CHARS && trimmed.length <= MAX_CHARS;

  const runAssist = async (field: ClosureAssistField) => {
    const options = await onAssist(field);
    if (field === 'commitment') setCommitmentAssist(options);
    else setDecisionAssist(options);
  };

  const submit = async () => {
    if (!commitmentValid) return;
    await onSubmit(trimmed, decision.trim() ? decision.trim() : null);
  };

  return (
    <div className="space-y-3" data-testid="event-closure-panel">
      <section className="bg-white border border-petal-sage/40 rounded-2xl p-4 space-y-3">
        <div>
          <h4 className="font-serif text-petal-ink text-base">① 下次我願意做的一件小事</h4>
          <p className="text-xs text-petal-ink-soft mt-0.5">
            寫成一個看得見的行動，只寫自己能做的，不寫{partnerNickname || '對方'}要怎麼樣。
          </p>
        </div>

        <textarea
          data-testid="closure-commitment-input"
          value={commitment}
          onChange={(e) => setCommitment(e.target.value.slice(0, MAX_CHARS))}
          placeholder="例如：即使很生氣，也不在人前責罵你"
          rows={3}
          className="w-full text-sm bg-petal-cream border border-petal-rule rounded-xl px-3 py-2 focus:outline-none focus:border-petal-sage-deep"
        />
        <div className="flex items-center justify-between text-xs">
          <span className="text-petal-ink-soft">{trimmed.length}/{MAX_CHARS}</span>
          <div className="flex items-center gap-2">
            <AiQuotaHint quota={quota} />
            <button
              type="button"
              data-testid="closure-assist-button"
              disabled={assisting === 'commitment'}
              onClick={() => runAssist('commitment')}
              className="px-3 py-1.5 rounded-full bg-petal-sage-deeper text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
            >
              {assisting === 'commitment' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              幫我想一個
            </button>
          </div>
        </div>

        <AssistOptions
          options={commitmentAssist}
          onPick={(text) => setCommitment(text)}
          onDismiss={() => setCommitmentAssist([])}
        />
      </section>

      <section className="bg-white border border-petal-sage/40 rounded-2xl p-4 space-y-3">
        <div>
          <h4 className="font-serif text-petal-ink text-base">② 我們一起決定（可略）</h4>
          <p className="text-xs text-petal-ink-soft mt-0.5">
            一件想達成共識的事。{partnerNickname || '對方'}會看到並回應：就這樣、或我想調整。
          </p>
        </div>

        <textarea
          data-testid="closure-decision-input"
          value={decision}
          onChange={(e) => setDecision(e.target.value.slice(0, MAX_CHARS))}
          placeholder="例如：孩子睡著後若沒有立即危險，就不移動"
          rows={2}
          className="w-full text-sm bg-petal-cream border border-petal-rule rounded-xl px-3 py-2 focus:outline-none focus:border-petal-sage-deep"
        />
        <div className="flex items-center justify-end">
          <button
            type="button"
            disabled={assisting === 'decision'}
            onClick={() => runAssist('decision')}
            className="px-3 py-1.5 rounded-full bg-petal-sage-deeper/90 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
          >
            {assisting === 'decision' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            幫我想一個
          </button>
        </div>

        <AssistOptions
          options={decisionAssist}
          onPick={(text) => setDecision(text)}
          onDismiss={() => setDecisionAssist([])}
        />
      </section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="closure-skip-link"
          onClick={onSkip}
          className="text-xs text-petal-ink-soft underline underline-offset-2 hover:text-petal-ink"
        >
          先不寫，跳過這次
        </button>
        <button
          type="button"
          data-testid="closure-submit-button"
          disabled={!commitmentValid || busy}
          onClick={submit}
          className="px-4 py-2 rounded-full bg-petal-sage-deeper text-white font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          送出我的約定
        </button>
      </div>
    </div>
  );
}
