import { useState } from 'react';
import { addDays, daysBetween, rhythmForDate, rhythmPhase, type CyclePrediction, type RhythmPhase } from '../utils/cycle';
import type { CycleRecord, DayMood, DayStatus, IntimacyIntention } from '../services/api';
import type { IntimateRecord } from '../App';
import { tr, dateLocale } from '../i18n/tr';
import { RHYTHM_STRIP_BG, RHYTHM_STRIP_HEIGHT, rhythmOffsetLabel, MOOD_OPTIONS, INTENTION_OPTIONS } from './rhythmDisplay';

function phaseLabel(phase: RhythmPhase): string {
  switch (phase) {
    case 'approaching': return tr('逐漸接近預測排卵期', 'Getting closer to the predicted ovulation window');
    case 'near': return tr('接近預測排卵日', 'Close to the predicted ovulation day');
    case 'ovulation': return tr('預測排卵日', 'Predicted ovulation day');
    case 'after': return tr('預測排卵日之後', 'After the predicted ovulation day');
    case 'in_window': return tr('在可能排卵區間內', 'Inside the possible ovulation window');
    default: return '';
  }
}

const moodText = (k: DayMood | null) => {
  const o = MOOD_OPTIONS.find(m => m.key === k);
  return o ? `${o.emoji} ${o.label}` : null;
};
const intentionText = (k: IntimacyIntention | null) => INTENTION_OPTIONS.find(o => o.key === k)?.label ?? null;

const formatDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
};

export type DayStatusPatch = Partial<{ mood: DayMood | null; intimacyIntention: IntimacyIntention | null; sharingEnabled: boolean }>;

interface DayRhythmCardProps {
  date: string;
  todayYmd: string;
  onClose: () => void;
  cycleEnabled: boolean;
  prediction: CyclePrediction | null;
  dayRecords: IntimateRecord[];
  onOpenRecord: (record: IntimateRecord) => void;
  onAddRecord: (date: string) => void;
  periodRecord: CycleRecord | null;
  onDeletePeriod: () => void;
  deletingPeriod: boolean;
  myStatus: DayStatus | null;
  partnerStatus: DayStatus | null;
  partnerConnected: boolean;
  partnerNickname: string;
  onSaveStatus: (date: string, patch: DayStatusPatch) => void;
  onClearStatus: (date: string) => void;
}

// 親密節奏 day card — opened by tapping any calendar day. One modal holds the
// day's cycle estimate, the user's own 每日狀態 (one tap per option, saved
// optimistically by the parent), the partner's status only if THEY shared it,
// and the day's existing records / period entry.
export default function DayRhythmCard({
  date,
  todayYmd,
  onClose,
  cycleEnabled,
  prediction,
  dayRecords,
  onOpenRecord,
  onAddRecord,
  periodRecord,
  onDeletePeriod,
  deletingPeriod,
  myStatus,
  partnerStatus,
  partnerConnected,
  partnerNickname,
  onSaveStatus,
  onClearStatus,
}: DayRhythmCardProps) {
  const [editing, setEditing] = useState(false);
  const isFuture = date > todayYmd;
  const isPast = date < todayYmd;
  const rhythm = cycleEnabled ? rhythmForDate(prediction, date) : null;
  const phase = cycleEnabled ? rhythmPhase(prediction, date) : null;
  const partnerName = partnerNickname || tr('另一半', 'your partner');
  const hasMine = !!myStatus && (myStatus.mood !== null || myStatus.intimacyIntention !== null);
  // Only show the ovulation lines when the day is reasonably near the estimate;
  // a date months away gets its records, not an unrelated reminder.
  const nearPrediction = !!prediction && Math.abs(daysBetween(prediction.ovulation, date)) <= 16;

  const chip = (selected: boolean) =>
    `px-3 py-1.5 min-h-[36px] rounded-full border font-body text-xs text-left transition-colors ${
      selected
        ? 'border-petal-rose-deep bg-petal-rose-soft text-petal-ink'
        : 'border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink'
    }`;

  return (
    <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-petal-cream rounded-md shadow-petal max-w-md w-full max-h-[88vh] overflow-y-auto overscroll-contain border border-petal-rule"
        data-testid="day-rhythm-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex justify-between items-end pb-4 border-b border-petal-rule">
            <div>
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-1" data-testid="day-rhythm-date">
                — {formatDay(date)}
              </div>
              <h3 className="font-display text-2xl font-light tracking-tight text-petal-ink">
                {tr('這一天的', 'This day\'s ')}<em className="not-italic font-light italic text-pink-600">{tr('節奏', 'rhythm')}</em>
              </h3>
            </div>
            <button
              onClick={onClose}
              data-testid="day-rhythm-close"
              aria-label={tr('關閉', 'Close')}
              className="text-petal-muted hover:text-petal-ink text-2xl font-light transition-colors leading-none p-1"
            >
              ×
            </button>
          </div>

          {/* ── 親密節奏 (cycle estimate) ── */}
          {cycleEnabled && (
            <section data-testid="day-rhythm-cycle">
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
                {tr('親密節奏', 'Intimacy rhythm')}
              </div>
              {!prediction ? (
                <p className="font-body text-sm text-petal-ink-soft leading-relaxed" data-testid="day-rhythm-no-data">
                  {tr('還沒有月經紀錄。點「＋ 記錄今天」選「月經」記下一次開始日，就能看到預測排卵日。', 'No period records yet. Tap "+ Record today" and choose "Period" to log a start date, and the predicted ovulation day will appear.')}
                </p>
              ) : (
                <div className="space-y-2">
                  {phase ? (
                    <div className="flex items-center gap-2" data-testid="day-rhythm-phase">
                      {rhythm && (
                        <span className={`inline-block w-6 rounded-full ${RHYTHM_STRIP_BG[rhythm.level]} ${RHYTHM_STRIP_HEIGHT[rhythm.level]}`} aria-hidden="true" />
                      )}
                      <span className="font-display text-lg text-petal-ink">{phaseLabel(phase)}</span>
                    </div>
                  ) : (
                    <p className="font-body text-sm text-petal-ink-soft" data-testid="day-rhythm-phase-none">
                      {tr('這天不在預測排卵日前後。', 'This day isn\'t near the predicted ovulation day.')}
                    </p>
                  )}
                  {nearPrediction && (
                    <dl className="space-y-1.5 font-body text-sm text-petal-ink">
                      <div className="flex justify-between gap-4">
                        <dt className="text-petal-muted">{tr('預測排卵日', 'Predicted ovulation')}</dt>
                        <dd data-testid="day-rhythm-ovulation">{prediction.ovulation}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-petal-muted">{tr('可能排卵區間', 'Possible window')}</dt>
                        <dd className="text-right" data-testid="day-rhythm-window">
                          {prediction.windowStart && prediction.windowEnd
                            ? `${prediction.windowStart} ${tr('～', '–')} ${prediction.windowEnd}`
                            : tr('預測資料有限', 'Limited data')}
                        </dd>
                      </div>
                      {rhythm && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-petal-muted">{tr('相對位置', 'Relative position')}</dt>
                          <dd data-testid="day-rhythm-offset">{rhythmOffsetLabel(rhythm.offset)}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {nearPrediction && prediction.confidence === 'limited' && (
                    <p className="font-body text-xs text-petal-muted leading-relaxed">
                      {tr(`目前只有 ${prediction.completedCycles} 次完整週期，再記錄幾次月經，就能估出你自己的可能排卵區間。`, `Only ${prediction.completedCycles} complete ${prediction.completedCycles === 1 ? 'cycle' : 'cycles'} so far. Log a few more periods to estimate your own possible window.`)}
                    </p>
                  )}
                  {nearPrediction && prediction.confidence === 'variable' && (
                    <p className="font-body text-xs text-petal-muted leading-relaxed">
                      {tr('你的週期長度變化較大，所以區間比較寬。', 'Your cycle length varies quite a bit, so the window is wider.')}
                    </p>
                  )}
                  <p className="font-display italic font-light text-xs text-petal-muted leading-relaxed">
                    {tr('依過去週期推算的參考，不是實際排卵日，也不代表當天的心情或意願。', 'An estimate from past cycles — not a confirmed ovulation day, and not a measure of anyone\'s mood or wishes that day.')}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ── 我的每日狀態 ── */}
          <section className="pt-4 border-t border-petal-rule-soft" data-testid="day-status-section">
            <div className="flex items-center justify-between mb-2">
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted">
                {date === todayYmd ? tr('今日親密意願', 'Today\'s feelings') : tr('這天的親密意願', 'Feelings this day')}
              </div>
              {hasMine && (
                <span className="font-body text-[11px] text-petal-muted" data-testid="day-status-visibility">
                  {myStatus!.sharingEnabled ? tr(`已分享給 ${partnerName}`, `Shared with ${partnerName}`) : tr('只有你看得到', 'Only you can see this')}
                </span>
              )}
            </div>
            <dl className="space-y-1 font-body text-sm text-petal-ink mb-3">
              <div className="flex justify-between gap-4">
                <dt className="text-petal-muted">{tr('心情', 'Mood')}</dt>
                <dd data-testid="day-status-mood">{moodText(myStatus?.mood ?? null) ?? <span className="text-petal-muted">{tr('尚未記錄', 'Not recorded')}</span>}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-petal-muted shrink-0">{tr('親密意願', 'Intimacy')}</dt>
                <dd className="text-right" data-testid="day-status-intention">{intentionText(myStatus?.intimacyIntention ?? null) ?? <span className="text-petal-muted">{tr('尚未記錄', 'Not recorded')}</span>}</dd>
              </div>
            </dl>

            {isFuture ? (
              <p className="font-body text-xs text-petal-muted" data-testid="day-status-future">
                {tr('這天還沒到，到時再記錄你的狀態。', 'This day hasn\'t come yet — record how you feel when it does.')}
              </p>
            ) : !editing ? (
              <button
                type="button"
                data-testid="day-status-open"
                onClick={() => setEditing(true)}
                className="w-full px-4 py-2.5 min-h-[44px] rounded-md bg-petal-ink text-petal-cream font-display italic text-base hover:bg-pink-700 transition-colors"
              >
                {hasMine
                  ? tr('修改這天的狀態', 'Edit this day\'s status')
                  : date === todayYmd ? tr('記錄今日狀態', 'Record today\'s status') : tr('補記這天的狀態', 'Add a status for this day')}
              </button>
            ) : (
              <div className="space-y-4" data-testid="day-status-editor">
                {isPast && (
                  <p className="font-body text-xs text-petal-muted">
                    {tr('補記：寫下你那天實際的感受（是回顧，不是預測）。', 'Looking back: record how you actually felt that day (a recollection, not a prediction).')}
                  </p>
                )}
                <div>
                  <div className="font-body text-xs text-petal-ink-soft mb-1.5">{tr('心情如何？', 'How\'s your mood?')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {MOOD_OPTIONS.map(o => {
                      const selected = myStatus?.mood === o.key;
                      return (
                        <button
                          key={o.key}
                          type="button"
                          aria-pressed={selected}
                          data-testid={`day-status-mood-${o.key}`}
                          onClick={() => onSaveStatus(date, { mood: selected ? null : o.key })}
                          className={chip(selected)}
                        >
                          {o.emoji} {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="font-body text-xs text-petal-ink-soft mb-1.5">{tr('對親密互動的感覺？', 'How do you feel about intimacy?')}</div>
                  <div className="flex flex-col gap-1.5">
                    {INTENTION_OPTIONS.map(o => {
                      const selected = myStatus?.intimacyIntention === o.key;
                      return (
                        <button
                          key={o.key}
                          type="button"
                          aria-pressed={selected}
                          data-testid={`day-status-intention-${o.key}`}
                          onClick={() => onSaveStatus(date, { intimacyIntention: selected ? null : o.key })}
                          className={chip(selected)}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="font-body text-[11px] text-petal-muted mt-1.5">
                    {tr('兩題都可以只答一題，再點一次已選的選項就會取消。', 'Answer one or both. Tap a selected option again to unselect it.')}
                  </p>
                </div>

                {partnerConnected && (
                  <label className={`flex items-start gap-2.5 font-body text-sm ${hasMine ? 'text-petal-ink cursor-pointer' : 'text-petal-muted cursor-not-allowed'}`}>
                    <input
                      type="checkbox"
                      data-testid="day-status-share-toggle"
                      disabled={!hasMine}
                      checked={!!myStatus?.sharingEnabled}
                      onChange={(e) => onSaveStatus(date, { sharingEnabled: e.target.checked })}
                      className="mt-0.5 rounded border-petal-rule text-pink-600 focus:ring-pink-500"
                    />
                    <span>
                      {tr(`分享這天的狀態給 ${partnerName}`, `Share this day's status with ${partnerName}`)}
                      <span className="block text-xs text-petal-muted">
                        {hasMine
                          ? tr('預設只有你看得到；打開才會讓對方看到，隨時可以關掉。', 'Private by default; turn this on to let them see it. You can turn it off any time.')
                          : tr('先選一個心情或意願，才能分享。', 'Pick a mood or feeling first, then you can share it.')}
                      </span>
                    </span>
                  </label>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    data-testid="day-status-done"
                    onClick={() => setEditing(false)}
                    className="flex-[2] px-4 py-2.5 min-h-[44px] rounded-md border border-petal-rule text-petal-ink font-body text-sm hover:bg-petal-cream-2 transition-colors"
                  >
                    {tr('完成', 'Done')}
                  </button>
                  {hasMine && (
                    <button
                      type="button"
                      data-testid="day-status-clear"
                      onClick={() => onClearStatus(date)}
                      className="flex-1 px-4 py-2.5 min-h-[44px] rounded-md text-petal-muted hover:text-red-500 font-body text-sm transition-colors"
                    >
                      {tr('清除紀錄', 'Clear')}
                    </button>
                  )}
                </div>
              </div>
            )}
            {!hasMine && !isFuture && (
              <p className="font-body text-[11px] text-petal-muted mt-2">
                {tr('沒記錄不代表沒有意願，只是還沒說。', 'Not recorded doesn\'t mean "no" — just not said yet.')}
              </p>
            )}
          </section>

          {/* ── 伴侶分享的狀態 (only rows they chose to share reach us) ── */}
          {partnerConnected && partnerStatus && (
            <section className="pt-4 border-t border-petal-rule-soft" data-testid="day-status-partner">
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
                {tr(`${partnerName} 分享的狀態`, `What ${partnerName} shared`)}
              </div>
              <dl className="space-y-1 font-body text-sm text-petal-ink">
                {partnerStatus.mood && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-petal-muted">{tr('心情', 'Mood')}</dt>
                    <dd>{moodText(partnerStatus.mood)}</dd>
                  </div>
                )}
                {partnerStatus.intimacyIntention && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-petal-muted shrink-0">{tr('親密意願', 'Intimacy')}</dt>
                    <dd className="text-right">{intentionText(partnerStatus.intimacyIntention)}</dd>
                  </div>
                )}
              </dl>
              <p className="font-display italic font-light text-xs text-petal-muted mt-2 leading-relaxed">
                {tr('這是 TA 主動分享的感受，不等於同意；親密前，仍以當下彼此確認為準。', 'This is how they chose to share they feel — not consent. Always check in with each other in the moment.')}
              </p>
            </section>
          )}

          {/* ── 這天的紀錄 ── */}
          <section className="pt-4 border-t border-petal-rule-soft space-y-3">
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted">
              {tr('這天的紀錄', 'Records this day')}
            </div>

            {periodRecord && (
              <div className="rounded-md border border-petal-rule bg-petal-cream-2/60 p-3" data-testid="period-day-section">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-body text-sm text-petal-ink">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5 align-middle" aria-hidden="true" />
                    {tr('月經', 'Period')} · {periodRecord.startDate} {tr('～', '–')} {addDays(periodRecord.startDate, periodRecord.lengthDays - 1)}
                    <span className="text-petal-muted"> ({periodRecord.lengthDays} {tr('天', ' days')})</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 mt-2">
                  <span className="font-display italic font-light text-xs text-petal-muted">
                    {tr('標記錯了嗎？', 'Marked by mistake?')}
                  </span>
                  <button
                    type="button"
                    onClick={onDeletePeriod}
                    disabled={deletingPeriod}
                    data-testid="period-day-delete-button"
                    className="px-3 py-2 min-h-[40px] rounded-md bg-red-500 text-white font-body text-xs hover:bg-red-600 transition-colors disabled:opacity-60"
                  >
                    {deletingPeriod ? tr('移除中…', 'Removing…') : tr('取消這次月經', 'Remove this period')}
                  </button>
                </div>
              </div>
            )}

            {dayRecords.length > 0 && (
              <div className="space-y-1" data-testid="day-rhythm-records">
                {dayRecords.map(record => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => onOpenRecord(record)}
                    className="w-full text-left grid grid-cols-[32px_1fr] gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-petal-cream-2/40 transition-colors"
                  >
                    <div className="text-xl opacity-80 saturate-75 leading-none">{record.mood}</div>
                    <div className="min-w-0">
                      <div className="font-display italic font-light text-sm text-petal-muted">{record.time}</div>
                      {record.description && (
                        <p className="font-body text-sm text-petal-ink truncate">{record.description}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!periodRecord && dayRecords.length === 0 && (
              <p className="font-body text-xs text-petal-muted">
                {tr('這天還沒有親密或月經紀錄。', 'No intimacy or period records this day yet.')}
              </p>
            )}

            <button
              type="button"
              data-testid="day-rhythm-add-record"
              onClick={() => onAddRecord(date)}
              className="w-full px-4 py-2.5 min-h-[44px] rounded-md border border-petal-rule text-petal-ink font-body text-sm hover:bg-petal-cream-2 transition-colors"
            >
              {tr('＋ 新增這天的紀錄', '+ Add a record for this day')}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
