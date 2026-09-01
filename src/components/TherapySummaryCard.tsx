import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  Sparkles,
  Loader2,
  Copy,
  Check,
  UserPlus,
  History,
  ChevronDown,
  Clock,
} from 'lucide-react';
import { apiService, type TherapySummary, type TherapySummaryHistoryEntry } from '../services/api';
import type { Notification } from './ErrorNotification';
import TherapySummaryDetail from './TherapySummaryDetail';
import { summaryToText } from '../utils/therapySummary';

interface Props {
  authState: { isAuthenticated: boolean; partnerConnected: boolean };
  showNotification: (n: Omit<Notification, 'id'>) => void;
}

const PERIODS: { days: number; label: string }[] = [
  { days: 14, label: '最近兩週' },
  { days: 30, label: '最近 30 天' },
];

// Short date for the history list — the couple recognises "which session was
// this for" by roughly when they made it.
function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

const TherapySummaryCard: React.FC<Props> = ({ authState, showNotification }) => {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<TherapySummary | null>(null);
  const [periodLabel, setPeriodLabel] = useState('最近兩週');
  const [eventCount, setEventCount] = useState(0);
  // Guiding empty state (not paired / no events) — never a red error.
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Past summaries the couple already generated — re-opening one is free.
  const [history, setHistory] = useState<TherapySummaryHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Which historic snapshot is on screen (null = a freshly generated one). Drives
  // the "檢視歷史紀錄" badge and stops us re-charging an AI credit for old digests.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingDate, setViewingDate] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!authState.isAuthenticated) return;
    try {
      const rows = await apiService.getTherapySummaryHistory();
      setHistory(rows);
    } catch {
      // History is a convenience — a failure here shouldn't disrupt the card.
    }
  }, [authState.isAuthenticated]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Re-open a past summary from the cache — no AI credit, no server round-trip
  // to regenerate. This is the core of the feature: same digest, zero tokens.
  const viewHistoric = (entry: TherapySummaryHistoryEntry) => {
    setSummary(entry.summary);
    setPeriodLabel(entry.periodLabel);
    setEventCount(entry.eventCount ?? 0);
    setViewingId(entry.id);
    setViewingDate(entry.createdAt);
    setNotice(null);
    setCopied(false);
  };

  const generate = async (targetDays: number) => {
    if (!authState.isAuthenticated) {
      showNotification({ type: 'warning', title: '請先登入', message: '登入後即可整理你們的諮商摘要', duration: 3000 });
      return;
    }
    setLoading(true);
    setNotice(null);
    setSummary(null);
    setCopied(false);
    setViewingId(null);
    setViewingDate(null);
    try {
      const res = await apiService.getTherapySummary(targetDays);
      if (res.ok) {
        setSummary(res.summary);
        setPeriodLabel(res.period.label);
        setEventCount(res.period.eventCount);
        // A new event-set produces a new cached snapshot — refresh the list.
        loadHistory();
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

      {/* Past summaries — re-open any earlier digest without spending an AI credit */}
      {history.length > 0 && (
        <div className="mt-3" data-testid="therapy-summary-history">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            data-testid="therapy-summary-history-toggle"
            className="inline-flex items-center gap-1.5 font-body text-xs text-petal-muted hover:text-petal-ink transition-colors"
          >
            <History className="w-3.5 h-3.5" strokeWidth={1.5} />
            歷史紀錄（{history.length}）
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </button>
          {historyOpen && (
            <ul className="mt-2 space-y-1.5">
              {history.map((h) => {
                const active = viewingId === h.id;
                return (
                  <li key={h.id}>
                    <button
                      onClick={() => viewHistoric(h)}
                      data-testid="therapy-summary-history-item"
                      className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                        active
                          ? 'border-petal-rose-deep bg-petal-rose-soft/20'
                          : 'border-petal-rule bg-white hover:border-petal-ink'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Clock className="w-3.5 h-3.5 text-petal-muted shrink-0" strokeWidth={1.5} />
                        <span className="font-body text-xs text-petal-ink truncate">
                          {h.periodLabel}
                          {typeof h.eventCount === 'number' ? ` · 共 ${h.eventCount} 件` : ''}
                        </span>
                      </span>
                      <span className="font-body text-[11px] text-petal-muted shrink-0">
                        {formatHistoryDate(h.createdAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-1.5 font-body text-[11px] text-petal-muted leading-relaxed">
            點開舊摘要不會重新產生、也不扣 AI 次數。
          </p>
        </div>
      )}

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
            <span className="font-body text-xs text-petal-muted flex items-center gap-2 flex-wrap">
              <span>{periodLabel} · 共 {eventCount} 件事件</span>
              {viewingId && viewingDate && (
                <span
                  data-testid="therapy-summary-historic-badge"
                  className="inline-flex items-center gap-1 rounded-full bg-petal-cream-2 text-petal-ink-soft px-2 py-0.5 text-[11px]"
                >
                  <History className="w-3 h-3" strokeWidth={1.5} />
                  歷史紀錄 · {formatHistoryDate(viewingDate)}
                </span>
              )}
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

          <TherapySummaryDetail summary={summary} />
        </div>
      )}
    </div>
  );
};

export default TherapySummaryCard;
