import React from 'react';
import { HeartHandshake } from 'lucide-react';
import type { MessageTranslation } from '../services/api';

// The 情緒翻譯 (emotion/need translation) shown under a message when the shared
// lens is on. It reframes an attack into the underlying need so the other
// partner reads a need, not a blow: 可能真正想表達的是：「…」. Read-only.
interface Props {
  translation: MessageTranslation;
  className?: string;
}

const MessageTranslationCard: React.FC<Props> = ({ translation, className }) => {
  const { rewrite, need, emotions } = translation;
  if (!rewrite) return null;
  return (
    <div
      className={`mt-1.5 rounded-xl border border-petal-rose-deep/25 bg-petal-cream-2 px-3 py-2 ${className || ''}`}
      data-testid="message-translation"
    >
      <div className="flex items-center gap-1.5 text-petal-rose-deep">
        <HeartHandshake className="w-3.5 h-3.5" strokeWidth={1.5} />
        <span className="font-body text-[11px] font-medium flex-1">可能真正想表達的是</span>
        {/* 冰山原則：說出口的只是一角，這裡翻出水面下的情緒與需求。 */}
        <span className="font-body text-[10px] uppercase tracking-[0.14em] text-petal-rose-deep/70 border border-petal-rose-deep/25 rounded-full px-1.5 py-0.5">
          冰山
        </span>
      </div>
      <p className="mt-1 font-body text-sm text-petal-ink leading-relaxed">「{rewrite}」</p>
      {(need || (emotions && emotions.length > 0)) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {need && (
            <span className="inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep font-body text-[11px] px-2 py-0.5">
              需要{need}
            </span>
          )}
          {(emotions || []).map((e) => (
            <span
              key={e.label}
              className="inline-flex items-center rounded-full border border-petal-rule text-petal-muted font-body text-[11px] px-2 py-0.5"
            >
              {e.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default MessageTranslationCard;
