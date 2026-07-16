import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import type { CuratedReading } from '../content/curatedReadings';

// Read-only, collapsible card for a single editorial curated reading. Pinned at
// the top of the 好文 · 故事 list (StoryList) — no votes/comments/report.
export default function CuratedReadingCard({ reading }: { reading: CuratedReading }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article
      data-testid="curated-reading"
      className="bg-white rounded-2xl border border-petal-rose/40 shadow-petal p-5 md:p-6"
    >
      <header className={expanded ? 'mb-6 pb-4 border-b border-petal-rule-soft' : ''}>
        <div className="flex items-center gap-1.5 font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-rose-deep mb-2">
          <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} /> 編輯精選
        </div>
        <h3 className="font-display text-2xl md:text-3xl font-light tracking-tight text-petal-ink leading-[1.15] mb-2">
          {reading.title}
        </h3>
        <p className="font-display italic font-light text-sm text-petal-muted leading-relaxed">
          {reading.lede}
        </p>
      </header>

      {!expanded && (
        <div className="mt-4 pt-4 border-t border-petal-rule-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="font-body text-xs text-petal-muted leading-relaxed">{reading.readingTime}</p>
          <button
            type="button"
            data-testid="curated-reading-expand"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-petal-rule rounded-md font-body text-sm text-petal-rose-deep hover:border-petal-rose-deep hover:bg-petal-cream-2/40 transition-colors self-start sm:self-auto"
          >
            閱讀全文
            <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {expanded && (
        <div className="space-y-5 font-body text-[15px] leading-loose text-petal-ink">
          {reading.body}
          <div className="pt-5 border-t border-petal-rule-soft flex justify-center">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-petal-rule rounded-md font-body text-sm text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors"
            >
              <ChevronUp className="w-4 h-4" strokeWidth={1.5} />
              收起
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
