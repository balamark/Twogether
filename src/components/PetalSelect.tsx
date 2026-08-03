import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface PetalSelectOption {
  value: string;
  label: string;
}

interface PetalSelectProps {
  value: string;
  options: PetalSelectOption[];
  onChange: (value: string) => void;
  /** Leading icon shown inside the pill trigger. */
  icon?: React.ReactNode;
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
  /** data-testid for the trigger (mirrors the old <select> testid). */
  testId?: string;
  /** Prefix for per-option testids, e.g. `marketplace-sort` → `…-option-rating`. */
  optionTestIdPrefix?: string;
}

/**
 * Themed dropdown that replaces the native <select> so the option list follows
 * the "Soft Petal" palette instead of the browser's dark native popup. Built
 * from the same trigger + absolute panel + click-catcher overlay pattern used
 * by the user menu in Header.tsx.
 */
export default function PetalSelect({
  value,
  options,
  onChange,
  icon,
  ariaLabel,
  testId,
  optionTestIdPrefix,
}: PetalSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-full border border-petal-rule bg-white hover:border-petal-rose transition-colors focus:outline-none focus:border-petal-rose-deep"
      >
        {icon}
        <span className="font-body text-[13px] text-petal-ink">
          {selected?.label ?? ''}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-petal-muted transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <>
          {/* Click-catcher to close on outside click */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            className="absolute left-0 mt-2 min-w-[10rem] bg-petal-cream rounded-md shadow-petal border border-petal-rule z-50 py-1 overflow-hidden"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li key={opt.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    data-testid={optionTestIdPrefix ? `${optionTestIdPrefix}-option-${opt.value}` : undefined}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 min-h-[44px] text-left font-body text-[13px] transition-colors ${
                      isSelected
                        ? 'bg-petal-rose-soft text-petal-rose-deep'
                        : 'text-petal-ink hover:bg-petal-cream-2'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={2} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
