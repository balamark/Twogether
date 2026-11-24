import { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import {
  HandHeart,
  X,
  Repeat,
  ArrowRight,
  Lightbulb,
} from 'lucide-react';
import apiService, {
  type EventAnalyticsData,
  type CommunicationPattern,
} from '../services/api';
import { useCachedQuery, userKey } from '../services/queryCache';
import { useAiUsageToday, useRelationshipSummary } from '../hooks/usePageData';
import { getEmotionAcceptance } from '../data/emotionAcceptance';
import { useScrollLock } from '../hooks/useScrollLock';
import AiQuotaHint from './AiQuotaHint';
import { trackAction } from '../utils/track';
import { tr } from '../i18n/tr';

const PETAL_LINE = '#b86b6b';
const PETAL_BAR = '#7a8d6f';
const GRID = '#e2dad2';

export default function EventAnalytics() {
  // Cached across visits (src/services/queryCache.ts): revisiting 成長 paints
  // the last charts instantly and refreshes them in the background.
  const analytics = useCachedQuery<EventAnalyticsData>(userKey('/events', 'analytics'), () => apiService.getEventAnalytics());
  const data = analytics.data ?? null;
  const loading = analytics.loading;
  const error = analytics.error
    ? (analytics.error.message || tr('無法取得分析資料', 'Couldn\'t load insights. Please try again in a moment.'))
    : null;
  // Which emotion's "如何接住" hint panel is open (null = closed).
  const [openEmotion, setOpenEmotion] = useState<string | null>(null);

  if (loading) return <div className="p-8 text-center text-petal-ink-soft">{tr('載入中…', 'Loading…')}</div>;
  if (error) return <div className="p-6 text-center text-red-500">{error}</div>;
  if (!data) return null;

  const hasAnyData =
    data.counts.last30 > 0 ||
    data.tagDistribution.length > 0 ||
    data.emotionDistribution.length > 0 ||
    data.dailyTrend.some((d) => d.count > 0);

  const topEmotions = data.emotionDistribution.slice(0, 8);

  return (
    <div className="space-y-5">
      <RelationshipRecapCard data={data} />

      {/* 模式原則：跨多次衝突的「你們反覆卡住的循環」第三方視角。 */}
      <CommunicationPatternCard />

      {!hasAnyData ? (
        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-10 text-center text-petal-ink-soft">
          {tr('目前還沒有足夠資料可分析。累積幾段對話後再回來看看。', 'Not enough data to analyze yet. Come back after a few conversations.')}
        </div>
      ) : (
        <>
          <ChartCard title={tr("近 30 日對話趨勢", 'Conversation trend, last 30 days')}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.dailyTrend}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke={PETAL_LINE} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={tr("對話類型分布", 'Conversation types')}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.tagDistribution}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="tag" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill={PETAL_BAR} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {topEmotions.length > 0 && (
            <div className="bg-petal-cream border border-petal-rule rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <HandHeart className="w-4 h-4 text-petal-rose-deep" />
                <h3 className="text-sm text-petal-ink">{tr('你最常出現的情緒', 'Your most frequent feelings')}</h3>
              </div>
              <p className="text-xs text-petal-ink-soft mb-3">
                {tr('點一個情緒，看看下次可以怎麼接住它——先被接住，溝通才開始。', 'Tap a feeling to see how to hold it next time. Feelings need to be heard before communication can begin.')}
              </p>
              <div className="flex flex-wrap gap-2">
                {topEmotions.map((e) => (
                  <button
                    key={e.emotion}
                    type="button"
                    data-testid={`analytics-emotion-${e.emotion}`}
                    onClick={() => setOpenEmotion(e.emotion)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-petal-rose/40 bg-white text-petal-ink text-sm hover:border-petal-rose hover:bg-petal-rose/10 transition-colors"
                  >
                    <span>{e.emotion}</span>
                    <span className="text-xs text-petal-rose-deep">{e.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {data.hotspotHours.length > 0 && (
            <ChartCard title={tr("容易起衝突的時間", 'When conflicts tend to happen')}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={[...data.hotspotHours].sort((a, b) => a.hour - b.hour)}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(h) => `${h}:00`}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip labelFormatter={(h) => `${h}:00`} />
                  <Bar dataKey="count" fill={PETAL_LINE} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </>
      )}

      {openEmotion && (
        <EmotionAcceptancePanel emotion={openEmotion} onClose={() => setOpenEmotion(null)} />
      )}
    </div>
  );
}

function EmotionAcceptancePanel({ emotion, onClose }: { emotion: string; onClose: () => void }) {
  useScrollLock(true);
  const guide = getEmotionAcceptance(emotion);
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      data-testid="analytics-emotion-modal"
    >
      <div className="bg-petal-cream rounded-2xl max-w-md w-full max-h-[min(85vh,calc(100dvh-80px))] overflow-y-auto overscroll-contain p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <HandHeart className="w-5 h-5 text-petal-rose-deep" />
            <div>
              <h3 className="text-lg font-serif text-petal-ink">{tr('怎麼接住「', 'How to hold "')}{emotion}{tr('」', '"')}</h3>
              <p className="text-xs text-petal-ink-soft mt-1">{tr('先接住，再溝通。', 'Hold it first, then talk.')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-petal-ink-soft hover:text-petal-ink" aria-label={tr("關閉", 'Close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-petal-rose-deep mb-1">{tr('這份情緒在說什麼', 'What this feeling is saying')}</div>
            <p className="text-sm text-petal-ink leading-relaxed">{guide.meaning}</p>
          </div>
          <div>
            <div className="text-xs font-medium text-petal-rose-deep mb-1">{tr('你可以怎麼接住', 'How you can hold it')}</div>
            <p className="text-sm text-petal-ink leading-relaxed">{guide.howToReceive}</p>
          </div>
          <div>
            <div className="text-xs font-medium text-petal-rose-deep mb-1">{tr('可以這樣說', 'You could say')}</div>
            <div className="space-y-2">
              {guide.sampleLines.map((line, i) => (
                <p
                  key={i}
                  className="text-sm text-petal-ink bg-white border border-petal-rule rounded-xl px-3 py-2 leading-relaxed"
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            {tr('知道了', 'Got it')}
          </button>
        </div>
      </div>
    </div>
  );
}

// 溝通模式：像看過你們吵過幾次架的第三方，指出反覆出現的循環＋一個跳出它的小
// 練習。按需生成（花一次 AI 額度），結果 server 端有快取，重看免費。文案理念見
// src/content/communicationPrinciples.ts（模式原則）。
function CommunicationPatternCard() {
  const [pattern, setPattern] = useState<CommunicationPattern | null>(null);
  const [notReady, setNotReady] = useState<{ message: string; progress?: { have: number; need: number } } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: quotaData, refetch: refreshQuota } = useAiUsageToday();
  const quota = quotaData ?? null;

  const generate = async () => {
    setLoading(true);
    setError(null);
    setNotReady(null);
    try {
      // R5 量測：記錄「看溝通模式」的點擊（沿用 track/view 機制）。
      trackAction('onboarding.principles.pattern_generate');
      const res = await apiService.getCommunicationPattern();
      if (res.ok) {
        setPattern(res.pattern);
      } else {
        setNotReady({ message: res.message, progress: res.progress });
      }
      // Refresh remaining quota after spending (or not) a credit.
      void refreshQuota();
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('溝通模式暫時無法產生，請稍後再試', 'Communication patterns couldn\'t be generated right now. Please try again in a moment.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="bg-petal-cream border border-petal-rule rounded-2xl p-4"
      data-testid="communication-pattern-card"
    >
      <div className="flex items-center gap-2 mb-1">
        <Repeat className="w-4 h-4 text-petal-rose-deep" />
        <h3 className="text-sm text-petal-ink flex-1">{tr('你們的溝通模式', 'Your communication patterns')}</h3>
        <span className="font-body text-[10px] uppercase tracking-[0.16em] text-petal-rose-deep border border-petal-rose-soft bg-petal-rose-soft/20 rounded-full px-2 py-0.5">
          {tr('模式', 'Patterns')}
        </span>
      </div>
      <p className="text-xs text-petal-ink-soft mb-3 leading-relaxed">
        {tr('像一個看過你們吵過幾次架的第三方，幫你們認出反覆出現的循環，並給一個一起跳出來的小練習。看見它，才有機會不再重複它。', 'Like a third party who\'s seen you argue a few times, it helps you spot the cycles that keep repeating, and offers a small exercise to step out together. Seeing it is the first step to not repeating it.')}
      </p>

      {/* 尚未生成：一顆會花一次 AI 額度的按鈕＋剩餘次數提示。 */}
      {!pattern && !notReady && (
        <div>
          <button
            type="button"
            data-testid="communication-pattern-generate"
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-petal-ink text-petal-cream font-body text-sm font-medium hover:bg-pink-700 transition-colors disabled:opacity-40"
          >
            <Repeat className="w-4 h-4" strokeWidth={1.75} />
            {loading ? tr('正在看你們的模式…', 'Looking at your patterns…') : tr('看我們的溝通模式', 'See our communication patterns')}
          </button>
          <div className="mt-2">
            <AiQuotaHint quota={quota} />
          </div>
          {error && <p className="text-xs text-amber-700 mt-2 leading-relaxed">{error}</p>}
        </div>
      )}

      {/* 事件不足 / 未配對：三段式引導的空狀態，不是紅色錯誤。 */}
      {notReady && (
        <div className="rounded-xl border border-petal-rule bg-white px-4 py-4 text-center">
          <p className="text-sm text-petal-ink-soft leading-relaxed">{notReady.message}</p>
          {notReady.progress && (
            <p className="text-xs text-petal-rose-deep mt-2">
              {tr('進度：', 'Progress: ')}{notReady.progress.have} / {notReady.progress.need} {tr('件', '')}
            </p>
          )}
        </div>
      )}

      {/* 生成結果：循環步驟 + 訊號 + 跳出練習。 */}
      {pattern && (
        <div className="space-y-3">
          {pattern.recurringCycle.length > 0 && (
            <div>
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.12em] text-petal-muted mb-1.5">
                {tr('你們反覆卡住的循環', 'The cycle you keep getting stuck in')}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {pattern.recurringCycle.map((step, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full border border-petal-rule bg-white text-petal-ink font-body text-[12px] px-2.5 py-1">
                      {step}
                    </span>
                    {i < pattern.recurringCycle.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-petal-muted shrink-0" strokeWidth={1.5} />
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {pattern.signals.length > 0 && (
            <div>
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.12em] text-petal-muted mb-1.5">
                {tr('容易被忽略的訊號', 'Signals that are easy to miss')}
              </div>
              <ul className="space-y-1">
                {pattern.signals.map((s, i) => (
                  <li key={i} className="font-body text-sm text-petal-ink leading-relaxed">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pattern.exitTip && (
            <div className="rounded-xl border border-petal-rose-deep/25 bg-petal-cream-2 px-3 py-2">
              <div className="flex items-center gap-1.5 text-petal-rose-deep mb-1">
                <Lightbulb className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="font-body text-[11px] font-medium">{tr('一起跳出這個循環', 'Step out of this cycle together')}</span>
              </div>
              <p className="font-body text-sm text-petal-ink leading-relaxed">{tr('「', '“')}{pattern.exitTip}{tr('」', '”')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 730.4h means nothing to a couple; "約 30 天" does.
function humanizeHours(h: number): string {
  if (h < 1) return tr('不到 1 小時', 'under an hour');
  if (h < 24) return tr(`約 ${Math.round(h)} 小時`, `about ${Math.round(h)} hours`);
  const days = h / 24;
  if (days < 60) return tr(`約 ${Math.max(1, Math.round(days))} 天`, `about ${Math.max(1, Math.round(days))} days`);
  return tr(`約 ${Math.round(days / 30)} 個月`, `about ${Math.round(days / 30)} months`);
}

// A one-line takeaway from the numbers already on the card. Deterministic and
// free (no AI call, no quota): the AI-written observation is the 溝通模式 card
// right below, which the couple asks for explicitly.
function recapInsight(total: number, resolved: number, pos: number, neg: number): string {
  const open = total - resolved;
  if (total === 0) {
    return pos > 0
      ? tr('這個月沒有需要說開的事，還一起留下了不少美好，好好享受。', 'Nothing needed talking through this month, and you kept plenty of good moments. Enjoy it.')
      : tr('這個月很平靜。平靜的時候，也很適合存一點愛。', 'A calm month. Calm times are a great time to save a little love.');
  }
  if (open === 0) return tr('這個月的事都說開了，記得也謝謝彼此願意好好談。', 'Everything this month got talked through. Thank each other for being willing to.');
  if (resolved / total < 0.5) {
    return tr(`還有 ${open} 件沒說開的事，挑最小的一件先聊聊就好。`, `${open} thing${open > 1 ? 's are' : ' is'} still open. Start with the smallest one.`);
  }
  if (pos > neg) return tr('說開的比卡住的多，美好也比衝突多，你們走在對的方向。', 'More talked through than stuck, more good moments than conflicts. You\'re heading the right way.');
  return tr('大部分的事都說開了，剩下的慢慢來。', 'Most things got talked through. Take the rest slowly.');
}

// 本月關係回顧 — one warm card instead of four KPI tiles: how many things you
// talked through (with a progress bar), how long that usually takes, and the
// 近兩週 interaction counts that used to sit on 今天.
function RelationshipRecapCard({ data }: { data: EventAnalyticsData }) {
  const { data: summary } = useRelationshipSummary();
  const total = data.counts.last30;
  const resolved = Math.round((data.resolutionRate / 100) * total);
  const pos = summary?.positive14 ?? 0;
  const neg = summary?.negative14 ?? 0;
  const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;

  return (
    <section
      data-testid="grow-recap-card"
      className="rounded-3xl border border-petal-rose-soft bg-gradient-to-b from-white to-petal-cream p-5 md:p-6 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="font-display text-xl text-petal-ink">{tr('本月關係回顧', 'This month together')}</h2>
        <span className="font-body text-[11px] text-petal-muted">{tr('近 30 天', 'Last 30 days')}</span>
      </div>

      <p className="font-body text-sm text-petal-ink-soft mb-2">
        {total > 0
          ? <>{tr('說開了 ', 'Talked through ')}<b className="font-display text-2xl text-petal-ink">{resolved}</b>{tr(` / ${total} 件事`, ` of ${total}`)}</>
          : tr('這個月還沒有對話', 'No conversations yet this month')}
      </p>
      <div
        className="h-2 rounded-full bg-petal-cream-2 overflow-hidden mb-4"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={tr('說開的比例', 'Share talked through')}
      >
        <div className="h-full rounded-full bg-petal-sage-deep/70 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 font-body text-sm mb-4">
        <div>
          <dt className="text-[11px] text-petal-muted">{tr('本週新對話', 'New this week')}</dt>
          <dd className="text-petal-ink" data-testid="grow-recap-last7">{data.counts.last7} {tr('件', '')}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-petal-muted">{tr('通常多久說開', 'Usually resolved in')}</dt>
          <dd className="text-petal-ink" data-testid="grow-recap-avg">
            {data.avgResolutionHours == null ? tr('還沒有紀錄', 'Not yet') : humanizeHours(data.avgResolutionHours)}
          </dd>
        </div>
        {summary?.paired && (
          <>
            <div>
              <dt className="text-[11px] text-petal-muted">{tr('近兩週美好互動', 'Good moments, 2 weeks')}</dt>
              <dd className="text-petal-ink">{pos} {tr('次', '')}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-petal-muted">{tr('近兩週衝突', 'Conflicts, 2 weeks')}</dt>
              <dd className="text-petal-ink">{neg} {tr('次', '')}</dd>
            </div>
          </>
        )}
      </dl>

      {summary?.paired && (
        (typeof summary.daysSinceAppreciation === 'number' && summary.daysSinceAppreciation >= 3) ||
        (typeof summary.daysSinceIntimacy === 'number' && summary.daysSinceIntimacy >= 7) ||
        summary.checkin?.overdue
      ) && (
        <ul className="mb-4 space-y-1 font-body text-xs text-petal-rose-deep">
          {typeof summary.daysSinceAppreciation === 'number' && summary.daysSinceAppreciation >= 3 && (
            <li>{tr(`已經 ${summary.daysSinceAppreciation} 天沒說欣賞的話`, `${summary.daysSinceAppreciation} days without a word of appreciation`)}</li>
          )}
          {typeof summary.daysSinceIntimacy === 'number' && summary.daysSinceIntimacy >= 7 && (
            <li>{tr(`已經 ${summary.daysSinceIntimacy} 天沒有親密時光`, `${summary.daysSinceIntimacy} days without intimacy`)}</li>
          )}
          {summary.checkin?.overdue && <li>{tr('關係檢視待完成', 'Relationship check-in due')}</li>}
        </ul>
      )}

      <p className="flex items-start gap-2 rounded-2xl bg-white/80 border border-petal-rule-soft px-3.5 py-2.5 font-body text-[13px] text-petal-ink leading-relaxed" data-testid="grow-recap-insight">
        <Lightbulb className="w-4 h-4 text-petal-rose-deep shrink-0 mt-0.5" strokeWidth={1.5} />
        {recapInsight(total, resolved, pos, neg)}
      </p>
    </section>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-petal-cream border border-petal-rule rounded-2xl p-4">
      <h3 className="text-sm text-petal-ink mb-3">{title}</h3>
      {children}
    </div>
  );
}
