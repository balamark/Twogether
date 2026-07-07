import { Users, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// 「單人模式」gate (docs/UX_PLAYBOOK.md P0-3 / §6 Q2): features that need a
// paired partner don't dead-end into 「請先配對」. Three parts: what the
// feature does for the relationship, the invite CTA, and what you can do solo
// in the meantime.

export interface SoloAlternative {
  label: string;
  desc: string;
  onClick: () => void;
}

export default function SoloModeGate({
  icon: Icon,
  title,
  valueLine,
  sample,
  onInvite,
  alternatives,
}: {
  icon: LucideIcon;
  title: string;
  // What happens for the two of you once paired (benefit, not feature list).
  valueLine: string;
  // A short read-only illustration of the feature (optional).
  sample?: React.ReactNode;
  onInvite: () => void;
  alternatives: SoloAlternative[];
}) {
  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4" data-testid="solo-mode-gate">
      <div className="bg-petal-cream border border-petal-rule rounded-2xl p-6 text-center">
        <Icon className="w-8 h-8 mx-auto mb-3 text-petal-rose-deep" />
        <h2 className="text-xl font-serif text-petal-ink mb-2">{title}</h2>
        <p className="text-petal-ink-soft text-sm leading-relaxed max-w-md mx-auto">{valueLine}</p>
        {sample && <div className="mt-4 text-left">{sample}</div>}
        <button
          type="button"
          data-testid="solo-gate-invite"
          onClick={onInvite}
          className="mt-5 px-5 py-2.5 rounded-full bg-petal-rose-deep text-white font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-2"
        >
          <Users className="w-4 h-4" />
          邀請另一半配對
        </button>
      </div>

      {alternatives.length > 0 && (
        <div className="bg-white border border-petal-rule-soft rounded-2xl p-4">
          <p className="text-xs text-petal-muted mb-2">配對之前，你可以先：</p>
          <div className="space-y-1.5">
            {alternatives.map((alt) => (
              <button
                key={alt.label}
                type="button"
                onClick={alt.onClick}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-petal-cream-2 transition flex items-center gap-2 group"
              >
                <span className="flex-1">
                  <span className="text-sm text-petal-ink font-medium">{alt.label}</span>
                  <span className="block text-xs text-petal-ink-soft">{alt.desc}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-petal-muted group-hover:text-petal-ink transition" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
