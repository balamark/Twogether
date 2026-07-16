import React, { useState } from 'react';
import {
  ClipboardList,
  Sparkles,
  Loader2,
  Hash,
  HeartPulse,
  CheckCircle2,
  CircleDashed,
  HelpCircle,
  Copy,
  Check,
  UserPlus,
} from 'lucide-react';
import { apiService, type TherapySummary } from '../services/api';
import type { Notification } from './ErrorNotification';
import { NOT_A_SUBSTITUTE_SHORT } from '../content/positioning';

interface Props {
  authState: { isAuthenticated: boolean; partnerConnected: boolean };
  showNotification: (n: Omit<Notification, 'id'>) => void;
}

const PERIODS: { days: number; label: string }[] = [
  { days: 14, label: '最近兩週' },
  { days: 30, label: '最近 30 天' },
];

// Build a plain-text version the couple can paste into notes or hand to their
// therapist — the whole point of the feature is to carry it into the session.
function summaryToText(s: TherapySummary, periodLabel: string): string {
  const lines: string[] = [];
  lines.push(`【Twogether 諮商摘要 · ${periodLabel}】`, '');
  if (s.overview) lines.push(s.overview, '');
  if (s.themes.length) lines.push('最常出現的衝突主題：' + s.themes.join('、'));
  if (s.emotions.length) lines.push('雙方最常感受到的情緒：' + s.emotions.join('、'));
  if (s.repaired.length) {
    lines.push('', '已經成功修復的事件：');
    s.repaired.forEach((r) => lines.push(`・${r.title} — ${r.insight}`));
  }
  if (s.unresolved.length) {
    lines.push('', '還沒解決的事件：');
    s.unresolved.forEach((r) => lines.push(`・${r.title} — ${r.note}`));
  }
  if (s.questions.length) {
    lines.push('', '想帶去和心理師討論的問題：');
    s.questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  }
  lines.push('', NOT_A_SUBSTITUTE_SHORT);
  return lines.join('\n');
}

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-center gap-1.5 text-petal-sage-deep mb-1.5">
    {icon}
    <span className="font-body text-[11px] font-medium uppercase tracking-[0.12em]">{children}</span>
  </div>
);

const Chips: React.FC<{ items: string[] }> = ({ items }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((t, i) => (
      <span
        key={i}
        className="inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep font-body text-xs px-2.5 py-0.5"
      >
        {t}
      </span>
    ))}
  </div>
);

const TherapySummaryCard: React.FC<Props> = ({ authState, showNotification }) => {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<TherapySummary | null>(null);
  const [periodLabel, setPeriodLabel] = useState('最近兩週');
  const [eventCount, setEventCount] = useState(0);
  // Guiding empty state (not paired / no events) — never a red error.
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async (targetDays: number) => {
    if (!authState.isAuthenticated) {
      showNotification({ type: 'warning', title: '請先登入', message: '登入後即可整理你們的諮商摘要', duration: 3000 });
      return;
    }
    setLoading(true);
    setNotice(null);
    setSummary(null);
    setCopied(false);
    try {
      const res = await apiService.getTherapySummary(targetDays);
      if (res.ok) {
        setSummary(res.summary);
        setPeriodLabel(res.period.label);
        setEventCount(res.period.eventCount);
      } else {
        setNotice(res.message);
      }
    } catch (err: unknown) {
      // Quota exhaustion carries its own actionable message + error_code.
      const message = err instanceof Error ? err.message : '諮商摘要暫時無法產生，請稍後再試';
      const code = (err as { error_code?: string })?.error_code;
      const quota = code === 'AI_DAILY_LIMIT_REACHED';
      showNotification({
        type: quota ? 'warning' : 'error',
        title: quota ? '今日 AI 次數已用完' : '無法產生摘要',
        message,
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summaryToText(summary, periodLabel));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showNotification({ type: 'error', title: '複製失敗', message: '請手動選取文字複製', duration: 3000 });
    }
  };

  return (
    <div
      className="bg-petal-cream border border-petal-sage/40 rounded-2xl p-5 max-w-2xl mx-auto"
      data-testid="therapy-summary-card"
    >
      <div className="flex items-center gap-2 text-petal-sage-deep mb-1">
        <ClipboardList className="w-5 h-5" strokeWidth={1.5} />
        <h3 className="font-display italic text-lg text-petal-ink">諮商摘要</h3>
      </div>
      <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-4">
        把{periodLabel}記錄的事件，一鍵整理成一份可以帶進諮商室的摘要——最常出現的主題、雙方的情緒、已修復與還沒解決的事，還有三個想和心理師討論的問題。進諮商時不用再從頭回想。
      </p>

      {/* Period selector + generate */}
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <div className="inline-flex rounded-full bg-petal-cream-2 p-0.5" role="tablist" aria-label="期間">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              role="tab"
              aria-selected={days === p.days}
              onClick={() => setDays(p.days)}
              disabled={loading}
              className={`px-3 py-1.5 rounded-full font-body text-xs transition-colors ${
                days === p.days ? 'bg-white text-petal-ink shadow-sm' : 'text-petal-muted hover:text-petal-ink'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => generate(days)}
          disabled={loading}
          data-testid="therapy-summary-generate"
          className="inline-flex items-center gap-1.5 rounded-full bg-petal-rose-deep text-white font-body text-sm font-medium px-4 py-2 shadow-sm hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? '整理中…' : summary ? '重新整理' : '整理成諮商摘要'}
        </button>
      </div>

      {/* Guiding empty state (not paired / no events) */}
      {notice && (
        <div
          className="mt-4 rounded-xl border border-petal-rule bg-petal-cream-2 px-4 py-3 flex items-start gap-2.5"
          data-testid="therapy-summary-notice"
        >
          <UserPlus className="w-4 h-4 text-petal-rose-deep mt-0.5 shrink-0" strokeWidth={1.5} />
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{notice}</p>
        </div>
      )}

      {/* Result */}
      {summary && (
        <div className="mt-4 space-y-4" data-testid="therapy-summary-result">
          <div className="flex items-center justify-between gap-2">
            <span className="font-body text-xs text-petal-muted">
              {periodLabel} · 共 {eventCount} 件事件
            </span>
            <button
              onClick={copy}
              data-testid="therapy-summary-copy"
              className="inline-flex items-center gap-1.5 rounded-full border border-petal-rule bg-white text-petal-ink font-body text-xs px-3 py-1.5 hover:border-petal-ink transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-petal-sage-deep" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? '已複製' : '複製給心理師'}
            </button>
          </div>

          {summary.overview && (
            <p className="font-display italic font-light text-base text-petal-ink leading-relaxed border-l-2 border-petal-sage/50 pl-3">
              {summary.overview}
            </p>
          )}

          {summary.themes.length > 0 && (
            <div>
              <SectionTitle icon={<Hash className="w-3.5 h-3.5" strokeWidth={1.5} />}>最常出現的衝突主題</SectionTitle>
              <Chips items={summary.themes} />
            </div>
          )}

          {summary.emotions.length > 0 && (
            <div>
              <SectionTitle icon={<HeartPulse className="w-3.5 h-3.5" strokeWidth={1.5} />}>雙方最常感受到的情緒</SectionTitle>
              <Chips items={summary.emotions} />
            </div>
          )}

          {summary.repaired.length > 0 && (
            <div>
              <SectionTitle icon={<CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />}>已經成功修復的事件</SectionTitle>
              <ul className="space-y-1.5">
                {summary.repaired.map((r, i) => (
                  <li key={i} className="font-body text-sm text-petal-ink leading-relaxed">
                    <span className="font-medium">{r.title}</span>
                    <span className="text-petal-ink-soft"> — {r.insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.unresolved.length > 0 && (
            <div>
              <SectionTitle icon={<CircleDashed className="w-3.5 h-3.5" strokeWidth={1.5} />}>還沒解決的事件</SectionTitle>
              <ul className="space-y-1.5">
                {summary.unresolved.map((r, i) => (
                  <li key={i} className="font-body text-sm text-petal-ink leading-relaxed">
                    <span className="font-medium">{r.title}</span>
                    <span className="text-petal-ink-soft"> — {r.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.questions.length > 0 && (
            <div className="rounded-xl bg-petal-rose-soft/20 border border-petal-rose-soft px-4 py-3">
              <SectionTitle icon={<HelpCircle className="w-3.5 h-3.5" strokeWidth={1.5} />}>想帶去和心理師討論的三個問題</SectionTitle>
              <ol className="space-y-1.5 list-decimal list-inside">
                {summary.questions.map((q, i) => (
                  <li key={i} className="font-body text-sm text-petal-ink leading-relaxed">{q}</li>
                ))}
              </ol>
            </div>
          )}

          <p className="font-body text-xs text-petal-muted leading-relaxed">{NOT_A_SUBSTITUTE_SHORT}</p>
        </div>
      )}
    </div>
  );
};

export default TherapySummaryCard;
