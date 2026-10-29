import React, { useState } from 'react';
import { ChevronRight, HelpCircle } from 'lucide-react';
import { apiService } from '../services/api';
import { useCachedQuery, userKey } from '../services/queryCache';
import { tr } from '../i18n/tr';

interface LoveBankCardProps {
  /** Opens the full 感情存款 page (view 'shop'). */
  onOpen: () => void;
  /** Smaller variant for inside 關係之屋. */
  compact?: boolean;
}

// 感情存款 at a glance: only the average of both balances — the individual
// balances live on the 感情存款 page. The meaning sits behind the (?) so the
// card stays a single number. Shares the /coins/summary cache entry with the
// 感情存款 page, so either one paints instantly after the other.
const LoveBankCard: React.FC<LoveBankCardProps> = ({ onOpen, compact = false }) => {
  const { data: summary } = useCachedQuery(userKey('/coins/summary'), () => apiService.getDepositSummary());
  const [hintOpen, setHintOpen] = useState(false);

  if (!summary?.paired) return null;

  return (
    <div
      data-testid="love-bank-card"
      className={`relative border transition-colors hover:border-petal-ink ${
        compact ? 'rounded-xl bg-white border-petal-rule' : 'rounded-3xl bg-gradient-to-b from-white to-petal-cream border-petal-rose-soft shadow-petal'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className={`group w-full flex items-center gap-3 text-left ${compact ? 'px-4 py-3' : 'px-6 py-5'}`}
      >
        <span className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted">
          {tr('感情存款', 'Love Bank')}
        </span>
        <span
          data-testid="love-bank-average"
          className={`ml-auto font-display font-light text-petal-rose-deep leading-none ${compact ? 'text-3xl' : 'text-4xl'}`}
        >
          {summary.average}
        </span>
        {/* Room for the (?) button, which sits on top of this row. */}
        <span className="w-6" aria-hidden />
        <ChevronRight className="w-4 h-4 text-petal-muted group-hover:text-petal-ink transition-colors shrink-0" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={() => setHintOpen((v) => !v)}
        aria-label={tr('這個數字是什麼？', 'What is this number?')}
        aria-expanded={hintOpen}
        data-testid="love-bank-hint"
        className={`absolute top-1/2 -translate-y-1/2 p-1.5 rounded-full text-petal-muted hover:text-petal-ink ${compact ? 'right-9' : 'right-11'}`}
      >
        <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
      {hintOpen && (
        <p
          role="tooltip"
          data-testid="love-bank-hint-text"
          className="absolute right-3 top-full mt-1 z-10 max-w-[240px] rounded-md bg-petal-ink px-3 py-2 font-body text-[11px] leading-relaxed text-petal-cream shadow-lg"
        >
          {tr('你們兩人感情存款的平均', 'The average of both your Love Bank balances')}
        </p>
      )}
    </div>
  );
};

export default LoveBankCard;
