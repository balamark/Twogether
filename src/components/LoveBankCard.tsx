import React from 'react';
import { ChevronRight, Coins } from 'lucide-react';
import { apiService } from '../services/api';
import { useCachedQuery, userKey } from '../services/queryCache';
import { tr } from '../i18n/tr';

interface LoveBankCardProps {
  /** Opens the full 感情存款 page (view 'shop'). */
  onOpen: () => void;
  /** Smaller variant for inside 關係之屋. */
  compact?: boolean;
}

// 感情存款 at a glance: my balance, theirs, the read-only average, and how many
// requests are waiting on me. Shares the /coins/summary cache entry with the
// 感情存款 page, so either one paints instantly after the other.
const LoveBankCard: React.FC<LoveBankCardProps> = ({ onOpen, compact = false }) => {
  const { data: summary } = useCachedQuery(userKey('/coins/summary'), () => apiService.getDepositSummary());

  if (!summary?.paired) return null;
  const waiting = summary.awaitingMe.length;
  const cells = [
    { label: tr('我的', 'Mine'), value: summary.me.balance, testId: 'love-bank-mine' },
    { label: tr('TA 的', 'Theirs'), value: summary.partner?.balance ?? 0, testId: 'love-bank-partner' },
    { label: tr('平均', 'Average'), value: summary.average, testId: 'love-bank-average' },
  ];

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="love-bank-card"
      className={`group block w-full text-left border transition-colors hover:border-petal-ink ${
        compact ? 'rounded-xl bg-white border-petal-rule p-3.5' : 'rounded-3xl bg-gradient-to-b from-white to-petal-cream border-petal-rose-soft px-6 py-6 shadow-petal'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted">
          <Coins className="w-3.5 h-3.5 text-petal-rose-deep" strokeWidth={1.5} /> {tr('感情存款', 'Love Bank')}
        </span>
        <ChevronRight className="w-4 h-4 text-petal-muted group-hover:text-petal-ink transition-colors" strokeWidth={1.5} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {cells.map((c) => (
          <div key={c.testId} data-testid={c.testId}>
            <div className={`font-display font-light text-petal-ink leading-none ${compact ? 'text-2xl' : 'text-4xl'}`}>{c.value}</div>
            <div className="font-body text-[11px] text-petal-muted mt-1">{c.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 font-body text-[11px] text-petal-ink-soft leading-relaxed">
        {waiting > 0
          ? <span className="text-petal-rose-deep font-medium">{tr(`TA 有 ${waiting} 筆在等你回應`, `${waiting} waiting on you`)}</span>
          : tr('只有對方能為你存入；平均讓彼此大概知道感情的狀態。', 'Only the other can add to yours; the average shows roughly how things are between you.')}
      </p>
    </button>
  );
};

export default LoveBankCard;
