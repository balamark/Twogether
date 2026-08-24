import React, { useRef, useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { apiService } from '../services/api';
import type { AiResponseFeedbackInput } from '../services/api';

// A tiny 👍/👎 footer for AI-generated responses (情緒翻譯 / AI 諮商師). Thumb up
// posts immediately (optimistic); thumb down opens an optional reason box and
// posts once on 送出, so a down-vote is one row optionally carrying the text.
// Best-effort analytics: the POST is fire-and-forget (apiService swallows
// failures) and never blocks the user. Mirrors the roleplay feedback footer in
// IntimacyRequestForm.tsx so the two feel the same.
interface Props {
  surface: AiResponseFeedbackInput['surface'];
  referenceId?: string;
  messageText?: string;
  // A small slice of the surrounding thread, stored with down-votes so a bad
  // case (chiefly a 你/我 perspective error) can be diagnosed later.
  contextSnapshot?: unknown;
  className?: string;
}

const AiResponseFeedback: React.FC<Props> = ({
  surface,
  referenceId,
  messageText,
  contextSnapshot,
  className,
}) => {
  const [rated, setRated] = useState<'up' | 'down' | null>(null);
  const [downOpen, setDownOpen] = useState(false);
  const [downText, setDownText] = useState('');
  // Stops a double-tap from writing duplicate rows before state settles.
  const lockRef = useRef(false);

  const send = (rating: 'up' | 'down', feedbackText?: string) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setRated(rating);
    apiService.submitAiResponseFeedback({
      surface,
      referenceId,
      rating,
      messageText,
      feedbackText,
      // Only carry context on a down-vote (that's the case worth diagnosing).
      contextSnapshot: rating === 'down' ? contextSnapshot : undefined,
    });
  };

  const handleUp = () => {
    setDownOpen(false);
    send('up');
  };

  const handleDown = () => {
    setDownText('');
    setDownOpen((cur) => !cur);
  };

  const submitDown = () => {
    send('down', downText.trim() || undefined);
    setDownOpen(false);
    setDownText('');
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-testid={`ai-feedback-up-${surface}`}
          onClick={handleUp}
          disabled={lockRef.current}
          className={`p-1 rounded-md transition-colors ${
            rated === 'up' ? 'bg-green-100 text-green-600' : 'text-petal-muted hover:bg-petal-cream-2'
          }`}
          aria-label="這個回應很好"
        >
          <ThumbsUp className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          data-testid={`ai-feedback-down-${surface}`}
          onClick={handleDown}
          className={`p-1 rounded-md transition-colors ${
            rated === 'down' ? 'bg-rose-100 text-rose-600' : 'text-petal-muted hover:bg-petal-cream-2'
          }`}
          aria-label="這個回應不通順或不合理"
        >
          <ThumbsDown className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        {rated && <span className="font-body text-[11px] text-petal-muted ml-0.5">已回饋，謝謝！</span>}
      </div>
      {downOpen && (
        <div className="mt-1.5 space-y-1.5">
          <textarea
            value={downText}
            onChange={(e) => setDownText(e.target.value)}
            placeholder="哪裡不通順或不合理嗎？（選填，幫我們改進）"
            rows={2}
            className="w-full p-2 font-body text-sm border border-petal-rule rounded-md focus:ring-1 focus:ring-petal-rose-deep resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDownOpen(false);
                setDownText('');
              }}
              className="px-3 py-1 font-body text-xs text-petal-muted hover:text-petal-ink"
            >
              取消
            </button>
            <button
              type="button"
              data-testid={`ai-feedback-down-submit-${surface}`}
              onClick={submitDown}
              className="px-3 py-1 font-body text-xs rounded-md bg-petal-rose-deep text-white hover:opacity-90"
            >
              送出
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiResponseFeedback;
