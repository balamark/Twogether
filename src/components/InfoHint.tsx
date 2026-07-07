import { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { getFeatureIntro } from '../content/featureIntros';

// Per-page (?) hint (docs/UX_PLAYBOOK.md P0-4): tap to see what this tab is
// for, sourced from src/content/featureIntros.ts. Place next to page titles.

export default function InfoHint({ viewId }: { viewId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const intro = getFeatureIntro(viewId);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!intro) return null;

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-label={`關於${intro.title}`}
        data-testid={`info-hint-${viewId}`}
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded-full text-petal-muted hover:text-petal-rose-deep transition"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-72 bg-white border border-petal-rule rounded-xl shadow-petal p-3 text-left">
          <p className="text-sm text-petal-ink leading-relaxed">
            {intro.emoji} {intro.valueLine}
          </p>
          {intro.faqs[0] && (
            <p className="text-xs text-petal-ink-soft mt-2 leading-relaxed">
              <span className="font-medium">{intro.faqs[0].q}</span> {intro.faqs[0].a}
            </p>
          )}
          <p className="text-[11px] text-petal-muted mt-2">更多說明在個人選單的「使用說明」。</p>
        </div>
      )}
    </div>
  );
}
