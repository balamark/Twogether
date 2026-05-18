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
import { BarChart3, TrendingUp, CheckCircle2, Clock3 } from 'lucide-react';
import apiService, { type EventAnalyticsData } from '../services/api';

const PETAL_LINE = '#b86b6b';
const PETAL_BAR = '#7a8d6f';
const GRID = '#e2dad2';

export default function EventAnalytics() {
  const [data, setData] = useState<EventAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    data.counts.last30 > 0 || data.tagDistribution.length > 0 || data.dailyTrend.some((d) => d.count > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={TrendingUp} label="近 7 日事件" value={data.counts.last7} />
        <KpiCard icon={BarChart3} label="近 30 日事件" value={data.counts.last30} />
        <KpiCard icon={CheckCircle2} label="解決率" value={`${data.resolutionRate}%`} />
        <KpiCard
          icon={Clock3}
          label="平均解決時數"
          value={data.avgResolutionHours == null ? '—' : `${data.avgResolutionHours}h`}
        />
      </div>

      {!hasAnyData ? (
        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-10 text-center text-petal-ink-soft">
          目前還沒有足夠資料可分析。建立幾個事件後再回來看看。
        </div>
      ) : (
        <>
          <ChartCard title="近 30 日事件趨勢">
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

          <ChartCard title="事件類型分布">
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

          {data.hotspotHours.length > 0 && (
            <ChartCard title="熱點時段（每日）">
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
