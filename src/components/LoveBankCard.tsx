import React, { useState } from 'react';
import { ChevronRight, HelpCircle, PiggyBank } from 'lucide-react';
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

  // The (?) and its tooltip; `align` keeps the tooltip on-screen (the compact
  // row's (?) sits near the right edge).
  const hint = (align: 'left' | 'right') => (
    <>
      <button
        type="button"
        onClick={() => setHintOpen((v) => !v)}
        aria-label={tr('這個數字是什麼？', 'What is this number?')}
        aria-expanded={hintOpen}
        data-testid="love-bank-hint"
        className="p-1.5 rounded-full text-petal-muted hover:text-petal-ink"
      >
        <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
      {hintOpen && (
        <p
          role="tooltip"
          data-testid="love-bank-hint-text"
          className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full mt-1 z-10 w-max max-w-[240px] rounded-md bg-petal-ink px-3 py-2 font-body text-[11px] leading-relaxed text-petal-cream shadow-lg`}
        >
          {tr('你們兩人感情存款的平均', 'The average of both your Love Bank balances')}
        </p>
      )}
    </>
  );

  // 關係之屋: one quiet row inside the house.
  if (compact) {
    return (
      <div data-testid="love-bank-card" className="relative flex items-center rounded-xl bg-white border border-petal-rule hover:border-petal-ink transition-colors">
        <button type="button" onClick={onOpen} className="group flex-1 flex items-center gap-3 px-4 py-3 text-left">
          <span className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted">{tr('感情存款', 'Love Bank')}</span>
          <span data-testid="love-bank-average" className="ml-auto font-display text-3xl font-light text-petal-rose-deep leading-none">{summary.average}</span>
        </button>
        <div className="relative">{hint('right')}</div>
        <button type="button" onClick={onOpen} aria-label={tr('打開感情存款', 'Open Love Bank')} className="pr-3 pl-1 py-3 text-petal-muted hover:text-petal-ink">
          <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  // 我們: one compact row — the number, how it moved this week, and the latest
  // entry — instead of a big white block holding a lone number. The weekly
  // change and the last entry are what make tapping in feel worth it.
  const delta = summary.weekDelta ?? 0;
  const latest = summary.recent.find((t) => t.status === 'confirmed');
  const deltaTone = delta > 0
    ? 'bg-petal-sage/25 text-petal-sage-deeper'
    : delta < 0 ? 'bg-petal-rose-soft/50 text-petal-rose-deep' : 'bg-petal-cream-2 text-petal-muted';
  return (
    <section data-testid="love-bank-card" className="rounded-3xl border border-sky-200 bg-sky-50/60 p-4 md:p-5">
      <div className="relative flex items-center gap-2 mb-3">
        <PiggyBank className="w-5 h-5 text-sky-800" strokeWidth={1.5} />
        <h2 className="font-display text-lg text-petal-ink">{tr('感情存款', 'Love Bank')}</h2>
        <div className="relative">{hint('left')}</div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="group w-full flex items-center gap-3 rounded-2xl bg-white/80 border border-petal-rule-soft px-4 py-3 text-left hover:border-petal-ink transition-colors"
      >
        <span data-testid="love-bank-average" className="font-display text-4xl font-light text-petal-ink leading-none">{summary.average}</span>
        <span className="min-w-0 flex-1">
          <span data-testid="love-bank-week-delta" className={`inline-block rounded-full px-2 py-0.5 font-body text-[11px] font-medium ${deltaTone}`}>
            {delta === 0
              ? tr('本週持平', 'Flat this week')
              : tr(`本週 ${delta > 0 ? '+' : ''}${delta}`, `${delta > 0 ? '+' : ''}${delta} this week`)}
          </span>
          {latest && (
            <span className="block mt-1 font-body text-[11px] text-petal-muted truncate" data-testid="love-bank-latest">
              {tr('最近：', 'Latest: ')}{latest.note || tr('一筆存款', 'a deposit')}
              {' '}{latest.kind === 'redeem' ? `−${latest.amount}` : `+${latest.amount}`}
            </span>
          )}
        </span>
        <ChevronRight className="w-4 h-4 text-petal-muted group-hover:text-petal-ink shrink-0 transition-colors" strokeWidth={1.5} />
      </button>
    </section>
  );
};

export default LoveBankCard;
