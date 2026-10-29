import React, { useEffect, useMemo, useState } from 'react';
import { Home, Heart, Sparkles, ShieldCheck, Send, StickyNote, TrendingUp, X, Loader2, HelpCircle, History, Coins } from 'lucide-react';
import { apiService, type RelationshipSummary, type GoodwillGroup, type RelationshipCheckin } from '../services/api';
import { daysSinceLastNudge } from './AchievementsView';
import { useScrollLock } from '../hooks/useScrollLock';
import { tr, dateLocale } from '../i18n/tr';
import { useRelationshipSummary } from '../hooks/usePageData';
import { useFeatureFlag } from '../contexts/FeatureFlagsContext';
import { useCachedQuery, userKey } from '../services/queryCache';
import LoveBankCard from './LoveBankCard';

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
  /** Open the 感情存款 page. */
  onOpenLoveBank: () => void;
}

type NudgeKind = 'intimacy' | 'checkin' | 'goodwill' | 'appreciation' | 'deposit';

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
  handlers: { intimacy?: () => void; checkin: () => void; praise: () => void; loveBank: () => void },
  opts: { goodwill: boolean; depositsWaiting: number }
): Nudge[] {
  const out: Nudge[] = [];

  // A 申請存款 / 兌換申請 only the viewer can answer — the partner is waiting.
  if (opts.depositsWaiting > 0) {
    out.push({
      kind: 'deposit', severity: 3, emoji: '💝',
      title: tr('TA 在等你回應感情存款', 'Your partner is waiting on you in the Love Bank'),
      body: tr(`有 ${opts.depositsWaiting} 筆申請存款或禮物兌換，等你確認或婉拒。`, `${opts.depositsWaiting} deposit request(s) or gift redemption(s) are waiting for you to confirm or decline.`),
      cta: { label: tr('去回應', 'Respond'), action: handlers.loveBank },
    });
  }

  const di = s.daysSinceIntimacy ?? null;
  if (di !== null) {
    const tier = daysSinceLastNudge(di).tier;
    if (tier >= 1) {
      out.push({
        kind: 'intimacy', severity: 1 + tier, emoji: '💗',
        title: tr(`已經 ${di} 天沒有親密了`, `It's been ${di} days without intimacy`),
        body: tier >= 3 ? tr('主動關心一下另一半，給彼此一點靠近的時間吧。', 'Reach out to your partner and make a little time to be close.') : tr('找個時間靠近一下，重新連結彼此。', 'Find a moment to be close and reconnect.'),
        cta: handlers.intimacy ? { label: tr('傳個親密邀請', 'Send an intimacy invitation'), action: handlers.intimacy } : null,
      });
    }
  }

  if (s.checkin?.overdue) {
    const d = s.checkin.myLastDays;
    out.push({
      kind: 'checkin', severity: d === null ? 4 : d >= 14 ? 4 : 3, emoji: '🏡',
      title: d === null ? tr('做第一次關係檢視', 'Do your first relationship check') : tr('該做本週的關係檢視了', 'Time for this week\'s relationship check'),
      body: tr('花兩分鐘為「信賴」與「奉獻」打個分數，照顧你們的關係之屋。', 'Take two minutes to rate "trust" and "commitment" and look after your relationship house.'),
      cta: { label: tr('開始檢視', 'Start the check'), action: handlers.checkin },
    });
  }

  const da = s.daysSinceAppreciation ?? null;
  if (da !== null && da >= 7) {
    out.push({
      kind: 'appreciation', severity: da >= 14 ? 3 : 2, emoji: '🌱',
      title: tr('說一句欣賞的話吧', 'Say something appreciative'),
      body: tr('這陣子還沒對 TA 說一句欣賞的話。一句真誠的稱讚，就能讓 TA 感覺被看見。', 'You haven\'t said anything appreciative to them lately. One sincere compliment helps them feel seen.'),
      cta: { label: tr('寫一句稱讚', 'Write a compliment'), action: handlers.praise },
    });
  }

  const pos = s.positive14 ?? 0;
  const neg = s.negative14 ?? 0;
  // The auto-counted 好感存款 nudge is paused with its meter (goodwill_meter).
  if (opts.goodwill && neg > 0 && pos < neg * 5) {
    out.push({
      kind: 'goodwill', severity: pos <= neg ? 4 : 2, emoji: '⚖️',
      title: tr('好感存款偏低', 'Goodwill balance is low'),
      body: tr(`近兩週正向互動 ${pos} 次、衝突 ${neg} 次。多累積一些美好回憶，衝突會更好化解。`, `Last 2 weeks: ${pos} positive interactions, ${neg} conflicts. Build up more good memories and conflicts get easier to resolve.`),
      cta: { label: tr('寫一句稱讚', 'Write a compliment'), action: handlers.praise },
    });
  }

  return out.sort((a, b) => b.severity - a.severity);
}

const SCORE_ROWS: { key: 'trust' | 'commitment' | 'connection'; label: string; hint: string }[] = [
  { key: 'trust', label: tr('信賴', 'Trust'), hint: tr('我相信 TA 會把我放在心上', 'I believe they keep me in mind') },
  { key: 'commitment', label: tr('奉獻', 'Commitment'), hint: tr('我們都願意為這段關係努力', 'We\'re both willing to work on this relationship') },
  { key: 'connection', label: tr('連結', 'Connection'), hint: tr('最近我感覺和 TA 很靠近', 'Lately I feel close to them') },
];

const RelationshipDashboard: React.FC<RelationshipDashboardProps> = ({
  partnerConnected,
  showNotification,
  onNudgePartner,
  onGoToWall,
  onOpenLoveBank,
}) => {
  // 好感存款 (auto-counted from positive14/negative14) is paused while
  // 感情存款 is the app's single 存款; flip goodwill_meter in /admin to restore.
  const showGoodwill = useFeatureFlag('goodwill_meter');
  const { data: deposits } = useCachedQuery(
    partnerConnected ? userKey('/coins/summary') : null,
    () => apiService.getDepositSummary(),
  );
  const depositsWaiting = deposits?.awaitingMe.length ?? 0;
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [goodwillOpen, setGoodwillOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ratioHint, setRatioHint] = useState(false);
  // Collapse the house by default; expand only on a signal or long absence.
  const [manualOpen, setManualOpen] = useState(false);
  const [dismissedSeverity, setDismissedSeverity] = useState<number>(() => {
    try { return Number(localStorage.getItem('relationshipHouseDismissed') ?? '0') || 0; } catch { return 0; }
  });
  // Whole days since the record page was last opened (previous session). A long
  // gap is itself a signal worth re-surfacing the house for.
  const [awayDays] = useState<number>(() => {
    try {
      const prev = localStorage.getItem('record.lastSeen');
      if (!prev) return 0;
      const gap = Math.floor((Date.now() - Number(prev)) / 86400000);
      return Number.isFinite(gap) && gap > 0 ? gap : 0;
    } catch { return 0; }
  });
  useEffect(() => {
    try { localStorage.setItem('record.lastSeen', String(Date.now())); } catch { /* ignore */ }
  }, []);

  // Shared cached entry with 首頁 / 我們 (src/hooks/usePageData.ts).
  const { data: cachedSummary, refetch: loadSummary } = useRelationshipSummary(partnerConnected);
  const summary = cachedSummary ?? null;

  const nudges = useMemo(() => {
    if (!summary?.paired) return [];
    return rankNudges(summary, {
      intimacy: onNudgePartner,
      checkin: () => setCheckinOpen(true),
      praise: onGoToWall,
      loveBank: onOpenLoveBank,
    }, { goodwill: showGoodwill, depositsWaiting });
  }, [summary, onNudgePartner, onGoToWall, onOpenLoveBank, showGoodwill, depositsWaiting]);

  if (!partnerConnected || !summary?.paired) return null;

  const top = nudges[0] || null;
  const pos = summary.positive14 ?? 0;
  const neg = summary.negative14 ?? 0;
  const goodwillTarget = Math.max(5, neg * 5);
  const goodwillPct = Math.min(100, Math.round((pos / goodwillTarget) * 100));

  // Expand only when there's a signal worth acting on, or the user is returning
  // after a long absence (which counts as a moderate signal). Dismissing records
  // the severity so it stays collapsed until something more urgent appears.
  const absenceSeverity = awayDays >= 7 ? 3 : 0;
  const signalSeverity = Math.max(top?.severity ?? 0, absenceSeverity);
  const expanded = manualOpen || signalSeverity > dismissedSeverity;

  const dismiss = () => {
    try { localStorage.setItem('relationshipHouseDismissed', String(signalSeverity)); } catch { /* ignore */ }
    setDismissedSeverity(signalSeverity);
    setManualOpen(false);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setManualOpen(true)}
        data-testid="relationship-dashboard-collapsed"
        className="w-full flex items-center gap-2 bg-petal-cream border border-petal-rule rounded-2xl px-4 py-3 mb-5 text-left hover:border-petal-ink transition-colors"
      >
        <Home className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
        <h3 className="font-display text-sm text-petal-ink">{tr('關係之屋', 'Relationship house')}</h3>
        <span className="font-body text-[11px] text-petal-muted">{tr('經營信賴與奉獻', 'Build trust and commitment')}</span>
        <span className="ml-auto font-body text-xs text-petal-muted" aria-hidden="true">›</span>
      </button>
    );
  }

  return (
    <div className="bg-petal-cream border border-petal-rule rounded-2xl p-4 sm:p-5 mb-5" data-testid="relationship-dashboard">
      <div className="flex items-center gap-2 mb-3">
        <Home className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
        <h3 className="font-display text-base text-petal-ink">{tr('關係之屋', 'Relationship house')}</h3>
        <span className="font-body text-[11px] text-petal-muted">{tr('經營信賴與奉獻', 'Build trust and commitment')}</span>
        <button
          type="button"
          onClick={dismiss}
          data-testid="relationship-dashboard-dismiss"
          aria-label={tr("稍後再說", 'Maybe later')}
          className="ml-auto p-1 rounded-full text-petal-muted hover:text-petal-ink transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
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
              {top.kind === 'intimacy' ? <Send className="w-3.5 h-3.5" /> : top.kind === 'checkin' ? <Home className="w-3.5 h-3.5" /> : top.kind === 'deposit' ? <Coins className="w-3.5 h-3.5" /> : <StickyNote className="w-3.5 h-3.5" />}
              {top.cta.label}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl p-4 mb-3 bg-petal-sage/15 border border-petal-sage/40" data-testid="relationship-all-good">
          <div className="font-body text-sm font-medium text-petal-ink">{tr('💛 你們的關係之屋很穩固', '💛 Your relationship house is solid')}</div>
          <p className="font-body text-xs text-petal-ink-soft mt-0.5">{tr('繼續保持親密、欣賞與檢視的好習慣！', 'Keep up the good habits of closeness, appreciation and check-ins!')}</p>
        </div>
      )}

      {/* 感情存款: both balances + the read-only average */}
      <div className="mb-3">
        <LoveBankCard onOpen={onOpenLoveBank} compact />
      </div>

      {/* Goodwill meter (paused behind goodwill_meter) */}
      {showGoodwill && (
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => setGoodwillOpen(true)}
            data-testid="goodwill-details-button"
            className="font-body text-[11px] text-petal-muted inline-flex items-center gap-1 hover:text-petal-ink"
          >
            <TrendingUp className="w-3.5 h-3.5" /> {tr('好感存款（近兩週）', 'Goodwill balance (last 2 weeks)')}
            <span className="underline underline-offset-2">{tr('明細', 'Details')}</span>
          </button>
          <span className="font-body text-[11px] text-petal-ink">
            {tr('正向', 'Positive')} {pos} {tr('＋ ／ 衝突', ' + / Conflicts')} {neg} −
          </span>
        </div>
        <div className="h-2 rounded-full bg-petal-cream-2 overflow-hidden">
          <div
            className={`h-full rounded-full ${goodwillPct >= 80 ? 'bg-petal-sage-deep' : goodwillPct >= 40 ? 'bg-pink-400' : 'bg-petal-rose-deep'}`}
            style={{ width: `${Math.max(4, goodwillPct)}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => setRatioHint((v) => !v)}
          data-testid="goodwill-ratio-hint-toggle"
          className="font-body text-[10px] text-petal-muted mt-1 inline-flex items-center gap-1 hover:text-petal-ink"
        >
          {tr('健康關係的正向：衝突約為 5：1', 'Healthy relationships: positive to conflict is about 5:1')}
          <HelpCircle className="w-3 h-3" strokeWidth={1.5} />
        </button>
        {ratioHint && (
          <p
            className="mt-1.5 font-body text-[11px] text-petal-ink-soft leading-relaxed bg-petal-cream-2 rounded-md p-2.5"
            data-testid="goodwill-ratio-hint"
          >
            {tr('心理學家 Gottman 的研究發現：穩定幸福的伴侶，平常的', 'Psychologist Gottman\'s research found that in stable, happy couples, everyday ')}<span className="text-petal-ink">{tr('正向互動', 'positive interactions')}</span>
            {tr('（稱讚、陪伴、親密、體貼）大約是', ' (compliments, time together, intimacy, care) outnumber ')}<span className="text-petal-ink">{tr('負向互動', 'negative interactions')}</span>{tr('（爭執、冷漠）的 5 倍。 平時多存一點好感，吵架時才有本錢化解。點上方「明細」看是哪些事加分或扣分。', ' (arguments, coldness) about 5 to 1. Build up goodwill day to day, and you\'ll have the reserves to resolve fights. Tap "Details" above to see what added or subtracted.')}
          </p>
        )}
      </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCheckinOpen(true)}
          data-testid="relationship-checkin-button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-xs"
        >
          <ShieldCheck className="w-3.5 h-3.5" /> {tr('關係檢視', 'Relationship check')}
          {summary.checkin?.overdue && <span className="w-1.5 h-1.5 rounded-full bg-petal-rose-deep" />}
        </button>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          data-testid="relationship-history-button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-xs"
        >
          <History className="w-3.5 h-3.5" /> {tr('檢視結果', 'Check results')}
        </button>
        <button
          type="button"
          onClick={onGoToWall}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-xs"
        >
          <Sparkles className="w-3.5 h-3.5" /> {tr('稱讚 TA', 'Compliment them')}
        </button>
        {onNudgePartner && (
          <button
            type="button"
            onClick={onNudgePartner}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-xs"
          >
            <Heart className="w-3.5 h-3.5" /> {tr('親密邀請', 'Intimacy invitation')}
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

      {showGoodwill && goodwillOpen && <GoodwillModal onClose={() => setGoodwillOpen(false)} />}
      {historyOpen && <CheckinHistoryModal onClose={() => setHistoryOpen(false)} />}
    </div>
  );
};

// Itemised breakdown behind the goodwill meter: what adds (+) / costs (−) and why.
const GoodwillModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useScrollLock(true);
  const [data, setData] = useState<{ positive: GoodwillGroup[]; negative: GoodwillGroup[] } | null>(null);
  useEffect(() => {
    apiService.getGoodwillBreakdown().then(setData).catch(() => setData({ positive: [], negative: [] }));
  }, []);

  const renderGroup = (g: GoodwillGroup, sign: '+' | '−') => (
    <div key={g.kind} className="bg-white border border-petal-rule rounded-md p-3">
      <div className="flex items-center justify-between">
        <span className="font-body text-sm font-medium text-petal-ink">
          <span className={sign === '+' ? 'text-petal-sage-deep' : 'text-petal-rose-deep'}>{sign}</span> {g.label}
        </span>
        <span className="font-body text-xs text-petal-muted">{tr('近兩週', 'Last 2 weeks')} {g.count}</span>
      </div>
      <p className="font-body text-[11px] text-petal-muted mt-0.5">{g.why}</p>
      {g.items.length > 0 && (
        <ul className="mt-2 space-y-1">
          {g.items.map((it, i) => (
            <li key={i} className="font-body text-xs text-petal-ink-soft flex items-baseline gap-1.5">
              <span className="text-petal-muted">·</span>
              <span className="truncate">{it.who ? tr(`${it.who}：`, `${it.who}: `) : ''}{it.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="goodwill-modal">
      <div className="bg-petal-cream rounded-2xl max-w-md w-full max-h-[min(85vh,calc(100dvh-60px))] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-petal-rose-deep" />
            <h3 className="text-lg font-serif text-petal-ink">{tr('好感存款明細', 'Goodwill details')}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-petal-ink-soft hover:text-petal-ink" aria-label={tr("關閉", 'Close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="font-body text-xs text-petal-muted mb-4">{tr('近兩週哪些事讓好感加分或扣分。', 'What added to or subtracted from your goodwill over the last 2 weeks.')}</p>
        {!data ? (
          <p className="text-center font-body text-sm text-petal-muted py-6">{tr('載入中…', 'Loading…')}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="font-body text-xs font-medium text-petal-sage-deep">{tr('加分（＋）', 'Added (+)')}</div>
              {data.positive.map((g) => renderGroup(g, '+'))}
            </div>
            <div className="space-y-2">
              <div className="font-body text-xs font-medium text-petal-rose-deep">{tr('扣分（−）', 'Subtracted (−)')}</div>
              {data.negative.map((g) => renderGroup(g, '−'))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PILLARS: { key: 'trust' | 'commitment' | 'connection'; label: string }[] = [
  { key: 'trust', label: tr('信賴', 'Trust') },
  { key: 'commitment', label: tr('奉獻', 'Commitment') },
  { key: 'connection', label: tr('連結', 'Connection') },
];

// View past 本週關係檢視 results — both partners' scores + notes over time.
const CheckinHistoryModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useScrollLock(true);
  const [items, setItems] = useState<RelationshipCheckin[] | null>(null);
  useEffect(() => {
    apiService.getCheckins().then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="checkin-history-modal">
      <div className="bg-petal-cream rounded-2xl max-w-md w-full max-h-[min(85vh,calc(100dvh-60px))] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-petal-rose-deep" />
            <h3 className="text-lg font-serif text-petal-ink">{tr('關係檢視結果', 'Relationship check results')}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-petal-ink-soft hover:text-petal-ink" aria-label={tr("關閉", 'Close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="font-body text-xs text-petal-muted mb-4">{tr('你和另一半每次檢視的評分與留言（最近在前）。', 'The scores and notes from each check by you and your partner (latest first).')}</p>
        {!items ? (
          <p className="text-center font-body text-sm text-petal-muted py-6">{tr('載入中…', 'Loading…')}</p>
        ) : items.length === 0 ? (
          <p className="text-center font-body text-sm text-petal-muted py-6">{tr('還沒有檢視紀錄，做一次檢視就會出現在這裡。', 'No checks yet. Do one and it\'ll show up here.')}</p>
        ) : (
          <div className="space-y-3">
            {items.map((c) => (
              <div key={c.id} className="bg-white border border-petal-rule rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body text-sm font-medium text-petal-ink">
                    {c.isMine ? tr('我', 'Me') : c.nickname}
                  </span>
                  <span className="font-body text-[11px] text-petal-muted">
                    {new Date(c.createdAt).toLocaleDateString(dateLocale())}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-1">
                  {PILLARS.map((p) => (
                    <div key={p.key} className="text-center bg-petal-cream-2 rounded-md py-1.5">
                      <div className="font-body text-[10px] text-petal-muted">{p.label}</div>
                      <div className="font-display italic text-lg text-petal-ink">{c[p.key]}</div>
                    </div>
                  ))}
                </div>
                {c.note && <p className="font-body text-xs text-petal-ink-soft mt-1.5">{tr('「', '“')}{c.note}{tr('」', '”')}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CheckinModal: React.FC<{
  onClose: () => void;
  showNotification: (n: NotificationInput) => void;
  onSaved: () => void;
}> = ({ onClose, showNotification, onSaved }) => {
  useScrollLock(true);
  const [scores, setScores] = useState({ trust: 0, commitment: 0, connection: 0 });
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const complete = scores.trust > 0 && scores.commitment > 0 && scores.connection > 0;

  const submit = async () => {
    if (!complete) {
      showNotification({ type: 'warning', title: tr('還沒評分', 'Not rated yet'), message: tr('請為每個項目選一個分數（1–5）。', 'Please choose a score (1–5) for each item.') });
      return;
    }
    setSaving(true);
    try {
      await apiService.submitCheckin({ ...scores, note: note.trim() || undefined });
      showNotification({ type: 'success', title: tr('已記錄', 'Saved'), message: tr('本週的關係檢視已儲存，謝謝你用心經營。', 'This week\'s relationship check is saved. Thanks for putting in the care.') });
      onSaved();
    } catch (err) {
      showNotification({ type: 'error', title: tr('儲存失敗', 'Couldn\'t save'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment') });
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
            <h3 className="text-lg font-serif text-petal-ink">{tr('本週關係檢視', 'This week\'s relationship check')}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-petal-ink-soft hover:text-petal-ink" aria-label={tr("關閉", 'Close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="font-body text-xs text-petal-ink-soft mb-4">{tr('為這三個支柱打分（1 = 需要加油，5 = 很穩固）。只有你們倆看得到。', 'Rate these three pillars (1 = needs work, 5 = rock solid). Only the two of you can see this.')}</p>

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
          placeholder={tr("想對 TA 或對自己說的一句話（選填）…", 'Something you want to say to them or yourself (optional)…')}
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
          {saving ? tr('儲存中…', 'Saving…') : tr('完成檢視', 'Finish the check')}
        </button>
      </div>
    </div>
  );
};

export default RelationshipDashboard;
