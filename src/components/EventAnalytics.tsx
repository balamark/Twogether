import { useEffect, useState } from 'react';
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
  BarChart3,
  TrendingUp,
  CheckCircle2,
  Clock3,
  HandHeart,
  X,
  Repeat,
  ArrowRight,
  Lightbulb,
} from 'lucide-react';
import apiService, {
  type EventAnalyticsData,
  type CommunicationPattern,
  type AiUsageToday,
} from '../services/api';
import { getEmotionAcceptance } from '../data/emotionAcceptance';
import { useScrollLock } from '../hooks/useScrollLock';
import AiQuotaHint from './AiQuotaHint';
import { trackAction } from '../utils/track';

const PETAL_LINE = '#b86b6b';
const PETAL_BAR = '#7a8d6f';
const GRID = '#e2dad2';

export default function EventAnalytics() {
  const [data, setData] = useState<EventAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which emotion's "如何接住" hint panel is open (null = closed).
  const [openEmotion, setOpenEmotion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiService
      .getEventAnalytics()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '無法取得分析資料');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="p-8 text-center text-petal-ink-soft">載入中…</div>;
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={TrendingUp} label="近 7 日對話" value={data.counts.last7} />
        <KpiCard icon={BarChart3} label="近 30 日對話" value={data.counts.last30} />
        <KpiCard icon={CheckCircle2} label="解決率" value={`${data.resolutionRate}%`} />
        <KpiCard
          icon={Clock3}
          label="平均解決時數"
          value={data.avgResolutionHours == null ? '—' : `${data.avgResolutionHours}h`}
        />
      </div>

      {/* 模式原則：跨多次衝突的「你們反覆卡住的循環」第三方視角。 */}
      <CommunicationPatternCard />

      {!hasAnyData ? (
        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-10 text-center text-petal-ink-soft">
          目前還沒有足夠資料可分析。累積幾段對話後再回來看看。
        </div>
      ) : (
        <>
          <ChartCard title="近 30 日對話趨勢">
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

          <ChartCard title="對話類型分布">
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
                <h3 className="text-sm text-petal-ink">你最常出現的情緒</h3>
              </div>
              <p className="text-xs text-petal-ink-soft mb-3">
                點一個情緒，看看下次可以怎麼接住它——先被接住，溝通才開始。
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
            <ChartCard title="容易起衝突的時間">
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
              <h3 className="text-lg font-serif text-petal-ink">怎麼接住「{emotion}」</h3>
              <p className="text-xs text-petal-ink-soft mt-1">先接住，再溝通。</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-petal-ink-soft hover:text-petal-ink" aria-label="關閉">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-petal-rose-deep mb-1">這份情緒在說什麼</div>
            <p className="text-sm text-petal-ink leading-relaxed">{guide.meaning}</p>
          </div>
          <div>
            <div className="text-xs font-medium text-petal-rose-deep mb-1">你可以怎麼接住</div>
            <p className="text-sm text-petal-ink leading-relaxed">{guide.howToReceive}</p>
          </div>
          <div>
            <div className="text-xs font-medium text-petal-rose-deep mb-1">可以這樣說</div>
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
            知道了
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
  const [quota, setQuota] = useState<AiUsageToday | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiService
      .getAiUsageToday()
      .then((q) => {
        if (!cancelled) setQuota(q);
      })
      .catch(() => {
        /* quota hint is best-effort; ignore fetch errors */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      apiService.getAiUsageToday().then(setQuota).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : '溝通模式暫時無法產生，請稍後再試');
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
        <h3 className="text-sm text-petal-ink flex-1">你們的溝通模式</h3>
        <span className="font-body text-[10px] uppercase tracking-[0.16em] text-petal-rose-deep border border-petal-rose-soft bg-petal-rose-soft/20 rounded-full px-2 py-0.5">
          模式
        </span>
      </div>
      <p className="text-xs text-petal-ink-soft mb-3 leading-relaxed">
        像一個看過你們吵過幾次架的第三方，幫你們認出反覆出現的循環，並給一個一起跳出來的小練習。看見它，才有機會不再重複它。
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
            {loading ? '正在看你們的模式…' : '看我們的溝通模式'}
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
              進度：{notReady.progress.have} / {notReady.progress.need} 件
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
                你們反覆卡住的循環
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
                容易被忽略的訊號
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
                <span className="font-body text-[11px] font-medium">一起跳出這個循環</span>
              </div>
              <p className="font-body text-sm text-petal-ink leading-relaxed">「{pattern.exitTip}」</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-petal-cream border border-petal-rule rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2 text-petal-ink-soft">
        <Icon className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-serif text-petal-ink">{value}</p>
    </div>
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
