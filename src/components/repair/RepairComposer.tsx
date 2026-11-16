import { useMemo, useState } from 'react';
import { X, Send, Copy, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { apiService } from '../../services/api';
import type { RepairAttempt, RepairKind } from '../../services/api';
import { patchRepairOverview as patchOverview } from './repairData';
import { trackAction } from '../../utils/track';
import type { Notification } from '../../App';
import { tr } from '../../i18n/tr';
import { REPAIR_KINDS, repairKindCopy, wordingHint } from './repairCopy';

// 回頭接住 composer — write one short line to your partner after a fight.
//
// Submit returns instantly (playbook §R7): the sheet closes, the note shows on
// 首頁 right away, and the request runs in the background. A failure keeps the
// draft (module-level, this tab only) so reopening the composer brings it back.

let failedDraft: { kind: RepairKind; text: string } | null = null;

const MAX = 500;

interface Props {
  paired: boolean;
  partnerName: string;
  /** The 冷靜後提醒我 row this note answers, if any. */
  reminderId?: string | null;
  onClose: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
  onInvitePartner?: () => void;
  /** Where the user opened it from, for logging. */
  source: 'home' | 'reminder' | 'reply' | 'events';
}

export default function RepairComposer({
  paired,
  partnerName,
  reminderId,
  onClose,
  showNotification,
  onInvitePartner,
  source,
}: Props) {
  useScrollLock(true);
  const [kind, setKind] = useState<RepairKind>(failedDraft?.kind || 'validate');
  const [text, setText] = useState<string>(failedDraft?.text || repairKindCopy('validate').template);
  const [why, setWhy] = useState(false);
  const hint = useMemo(() => wordingHint(text), [text]);
  const copy = repairKindCopy(kind);

  const pickKind = (k: RepairKind) => {
    // Swap the template only while the user hasn't written their own words.
    const untouched = !text.trim() || REPAIR_KINDS.some((c) => c.template === text);
    setKind(k);
    if (untouched) setText(repairKindCopy(k).template);
    trackAction(`repair.kind.${k}`);
  };

  const trimmed = text.trim();
  const tooLong = trimmed.length > MAX;
  const canSubmit = !!trimmed && !tooLong;

  const send = () => {
    if (!canSubmit) return;
    const draft = { kind, text: trimmed };
    failedDraft = null;
    trackAction(`repair.send.${source}`);

    // Optimistic: show it on 首頁 straight away.
    const tempId = `pending-${Date.now()}`;
    const optimistic: RepairAttempt = {
      id: tempId, status: 'sent', direction: 'outgoing', kind, text: trimmed,
      remind_at: null, reminded_at: null, sent_at: new Date().toISOString(),
      response: null, response_note: null, responded_at: null, created_at: new Date().toISOString(),
    };
    patchOverview((prev) => ({
      ...prev,
      reminders: reminderId ? prev.reminders.filter((r) => r.id !== reminderId) : prev.reminders,
      notes: [optimistic, ...prev.notes],
      stats: { ...prev.stats, sent: prev.stats.sent + 1 },
    }));
    onClose();
    showNotification({
      type: 'success',
      title: tr('小紙條送出了', 'Note sent'),
      message: tr(`${partnerName}會收到通知。不用急著等回應，你已經踏出修復的第一步了。`, `${partnerName} will get a notification. No need to wait for a reply — you've already taken the first step.`),
    });

    apiService.sendRepair({ ...draft, reminderId })
      .then((saved) => patchOverview((prev) => ({ ...prev, notes: prev.notes.map((n) => (n.id === tempId ? saved : n)) })))
      .catch((err: { message?: string; error_code?: string }) => {
        if (err?.error_code === 'TIMEOUT') {
          // A write that timed out may well have gone through — don't invite a duplicate.
          showNotification({
            type: 'info',
            title: tr('網路有點慢', 'The connection is slow'),
            message: tr('小紙條可能已經送出了。等一下回到首頁看看，先不要重送。', 'Your note may already have been sent. Check 今天 again in a moment before resending.'),
          });
          return;
        }
        failedDraft = draft;
        patchOverview((prev) => ({
          ...prev,
          notes: prev.notes.filter((n) => n.id !== tempId),
          stats: { ...prev.stats, sent: Math.max(0, prev.stats.sent - 1) },
        }));
        const limit = err?.error_code === 'REPAIR_DAILY_LIMIT';
        showNotification({
          type: limit ? 'warning' : 'error',
          title: limit ? tr('今天先送到這裡', 'That\'s enough for today') : tr('小紙條沒有送出去', 'The note wasn\'t sent'),
          message: err?.message || tr('你寫的內容還在，再按一次「寫一句給 TA」就會帶回來。', 'What you wrote is saved — tap "Write them a line" again to bring it back.'),
        });
      });
  };

  const copyText = async () => {
    trackAction('repair.copy_unpaired');
    try {
      await navigator.clipboard.writeText(trimmed);
      showNotification({
        type: 'success',
        title: tr('已複製', 'Copied'),
        message: tr('貼到 LINE 傳給 TA 吧。配對之後，小紙條就能直接送到 TA 的 Twogether。', 'Paste it into LINE and send it. Once you pair, notes go straight to their Twogether.'),
      });
      onClose();
    } catch {
      showNotification({
        type: 'warning',
        title: tr('沒辦法自動複製', 'Couldn\'t copy automatically'),
        message: tr('請長按文字框選取文字，手動複製後再傳給 TA。', 'Long-press the text box to select the text, copy it, then send it.'),
      });
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-testid="repair-composer"
      role="dialog"
      aria-modal="true"
      aria-label={tr('回頭接住', 'Circle back')}
    >
      <div className="bg-petal-cream w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[min(92vh,calc(100dvh-24px))] overflow-y-auto p-4 sm:p-5 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted">
              {tr('回頭接住', 'Circle back')}
            </div>
            <h3 className="font-display text-xl text-petal-ink leading-snug">
              {tr(`冷靜之後，對${partnerName}說一句`, `Now that you've cooled down, say one thing to ${partnerName}`)}
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label={tr('關閉', 'Close')} className="text-petal-muted hover:text-petal-ink p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setWhy((v) => !v)}
          data-testid="repair-why-toggle"
          className="inline-flex items-center gap-1 font-body text-[12px] text-petal-muted hover:text-petal-ink underline underline-offset-2"
        >
          {tr('吵完一段時間了，現在說還有用嗎？', 'It\'s been a while since the fight — does it still help?')}
          {why ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {why && (
          <div className="rounded-xl bg-white border border-petal-rule px-3.5 py-3 space-y-2 font-body text-[13px] text-petal-ink leading-relaxed" data-testid="repair-why">
            <p>
              {tr(
                '婚姻研究者 John Gottman 觀察大量夫妻後發現：關係能不能長久，關鍵不在會不會吵架，而在吵完之後有沒有人做「修復嘗試」——一句話、一個笑容，把關係輕輕拉回來。',
                'After observing thousands of couples, researcher John Gottman found that what predicts a lasting relationship isn\'t whether you fight, but whether someone makes a "repair attempt" afterwards — a word or a smile that gently pulls you back together.',
              )}
            </p>
            <p>
              {tr(
                '生氣的當下很難釋出善意，這很正常。但一小時後、甚至隔天的同理，一樣有價值。說「你會那樣生氣，是有原因的」不是認輸，而是告訴對方：我願意開始理解你的感受。',
                'It\'s hard to be kind in the heat of the moment — that\'s normal. But empathy an hour or even a day later still counts. Saying "it makes sense you were that upset" isn\'t losing; it tells them: I\'m willing to start understanding how you feel.',
              )}
            </p>
            <p className="text-petal-muted">
              {tr(
                '如果每次都停在「算了，不講了」，沒被理解的感覺會慢慢累積，變成「他根本不重視我的感受」。',
                'If every fight ends at "forget it", the feeling of not being understood quietly piles up into "they never care how I feel".',
              )}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={tr('想說的方式', 'How you\'d like to say it')}>
          {REPAIR_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={kind === k.kind}
              onClick={() => pickKind(k.kind)}
              data-testid={`repair-kind-${k.kind}`}
              className={`rounded-full border px-3 py-1.5 font-body text-[13px] transition-colors ${
                kind === k.kind
                  ? 'bg-petal-ink text-petal-cream border-petal-ink'
                  : 'bg-white text-petal-ink border-petal-rule hover:border-petal-ink'
              }`}
            >
              <span aria-hidden>{k.emoji}</span> {k.label}
            </button>
          ))}
        </div>
        <p className="font-body text-[12px] text-petal-muted leading-relaxed">{copy.why}</p>

        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={MAX + 50}
            data-testid="repair-text"
            aria-label={tr('想對 TA 說的話', 'What you want to say')}
            className="w-full rounded-xl border border-petal-rule bg-white px-3.5 py-3 font-body text-[15px] text-petal-ink leading-relaxed focus:border-petal-ink focus:ring-0"
          />
          <div className={`mt-1 text-right font-body text-[11px] ${tooLong ? 'text-petal-rose-deep' : 'text-petal-muted'}`}>
            {trimmed.length} / {MAX}
          </div>
        </div>

        {hint && (
          <div className="flex gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 font-body text-[12.5px] text-amber-900 leading-relaxed" data-testid="repair-wording-hint">
            <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{hint}</span>
          </div>
        )}

        {!paired && (
          <p className="font-body text-[12.5px] text-petal-muted leading-relaxed" data-testid="repair-unpaired-note">
            {tr(
              '你們還沒在 Twogether 配對，所以小紙條還不能直接送達。先複製這句話用 LINE 傳給 TA；配對之後，TA 就能直接回你「被接住了」。',
              'You\'re not paired on Twogether yet, so the note can\'t be delivered directly. Copy it and send it on LINE for now; once you pair, they can answer "I feel understood" right here.',
            )}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            data-testid="repair-later"
            className="rounded-full border border-petal-rule px-4 py-2 font-body text-[13px] text-petal-ink hover:bg-white"
          >
            {tr('稍後再說', 'Maybe later')}
          </button>
          {paired ? (
            <button
              type="button"
              onClick={send}
              disabled={!canSubmit}
              data-testid="repair-send"
              className="inline-flex items-center gap-1.5 rounded-full bg-petal-ink px-4 py-2 font-body text-[13px] font-medium text-petal-cream hover:bg-petal-ink/85 disabled:opacity-40"
            >
              <Send className="w-4 h-4" /> {tr(`送給${partnerName}`, `Send to ${partnerName}`)}
            </button>
          ) : (
            <>
              {onInvitePartner && (
                <button
                  type="button"
                  onClick={() => { onClose(); onInvitePartner(); }}
                  data-testid="repair-invite"
                  className="rounded-full border border-petal-rule px-4 py-2 font-body text-[13px] text-petal-ink hover:bg-white"
                >
                  {tr('邀請 TA 配對', 'Invite them to pair')}
                </button>
              )}
              <button
                type="button"
                onClick={copyText}
                disabled={!canSubmit}
                data-testid="repair-copy"
                className="inline-flex items-center gap-1.5 rounded-full bg-petal-ink px-4 py-2 font-body text-[13px] font-medium text-petal-cream hover:bg-petal-ink/85 disabled:opacity-40"
              >
                <Copy className="w-4 h-4" /> {tr('複製這句話', 'Copy this line')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
