import React, { useEffect, useState } from 'react';
import { formatRelativeOrDate } from '../utils/datetime';
import type { MomentReactionKey } from '../services/api';
import type { IntimateRecord } from '../App';

// 快速回應 on a 親密記錄. Keys must match MOMENT_REACTIONS in
// routes/love-moments.js. These exist because a record used to be a row nobody
// could answer: the moment belongs to both people, but only one of them ever
// got to say anything about it.
//
// Words, not emoji. A row of coloured capsules turned every record into a
// control panel; four plain words sit inside the card's own typography and only
// the chosen one takes on any colour at all.
const MOMENT_REACTIONS: { key: MomentReactionKey; label: string }[] = [
  { key: 'love', label: '愛你' },
  { key: 'fire', label: '意猶未盡' },
  { key: 'hug', label: '想再抱一次' },
  { key: 'memorable', label: '很難忘' },
];

const reactionMeta = (key: MomentReactionKey | null | undefined) =>
  MOMENT_REACTIONS.find((r) => r.key === key) || null;

// Matches NOTE_MAX in routes/love-moments.js and the note column in migration 086.
const NOTE_MAX = 80;

export type MomentResponsePatch = { reaction?: MomentReactionKey | null; note?: string | null };

interface MomentResponseBarProps {
  record: IntimateRecord;
  partnerConnected: boolean;
  /** Display name for the other half, used in the "TA 說" line. */
  partnerNickname: string;
  /** 'row' is the compact strip under a list row; 'detail' adds the note editor. */
  variant: 'row' | 'detail';
  /** Sends a partial update. Resolves once the server has reconciled. */
  onRespond: (record: IntimateRecord, patch: MomentResponsePatch) => Promise<void>;
  /** Detail variant only: CTA for the unpaired gate. */
  onInvitePartner?: () => void;
  timezone: string;
}

const MomentResponseBar: React.FC<MomentResponseBarProps> = ({
  record,
  partnerConnected,
  partnerNickname,
  variant,
  onRespond,
  onInvitePartner,
  timezone,
}) => {
  const [busy, setBusy] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState('');

  const mine = record.myResponse ?? null;
  const theirs = record.partnerResponse ?? null;

  // Reopening the editor should start from whatever is saved now, not from a
  // stale draft left over from another record.
  useEffect(() => {
    if (!editingNote) setDraft(mine?.note || '');
  }, [editingNote, mine?.note]);

  // Nothing to respond with, and nobody to respond to. Rather than showing dead
  // chips, the detail view explains why and offers the way out (playbook §R1);
  // the list row stays clean.
  if (!partnerConnected) {
    if (variant === 'row') return null;
    return (
      <div
        className="rounded-md border border-dashed border-petal-rule px-4 py-3"
        data-testid={`moment-response-gate-${record.id}`}
      >
        <p className="font-body text-sm text-petal-ink">還沒配對，這則記錄只有你看得到。</p>
        <p className="font-body text-xs text-petal-ink-soft mt-1 leading-relaxed">
          你還是可以先把心情記下來；配對之後，你們就能互相回應這些時光。
        </p>
        {onInvitePartner && (
          <button
            type="button"
            onClick={onInvitePartner}
            data-testid={`moment-response-invite-${record.id}`}
            className="mt-3 px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition"
          >
            邀請另一半
          </button>
        )}
      </div>
    );
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const send = async (patch: MomentResponsePatch) => {
    setBusy(true);
    try {
      await onRespond(record, patch);
    } finally {
      setBusy(false);
    }
  };

  const toggleReaction = (key: MomentReactionKey) => send({ reaction: key });

  // One quiet line, and only four things in it. The underline is reserved for
  // "this one is chosen" — nothing else in this row is allowed to wear it.
  // There is deliberately no 說一句 link here: at 390px the list row gives this
  // strip 254px, which the four words fill, and tapping anywhere else on the
  // record already opens the detail view where the sentence gets written.
  const chips = (
    <div className="flex flex-wrap items-center gap-x-4">
      {MOMENT_REACTIONS.map(({ key, label }) => {
        const active = mine?.reaction === key;
        return (
          <button
            key={key}
            type="button"
            onClick={(e) => { stop(e); void toggleReaction(key); }}
            disabled={busy}
            aria-pressed={active}
            data-testid={`moment-reaction-${key}-${record.id}`}
            // py-2 is for the finger, not the eye: a bare word is an easy tap
            // to miss. The rule goes on the inner span so it hugs the text
            // instead of floating below the padding.
            className={`py-2 font-body text-[13px] transition-colors disabled:opacity-50 ${
              active ? 'text-petal-rose-deep' : 'text-petal-ink-soft hover:text-petal-ink'
            }`}
          >
            <span className={active ? 'border-b border-petal-rose-deep pb-0.5' : ''}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );

  // One saved response, rendered the same way whoever left it.
  const responsePill = (response: NonNullable<typeof mine>, who: string, testId: string) => {
    const meta = reactionMeta(response.reaction);
    return (
      <div
        className="inline-flex items-baseline gap-1.5 rounded-full bg-petal-rose-soft/50 px-3 py-1 max-w-full"
        data-testid={testId}
      >
        <span className="font-body text-xs text-petal-rose-deep truncate">
          {response.note ? `${who}：${response.note}` : `${who}給了一個「${meta?.label ?? '心意'}」`}
        </span>
        <span className="font-body text-[11px] text-petal-muted whitespace-nowrap">
          · {formatRelativeOrDate(response.updated_at, timezone, { month: 'short', day: 'numeric' })}
        </span>
      </div>
    );
  };

  const theirName = theirs?.nickname || partnerNickname || '對方';

  if (variant === 'row') {
    // No onClick={stop} on the wrapper: only the four words swallow the tap.
    // Everywhere else here — the gaps, the saved-response pill — falls through
    // to the row and opens the record, which is where a sentence gets written.
    return (
      <div className="mt-2 space-y-1.5">
        {(theirs || mine) && (
          <div className="flex flex-wrap gap-1.5">
            {theirs && responsePill(theirs, theirName, `moment-response-partner-${record.id}`)}
            {mine?.note && responsePill(mine, '你', `moment-response-mine-${record.id}`)}
          </div>
        )}
        {chips}
      </div>
    );
  }

  const overLimit = [...draft.trim()].length > NOTE_MAX;

  return (
    <div className="space-y-3" data-testid={`moment-response-detail-${record.id}`}>
      {theirs && (
        <div className="flex flex-wrap gap-1.5">
          {responsePill(theirs, theirName, `moment-response-partner-${record.id}`)}
        </div>
      )}

      {chips}

      {editingNote ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={NOTE_MAX}
            rows={2}
            autoFocus
            placeholder="想說一句什麼？"
            data-testid={`moment-note-input-${record.id}`}
            className="w-full rounded-md border border-petal-rule bg-petal-cream px-3 py-2 font-body text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="font-body text-[11px] text-petal-muted">
              {[...draft.trim()].length}/{NOTE_MAX}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingNote(false)}
                className="font-body text-xs text-petal-muted hover:text-petal-ink transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy || overLimit}
                onClick={async () => {
                  setEditingNote(false);
                  await send({ note: draft.trim() });
                }}
                data-testid={`moment-note-submit-${record.id}`}
                className="px-3 py-1.5 rounded-full bg-petal-rose-deep text-white font-body text-xs font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
              >
                送出
              </button>
            </div>
          </div>
        </div>
      ) : mine?.note ? (
        <div className="flex items-start justify-between gap-3">
          <p
            className="font-display italic font-light text-sm text-petal-ink-soft pl-3 border-l border-petal-rose-soft leading-relaxed min-w-0"
            data-testid={`moment-note-mine-${record.id}`}
          >
            "{mine.note}"
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="font-body text-xs text-petal-muted hover:text-petal-ink transition-colors"
            >
              編輯
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send({ note: '' })}
              className="font-body text-xs text-petal-muted hover:text-red-500 transition-colors disabled:opacity-50"
            >
              清除
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditingNote(true)}
          data-testid={`moment-note-open-${record.id}`}
          className="font-body text-[13px] text-petal-muted hover:text-petal-rose-deep transition-colors"
        >
          說一句（{NOTE_MAX} 字以內）
        </button>
      )}
    </div>
  );
};

export default MomentResponseBar;
