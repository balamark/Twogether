import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square, X } from 'lucide-react';
import { tr } from '../i18n/tr';
import apiService, { type VoiceUsage } from '../services/api';
import { isGuestActive } from '../guest/guestMode';
import { transcribeGuestVoice } from '../guest/guestAi';
import { trackAction } from '../utils/track';
import { useVoiceRecorder, VOICE_MAX_MS, VOICE_MIN_MS, type RecorderError } from '../hooks/useVoiceRecorder';

// 🎤 語音輸入: record a clip (≤60s), turn it into text and drop it into the
// paired textarea at the cursor. The text is never sent anywhere by this
// button — the user reads/edits it and presses the box's own send button, so
// a misheard word can't reach the partner or the AI unseen.
//
// It writes through the textarea's native value setter + an `input` event, so
// the caller's own controlled `onChange` runs exactly as if the user typed —
// no caller wiring beyond a ref. Signed-in users hit /api/voice/transcribe
// (free: 10 min/day, premium unlimited); guests /api/guest-ai/voice (3 tries).

type Status =
  | { kind: 'idle' }
  | { kind: 'transcribing' }
  | { kind: 'done'; note: string }
  | { kind: 'error'; message: string; cta?: 'upgrade' | 'signup' };

const fmt = (ms: number) => {
  const s = Math.min(Math.floor(ms / 1000), VOICE_MAX_MS / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const recorderMessage = (e: RecorderError): string => {
  switch (e) {
    case 'unsupported':
      return tr('這個瀏覽器不支援錄音。可以用手機鍵盤上的 🎤 聽寫，或改用 Safari／Chrome 開啟。', 'This browser can\'t record audio. Use the 🎤 dictation on your phone\'s keyboard, or open the app in Safari or Chrome.');
    case 'denied':
      return tr('沒有麥克風權限。請在瀏覽器的網站設定裡允許使用麥克風，或先用打字。', 'Microphone access is blocked. Allow the microphone in your browser\'s site settings, or type for now.');
    case 'no_mic':
      return tr('找不到麥克風。請接上麥克風再試，或先用打字。', 'No microphone found. Connect one and try again, or type for now.');
    default:
      return tr('錄音沒有成功，請再試一次，或先用打字。', 'Recording didn\'t work. Please try again, or type for now.');
  }
};

function usageNote(usage?: VoiceUsage): string {
  if (!usage) return '';
  if (usage.tier === 'guest' && typeof usage.remaining === 'number') {
    return tr(`語音試用剩 ${usage.remaining} 次`, `${usage.remaining} preview voice ${usage.remaining === 1 ? 'try' : 'tries'} left`);
  }
  if (typeof usage.remainingSeconds === 'number') {
    const min = Math.floor(usage.remainingSeconds / 60);
    return min >= 1
      ? tr(`今日語音剩 ${min} 分鐘`, `${min} min of voice left today`)
      : tr('今日語音剩不到 1 分鐘', 'Less than 1 min of voice left today');
  }
  return '';
}

/** Insert text at the textarea's cursor and fire React's onChange. */
function insertIntoTextarea(el: HTMLTextAreaElement, text: string) {
  const value = el.value;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const before = value.slice(0, start);
  const after = value.slice(end);
  // Join with a space only between two Latin words; 中文 needs no separator.
  const sep = before && !/\s$/.test(before) && /[A-Za-z0-9]$/.test(before) && /^[A-Za-z0-9]/.test(text) ? ' ' : '';
  let next = before + sep + text + after;
  const max = el.maxLength > 0 ? el.maxLength : Infinity;
  if (next.length > max) next = next.slice(0, max);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const caret = Math.min(next.length, (before + sep + text).length);
  try {
    el.focus();
    el.setSelectionRange(caret, caret);
  } catch { /* detached */ }
  return next.length < (before + sep + text + after).length;
}

interface Props {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  /** Prefix for data-testids, e.g. "event-reply" → event-reply-voice. */
  testId?: string;
  /** Where the button is, for analytics. */
  source: string;
  className?: string;
}

export default function VoiceInputButton({ targetRef, disabled, testId = 'voice', source, className = '' }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const handleClip = useCallback(async ({ blob, durationMs }: { blob: Blob; durationMs: number }) => {
    if (durationMs < VOICE_MIN_MS || blob.size === 0) {
      setStatus({ kind: 'error', message: tr('錄音太短了。按 🎤 說完一句話，再按「完成」。', 'That was too short. Tap 🎤, say a full sentence, then tap “Done”.') });
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus({ kind: 'transcribing' });
    trackAction(`voice.${source}.transcribe_start`);
    try {
      const result = isGuestActive()
        ? await transcribeGuestVoice(blob, durationMs, ctrl.signal)
        : await apiService.transcribeVoice(blob, durationMs, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const text = result.text.trim();
      const quota = usageNote(result.usage as VoiceUsage | undefined);
      if (!text) {
        setStatus({ kind: 'error', message: [tr('沒聽清楚，請靠近麥克風再說一次，或改用打字。', 'Didn\'t catch that. Move closer to the mic and try again, or type instead.'), quota].filter(Boolean).join(' · ') });
        trackAction(`voice.${source}.transcribe_empty`);
        return;
      }
      const el = targetRef.current;
      if (!el) return;
      const truncated = insertIntoTextarea(el, text);
      const note = truncated
        ? tr('已填入，但超過字數上限的部分被截掉了，送出前請檢查。', 'Added — but the part over the length limit was cut off. Check it before sending.')
        : tr('已填入，送出前可以修改', 'Added — you can edit it before sending');
      setStatus({ kind: 'done', note: [note, quota].filter(Boolean).join(' · ') });
      trackAction(`voice.${source}.transcribe_ok`);
    } catch (e) {
      if (ctrl.signal.aborted || (e as Error)?.name === 'AbortError' || (e as { error_code?: string })?.error_code === 'CANCELED') return;
      const err = e as { message?: string; error_code?: string };
      const code = err.error_code || '';
      const cta = code === 'VOICE_DAILY_LIMIT_REACHED' ? 'upgrade' : code === 'GUEST_VOICE_LIMIT' ? 'signup' : undefined;
      const message = code === 'TIMEOUT'
        ? tr('轉文字花太久了，這次沒有完成。請再錄一次，或改用打字。', 'Voice-to-text took too long and didn\'t finish. Please record again, or type instead.')
        : err.message || tr('語音轉文字沒有成功，請再錄一次，或改用打字。', 'Voice-to-text didn\'t work. Please record again, or type instead.');
      setStatus({ kind: 'error', message, cta });
      trackAction(`voice.${source}.transcribe_failed`);
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [source, targetRef]);

  const { recording, elapsedMs, error, start, stop, cancel, clearError } = useVoiceRecorder({ onClip: handleClip });

  useEffect(() => {
    if (error) {
      setStatus({ kind: 'error', message: recorderMessage(error) });
      trackAction(`voice.${source}.recorder_error`);
    }
  }, [error, source]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const begin = () => {
    clearError();
    setStatus({ kind: 'idle' });
    trackAction(`voice.${source}.record_start`);
    void start();
  };

  const cancelTranscribe = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ kind: 'idle' });
  };

  const pill = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium border transition-colors';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} data-testid={`${testId}-voice`}>
      {recording ? (
        <>
          <button
            type="button"
            onClick={stop}
            data-testid={`${testId}-voice-stop`}
            className={`${pill} border-petal-rose-deep bg-petal-rose-deep text-white`}
            aria-label={tr('完成錄音並轉成文字', 'Finish recording and convert to text')}
          >
            <span className="relative flex w-2 h-2" aria-hidden>
              <span className="absolute inline-flex w-full h-full rounded-full bg-white opacity-75 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-white" />
            </span>
            <Square className="w-3 h-3" strokeWidth={2} fill="currentColor" />
            {tr('完成', 'Done')}
            <span className="tabular-nums opacity-90">{fmt(elapsedMs)} / {fmt(VOICE_MAX_MS)}</span>
          </button>
          <button
            type="button"
            onClick={cancel}
            data-testid={`${testId}-voice-cancel`}
            className="inline-flex items-center gap-1 font-body text-xs text-petal-muted hover:text-petal-ink"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
            {tr('取消', 'Cancel')}
          </button>
        </>
      ) : status.kind === 'transcribing' ? (
        <>
          <span className={`${pill} border-petal-rule text-petal-ink-soft bg-white`} data-testid={`${testId}-voice-busy`}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
            {tr('轉成文字中…', 'Converting to text…')}
          </span>
          <button
            type="button"
            onClick={cancelTranscribe}
            className="inline-flex items-center gap-1 font-body text-xs text-petal-muted hover:text-petal-ink"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
            {tr('取消', 'Cancel')}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={begin}
          disabled={disabled}
          data-testid={`${testId}-voice-start`}
          title={tr('用說的：最長 60 秒，中英夾雜也可以', 'Speak instead: up to 60 seconds, mixing languages is fine')}
          className={`${pill} border-petal-rule bg-white text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Mic className="w-3.5 h-3.5" strokeWidth={1.75} />
          {tr('用說的', 'Speak')}
        </button>
      )}

      {!recording && status.kind === 'done' && (
        <span className="font-body text-[11px] text-petal-muted" role="status" data-testid={`${testId}-voice-note`}>
          {status.note}
        </span>
      )}
      {!recording && status.kind === 'error' && (
        <span className="basis-full font-body text-xs text-amber-700" role="alert" data-testid={`${testId}-voice-error`}>
          {status.message}
          {status.cta === 'upgrade' && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('billing:limit-reached', { detail: { error_code: 'VOICE_DAILY_LIMIT_REACHED', message: status.message } }))}
              className="ml-1.5 underline font-medium text-petal-rose-deep"
            >
              {tr('升級 Premium', 'Upgrade to Premium')}
            </button>
          )}
          {status.cta === 'signup' && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('guest:signup', { detail: { source: 'voice' } }))}
              className="ml-1.5 underline font-medium text-petal-rose-deep"
            >
              {tr('免費註冊', 'Sign up free')}
            </button>
          )}
        </span>
      )}
    </div>
  );
}
