import React, { useMemo, useState } from 'react';
import { Sparkles, ArrowLeft, ArrowRight, RefreshCw, Heart } from 'lucide-react';
import AutoGrowTextarea from './AutoGrowTextarea';
import { trackAction } from '../utils/track';
import type { AuthState } from '../App';

interface RediscoverViewProps {
  authState: AuthState;
  onBack: () => void;
}

// 「重新認識你」— a guided, one-question-at-a-time flow that walks you back to
// the person you first fell for. Deliberately NOT an AI generator and NOT a
// 20-question form: like a counsellor, it asks a single question per screen and
// lets the answer land before the next one. The finished set becomes a keepsake
// letter — 💌 我們曾經這樣愛過 — kept locally on this device (no server round
// trip, no AI credit) so the flow works solo and offline.
//
// This is the positive-first counterpart the 我們 redesign was missing: the app
// used to only help you process problems; this helps you remember why there's a
// relationship worth processing them for.

const buildQuestions = (them: string): { key: string; prompt: string; hint: string }[] => [
  {
    key: 'first-notice',
    prompt: `還記得第一次注意到${them}的時候嗎？`,
    hint: '當時是什麼吸引了你？一個眼神、一句話，還是某個瞬間。',
  },
  {
    key: 'impressive-moment',
    prompt: '有沒有一個「那時候我覺得對方真的很棒」的瞬間？',
    hint: '那時候做了什麼、說了什麼，讓你印象特別深？',
  },
  {
    key: 'favorite-trait',
    prompt: '那時候的你，最喜歡對方身上的哪一個特質？',
    hint: '不用是什麼大道理，可能只是「讓我覺得人生可以很輕鬆」。',
  },
  {
    key: 'still-there',
    prompt: '現在的對方，還有沒有某些時候，讓你想起那個當年的人？',
    hint: '哪怕只是一個很小的瞬間也算。',
  },
  {
    key: 'one-line',
    prompt: '如果要用一句話，告訴現在的對方，你會說什麼？',
    hint: '這句話之後會留在你們的信裡。',
  },
];

const storageKey = (userId?: string) => `tw:rediscover:${userId || 'anon'}`;

type Answers = Record<string, string>;

const RediscoverView: React.FC<RediscoverViewProps> = ({ authState, onBack }) => {
  const them = authState.user?.partnerNickname?.trim() || '對方';
  const questions = useMemo(() => buildQuestions(them), [them]);

  const [answers, setAnswers] = useState<Answers>(() => {
    try {
      const raw = localStorage.getItem(storageKey(authState.user?.id));
      return raw ? (JSON.parse(raw) as Answers) : {};
    } catch {
      return {};
    }
  });
  // Start on the letter if a previous run was already completed on this device.
  const alreadyDone = questions.every((q) => (answers[q.key] || '').trim().length > 0);
  const [step, setStep] = useState<number>(alreadyDone ? questions.length : 0);
  const [draft, setDraft] = useState<string>(answers[questions[0]?.key] ?? '');

  const persist = (next: Answers) => {
    setAnswers(next);
    try {
      localStorage.setItem(storageKey(authState.user?.id), JSON.stringify(next));
    } catch {
      /* storage full / disabled — the in-memory copy still drives this session */
    }
  };

  const goToStep = (i: number) => {
    setStep(i);
    if (i < questions.length) setDraft(answers[questions[i].key] ?? '');
  };

  const handleNext = () => {
    const q = questions[step];
    const next = { ...answers, [q.key]: draft.trim() };
    persist(next);
    if (step === 0) trackAction('rediscover.start');
    if (step + 1 === questions.length) trackAction('rediscover.complete');
    goToStep(step + 1);
  };

  const handleBack = () => {
    // Save whatever's typed so nothing is lost when stepping back.
    const q = questions[step];
    if (q) persist({ ...answers, [q.key]: draft.trim() });
    if (step === 0) onBack();
    else goToStep(step - 1);
  };

  const restart = () => {
    trackAction('rediscover.restart');
    goToStep(0);
  };

  // ── The finished letter ──────────────────────────────────────────────────
  if (step >= questions.length) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6" data-testid="rediscover-letter">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 font-body text-sm text-petal-muted hover:text-petal-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> 回到我們
        </button>

        <div className="rounded-3xl border border-petal-rose-soft bg-gradient-to-b from-white to-petal-cream p-6 md:p-8 shadow-petal">
          <div className="text-center mb-6">
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2">
              — 重新認識你
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1]">
              💌 我們曾經<em className="not-italic italic text-pink-600">這樣愛過</em>
            </h2>
            <p className="mt-3 font-display italic font-light text-sm text-petal-muted">
              你當初愛上{them}的樣子，一直都還在。
            </p>
          </div>

          <div className="space-y-5">
            {questions.map((q) => {
              const a = (answers[q.key] || '').trim();
              if (!a) return null;
              return (
                <div key={q.key} className="border-l-2 border-petal-rose-soft pl-4">
                  <div className="font-body text-[12px] text-petal-muted mb-1">{q.prompt}</div>
                  <div className="font-display text-lg font-light text-petal-ink leading-relaxed whitespace-pre-wrap">
                    {a}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-1.5 rounded-full border border-petal-rule px-4 py-2 font-body text-sm text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors"
          >
            <RefreshCw className="w-4 h-4" strokeWidth={1.5} /> 再寫一次
          </button>
        </div>
        <p className="text-center font-body text-[12px] text-petal-muted leading-relaxed">
          這封信只留在你這台裝置上，慢慢寫、隨時回來看。
        </p>
      </div>
    );
  }

  // ── One question at a time ───────────────────────────────────────────────
  const q = questions[step];
  const isLast = step + 1 === questions.length;
  const progress = ((step + 1) / questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6" data-testid="rediscover-view">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 font-body text-sm text-petal-muted hover:text-petal-ink transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> {step === 0 ? '回到我們' : '上一題'}
      </button>

      <div className="rounded-3xl border border-petal-rule bg-white p-6 md:p-9 shadow-petal">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
          <span className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted">
            重新認識你 · 第 {step + 1} / {questions.length} 題
          </span>
        </div>

        <div className="h-1 w-full rounded-full bg-petal-rule-soft mb-8 overflow-hidden">
          <div
            className="h-full rounded-full bg-petal-rose-deep transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight text-petal-ink leading-[1.25] mb-2">
          {q.prompt}
        </h2>
        <p className="font-body text-sm text-petal-muted leading-relaxed mb-5">{q.hint}</p>

        <AutoGrowTextarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="慢慢想，沒有標準答案…"
          className="w-full rounded-2xl border border-petal-rule bg-petal-cream px-4 py-3 font-body text-base text-petal-ink placeholder:text-petal-muted focus:border-petal-rose-deep focus:outline-none min-h-[120px]"
          data-testid="rediscover-answer"
          autoFocus
        />

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goToStep(step + 1)}
            className="font-body text-sm text-petal-muted hover:text-petal-ink transition-colors"
          >
            這題先跳過
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={draft.trim().length === 0}
            data-testid="rediscover-next"
            className="inline-flex items-center gap-1.5 rounded-full bg-petal-rose-deep px-5 py-2.5 font-body text-sm font-medium text-white transition-colors hover:bg-petal-rose disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLast ? (
              <>
                <Heart className="w-4 h-4" strokeWidth={1.5} /> 完成這封信
              </>
            ) : (
              <>
                下一題 <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RediscoverView;
