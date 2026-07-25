import React from 'react';
import { Gauge, Ear, Heart, Sparkles, X } from 'lucide-react';
import type { DraftAnalysis } from '../services/api';

// The per-message emotion meter shown for a reply draft before it is sent.
// Read-only diagnostic + a one-tap rewrite. Reuses petal styling.
interface Props {
  analysis: DraftAnalysis;
  onUseRewrite: (text: string) => void;
  onClose: () => void;
}

const DraftEmotionMeter: React.FC<Props> = ({ analysis, onUseRewrite, onClose }) => {
  const { emotions, partnerHears, need, rewrite } = analysis;
  return (
    <div
      className="bg-petal-cream border border-petal-rose-deep/30 rounded-2xl p-4 space-y-4"
      data-testid="draft-emotion-meter"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-petal-rose-deep">
          <Gauge className="w-4 h-4" strokeWidth={1.5} />
          <span className="font-display italic text-base">送出前，先看看這句話</span>
          {/* 冰山原則：看見這句話底下的情緒與需求，再決定要不要這樣送出。 */}
          <span className="font-body text-[10px] uppercase tracking-[0.14em] text-petal-rose-deep/70 border border-petal-rose-deep/25 rounded-full px-1.5 py-0.5">
            冰山
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          data-testid="draft-emotion-meter-close"
          className="p-1 text-petal-muted hover:text-petal-ink transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {emotions.length > 0 && (
        <div>
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.12em] text-petal-muted mb-1.5">
            這句話底層的情緒
          </div>
          <div className="space-y-1.5">
            {emotions.map((e, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 shrink-0 font-body text-sm text-petal-ink">
                  {e.emoji} {e.label}
                </span>
                <div className="flex-1 h-2 rounded-full bg-petal-cream-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-petal-rose-deep"
                    style={{ width: `${Math.max(0, Math.min(100, e.intensity))}%` }}
                  />
                </div>
                <span className="w-9 text-right font-body text-[11px] text-petal-muted">{e.intensity}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(partnerHears.misread || partnerHears.real) && (
        <div>
          <div className="flex items-center gap-1.5 font-body text-[11px] font-medium uppercase tracking-[0.12em] text-petal-muted mb-1.5">
            <Ear className="w-3.5 h-3.5" strokeWidth={1.5} />
            對方可能聽成
          </div>
          {partnerHears.misread && (
            <p className="font-body text-sm text-petal-ink leading-relaxed">
              <span className="text-red-500 mr-1">✕</span>
              {partnerHears.misread}
            </p>
          )}
          {partnerHears.real && (
            <p className="font-body text-sm text-petal-ink leading-relaxed mt-0.5">
              <span className="text-petal-sage-deep mr-1">✓</span>
              {partnerHears.real}
            </p>
          )}
        </div>
      )}

      {need && (
        <div className="flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5 text-petal-rose-deep" strokeWidth={1.5} />
          <span className="font-body text-sm text-petal-ink">
            你其實需要
            <span className="ml-1 inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep text-[12px] px-2 py-0.5">
              {need}
            </span>
          </span>
        </div>
      )}

      {rewrite && (
        <div className="rounded-xl border border-petal-rose-deep/25 bg-petal-cream-2 px-3 py-2.5">
          <div className="font-body text-[11px] font-medium text-petal-rose-deep mb-1">試著這樣說</div>
          <p className="font-body text-sm text-petal-ink leading-relaxed">「{rewrite}」</p>
          <button
            type="button"
            data-testid="draft-emotion-meter-use"
            onClick={() => onUseRewrite(rewrite)}
            className="mt-2 inline-flex items-center gap-1.5 bg-petal-rose-deep text-white font-medium shadow-sm rounded-full px-3 py-1.5 font-body text-xs hover:opacity-90 active:scale-[0.98] transition"
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
            採用這句
          </button>
        </div>
      )}
    </div>
  );
};

export default DraftEmotionMeter;
