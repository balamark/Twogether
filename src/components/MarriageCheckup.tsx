import { useEffect, useState } from 'react';
import { ClipboardCheck, HeartHandshake, Loader2, Send, Sparkles, Clock, Check } from 'lucide-react';
import apiService, {
  type MarriageCheckup as Checkup,
  type MarriageCheckupAnswers,
} from '../services/api';
import {
  CHECKUP_DIMENSIONS,
  SCORE_LABELS,
  GRATITUDE_PROMPT,
  GRATITUDE_HINT,
  ATTENTION_PROMPT,
  ATTENTION_HINT,
  emptyCheckupAnswers,
} from '../data/marriageCheckup';
import type { Notification } from '../App';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateTime } from '../utils/datetime';

interface MarriageCheckupProps {
  showNotification: (n: Omit<Notification, 'id'>) => void;
  partnerConnected: boolean;
}

// Module-scope so its identity is stable across renders — defining it inside the
// component would remount the whole subtree (and drop input focus) every render.
function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <section id="conflict-checkup" className="scroll-mt-20">
      <header className="mb-5">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 婚姻檢查
        </div>
        <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-2">
          每隔一段時間，<em className="not-italic font-light italic text-pink-600">盤點一次我們</em>
        </h3>
        <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
          各自誠實回答幾個問題：哪裡還不錯、哪裡卡住了、哪裡需要關注。兩個人都完成後一起揭曉，
          AI 會像個中立的第三方，幫你們把話攤開來看清楚。
        </p>
      </header>
      {children}
    </section>
  );
}

// "婚姻檢查" — a periodic, structured relationship review. Both partners answer
// the same questions independently; answers are revealed side-by-side only once
// both have submitted, alongside an AI "neutral third party" summary.
export default function MarriageCheckup({ showNotification, partnerConnected }: MarriageCheckupProps) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkup, setCheckup] = useState<Checkup | null>(null);
  const [draft, setDraft] = useState<MarriageCheckupAnswers>(emptyCheckupAnswers());
  const tz = useTimezone();

  useEffect(() => {
    if (!partnerConnected) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiService
      .getMarriageCheckup()
      .then((c) => {
        if (!cancelled) setCheckup(c);
      })
      .catch(() => {
        /* non-fatal — the section just shows the intro */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [partnerConnected]);

  const setScore = (dimId: string, score: number) =>
    setDraft((d) => ({ ...d, scores: { ...d.scores, [dimId]: score } }));
  const setNote = (dimId: string, note: string) =>
    setDraft((d) => ({ ...d, notes: { ...d.notes, [dimId]: note } }));

  const allScored = CHECKUP_DIMENSIONS.every((d) => draft.scores[d.id] != null);

  const start = async () => {
    setBusy(true);
    try {
      const c = await apiService.startMarriageCheckup();
      setCheckup(c);
      setDraft(emptyCheckupAnswers());
    } catch (err) {
      showNotification({
        type: 'error',
        title: '無法開始',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!checkup) return;
    if (!allScored) {
      showNotification({
        type: 'warning',
        title: '還有題目沒填',
        message: '請先為每個面向選一個分數，再送出。',
      });
      return;
    }
    setBusy(true);
    try {
      const updated = await apiService.submitMarriageCheckupResponse(checkup.id, draft);
      setCheckup(updated);
      showNotification({
        type: 'success',
        title: updated.status === 'revealed' ? '雙方都完成了！' : '已送出',
        message:
          updated.status === 'revealed'
            ? '一起看看彼此的答案與 AI 的中立總結吧。'
            : '等另一半也完成後，就會一起揭曉。',
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: '送出失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setBusy(false);
    }
  };

  // Begin a fresh cycle after a revealed one.
  const startAnother = async () => {
    setBusy(true);
    try {
      const c = await apiService.startMarriageCheckup();
      setCheckup(c);
      setDraft(emptyCheckupAnswers());
    } catch (err) {
      showNotification({
        type: 'error',
        title: '無法開始',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SectionShell>
        <div className="bg-white rounded-md border border-petal-rule p-6 text-center text-petal-ink-soft">
          載入中…
        </div>
      </SectionShell>
    );
  }

  if (!partnerConnected) {
    return (
      <SectionShell>
        <div className="bg-white rounded-md border border-petal-rule p-6 text-center text-petal-ink-soft text-sm">
          婚姻檢查需要兩個人一起完成，配對伴侶後就能開始。
        </div>
      </SectionShell>
    );
  }

  // Revealed → side-by-side reveal + AI summary.
  if (checkup && checkup.status === 'revealed') {
    return (
      <SectionShell>
        <RevealView checkup={checkup} tz={tz} onStartAnother={startAnother} busy={busy} />
      </SectionShell>
    );
  }

  // Collecting + I've submitted → waiting for partner.
  if (checkup && checkup.status === 'collecting' && checkup.mySubmitted) {
    return (
      <SectionShell>
        <div className="bg-petal-sage/10 border border-petal-sage/40 rounded-md p-6 text-center">
          <Clock className="w-7 h-7 text-petal-sage-deep mx-auto mb-3" strokeWidth={1.5} />
          <p className="font-display text-lg text-petal-ink mb-1">你已經完成了 ✅</p>
          <p className="font-body text-sm text-petal-ink-soft">
            等另一半也完成這次的婚姻檢查，就會一起揭曉雙方的答案與 AI 總結。
          </p>
        </div>
      </SectionShell>
    );
  }

  // No checkup yet → intro + start.
  if (!checkup) {
    return (
      <SectionShell>
        <div className="bg-white rounded-md border border-petal-rule p-6 text-center">
          <ClipboardCheck className="w-8 h-8 text-petal-rose-deep mx-auto mb-3" strokeWidth={1.5} />
          <p className="font-body text-sm text-petal-ink-soft mb-4 max-w-md mx-auto leading-relaxed">
            研究發現，定期、有系統地一起檢視關係，能提升親密感與滿意度。花幾分鐘，誠實地為這段關係打打分數吧。
          </p>
          <button
            type="button"
            data-testid="checkup-start"
            onClick={start}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-petal-ink text-petal-cream font-body text-sm font-medium hover:bg-pink-700 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
            開始婚姻檢查
          </button>
        </div>
      </SectionShell>
    );
  }

  // Collecting + I haven't submitted → the questionnaire.
  return (
    <SectionShell>
      <div className="space-y-4">
        {checkup.partnerSubmitted && (
          <div className="bg-petal-rose/10 border border-petal-rose/30 rounded-md px-4 py-2.5 text-sm text-petal-ink-soft">
            另一半已經完成了，換你了 — 填完就能一起揭曉。
          </div>
        )}

        {CHECKUP_DIMENSIONS.map((d) => (
          <div key={d.id} className="bg-white rounded-md border border-petal-rule p-4">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-lg">{d.emoji}</span>
              <span className="font-display text-base font-medium text-petal-ink">{d.label}</span>
            </div>
            <p className="font-body text-sm text-petal-ink mb-1">{d.question}</p>
            <p className="font-body text-xs text-petal-muted mb-3">{d.hint}</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = draft.scores[d.id] === n;
                return (
                  <button
                    key={n}
                    type="button"
                    data-testid={`checkup-score-${d.id}-${n}`}
                    onClick={() => setScore(d.id, n)}
                    className={`flex-1 min-w-[56px] px-2 py-1.5 rounded-lg border text-xs transition-colors ${
                      active
                        ? 'border-pink-400 bg-pink-50 text-pink-700'
                        : 'border-petal-rule bg-white text-petal-ink-soft hover:border-pink-200'
                    }`}
                  >
                    <div className="font-medium">{n}</div>
                    <div className="text-[10px] leading-tight">{SCORE_LABELS[n]}</div>
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={draft.notes[d.id] || ''}
              onChange={(e) => setNote(d.id, e.target.value)}
              placeholder="想補充的話（可不填）"
              maxLength={300}
              className="w-full px-3 py-2 rounded-lg border border-petal-rule bg-white text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep"
            />
          </div>
        ))}

        {/* Gratitude — the heart of the check-up */}
        <div className="bg-petal-rose/10 rounded-md border border-petal-rose/30 p-4">
          <label className="block font-display text-base font-medium text-petal-ink mb-1">
            💗 {GRATITUDE_PROMPT}
          </label>
          <p className="font-body text-xs text-petal-muted mb-2">{GRATITUDE_HINT}</p>
          <textarea
            value={draft.gratitude}
            onChange={(e) => setDraft((d) => ({ ...d, gratitude: e.target.value }))}
            rows={3}
            maxLength={2000}
            placeholder="例如：謝謝你每天都記得倒垃圾、會在我累的時候泡杯茶給我…"
            className="w-full px-3 py-2 rounded-lg border border-petal-rule bg-white text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
        </div>

        {/* One thing to work on */}
        <div className="bg-white rounded-md border border-petal-rule p-4">
          <label className="block font-display text-base font-medium text-petal-ink mb-1">
            🎯 {ATTENTION_PROMPT}
          </label>
          <p className="font-body text-xs text-petal-muted mb-2">{ATTENTION_HINT}</p>
          <textarea
            value={draft.attention}
            onChange={(e) => setDraft((d) => ({ ...d, attention: e.target.value }))}
            rows={2}
            maxLength={2000}
            placeholder="挑一件你最在意的…"
            className="w-full px-3 py-2 rounded-lg border border-petal-rule bg-white text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
        </div>

        <button
          type="button"
          data-testid="checkup-submit"
          onClick={submit}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-petal-ink text-petal-cream font-body text-sm font-medium hover:bg-pink-700 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          送出我的答案
        </button>
        <p className="font-body text-xs text-petal-muted text-center">
          你的答案會先保密，等另一半也完成後才一起揭曉。
        </p>
      </div>
    </SectionShell>
  );
}

function RevealView({
  checkup,
  tz,
  onStartAnother,
  busy,
}: {
  checkup: Checkup;
  tz: string;
  onStartAnother: () => void;
  busy: boolean;
}) {
  const mine = checkup.myAnswers;
  const theirs = checkup.partnerAnswers;
  const revealedAt = checkup.revealedAt ? safeFormat(checkup.revealedAt, tz) : '';

  return (
    <div className="space-y-4">
      {revealedAt && (
        <p className="font-body text-xs text-petal-muted">完成於 {revealedAt}</p>
      )}

      {/* AI neutral summary */}
      {checkup.aiSummary && (
        <div className="bg-petal-sage/15 border border-petal-sage/40 rounded-md p-4">
          <div className="flex items-center gap-1.5 mb-2 text-petal-sage-deep">
            <HeartHandshake className="w-4 h-4" />
            <span className="font-body text-xs font-medium">AI 諮商師的中立總結</span>
          </div>
          <p className="font-body text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">
            {checkup.aiSummary}
          </p>
          {checkup.aiPoints.length > 0 && (
            <div className="mt-3 pt-3 border-t border-petal-sage/30">
              <div className="font-body text-xs font-medium text-petal-sage-deep mb-2 inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> 可以一起聊聊
              </div>
              <ul className="space-y-1.5">
                {checkup.aiPoints.map((p, i) => (
                  <li key={i} className="font-body text-sm text-petal-ink leading-relaxed flex gap-2">
                    <span className="text-petal-sage-deep">{i + 1}.</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Side-by-side scores per dimension */}
      <div className="bg-white rounded-md border border-petal-rule overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-2 bg-petal-cream-2 text-[11px] font-body text-petal-muted uppercase tracking-wide">
          <span>面向</span>
          <span className="text-center w-10">你</span>
          <span className="text-center w-10">對方</span>
        </div>
        {CHECKUP_DIMENSIONS.map((d) => {
          const a = mine?.scores?.[d.id];
          const b = theirs?.scores?.[d.id];
          const gap = a != null && b != null && Math.abs(a - b) >= 2;
          return (
            <div
              key={d.id}
              className={`px-4 py-2.5 border-t border-petal-rule ${gap ? 'bg-amber-50/60' : ''}`}
            >
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
                <span className="font-body text-sm text-petal-ink">
                  {d.emoji} {d.label}
                  {gap && <span className="ml-1.5 text-[10px] text-amber-700">感受落差大</span>}
                </span>
                <span className="text-center w-10 font-display text-lg text-petal-ink">{a ?? '—'}</span>
                <span className="text-center w-10 font-display text-lg text-petal-rose-deep">{b ?? '—'}</span>
              </div>
              {(mine?.notes?.[d.id] || theirs?.notes?.[d.id]) && (
                <div className="mt-1.5 space-y-1">
                  {mine?.notes?.[d.id] && (
                    <p className="font-body text-xs text-petal-ink-soft">你：{mine.notes[d.id]}</p>
                  )}
                  {theirs?.notes?.[d.id] && (
                    <p className="font-body text-xs text-petal-rose-deep">對方：{theirs.notes[d.id]}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Gratitude — both sides */}
      <RevealFreeText title="💗 想感謝對方的事" mine={mine?.gratitude} theirs={theirs?.gratitude} />
      <RevealFreeText title="🎯 最想一起改善的" mine={mine?.attention} theirs={theirs?.attention} />

      <button
        type="button"
        data-testid="checkup-start-another"
        onClick={onStartAnother}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-petal-rule text-petal-ink font-body text-sm font-medium hover:bg-petal-sage/15 transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        再做一次新的檢查
      </button>
    </div>
  );
}

function RevealFreeText({ title, mine, theirs }: { title: string; mine?: string; theirs?: string }) {
  if (!mine && !theirs) return null;
  return (
    <div className="bg-white rounded-md border border-petal-rule p-4">
      <div className="font-display text-base font-medium text-petal-ink mb-2">{title}</div>
      <div className="space-y-2">
        <div>
          <div className="font-body text-[11px] uppercase tracking-wide text-petal-muted mb-0.5">你</div>
          <p className="font-body text-sm text-petal-ink whitespace-pre-wrap">{mine || '（未填）'}</p>
        </div>
        <div className="pt-2 border-t border-petal-rule">
          <div className="font-body text-[11px] uppercase tracking-wide text-petal-rose-deep mb-0.5">對方</div>
          <p className="font-body text-sm text-petal-ink whitespace-pre-wrap">{theirs || '（未填）'}</p>
        </div>
      </div>
    </div>
  );
}

function safeFormat(iso: string, tz: string) {
  try {
    return formatDateTime(iso, tz);
  } catch {
    return iso;
  }
}
