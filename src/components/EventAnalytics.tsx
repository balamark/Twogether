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
import { BarChart3, TrendingUp, CheckCircle2, Clock3, HandHeart, X } from 'lucide-react';
import apiService, { type EventAnalyticsData } from '../services/api';
import { getEmotionAcceptance } from '../data/emotionAcceptance';
import { useScrollLock } from '../hooks/useScrollLock';

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
