import { useState, useEffect, useMemo } from 'react';
import apiService from '../services/api';

interface IntimateRecord {
  id: number;
  date: string;
  time: string;
  mood: string;
  notes?: string;
  timestamp: string;
  photo?: string;
  description?: string;
  duration?: string;
  location?: string;
  roleplayScript?: string;
  coinsEarned?: number;
  activityType?: string;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  unlocked_at?: string;
  progress: number;
  max_progress: number;
  is_unlocked: boolean;
}

interface AchievementStats {
  total_achievements: number;
  unlocked_achievements: number;
  completion_percentage: number;
  recent_achievements: Achievement[];
}

interface IntimacyStats {
  total_moments: number;
  average_per_month: number;
  average_per_week: number;
  current_streak?: number;
  longest_streak?: number;
  monthly_data?: { month: string; count: number }[];
  // Legacy/extra fields (optional)
  total_days?: number;
  total_months?: number;
  total_coins_earned?: number;
  total_coins_spent?: number;
  current_balance?: number;
  favorite_activity?: string;
  most_active_month?: string;
  most_active_day?: string;
  first_record_date?: string;
  last_record_date?: string;
  total_duration_hours?: number;
  average_duration_minutes?: number;
}

export function AchievementsView() {
  const [achievements, setAchievements] = useState<AchievementStats | null>(null);
  const [stats, setStats] = useState<IntimacyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Fetch all records for badge logic
  const [records, setRecords] = useState<IntimateRecord[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const recs = await apiService.getIntimateRecords();
        setRecords(recs);
      } catch (error) {
        console.error('Failed to load intimate records:', error);
        // Keep empty array if API fails
      }
    })();
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [achievementsData, statsData] = await Promise.all([
        apiService.getAchievements(),
        apiService.getStats(),
      ]);
      const achievementsPayload = achievementsData as { stats?: AchievementStats };
      setAchievements(achievementsPayload.stats ?? null);
      setStats(statsData as IntimacyStats);
    } catch (err: unknown) {
      console.error('Failed to load achievements and stats:', err);
      setError((err as Error)?.message || '載入數據失敗');
    } finally {
      setLoading(false);
    }
  };


  // Calculate current week/month statistics
  const currentStats = useMemo(() => {
    if (!records || records.length === 0) return { thisWeek: 0, thisMonth: 0 };

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const thisWeek = records.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= startOfWeek;
    }).length;

    const thisMonth = records.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= startOfMonth;
    }).length;

    return { thisWeek, thisMonth };
  }, [records]);

  // Badge logic
  const badges = useMemo(() => {
    if (!stats) return [];
    const b = [];
    // Weekly/Monthly/Total badges
    if (currentStats.thisWeek >= 1) b.push({ name: '週間戀人', icon: '💕', desc: '本週至少一次親密時光' });
    if (currentStats.thisWeek >= 2) b.push({ name: '熱戀情侶', icon: '🔥', desc: '本週至少兩次親密時光' });
    if (currentStats.thisWeek >= 3) b.push({ name: '甜蜜無敵', icon: '🌟', desc: '本週三次以上親密時光' });
    if (stats.total_moments >= 10) b.push({ name: '愛情老手', icon: '🏆', desc: '累計十次親密記錄' });
    if (stats.total_moments >= 50) b.push({ name: '愛情大師', icon: '👑', desc: '累計五十次親密記錄' });
    // Unique poses badge
    const uniquePoses = new Set(records.map(r => r.activityType).filter(Boolean));
    if (uniquePoses.size >= 3) b.push({ name: '多樣體驗', icon: '🧘', desc: `已嘗試 ${uniquePoses.size} 種不同體位/活動` });
    // Unique locations badge
    const uniqueLocs = new Set(records.map(r => r.location).filter(Boolean));
    if (uniqueLocs.size >= 3) b.push({ name: '冒險地點', icon: '🗺️', desc: `已在 ${uniqueLocs.size} 個不同地點親密` });
    // Longest duration badge
    const maxDuration = Math.max(...records.map(r => parseInt(r.duration ?? '0') || 0));
    if (maxDuration >= 60) b.push({ name: '最長紀錄', icon: '⏱️', desc: `單次親密時長達 ${maxDuration} 分鐘` });
    return b;
  }, [stats, records, currentStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-4">⚠️ {error}</div>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
        >
          重新載入
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink">
          親密<em className="not-italic font-light italic text-pink-600">統計</em>
        </h3>
        <span className="font-display italic font-light text-sm text-petal-muted">
          你們的數據與成就
        </span>
      </div>

      {stats && (
        <div className="space-y-8 mb-10">
          {/* Badges */}
          <div>
            <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6">
              愛情<em className="not-italic font-light italic text-pink-600">成就徽章</em>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {badges.length > 0 ? badges.map((badge, index) => (
                <div key={index} className="flex items-center space-x-4 p-4 bg-white rounded-md border border-petal-rule hover:border-petal-rose transition-colors">
                  <div className="text-xl opacity-75 saturate-75">{badge.icon}</div>
                  <div>
                    <div className="font-display text-base font-medium text-petal-ink">{badge.name}</div>
                    <div className="font-body text-sm text-petal-ink-soft">{badge.desc}</div>
                  </div>
                </div>
              )) : (
                <div className="col-span-2 border border-dashed border-petal-rule rounded-md py-10 px-6 text-center">
                  <p className="font-display italic font-light text-base text-petal-muted">
                    開始記錄你們的愛情 — 解鎖更多成就徽章
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Achievements Section */}
      {achievements && stats && (
        <div className="space-y-6">
          <div className="bg-petal-cream-2/40 rounded-md p-6 border border-petal-rule">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-medium tracking-tight text-petal-ink">成就<em className="not-italic font-light italic text-pink-600">進度</em></h2>
              <span className="font-display italic font-light text-3xl text-petal-rose-deep">
                {Math.round(achievements.completion_percentage || 0)}<span className="text-base">%</span>
              </span>
            </div>
            <div className="w-full bg-petal-cream rounded-full h-1.5 border border-petal-rule-soft">
              <div
                className="bg-petal-rose-deep h-full rounded-full transition-all duration-500"
                style={{ width: `${achievements.completion_percentage || 0}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              已解鎖 {achievements.unlocked_achievements} / {achievements.total_achievements} 個成就
            </p>
          </div>

          {/* Recent Achievements */}
          {achievements.recent_achievements && achievements.recent_achievements.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">最近解鎖</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {achievements.recent_achievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm"
                  >
                    <div className="flex items-center mb-3">
                      <span className="text-2xl mr-3">{achievement.icon}</span>
                      <div>
                        <h4 className="font-semibold text-gray-800">{achievement.title}</h4>
                        <p className="text-sm text-gray-600">{achievement.description}</p>
                      </div>
                    </div>
                    {achievement.unlocked_at && (
                      <p className="text-xs text-green-600">
                        解鎖於 {new Date(achievement.unlocked_at).toLocaleDateString('zh-TW')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Achievements */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">所有成就</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  id: '1',
                  title: '初次記錄',
                  description: '記錄第一次愛的時光',
                  icon: '🌟',
                  category: 'milestone',
                  progress: stats?.total_moments || 0,
                  max_progress: 1,
                  is_unlocked: (stats?.total_moments || 0) > 0,
                },
                {
                  id: '2',
                  title: '甜蜜時光',
                  description: '記錄10次愛的時光',
                  icon: '💕',
                  category: 'milestone',
                  progress: stats?.total_moments || 0,
                  max_progress: 10,
                  is_unlocked: (stats?.total_moments || 0) >= 10,
                },
                {
                  id: '3',
                  title: '浪漫情侶',
                  description: '記錄50次愛的時光',
                  icon: '💖',
                  category: 'milestone',
                  progress: stats?.total_moments || 0,
                  max_progress: 50,
                  is_unlocked: (stats?.total_moments || 0) >= 50,
                },
                {
                  id: '4',
                  title: '愛情專家',
                  description: '記錄100次愛的時光',
                  icon: '👑',
                  category: 'milestone',
                  progress: stats?.total_moments || 0,
                  max_progress: 100,
                  is_unlocked: (stats?.total_moments || 0) >= 100,
                },
                {
                  id: '5',
                  title: '每日情侶',
                  description: '連續記錄7天',
                  icon: '📅',
                  category: 'streak',
                  progress: stats?.total_days || 0,
                  max_progress: 7,
                  is_unlocked: (stats?.total_days || 0) >= 7,
                },
                {
                  id: '6',
                  title: '月度情侶',
                  description: '記錄3個月的時光',
                  icon: '📆',
                  category: 'streak',
                  progress: stats?.total_months || 0,
                  max_progress: 3,
                  is_unlocked: (stats?.total_months || 0) >= 3,
                },
                {
                  id: '7',
                  title: '金幣收集者',
                  description: '累積1000金幣',
                  icon: '💰',
                  category: 'coins',
                  progress: stats?.total_coins_earned || 0,
                  max_progress: 1000,
                  is_unlocked: (stats?.total_coins_earned || 0) >= 1000,
                },
                {
                  id: '8',
                  title: '金幣大師',
                  description: '累積5000金幣',
                  icon: '💎',
                  category: 'coins',
                  progress: stats?.total_coins_earned || 0,
                  max_progress: 5000,
                  is_unlocked: (stats?.total_coins_earned || 0) >= 5000,
                },
              ].map((achievement) => (
                <div
                  key={achievement.id}
                  className={`bg-white rounded-lg p-4 border shadow-sm transition-all ${
                    achievement.is_unlocked
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center mb-3">
                    <span className="text-base mr-3 opacity-75 saturate-75">{achievement.icon}</span>
                    <div>
                      <h4 className="font-display text-base font-medium tracking-tight text-petal-ink">{achievement.title}</h4>
                      <p className="font-body text-sm text-petal-ink-soft">{achievement.description}</p>
                    </div>
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-1.5">
                      <span>進度</span>
                      <span className="font-display italic">{achievement.progress} / {achievement.max_progress}</span>
                    </div>
                    <div className="w-full bg-petal-cream-2 rounded-full h-1 border border-petal-rule-soft">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          achievement.is_unlocked
                            ? 'bg-petal-sage-deep'
                            : 'bg-petal-rule'
                        }`}
                        style={{
                          width: `${Math.min((achievement.progress / achievement.max_progress) * 100, 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                  {achievement.is_unlocked && (
                    <p className="font-display italic font-light text-xs text-petal-sage-deep">— 已解鎖</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 

// Calendar Heatmap Component - GitHub style for better mobile experience
interface CalendarHeatmapProps {
  data: IntimateRecord[];
  year?: number;
  month?: number;
  title: string;
  showMonthLabels?: boolean;
  onNavigate?: (year: number, month: number) => void;
  onDaySelect?: (dateStr: string) => void;
  selectedDay?: string | null;
  periodDates?: Set<string>;
  predictedPeriodDates?: Set<string>;
  fertileDates?: Set<string>;
}

export function CalendarHeatmap({ data, year, month, title, showMonthLabels = true, onNavigate, onDaySelect, selectedDay, periodDates, predictedPeriodDates, fertileDates }: CalendarHeatmapProps) {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const targetMonth = month ?? now.getMonth();

  // Generate calendar data
  const calendarData = useMemo(() => {
    const firstDay = new Date(targetYear, targetMonth, 1);
    const lastDay = new Date(targetYear, targetMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    // Create array of days with counts
    const days = [];

    // Add empty cells for days before the month starts
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: null, count: 0, isEmpty: true });
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(targetYear, targetMonth, day);
      const dateStr = currentDate.toISOString().split('T')[0];

      // Count records for this day
      const count = data.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate.toISOString().split('T')[0] === dateStr;
      }).length;

      days.push({
        date: currentDate,
        count,
        isEmpty: false,
        dateStr
      });
    }

    return days;
  }, [data, targetYear, targetMonth]);

  // Color intensity based on count
  const getIntensityClass = (count: number) => {
    if (count === 0) return 'bg-gray-100 border-gray-200';
    if (count === 1) return 'bg-pink-100 border-pink-200';
    if (count === 2) return 'bg-pink-200 border-pink-300';
    if (count === 3) return 'bg-pink-300 border-pink-400';
    if (count >= 4) return 'bg-pink-500 border-pink-600';
    return 'bg-gray-100 border-gray-200';
  };

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

  const maxCount = Math.max(...calendarData.map(d => d.count));

  const navigateMonth = (direction: number) => {
    if (!onNavigate) return;

    let newMonth = targetMonth + direction;
    let newYear = targetYear;

    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }

    onNavigate(newYear, newMonth);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        {showMonthLabels && (
          <div className="flex items-center space-x-2">
            {onNavigate && (
              <button
                onClick={() => navigateMonth(-1)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                title="上一個月"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <span className="text-sm text-gray-500 min-w-[80px] text-center">
              {targetYear}年 {monthNames[targetMonth]}
            </span>
            {onNavigate && (
              <button
                onClick={() => navigateMonth(1)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                title="下一個月"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div key={day} className="text-xs text-gray-500 text-center py-1 font-medium">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {calendarData.map((day, index) => {
          if (day.isEmpty || !day.date) {
            return <div key={index} className="aspect-square invisible" />;
          }
          const isSelected = selectedDay === day.dateStr;
          const isPeriod = !!periodDates && periodDates.has(day.dateStr!);
          const isPredictedPeriod = !!predictedPeriodDates && predictedPeriodDates.has(day.dateStr!);
          const isFertile = !!fertileDates && fertileDates.has(day.dateStr!);
          return (
            <button
              key={index}
              type="button"
              onClick={() => onDaySelect?.(day.dateStr!)}
              className={`
                aspect-square rounded-sm border transition-all duration-200 hover:scale-110 hover:z-10 relative group cursor-pointer
                ${getIntensityClass(day.count)}
                ${isSelected ? 'ring-2 ring-petal-rose-deep ring-offset-1 z-10' : ''}
              `}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xs font-medium ${day.count >= 3 ? 'text-white' : 'text-gray-600'}`}>
                  {day.date.getDate()}
                </span>
              </div>
              {isPeriod && (
                <span data-testid="cycle-period-dot" className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-red-500" title="月經" />
              )}
              {!isPeriod && isPredictedPeriod && (
                <span data-testid="cycle-predicted-dot" className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full border border-red-400" title="預測月經" />
              )}
              {isFertile && (
                <span data-testid="cycle-fertile-dot" className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" title="適合備孕" />
              )}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity z-20 whitespace-nowrap pointer-events-none">
                {day.date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                <br />
                {day.count} 次記錄
                {isPeriod && <><br />🔴 月經</>}
                {!isPeriod && isPredictedPeriod && <><br />⭕ 預測月經</>}
                {isFertile && <><br />🟢 適合備孕</>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend and stats */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-gray-500">
        <div className="flex items-center space-x-2">
          <span>較少</span>
          <div className="flex space-x-1">
            <div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded-sm"></div>
            <div className="w-3 h-3 bg-pink-100 border border-pink-200 rounded-sm"></div>
            <div className="w-3 h-3 bg-pink-200 border border-pink-300 rounded-sm"></div>
            <div className="w-3 h-3 bg-pink-300 border border-pink-400 rounded-sm"></div>
            <div className="w-3 h-3 bg-pink-500 border border-pink-600 rounded-sm"></div>
          </div>
          <span>較多</span>
        </div>
        {(periodDates || fertileDates || predictedPeriodDates) && (
          <div className="flex items-center gap-3">
            {periodDates && periodDates.size > 0 && (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> 月經</span>
            )}
            {predictedPeriodDates && predictedPeriodDates.size > 0 && (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full border border-red-400" /> 預測月經</span>
            )}
            {fertileDates && fertileDates.size > 0 && (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 適合備孕</span>
            )}
          </div>
        )}
        <span>最高 {maxCount} 次</span>
      </div>
    </div>
  );
}

export function IntimacyStatsCards({ records }: { records: IntimateRecord[] }) {
  const derived = useMemo(() => {
    if (!records || records.length === 0) {
      return { total: 0, monthlyAvg: 0, thisWeek: 0, thisMonth: 0 };
    }
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisWeek = records.filter(r => new Date(r.date) >= startOfWeek).length;
    const thisMonth = records.filter(r => new Date(r.date) >= startOfMonth).length;

    const earliest = records.reduce((min, r) => (r.date < min ? r.date : min), records[0].date);
    const earliestDate = new Date(earliest);
    const monthsSpan = Math.max(
      1,
      (now.getFullYear() - earliestDate.getFullYear()) * 12 + (now.getMonth() - earliestDate.getMonth()) + 1
    );
    const monthlyAvg = records.length / monthsSpan;

    return { total: records.length, monthlyAvg, thisWeek, thisMonth };
  }, [records]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      <div className="bg-white rounded-md p-5 border border-petal-rule">
        <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-1.5">總記錄</div>
        <div className="font-display italic font-light text-3xl text-petal-ink">{derived.total}</div>
      </div>
      <div className="bg-white rounded-md p-5 border border-petal-rule">
        <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-1.5">月平均</div>
        <div className="font-display italic font-light text-3xl text-petal-ink">{derived.monthlyAvg.toFixed(1)}</div>
      </div>
      <div className="bg-petal-rose-soft/30 rounded-md p-5 border border-petal-rose-soft">
        <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-rose-deep mb-1.5">本週次數</div>
        <div className="font-display italic font-light text-3xl text-petal-rose-deep">{derived.thisWeek}</div>
      </div>
      <div className="bg-petal-sage/15 rounded-md p-5 border border-petal-sage/40">
        <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-sage-deep mb-1.5">本月次數</div>
        <div className="font-display italic font-light text-3xl text-petal-sage-deep">{derived.thisMonth}</div>
      </div>
    </div>
  );
}
