import React, { useEffect, useMemo, useState } from 'react';
import { Home, Heart, Sparkles, ShieldCheck, Send, StickyNote, TrendingUp, X, Loader2 } from 'lucide-react';
import { apiService, type RelationshipSummary } from '../services/api';
import { daysSinceLastNudge } from './AchievementsView';

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface RelationshipDashboardProps {
  partnerConnected: boolean;
  showNotification: (n: NotificationInput) => void;
  /** Opens the 親密邀請 flow (intimacy nudge). */
  onNudgePartner?: () => void;
  /** Navigate to 我們的牆 so the user can leave a praise note. */
  onGoToWall: () => void;
}

type NudgeKind = 'intimacy' | 'checkin' | 'goodwill' | 'appreciation';

interface Nudge {
  kind: NudgeKind;
  severity: number; // higher = more urgent
  emoji: string;
  title: string;
  body: string;
  cta: { label: string; action: () => void } | null;
}

// The "smart" ranking: build candidate nudges from the signals and surface only
// the single most urgent one, so the couple is guided rather than spammed.
function rankNudges(
  s: RelationshipSummary,
  handlers: { intimacy?: () => void; checkin: () => void; praise: () => void }
): Nudge[] {
  const out: Nudge[] = [];

  const di = s.daysSinceIntimacy ?? null;
  if (di !== null) {
    const tier = daysSinceLastNudge(di).tier;
    if (tier >= 1) {
      out.push({
        kind: 'intimacy', severity: 1 + tier, emoji: '💗',
        title: `已經 ${di} 天沒有親密了`,
        body: tier >= 3 ? '主動關心一下另一半，給彼此一點靠近的時間吧。' : '找個時間靠近一下，重新連結彼此。',
        cta: handlers.intimacy ? { label: '傳個親密邀請', action: handlers.intimacy } : null,
      });
    }
  }

  if (s.checkin?.overdue) {
    const d = s.checkin.myLastDays;
    out.push({
      kind: 'checkin', severity: d === null ? 4 : d >= 14 ? 4 : 3, emoji: '🏡',
      title: d === null ? '做第一次關係檢視' : '該做本週的關係檢視了',
      body: '花兩分鐘為「信賴」與「奉獻」打個分數，照顧你們的關係之屋。',
      cta: { label: '開始檢視', action: handlers.checkin },
    });
  }

  const da = s.daysSinceAppreciation ?? null;
  if (da !== null && da >= 7) {
    out.push({
      kind: 'appreciation', severity: da >= 14 ? 3 : 2, emoji: '🌱',
      title: '存一筆好感吧',
      body: '這陣子還沒對 TA 說一句欣賞的話。一句真誠的稱讚，就是替關係存好感。',
      cta: { label: '寫一句稱讚', action: handlers.praise },
    });
  }

  const pos = s.positive14 ?? 0;
  const neg = s.negative14 ?? 0;
  if (neg > 0 && pos < neg * 5) {
    out.push({
      kind: 'goodwill', severity: pos <= neg ? 4 : 2, emoji: '⚖️',
      title: '好感存款偏低',
      body: `近兩週正向互動 ${pos} 次、衝突 ${neg} 次。多累積一些美好回憶，衝突會更好化解。`,
      cta: { label: '寫一句稱讚', action: handlers.praise },
    });
  }

  return out.sort((a, b) => b.severity - a.severity);
}

const SCORE_ROWS: { key: 'trust' | 'commitment' | 'connection'; label: string; hint: string }[] = [
  { key: 'trust', label: '信賴', hint: '我相信 TA 會把我放在心上' },
  { key: 'commitment', label: '奉獻', hint: '我們都願意為這段關係努力' },
  { key: 'connection', label: '連結', hint: '最近我感覺和 TA 很靠近' },
];

const RelationshipDashboard: React.FC<RelationshipDashboardProps> = ({
  partnerConnected,
  showNotification,
  onNudgePartner,
  onGoToWall,
}) => {
  const [summary, setSummary] = useState<RelationshipSummary | null>(null);
  const [checkinOpen, setCheckinOpen] = useState(false);

  const loadSummary = React.useCallback(() => {
    apiService.getRelationshipSummary().then(setSummary).catch(() => {});
  }, []);

  useEffect(() => {
    if (partnerConnected) loadSummary();
  }, [partnerConnected, loadSummary]);

  const nudges = useMemo(() => {
    if (!summary?.paired) return [];
    return rankNudges(summary, {
      intimacy: onNudgePartner,
      checkin: () => setCheckinOpen(true),
      praise: onGoToWall,
    });
  }, [summary, onNudgePartner, onGoToWall]);

  if (!partnerConnected || !summary?.paired) return null;

  const top = nudges[0] || null;
  const pos = summary.positive14 ?? 0;
  const neg = summary.negative14 ?? 0;
  const goodwillTarget = Math.max(5, neg * 5);
  const goodwillPct = Math.min(100, Math.round((pos / goodwillTarget) * 100));

  return (
    <div className="bg-petal-cream border border-petal-rule rounded-2xl p-4 sm:p-5 mb-5" data-testid="relationship-dashboard">
      <div className="flex items-center gap-2 mb-3">
        <Home className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
        <h3 className="font-display text-base text-petal-ink">關係之屋</h3>
        <span className="font-body text-[11px] text-petal-muted">經營信賴與奉獻</span>
      </div>

      {/* Primary nudge (the single most important signal), or an all-good state */}
      {top ? (
        <div
          className={`rounded-xl p-4 mb-3 border ${
            top.severity >= 3 ? 'bg-petal-rose-soft/40 border-petal-rose-soft' : 'bg-petal-rose-soft/20 border-petal-rose-soft'
          }`}
          data-testid="relationship-primary-nudge"
        >
          <div className="font-body text-sm font-medium text-petal-ink mb-0.5">
            {top.emoji} {top.title}
          </div>
          <p className="font-body text-xs text-petal-ink-soft leading-relaxed">{top.body}</p>
          {top.cta && (
            <button
              type="button"
              onClick={top.cta.action}
              data-testid="relationship-primary-cta"
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-pink-500 text-white hover:bg-pink-600 transition-colors font-body text-xs font-medium"
            >
              {top.kind === 'intimacy' ? <Send className="w-3.5 h-3.5" /> : top.kind === 'checkin' ? <Home className="w-3.5 h-3.5" /> : <StickyNote className="w-3.5 h-3.5" />}
              {top.cta.label}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl p-4 mb-3 bg-petal-sage/15 border border-petal-sage/40" data-testid="relationship-all-good">
          <div className="font-body text-sm font-medium text-petal-ink">💛 你們的關係之屋很穩固</div>
          <p className="font-body text-xs text-petal-ink-soft mt-0.5">繼續保持親密、欣賞與檢視的好習慣！</p>
        </div>
      )}

      {/* Goodwill meter */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="font-body text-[11px] text-petal-muted inline-flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> 好感存款（近兩週）
          </span>
          <span className="font-body text-[11px] text-petal-ink">
            正向 {pos} ＋ ／ 衝突 {neg} −
          </span>
        </div>
        <div className="h-2 rounded-full bg-petal-cream-2 overflow-hidden">
          <div
            className={`h-full rounded-full ${goodwillPct >= 80 ? 'bg-petal-sage-deep' : goodwillPct >= 40 ? 'bg-pink-400' : 'bg-petal-rose-deep'}`}
            style={{ width: `${Math.max(4, goodwillPct)}%` }}
          />
        </div>
        <p className="font-body text-[10px] text-petal-muted mt-1">健康關係的正向：衝突約為 5：1</p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCheckinOpen(true)}
          data-testid="relationship-checkin-button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-xs"
        >
          <ShieldCheck className="w-3.5 h-3.5" /> 關係檢視
          {summary.checkin?.overdue && <span className="w-1.5 h-1.5 rounded-full bg-petal-rose-deep" />}
        </button>
        <button
          type="button"
          onClick={onGoToWall}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-xs"
        >
          <Sparkles className="w-3.5 h-3.5" /> 稱讚 TA
        </button>
        {onNudgePartner && (
          <button
            type="button"
            onClick={onNudgePartner}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-xs"
          >
            <Heart className="w-3.5 h-3.5" /> 親密邀請
          </button>
        )}
      </div>

      {checkinOpen && (
        <CheckinModal
          onClose={() => setCheckinOpen(false)}
          showNotification={showNotification}
          onSaved={() => {
            setCheckinOpen(false);
            loadSummary();
          }}
        />
      )}
    </div>
  );
};

const CheckinModal: React.FC<{
  onClose: () => void;
  showNotification: (n: NotificationInput) => void;
  onSaved: () => void;
}> = ({ onClose, showNotification, onSaved }) => {
  const [scores, setScores] = useState({ trust: 0, commitment: 0, connection: 0 });
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const complete = scores.trust > 0 && scores.commitment > 0 && scores.connection > 0;

  const submit = async () => {
    if (!complete) {
      showNotification({ type: 'warning', title: '還沒評分', message: '請為每個項目選一個分數（1–5）。' });
      return;
    }
    setSaving(true);
    try {
      await apiService.submitCheckin({ ...scores, note: note.trim() || undefined });
      showNotification({ type: 'success', title: '已記錄', message: '本週的關係檢視已儲存，謝謝你用心經營。' });
      onSaved();
    } catch (err) {
      showNotification({ type: 'error', title: '儲存失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="relationship-checkin-modal">
      <div className="bg-petal-cream rounded-2xl max-w-md w-full max-h-[min(88vh,calc(100dvh-60px))] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <Home className="w-5 h-5 text-petal-rose-deep" />
            <h3 className="text-lg font-serif text-petal-ink">本週關係檢視</h3>
          </div>
          <button type="button" onClick={onClose} className="text-petal-ink-soft hover:text-petal-ink" aria-label="關閉">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="font-body text-xs text-petal-ink-soft mb-4">為這三個支柱打分（1 = 需要加油，5 = 很穩固）。只有你們倆看得到。</p>

        <div className="space-y-4">
          {SCORE_ROWS.map((row) => (
            <div key={row.key}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="font-body text-sm font-medium text-petal-ink">{row.label}</span>
                <span className="font-body text-[11px] text-petal-muted">{row.hint}</span>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setScores((s) => ({ ...s, [row.key]: v }))}
                    data-testid={`checkin-${row.key}-${v}`}
                    className={`flex-1 py-2 rounded-md border font-body text-sm transition-colors ${
                      scores[row.key] === v
                        ? 'bg-petal-ink text-petal-cream border-petal-ink'
                        : 'bg-white text-petal-ink-soft border-petal-rule hover:border-petal-ink'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 1000))}
          rows={3}
          placeholder="想對 TA 或對自己說的一句話（選填）…"
          data-testid="checkin-note"
          className="w-full mt-4 p-3 rounded-md border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y text-sm"
        />

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          data-testid="checkin-submit"
          className="w-full mt-4 flex items-center justify-center gap-2 bg-petal-ink text-petal-cream py-3 rounded-md hover:bg-pink-700 transition-colors font-display italic disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {saving ? '儲存中…' : '完成檢視'}
        </button>
      </div>
    </div>
  );
};

export default RelationshipDashboard;
