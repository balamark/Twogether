import React from 'react';
import { Hash, HeartPulse, CheckCircle2, CircleDashed, HelpCircle } from 'lucide-react';
import type { TherapySummary } from '../services/api';
import { NOT_A_SUBSTITUTE_SHORT } from '../content/positioning';

// Shared, read-only rendering of a 諮商摘要 (therapy summary). Used both by the
// couple's own TherapySummaryCard and by the dedicated therapist's client view,
// so the digest looks identical wherever it's read.

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-center gap-1.5 text-petal-sage-deep mb-1.5">
    {icon}
    <span className="font-body text-[11px] font-medium uppercase tracking-[0.12em]">{children}</span>
  </div>
);

const Chips: React.FC<{ items: string[] }> = ({ items }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((t, i) => (
      <span
        key={i}
        className="inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep font-body text-xs px-2.5 py-0.5"
      >
        {t}
      </span>
    ))}
  </div>
);

// The sections of one summary. `showDisclaimer` appends the "not a substitute"
// line (the card shows it; callers embedding several summaries can suppress it).
const TherapySummaryDetail: React.FC<{ summary: TherapySummary; showDisclaimer?: boolean }> = ({
  summary,
  showDisclaimer = true,
}) => (
  <div className="space-y-4" data-testid="therapy-summary-detail">
    {summary.overview && (
      <p className="font-display italic font-light text-base text-petal-ink leading-relaxed border-l-2 border-petal-sage/50 pl-3">
        {summary.overview}
      </p>
    )}

    {summary.themes.length > 0 && (
      <div>
        <SectionTitle icon={<Hash className="w-3.5 h-3.5" strokeWidth={1.5} />}>最常出現的衝突主題</SectionTitle>
        <Chips items={summary.themes} />
      </div>
    )}

    {summary.emotions.length > 0 && (
      <div>
        <SectionTitle icon={<HeartPulse className="w-3.5 h-3.5" strokeWidth={1.5} />}>雙方最常感受到的情緒</SectionTitle>
        <Chips items={summary.emotions} />
      </div>
    )}

    {summary.repaired.length > 0 && (
      <div>
        <SectionTitle icon={<CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />}>已經成功修復的事件</SectionTitle>
        <ul className="space-y-1.5">
          {summary.repaired.map((r, i) => (
            <li key={i} className="font-body text-sm text-petal-ink leading-relaxed">
              <span className="font-medium">{r.title}</span>
              <span className="text-petal-ink-soft"> — {r.insight}</span>
            </li>
          ))}
        </ul>
      </div>
    )}

    {summary.unresolved.length > 0 && (
      <div>
        <SectionTitle icon={<CircleDashed className="w-3.5 h-3.5" strokeWidth={1.5} />}>還沒解決的事件</SectionTitle>
        <ul className="space-y-1.5">
          {summary.unresolved.map((r, i) => (
            <li key={i} className="font-body text-sm text-petal-ink leading-relaxed">
              <span className="font-medium">{r.title}</span>
              <span className="text-petal-ink-soft"> — {r.note}</span>
            </li>
          ))}
        </ul>
      </div>
    )}

    {summary.questions.length > 0 && (
      <div className="rounded-xl bg-petal-rose-soft/20 border border-petal-rose-soft px-4 py-3">
        <SectionTitle icon={<HelpCircle className="w-3.5 h-3.5" strokeWidth={1.5} />}>想帶去和心理師討論的三個問題</SectionTitle>
        <ol className="space-y-1.5 list-decimal list-inside">
          {summary.questions.map((q, i) => (
            <li key={i} className="font-body text-sm text-petal-ink leading-relaxed">{q}</li>
          ))}
        </ol>
      </div>
    )}

    {showDisclaimer && (
      <p className="font-body text-xs text-petal-muted leading-relaxed">{NOT_A_SUBSTITUTE_SHORT}</p>
    )}
  </div>
);

export default TherapySummaryDetail;
