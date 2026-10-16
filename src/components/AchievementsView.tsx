import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Send, Sparkles, RefreshCw, X, HelpCircle } from 'lucide-react';
import apiService from '../services/api';
import type { NudgeSuggestion } from '../services/api';
import type { Notification } from '../App';
import { useTimezone } from '../contexts/TimezoneContext';
import { useFeatureFlag } from '../contexts/FeatureFlagsContext';
import { formatDate, formatYmdInTz } from '../utils/datetime';
import { tr } from '../i18n/tr';

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
  const tz = useTimezone();
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
      setError((err as Error)?.message || tr('載入數據失敗', 'Couldn\'t load the data'));
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
    if (currentStats.thisWeek >= 1) b.push({ name: tr('週間戀人', 'Weekday lovers'), icon: '💕', desc: tr('本週至少一次親密時光', 'At least one intimate moment this week') });
    if (currentStats.thisWeek >= 2) b.push({ name: tr('熱戀情侶', 'Head over heels'), icon: '🔥', desc: tr('本週至少兩次親密時光', 'At least two intimate moments this week') });
    if (currentStats.thisWeek >= 3) b.push({ name: tr('甜蜜無敵', 'Unstoppably sweet'), icon: '🌟', desc: tr('本週三次以上親密時光', 'Three or more intimate moments this week') });
    if (stats.total_moments >= 10) b.push({ name: tr('愛情老手', 'Seasoned lovers'), icon: '🏆', desc: tr('累計十次親密記錄', '10 intimacy records in total') });
    if (stats.total_moments >= 50) b.push({ name: tr('愛情大師', 'Love masters'), icon: '👑', desc: tr('累計五十次親密記錄', '50 intimacy records in total') });
    // Unique poses badge
    const uniquePoses = new Set(records.map(r => r.activityType).filter(Boolean));
    if (uniquePoses.size >= 3) b.push({ name: tr('多樣體驗', 'Variety'), icon: '🧘', desc: tr(`已嘗試 ${uniquePoses.size} 種不同體位/活動`, `Tried ${uniquePoses.size} different positions/activities`) });
    // Unique locations badge
    const uniqueLocs = new Set(records.map(r => r.location).filter(Boolean));
    if (uniqueLocs.size >= 3) b.push({ name: tr('冒險地點', 'Adventurous places'), icon: '🗺️', desc: tr(`已在 ${uniqueLocs.size} 個不同地點親密`, `Intimate in ${uniqueLocs.size} different places`) });
    // Longest duration badge
    const maxDuration = Math.max(...records.map(r => parseInt(r.duration ?? '0') || 0));
    if (maxDuration >= 60) b.push({ name: tr('最長紀錄', 'Longest session'), icon: '⏱️', desc: tr(`單次親密時長達 ${maxDuration} 分鐘`, `A single session lasted ${maxDuration} minutes`) });
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
          {tr('重新載入', 'Reload')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink">
          {tr('親密', 'Intimacy')}<em className="not-italic font-light italic text-pink-600">{tr('統計', ' stats')}</em>
        </h3>
        <span className="font-display italic font-light text-sm text-petal-muted">
          {tr('你們的數據與成就', 'Your numbers and achievements')}
        </span>
      </div>

      {stats && (
        <div className="space-y-8 mb-10">
          {/* Badges */}
          <div>
            <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6">
              {tr('愛情', 'Love')}<em className="not-italic font-light italic text-pink-600">{tr('成就徽章', ' badges')}</em>
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
                    {tr('開始記錄你們的愛情 — 解鎖更多成就徽章', 'Start recording your love story to unlock more badges')}
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
              <h2 className="font-display text-xl font-medium tracking-tight text-petal-ink">{tr('成就', 'Achievement')}<em className="not-italic font-light italic text-pink-600">{tr('進度', ' progress')}</em></h2>
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
              {tr('已解鎖', 'Unlocked')} {achievements.unlocked_achievements} / {achievements.total_achievements} {tr('個成就', ' achievements')}
            </p>
          </div>

          {/* Recent Achievements */}
          {achievements.recent_achievements && achievements.recent_achievements.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">{tr('最近解鎖', 'Recently unlocked')}</h3>
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
                        {tr('解鎖於', 'Unlocked on')} {formatDate(achievement.unlocked_at, tz, { year: 'numeric', month: 'numeric', day: 'numeric', withWeekday: false })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Achievements */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">{tr('所有成就', 'All achievements')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  id: '1',
                  title: tr('初次記錄', 'First record'),
                  description: tr('記錄第一次愛的時光', 'Record your first moment of love'),
                  icon: '🌟',
                  category: 'milestone',
                  progress: stats?.total_moments || 0,
                  max_progress: 1,
                  is_unlocked: (stats?.total_moments || 0) > 0,
                },
                {
                  id: '2',
                  title: tr('甜蜜時光', 'Sweet moments'),
                  description: tr('記錄10次愛的時光', 'Record 10 moments of love'),
                  icon: '💕',
                  category: 'milestone',
                  progress: stats?.total_moments || 0,
                  max_progress: 10,
                  is_unlocked: (stats?.total_moments || 0) >= 10,
                },
                {
                  id: '3',
                  title: tr('浪漫情侶', 'Romantic couple'),
                  description: tr('記錄50次愛的時光', 'Record 50 moments of love'),
                  icon: '💖',
                  category: 'milestone',
                  progress: stats?.total_moments || 0,
                  max_progress: 50,
                  is_unlocked: (stats?.total_moments || 0) >= 50,
                },
                {
                  id: '4',
                  title: tr('愛情專家', 'Love expert'),
                  description: tr('記錄100次愛的時光', 'Record 100 moments of love'),
                  icon: '👑',
                  category: 'milestone',
                  progress: stats?.total_moments || 0,
                  max_progress: 100,
                  is_unlocked: (stats?.total_moments || 0) >= 100,
                },
                {
                  id: '5',
                  title: tr('每日情侶', 'Daily couple'),
                  description: tr('連續記錄7天', 'Record 7 days in a row'),
                  icon: '📅',
                  category: 'streak',
                  progress: stats?.total_days || 0,
                  max_progress: 7,
                  is_unlocked: (stats?.total_days || 0) >= 7,
                },
                {
                  id: '6',
                  title: tr('月度情侶', 'Monthly couple'),
                  description: tr('記錄3個月的時光', 'Record 3 months of moments'),
                  icon: '📆',
                  category: 'streak',
                  progress: stats?.total_months || 0,
                  max_progress: 3,
                  is_unlocked: (stats?.total_months || 0) >= 3,
                },
                {
                  id: '7',
                  title: tr('金幣收集者', 'Coin collector'),
                  description: tr('累積1000金幣', 'Collect 1,000 coins'),
                  icon: '💰',
                  category: 'coins',
                  progress: stats?.total_coins_earned || 0,
                  max_progress: 1000,
                  is_unlocked: (stats?.total_coins_earned || 0) >= 1000,
                },
                {
                  id: '8',
                  title: tr('金幣大師', 'Coin master'),
                  description: tr('累積5000金幣', 'Collect 5,000 coins'),
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
                      <span>{tr('進度', 'Progress')}</span>
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
                    <p className="font-display italic font-light text-xs text-petal-sage-deep">{tr('— 已解鎖', '— Unlocked')}</p>
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
  const tz = useTimezone();
  // Use the viewer's tz for "now" so the default month/year reflects local
  // wall-clock (a Taipei viewer sees the Taipei month, not UTC's).
  const nowYmd = formatYmdInTz(new Date(), tz);
  const [nowYear, nowMonth] = [Number(nowYmd.slice(0, 4)), Number(nowYmd.slice(5, 7)) - 1];
  const targetYear = year ?? nowYear;
  const targetMonth = month ?? nowMonth;

  // Generate calendar data
  const calendarData = useMemo(() => {
    const firstDay = new Date(targetYear, targetMonth, 1);
    const lastDay = new Date(targetYear, targetMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    const pad = (n: number) => String(n).padStart(2, '0');

    // Build a cell for any calendar date, keyed by its local YYYY-MM-DD (never
    // toISOString() — that shifts to UTC and mis-keys by the tz offset).
    const makeCell = (d: Date, isAdjacent: boolean) => {
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      // record.date is a YYYY-MM-DD string from the API — compare as-is.
      const count = data.filter(record => record.date === dateStr).length;
      return { date: d, count, isEmpty: false, isAdjacent, dateStr };
    };

    const days = [];

    // Leading cells: the PREVIOUS month's trailing days, so records right
    // before the 1st (e.g. 6/30 when 7/1 is a Wednesday) stay visible instead
    // of being hidden behind blank padding. `1 - i` rolls into the prior month.
    for (let i = startDayOfWeek; i > 0; i--) {
      days.push(makeCell(new Date(targetYear, targetMonth, 1 - i), true));
    }

    // The target month.
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(makeCell(new Date(targetYear, targetMonth, day), false));
    }

    // Trailing cells: the NEXT month's leading days, to complete the last week
    // (Date normalizes the month/year overflow).
    for (let nextDay = 1; days.length % 7 !== 0; nextDay++) {
      days.push(makeCell(new Date(targetYear, targetMonth + 1, nextDay), true));
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

  const weekDays = [tr('日', 'Sun'), tr('一', 'Mon'), tr('二', 'Tue'), tr('三', 'Wed'), tr('四', 'Thu'), tr('五', 'Fri'), tr('六', 'Sat')];
  const monthNames = [tr('一月', 'Jan'), tr('二月', 'Feb'), tr('三月', 'Mar'), tr('四月', 'Apr'), tr('五月', 'May'), tr('六月', 'Jun'), tr('七月', 'Jul'), tr('八月', 'Aug'), tr('九月', 'Sep'), tr('十月', 'Oct'), tr('十一月', 'Nov'), tr('十二月', 'Dec')];

  const maxCount = Math.max(0, ...calendarData.filter(d => !d.isAdjacent).map(d => d.count));
  const todayStr = formatYmdInTz(new Date(), tz);

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
                title={tr("上一個月", 'Previous month')}
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <span className="text-sm text-gray-500 min-w-[80px] text-center">
              {targetYear}{tr('年', '')} {monthNames[targetMonth]}
            </span>
            {onNavigate && (
              <button
                onClick={() => navigateMonth(1)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                title={tr("下一個月", 'Next month')}
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
      <div className="grid grid-cols-7 gap-1 mb-4" data-testid="calendar-grid">
        {calendarData.map((day, index) => {
          if (day.isEmpty || !day.date) {
            return <div key={index} className="aspect-square invisible" />;
          }
          const isSelected = selectedDay === day.dateStr;
          const isToday = day.dateStr === todayStr;
          const isPeriod = !!periodDates && periodDates.has(day.dateStr!);
          const isPredictedPeriod = !!predictedPeriodDates && predictedPeriodDates.has(day.dateStr!);
          const isFertile = !!fertileDates && fertileDates.has(day.dateStr!);
          return (
            <button
              key={index}
              type="button"
              onClick={() => onDaySelect?.(day.dateStr!)}
              data-testid={isToday ? 'calendar-today-cell' : undefined}
              className={`
                aspect-square rounded-sm border transition-all duration-200 hover:scale-110 hover:z-10 relative group cursor-pointer
                ${getIntensityClass(day.count)}
                ${day.isAdjacent ? 'opacity-45 hover:opacity-100' : ''}
                ${isToday && !isSelected ? 'ring-2 ring-petal-ink ring-offset-1 z-10' : ''}
                ${isSelected ? 'ring-2 ring-petal-rose-deep ring-offset-1 z-10' : ''}
              `}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xs ${isToday ? 'font-bold' : 'font-medium'} ${day.count >= 3 ? 'text-white' : isToday ? 'text-petal-ink' : 'text-gray-600'}`}>
                  {day.date.getDate()}
                </span>
              </div>
              {isPeriod && (
                <span data-testid="cycle-period-dot" className="absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-red-500" title={tr("月經", 'Period')} />
              )}
              {!isPeriod && isPredictedPeriod && (
                <span data-testid="cycle-predicted-dot" className="absolute top-0.5 left-0.5 w-2 h-2 rounded-full border border-red-400" title={tr("預測月經", 'Predicted period')} />
              )}
              {isFertile && (
                <span data-testid="cycle-fertile-dot" className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-500" title={tr("適合備孕", 'Fertile window')} />
              )}
              {day.count > 0 && (
                <span
                  data-testid="intimacy-heart"
                  className={`absolute top-0.5 right-0.5 flex items-center gap-px sm:gap-0.5 text-[10px] sm:text-lg md:text-xl leading-none font-semibold ${day.count >= 3 ? 'text-white' : 'text-rose-500'}`}
                  title={tr(`${day.count} 次記錄`, `${day.count} ${day.count === 1 ? 'record' : 'records'}`)}
                >
                  <span aria-hidden="true">♥</span>
                  <span className="text-[9px] sm:text-xs md:text-sm font-bold">{day.count}</span>
                </span>
              )}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity z-20 whitespace-nowrap pointer-events-none">
                {day.date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                <br />
                {day.count} {tr('次記錄', ' records')}
                {isPeriod && <><br />{tr('🔴 月經', '🔴 Period')}</>}
                {!isPeriod && isPredictedPeriod && <><br />{tr('⭕ 預測月經', '⭕ Predicted period')}</>}
                {isFertile && <><br />{tr('🟢 適合備孕', '🟢 Fertile window')}</>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend and stats */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-gray-500">
        <div className="flex items-center space-x-2">
          <span>{tr('較少', 'Fewer')}</span>
          <div className="flex space-x-1">
            <div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded-sm"></div>
            <div className="w-3 h-3 bg-pink-100 border border-pink-200 rounded-sm"></div>
            <div className="w-3 h-3 bg-pink-200 border border-pink-300 rounded-sm"></div>
            <div className="w-3 h-3 bg-pink-300 border border-pink-400 rounded-sm"></div>
            <div className="w-3 h-3 bg-pink-500 border border-pink-600 rounded-sm"></div>
          </div>
          <span>{tr('較多', 'More')}</span>
        </div>
        {(periodDates || fertileDates || predictedPeriodDates) && (
          <div className="flex items-center gap-3">
            {periodDates && periodDates.size > 0 && (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {tr('月經', 'Period')}</span>
            )}
            {predictedPeriodDates && predictedPeriodDates.size > 0 && (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full border border-red-400" /> {tr('預測月經', 'Predicted period')}</span>
            )}
            {fertileDates && fertileDates.size > 0 && (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {tr('適合備孕', 'Fertile window')}</span>
            )}
          </div>
        )}
        <span>{tr('最高', 'Max ')} {maxCount} {tr('次', '')}</span>
      </div>
    </div>
  );
}

// Quick「溫柔提醒」action for the 已經幾天沒有親密了 card. Twogether (the platform,
// NOT the partner) phrases the gap in a neutral, low-pressure way and offers three
// options — the recommended tone plus a couple of random others — for the user to
// send to their partner (in-app + email). Options are cached server-side per
// couple+day; we also memoize per day-count in-session so re-opening is instant.
function IntimacyNudgeButton({
  days,
  showNotification,
}: {
  days: number;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<NudgeSuggestion[]>([]);
  const [sendingIdx, setSendingIdx] = useState<number | null>(null);
  const [sentIdx, setSentIdx] = useState<number | null>(null);
  const cacheRef = useRef<Record<number, NudgeSuggestion[]>>({});

  const load = useCallback(async (regenerate: boolean) => {
    setLoading(true);
    try {
      if (!regenerate && cacheRef.current[days]) {
        setSuggestions(cacheRef.current[days]);
      } else {
        const result = await apiService.generateIntimacyNudges(days, regenerate);
        cacheRef.current[days] = result;
        setSuggestions(result);
        setSentIdx(null);
      }
    } catch (error) {
      showNotification({
        type: 'error',
        title: tr('產生失敗', 'Couldn\'t generate'),
        message: (error as Error)?.message || tr('暫時無法產生提醒句子，請稍後再試，或直接自行傳訊息給另一半。', 'We couldn\'t generate reminder messages right now. Please try again in a moment, or message your partner directly.'),
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }, [days, showNotification]);

  const handleOpen = () => {
    setOpen(true);
    if (suggestions.length === 0) load(false);
  };

  const handleSend = async (idx: number) => {
    const s = suggestions[idx];
    if (!s || sendingIdx !== null) return;
    if (!window.confirm(tr(`要讓 Twogether 把這則溫柔提醒送給TA嗎？\n\n「${s.text}」`, `Let Twogether send this gentle reminder to them?\n\n"${s.text}"`))) return;
    setSendingIdx(idx);
    try {
      const msg = await apiService.sendIntimacyNudgeMessage(s.text, days);
      setSentIdx(idx);
      showNotification({ type: 'success', title: tr('已送出', 'Sent'), message: msg, duration: 4000 });
    } catch (error) {
      showNotification({
        type: 'error',
        title: tr('送出失敗', 'Couldn\'t send'),
        message: (error as Error)?.message || tr('請稍後再試。', 'Please try again in a moment.'),
        duration: 4000,
      });
    } finally {
      setSendingIdx(null);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        data-testid="intimacy-nudge-open"
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-petal-rose-soft bg-white text-petal-rose-deep hover:bg-petal-rose-soft/20 transition-colors font-body text-sm font-medium"
      >
        <Sparkles className="w-4 h-4" strokeWidth={1.5} />
        {tr('讓 Twogether 溫柔提醒另一半', 'Let Twogether gently remind your partner')}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-petal-rose-soft bg-petal-rose-soft/10 p-4 space-y-3" data-testid="intimacy-nudge-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-body text-sm font-medium text-petal-rose-deep">
          <Sparkles className="w-4 h-4" strokeWidth={1.5} />
          {tr('選一則由 Twogether 送出的溫柔提醒', 'Pick a gentle reminder for Twogether to send')}
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-petal-muted hover:text-petal-ink" aria-label={tr("收起", 'Collapse')}>
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
      <p className="font-body text-xs text-petal-muted">{tr('由平台以中性、不帶壓力的語氣提醒你們（不是以你的名義）。挑一則送給TA，也會寄一封貼心提醒信。', 'Sent from the platform in a neutral, no-pressure tone (not in your name). Pick one to send them, and we\'ll also send a caring reminder email.')}</p>

      {loading ? (
        <p className="font-body text-sm text-petal-muted py-4 text-center">{tr('正在準備幾則溫柔的提醒…', 'Preparing a few gentle reminders…')}</p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s, idx) => (
            <li key={s.id || idx} className={`bg-white rounded-md border p-3 ${s.recommended ? 'border-petal-rose-deep' : 'border-petal-rule'}`}>
              <div className="flex items-center gap-2 mb-1">
                {s.label && (
                  <span className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep">{s.emoji ? `${s.emoji} ` : ''}{s.label}</span>
                )}
                {s.recommended && (
                  <span className="font-body text-[10px] px-1.5 py-0.5 rounded-full bg-petal-rose-soft/60 text-petal-rose-deep">{tr('推薦', 'Recommended')}</span>
                )}
              </div>
              <p className="font-body text-sm text-petal-ink leading-snug">{s.text}</p>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleSend(idx)}
                  disabled={sendingIdx !== null || sentIdx === idx}
                  data-testid="intimacy-nudge-send"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-60 transition-colors font-body text-xs font-medium"
                >
                  <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {sentIdx === idx ? tr('已送出', 'Sent') : sendingIdx === idx ? tr('送出中…', 'Sending…') : tr('送給TA', 'Send to them')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && suggestions.length > 0 && (
        <button
          type="button"
          onClick={() => load(true)}
          data-testid="intimacy-nudge-regenerate"
          className="inline-flex items-center gap-1.5 font-body text-xs text-petal-muted hover:text-petal-ink"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          {tr('換一批', 'Show others')}
        </button>
      )}
    </div>
  );
}

interface IntimacyStatsCardsProps {
  records: IntimateRecord[];
  birthDate?: string | null;
  onOpenSettings?: () => void;
  // Opens the 親密邀請 flow; shown as a CTA when the gap gets long. Only pass
  // when a partner is connected.
  onNudgePartner?: () => void;
  // Enables the「讓 Twogether 溫柔提醒」quick button (needs a connected partner).
  partnerConnected?: boolean;
  showNotification?: (n: Omit<Notification, 'id'>) => void;
}

// Progressive escalation for the「已經幾天沒有親密了」card. Because intimate
// records are couple-shared, both partners see this — so growing the number +
// a light caring nudge is how the partner learns the gap is getting long.
export interface DaysSinceLastNudge {
  tier: 0 | 1 | 2 | 3 | 4;
  numberClass: string;
  hint: string | null;
  showInvite: boolean;
}

export function daysSinceLastNudge(days: number | null): DaysSinceLastNudge {
  if (days === null || days < 7) {
    return { tier: 0, numberClass: 'text-3xl text-petal-ink', hint: null, showInvite: false };
  }
  if (days >= 15) {
    return {
      tier: 4,
      numberClass: 'text-6xl font-semibold text-petal-rose-deep',
      hint: tr(`已經 ${days} 天囉～真的該關心一下另一半了 💗`, `It's been ${days} days~ Time to show your partner some love 💗`),
      showInvite: true,
    };
  }
  if (days >= 12) {
    return {
      tier: 3,
      numberClass: 'text-5xl font-semibold text-petal-rose-deep',
      hint: tr(`${days} 天了，別讓距離越來越遠 👀`, `${days} days now. Don't let the distance grow 👀`),
      showInvite: true,
    };
  }
  if (days >= 10) {
    return {
      tier: 2,
      numberClass: 'text-5xl text-petal-rose-deep',
      hint: tr(`${days} 天了…該主動關心另一半囉！`, `${days} days… time to reach out to your partner!`),
      showInvite: false,
    };
  }
  // 7–9 days
  return {
    tier: 1,
    numberClass: 'text-4xl text-petal-rose-deep',
    hint: tr('一週沒親密囉～找個時間靠近一下吧 🙂', 'It\'s been a week~ Find a moment to get close 🙂'),
    showInvite: false,
  };
}

function ageFromBirthDate(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

// General health-reference buckets (not medical advice).
function weeklyRecommendationForAge(age: number): string | null {
  if (age < 18) return null;
  if (age < 30) return '3–4';
  if (age < 40) return '2–3';
  if (age < 50) return '1–2';
  return tr('約 1', 'About 1');
}

// On-demand health reference. Previously an always-on banner; now a (?) popover
// so it's available when curious without feeling clinical on every visit. Models
// the InfoHint pattern (button + absolute popover, close on outside mousedown).
function HealthReferenceHint({
  recommendation,
  hasBirthDate,
  onOpenSettings,
}: {
  recommendation: string | null;
  hasBirthDate: boolean;
  onOpenSettings?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-label={tr("健康參考", 'Health reference')}
        data-testid="health-reference-hint"
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded-full text-petal-muted hover:text-petal-rose-deep transition"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-72 bg-white border border-petal-rule rounded-xl shadow-petal p-3 text-left">
          {recommendation ? (
            <p className="text-sm text-petal-ink leading-relaxed">
              {tr('健康參考：建議每週', 'Health reference: about ')} <span className="font-semibold">{recommendation}</span> {tr('次', ' times a week')}
              <span className="text-xs text-petal-muted">{tr('（一般參考，非醫療建議）', ' (general reference, not medical advice)')}</span>
            </p>
          ) : (
            <p className="text-sm text-petal-ink leading-relaxed">{tr('規律親密對身心都有好處。', 'Regular intimacy is good for body and mind.')}</p>
          )}
          <ul className="mt-2 ml-4 list-disc space-y-1 text-xs text-petal-ink/80">
            <li>{tr('降低壓力與焦慮：促進腦內啡、催產素分泌，降低壓力荷爾蒙皮質醇。', 'Lowers stress and anxiety: boosts endorphins and oxytocin and lowers the stress hormone cortisol.')}</li>
            <li>{tr('改善睡眠：高潮後的催乳素與催產素有助於更深層的睡眠。', 'Improves sleep: prolactin and oxytocin after orgasm help with deeper sleep.')}</li>
            <li>{tr('免疫支持：研究指出每週 1–2 次與較高的免疫球蛋白 A（IgA）有關。', 'Supports immunity: research links 1–2 times a week with higher immunoglobulin A (IgA).')}</li>
            <li>{tr('心血管健康：屬於輕至中等強度的身體活動，對心臟有益。', 'Heart health: it counts as light to moderate physical activity, which is good for the heart.')}</li>
          </ul>
          {!hasBirthDate && onOpenSettings && (
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenSettings(); }}
              data-testid="stats-birthday-prompt"
              className="mt-2 block w-full text-left font-body text-xs text-petal-rose-deep hover:text-petal-ink underline decoration-dotted"
            >
              {tr('新增生日以獲得依年齡的健康參考建議 →', 'Add your birthday to get age-based health references →')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function IntimacyStatsCards({ records, birthDate, onOpenSettings, onNudgePartner, partnerConnected, showNotification }: IntimacyStatsCardsProps) {
  const derived = useMemo(() => {
    if (!records || records.length === 0) {
      return { total: 0, monthlyAvg: 0, weeklyAvg: 0, thisWeek: 0, thisMonth: 0, daysSinceLast: null as number | null };
    }
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisWeek = records.filter(r => new Date(r.date) >= startOfWeek).length;
    const thisMonth = records.filter(r => new Date(r.date) >= startOfMonth).length;

    const earliest = records.reduce((min, r) => (r.date < min ? r.date : min), records[0].date);
    const latest = records.reduce((max, r) => (r.date > max ? r.date : max), records[0].date);
    const earliestDate = new Date(earliest);
    const monthsSpan = Math.max(
      1,
      (now.getFullYear() - earliestDate.getFullYear()) * 12 + (now.getMonth() - earliestDate.getMonth()) + 1
    );
    const monthlyAvg = records.length / monthsSpan;

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksSpan = Math.max(1, Math.ceil((now.getTime() - earliestDate.getTime()) / msPerWeek));
    const weeklyAvg = records.length / weeksSpan;

    const latestDate = new Date(latest);
    latestDate.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const daysSinceLast = Math.max(0, Math.floor((today.getTime() - latestDate.getTime()) / (24 * 60 * 60 * 1000)));

    return { total: records.length, monthlyAvg, weeklyAvg, thisWeek, thisMonth, daysSinceLast };
  }, [records]);

  const age = ageFromBirthDate(birthDate);
  const recommendation = age !== null ? weeklyRecommendationForAge(age) : null;
  const hasRecords = derived.total > 0;
  const nudge = daysSinceLastNudge(hasRecords ? derived.daysSinceLast : null);
  // 周平均 is an admin-gated experiment — hidden by default, toggled on from
  // the /admin 功能開關 panel (feature flag `show_weekly_average`).
  const showWeeklyAvg = useFeatureFlag('show_weekly_average');

  return (
    <div className="space-y-3">
      {/* Section label with an on-demand health-reference (?) hint (replaces the
          old always-on banner). */}
      <div className="flex items-center justify-between">
        <span className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted">
          {tr('近況節奏', 'Recent rhythm')}
        </span>
        <HealthReferenceHint
          recommendation={recommendation}
          hasBirthDate={!!birthDate}
          onOpenSettings={onOpenSettings}
        />
      </div>

      {/* Recent / actionable metrics */}
      <div className={`grid grid-cols-2 ${showWeeklyAvg ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3 sm:gap-4`}>
        {showWeeklyAvg && (
          <div className="bg-white rounded-md p-5 border border-petal-rule" data-testid="weekly-avg-card">
            <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-1.5">{tr('周平均', 'Weekly average')}</div>
            <div className="font-display italic font-light text-3xl text-petal-ink">
              {hasRecords ? derived.weeklyAvg.toFixed(1) : '—'}
            </div>
          </div>
        )}
        <div className="bg-petal-rose-soft/30 rounded-md p-5 border border-petal-rose-soft">
          <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-rose-deep mb-1.5">{tr('本週次數', 'This week')}</div>
          <div className="font-display italic font-light text-3xl text-petal-rose-deep">{derived.thisWeek}</div>
        </div>
        <div className="bg-petal-sage/15 rounded-md p-5 border border-petal-sage/40">
          <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-sage-deep mb-1.5">{tr('本月次數', 'This month')}</div>
          <div className="font-display italic font-light text-3xl text-petal-sage-deep">{derived.thisMonth}</div>
        </div>
        <div
          className={`rounded-md p-5 border transition-colors ${
            nudge.tier >= 3
              ? 'bg-petal-rose-soft/40 border-petal-rose-soft'
              : nudge.tier >= 1
                ? 'bg-petal-rose-soft/20 border-petal-rose-soft'
                : 'bg-white border-petal-rule'
          }`}
          data-testid="days-since-last-card"
        >
          <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-1.5">{tr('已經幾天沒有親密了', 'Days since last intimacy')}</div>
          <div className={`font-display italic font-light leading-none transition-all ${nudge.numberClass}`}>
            {derived.daysSinceLast === null ? '—' : derived.daysSinceLast}
          </div>
          {nudge.hint && (
            <p className="mt-2 font-body text-xs text-petal-rose-deep leading-snug" data-testid="days-since-last-hint">
              {nudge.hint}
            </p>
          )}
        </div>
      </div>

      {/* When the gap is long, offer a one-tap way to reach out. */}
      {nudge.showInvite && onNudgePartner && (
        <button
          type="button"
          onClick={onNudgePartner}
          data-testid="days-since-last-nudge-cta"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-pink-500 text-white hover:bg-pink-600 transition-colors font-body text-sm font-medium"
        >
          <Send className="w-4 h-4" strokeWidth={1.5} />
          {tr('發送親密邀請給另一半', 'Send your partner an intimacy invitation')}
        </button>
      )}

      {/* Lighter, always-available option: let Twogether (the platform) phrase a
          gentle, neutral reminder (three choices) so it doesn't feel like a demand
          from you. */}
      {partnerConnected && showNotification && hasRecords && derived.daysSinceLast !== null && (
        <IntimacyNudgeButton days={derived.daysSinceLast} showNotification={showNotification} />
      )}

      {/* All-time totals — kept small */}
      <div className="font-body text-xs text-petal-muted">
        {tr('總記錄', 'Total records')} <span className="text-petal-ink font-medium">{derived.total}</span>
        <span className="mx-2">·</span>
        {tr('月平均', 'Monthly average')} <span className="text-petal-ink font-medium">{derived.monthlyAvg.toFixed(1)}</span>
      </div>
    </div>
  );
}
