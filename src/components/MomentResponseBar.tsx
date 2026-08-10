import React, { useEffect, useState } from 'react';
import { formatRelativeOrDate } from '../utils/datetime';
import type { MomentReactionKey } from '../services/api';
import type { IntimateRecord } from '../App';

// 快速回應 on a 親密記錄. Keys must match MOMENT_REACTIONS in
// routes/love-moments.js. These exist because a record used to be a row nobody
// could answer: the moment belongs to both people, but only one of them ever
// got to say anything about it.
const MOMENT_REACTIONS: { key: MomentReactionKey; emoji: string; label: string }[] = [
  { key: 'love', emoji: '❤️', label: '愛你' },
  { key: 'sweet', emoji: '🥰', label: '好甜' },
  { key: 'fire', emoji: '🔥', label: '意猶未盡' },
  { key: 'hug', emoji: '🫂', label: '想再抱一次' },
  { key: 'memorable', emoji: '✨', label: '很難忘' },
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
  /** Row variant only: jump into the detail modal to write a sentence. */
  onOpenDetail?: (record: IntimateRecord) => void;
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
  onOpenDetail,
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

  const chips = (
    <div className="flex flex-wrap items-center gap-1.5">
      {MOMENT_REACTIONS.map(({ key, emoji, label }) => {
        const active = mine?.reaction === key;
        return (
          <button
            key={key}
            type="button"
            onClick={(e) => { stop(e); void toggleReaction(key); }}
            disabled={busy}
            aria-pressed={active}
            aria-label={label}
            data-testid={`moment-reaction-${key}-${record.id}`}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-body text-[11px] transition-colors disabled:opacity-50 ${
              active
                ? 'bg-petal-rose-soft/50 text-petal-rose-deep'
                : 'border border-petal-rule text-petal-ink-soft hover:border-petal-rose hover:text-petal-ink'
            }`}
          >
            <span aria-hidden>{emoji}</span>
            {label}
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
        {meta && <span aria-hidden>{meta.emoji}</span>}
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
    return (
      <div className="mt-3 space-y-2" onClick={stop}>
        {(theirs || mine) && (
          <div className="flex flex-wrap gap-1.5">
            {theirs && responsePill(theirs, theirName, `moment-response-partner-${record.id}`)}
            {mine?.note && responsePill(mine, '你', `moment-response-mine-${record.id}`)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {chips}
          {onOpenDetail && (
            <button
              type="button"
              onClick={(e) => { stop(e); onOpenDetail(record); }}
              data-testid={`moment-response-say-${record.id}`}
              className="font-body text-[11px] text-petal-muted hover:text-petal-rose-deep underline underline-offset-2 transition-colors"
            >
              {mine?.note ? '改一句' : '＋ 說一句'}
            </button>
          )}
        </div>
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
          className="font-body text-xs text-petal-muted hover:text-petal-rose-deep underline underline-offset-2 transition-colors"
        >
          ＋ 說一句（{NOTE_MAX} 字以內）
        </button>
      )}
    </div>
  );
};

export default MomentResponseBar;
