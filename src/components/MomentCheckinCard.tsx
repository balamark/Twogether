import { useState } from 'react';
import { Heart, X } from 'lucide-react';
import type { IntimateRecord } from '../App';
import type { MomentCheckin, MomentCheckinAnswer } from '../services/api';
import { tr } from '../i18n/tr';
import { SATISFACTION_OPTIONS, LIKED_OPTIONS, TIMING_OPTIONS, likedLabel, timingLabel, satisfactionMeta } from './momentCheckinOptions';

// 感受小調查 — "剛剛的感覺如何？". Two hours after one partner records a
// moment, the other half gets a notification and this card on the calendar.
// Ten seconds, one required tap (整體感覺); everything else is optional. The
// answers feed 滿意度 / 最喜歡 / 最佳時段 in the stats below the calendar.
//
// Options + labels: ./momentCheckinOptions.ts (keys match lib/momentCheckins.js).

// Matches NOTE_MAX in lib/momentCheckins.js / the note column in migration 117.
const NOTE_MAX = 80;

const chip = (on: boolean) =>
  `px-3 py-1.5 rounded-full border font-body text-xs transition-colors ${
    on
      ? 'border-petal-rose-deep bg-petal-rose-soft/40 text-petal-rose-deep'
      : 'border-petal-rule bg-white text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink'
  }`;

interface MomentCheckinCardProps {
  record: IntimateRecord;
  /** Who recorded it (shown in the intro line). */
  recorderNickname: string;
  /** Returns at once; the parent saves optimistically and rolls back on failure. */
  onSubmit: (record: IntimateRecord, answer: MomentCheckinAnswer) => void;
  /** 這次不填 — closes it for good. */
  onDismiss: (record: IntimateRecord) => void;
  /** 稍後再說 — hides it for this session only. */
  onLater: (record: IntimateRecord) => void;
}

export function MomentCheckinCard({ record, recorderNickname, onSubmit, onDismiss, onLater }: MomentCheckinCardProps) {
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [liked, setLiked] = useState<string[]>([]);
  const [timing, setTiming] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const toggleLiked = (key: string) =>
    setLiked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const submit = () => {
    if (satisfaction === null) return;
    onSubmit(record, { satisfaction, liked, timing, note: note.trim() || null });
  };

  return (
    <section
      className="rounded-md border border-petal-rose-soft bg-gradient-to-b from-petal-rose-soft/25 to-white p-5 sm:p-6 space-y-5"
      data-testid="moment-checkin-card"
      data-record-api-id={record.apiId}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-medium tracking-tight text-petal-ink flex items-center gap-2">
            <Heart className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.75} />
            {tr('剛剛的感覺如何？', 'How was it just now?')}
          </h3>
          <p className="mt-1 font-body text-xs text-petal-muted leading-relaxed">
            {tr(
              `${recorderNickname} 記下了 ${record.date} ${record.time} 的親密時光。花 10 秒說說，下次可以照著來；只有你們兩個看得到。`,
              `${recorderNickname} logged your moment on ${record.date} at ${record.time}. Take 10 seconds so next time can be just as good. Only the two of you can see this.`,
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(record)}
          data-testid="moment-checkin-dismiss"
          className="shrink-0 p-1 text-petal-muted hover:text-petal-ink"
          aria-label={tr('這次不填', 'Skip this one')}
          title={tr('這次不填', 'Skip this one')}
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      <div>
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
          {tr('整體感覺', 'Overall')}
        </div>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={tr('整體感覺', 'Overall')}>
          {SATISFACTION_OPTIONS.map((o) => {
            const on = satisfaction === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSatisfaction(o.value)}
                data-testid={`moment-checkin-satisfaction-${o.value}`}
                className={`flex flex-col items-center gap-1 py-2 rounded-md border transition-all ${
                  on ? 'border-petal-rose-deep bg-white shadow-sm scale-[1.03]' : 'border-transparent bg-white/60 hover:bg-white'
                }`}
              >
                <span className={`text-2xl leading-none ${on ? '' : 'grayscale-[40%] opacity-80'}`} aria-hidden="true">{o.emoji}</span>
                <span className={`font-body text-[11px] ${on ? 'text-petal-rose-deep font-medium' : 'text-petal-muted'}`}>{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
          {tr('哪裡最喜歡？下次可以再來（可複選）', 'What did you like? Worth doing again (pick any)')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LIKED_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={liked.includes(o.key)}
              onClick={() => toggleLiked(o.key)}
              data-testid={`moment-checkin-liked-${o.key}`}
              className={chip(liked.includes(o.key))}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
          {tr('這個時間點呢？', 'How was the timing?')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TIMING_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={timing === o.key}
              onClick={() => setTiming((t) => (t === o.key ? null : o.key))}
              data-testid={`moment-checkin-timing-${o.key}`}
              className={chip(timing === o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <input
          type="text"
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder={tr('想對 TA 說一句（選填）', 'Anything to tell them? (optional)')}
          data-testid="moment-checkin-note"
          className="w-full px-3 py-2 rounded-md border border-petal-rule bg-white font-body text-sm focus:ring-2 focus:ring-petal-rose-soft focus:border-petal-rose-deep"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={satisfaction === null}
          data-testid="moment-checkin-submit"
          className="px-5 py-2 rounded-full bg-petal-rose-deep text-white font-body text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {tr('送出感受', 'Share how it felt')}
        </button>
        <button
          type="button"
          onClick={() => onLater(record)}
          data-testid="moment-checkin-later"
          className="font-body text-xs text-petal-muted hover:text-petal-ink"
        >
          {tr('稍後再說', 'Maybe later')}
        </button>
        {satisfaction === null && (
          <span className="font-body text-[11px] text-petal-muted">{tr('選一個整體感覺就能送出', 'Pick an overall feeling to send')}</span>
        )}
      </div>
    </section>
  );
}

/** One-line read-out of an answered check-in, for the timeline row. */
export function CheckinSummary({ checkin, who }: { checkin: MomentCheckin | null | undefined; who: string }) {
  if (!checkin?.answered_at || !checkin.satisfaction) return null;
  const s = satisfactionMeta(checkin.satisfaction);
  const t = timingLabel(checkin.timing);
  return (
    <div className="mt-2 font-body text-xs text-petal-ink-soft leading-relaxed" data-testid="moment-checkin-summary">
      <span className="text-petal-muted">{who}</span>{' '}
      <span aria-hidden="true">{s?.emoji}</span> {s?.label}
      {checkin.liked && checkin.liked.length > 0 && (
        <> · {tr('最喜歡', 'Liked')} {checkin.liked.map(likedLabel).join(tr('、', ', '))}</>
      )}
      {t && <> · {t}</>}
      {checkin.note && <span className="block font-display italic text-petal-ink-soft">“{checkin.note}”</span>}
    </div>
  );
}
