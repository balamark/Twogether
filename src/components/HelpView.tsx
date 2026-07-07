import { useState } from 'react';
import { ChevronDown, ChevronUp, LifeBuoy, MessageSquarePlus } from 'lucide-react';
import { FEATURE_INTROS } from '../content/featureIntros';

// 使用說明（docs/UX_PLAYBOOK.md P0-4）：per-tab FAQ from the single source in
// src/content/featureIntros.ts. Reachable from the user menu.

export default function HelpView({ onFeedback }: { onFeedback?: () => void }) {
  const [open, setOpen] = useState<string | null>(FEATURE_INTROS[0]?.id ?? null);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4" data-testid="help-view">
      <header className="border-b border-petal-rule pb-5">
        <div className="flex items-center gap-2 mb-1">
          <LifeBuoy className="w-5 h-5 text-petal-rose-deep" />
          <h1 className="text-2xl font-serif text-petal-ink">使用說明</h1>
        </div>
        <p className="text-sm text-petal-ink-soft">
          每個分頁在做什麼、常見的問題。找不到答案時，歡迎用「意見回饋」告訴我們。
        </p>
      </header>

      <div className="space-y-3">
        {FEATURE_INTROS.map((f) => {
          const isOpen = open === f.id;
          return (
            <div key={f.id} className="bg-white border border-petal-rule-soft rounded-2xl overflow-hidden">
              <button
                type="button"
                data-testid={`help-section-${f.id}`}
                onClick={() => setOpen(isOpen ? null : f.id)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-petal-cream-2 transition"
              >
                <span aria-hidden>{f.emoji}</span>
                <span className="font-medium text-petal-ink flex-1">{f.title}</span>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-petal-muted" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-petal-muted" />
                )}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                  <p className="text-sm text-petal-ink-soft leading-relaxed">{f.valueLine}</p>
                  {f.faqs.map((faq) => (
                    <div key={faq.q}>
                      <p className="text-sm font-medium text-petal-ink">{faq.q}</p>
                      <p className="text-sm text-petal-ink-soft leading-relaxed mt-0.5">{faq.a}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {onFeedback && (
        <button
          type="button"
          onClick={onFeedback}
          className="w-full py-3 rounded-2xl border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center justify-center gap-2 text-sm"
        >
          <MessageSquarePlus className="w-4 h-4" />
          還有問題？告訴我們
        </button>
      )}
    </div>
  );
}
