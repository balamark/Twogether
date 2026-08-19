import React from 'react';
import { LifeBuoy, ArrowLeft } from 'lucide-react';

// The safety exit (PRD §34). When a free-text step trips crisis detection
// (src/utils/conflictState.ts CRISIS_PATTERNS via detectDraftTone), the journey
// stops exploring — it must not keep guiding someone deeper into pain while they
// carry it alone. This is intentionally NOT a dismissible banner: it replaces
// the step until the user chooses to leave.
interface Props {
  onLeave: () => void;
}

const SafetyExitScreen: React.FC<Props> = ({ onLeave }) => {
  return (
    <div
      className="rounded-2xl border border-petal-rule bg-white p-5 sm:p-6"
      data-testid="deep-dive-safety-exit"
    >
      <div className="inline-flex items-center gap-2 text-petal-rose-deep mb-3">
        <LifeBuoy className="w-5 h-5" strokeWidth={1.5} />
        <span className="font-display italic text-lg">我們先停一下</span>
      </div>
      <p className="font-body text-sm text-petal-ink leading-relaxed">
        這個感受現在似乎已經超過了一般的關係反思。我不想繼續帶你往更深的地方走，而讓你一個人承受。
      </p>
      <p className="font-body text-sm text-petal-ink leading-relaxed mt-3">
        如果你現在感到不安全，或有想傷害自己的念頭，請立刻聯絡信任的人，或撥打 24 小時安心專線
        <span className="font-medium">「1925」</span>（依舊愛我）、生命線
        <span className="font-medium">「1995」</span>。你並不孤單，也值得被好好接住。
      </p>
      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        <a
          href="tel:1925"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-petal-ink text-petal-cream px-5 py-2.5 font-medium hover:opacity-90 active:scale-[0.98] transition"
          data-testid="deep-dive-safety-call"
        >
          撥打安心專線 1925
        </a>
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-petal-rule text-petal-ink px-5 py-2.5 font-body hover:bg-petal-cream-2 transition"
          data-testid="deep-dive-safety-leave"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          先離開這裡
        </button>
      </div>
      <p className="mt-3 font-body text-[11px] text-petal-muted">
        你剛才寫下的內容都會幫你保留。等你準備好了，隨時可以回來。
      </p>
    </div>
  );
};

export default SafetyExitScreen;
