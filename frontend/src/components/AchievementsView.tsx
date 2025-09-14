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
      setAchievements(achievementsData as AchievementStats);
      setStats(statsData as IntimacyStats);
    } catch (err: unknown) {
      console.error('Failed to load achievements and stats:', err);
      setError((err as Error)?.message || '載入數據失敗');
    } finally {
      setLoading(false);
    }
  };

  // Build monthly series from records for a small bar chart (12 months)
  const monthlySeries = useMemo(() => {
    const counts = new Array(12).fill(0);
    if (stats?.monthly_data && stats.monthly_data.length > 0) {
      stats.monthly_data.forEach((m) => {
        const normalized = m.month.replace('/', '-');
        const parts = normalized.split('-');
        const mm = parts.length === 2 ? parts[1] : parts[parts.length - 1];
        const monthIdx = Number(mm) - 1;
        if (!Number.isNaN(monthIdx) && monthIdx >= 0 && monthIdx < 12) {
          counts[monthIdx] = m.count;
        }
      });
    }
    return counts;
  }, [stats]);

  // Daily distributions for current and previous month
  const { currentMonthSeries, previousMonthSeries, currentMonthDays, previousMonthDays } = useMemo(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const daysInCurrent = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysInPrev = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
    const cur = new Array(daysInCurrent).fill(0);
    const pre = new Array(daysInPrev).fill(0);
    records.forEach((r) => {
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) return;
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        cur[(d.getDate() - 1)] += 1;
      } else if (d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth()) {
        pre[(d.getDate() - 1)] += 1;
      }
    });
    return { currentMonthSeries: cur, previousMonthSeries: pre, currentMonthDays: daysInCurrent, previousMonthDays: daysInPrev };
  }, [records]);

  // Badge logic
  const badges = useMemo(() => {
    if (!stats) return [];
    const b = [];
    // Weekly/Monthly/Total badges
    if (stats.average_per_week >= 1) b.push({ name: '週間戀人', icon: '💕', desc: '本週至少一次親密時光' });
    if (stats.average_per_week >= 2) b.push({ name: '熱戀情侶', icon: '🔥', desc: '本週至少兩次親密時光' });
    if (stats.average_per_week >= 3) b.push({ name: '甜蜜無敵', icon: '🌟', desc: '本週三次以上親密時光' });
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
  }, [stats, records]);

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
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">親密統計</h1>
        <p className="text-gray-600">查看你們的親密統計與成就徽章</p>
      </div>

      {/* Intimacy Stats Section */}
      {stats && (
        <div className="space-y-6 mb-10">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center">
                <span className="text-2xl mr-3">💗</span>
                <div>
                  <p className="text-sm text-gray-600">總記錄</p>
                  <p className="text-2xl font-bold text-gray-800">{stats.total_moments}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center">
                <span className="text-2xl mr-3">📈</span>
                <div>
                  <p className="text-sm text-gray-600">月平均</p>
                  <p className="text-2xl font-bold text-gray-800">{(stats.average_per_month || 0).toFixed(1)}</p>
                </div>
              </div>
            </div>
          </div>
          {/* Weekly/Monthly Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-pink-50 rounded-lg p-4 border border-pink-200 text-center">
              <div className="text-lg font-bold text-pink-600">本週次數</div>
              <div className="text-2xl font-bold">{(stats as any).this_week ?? 0}</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200 text-center">
              <div className="text-lg font-bold text-purple-600">本月次數</div>
              <div className="text-2xl font-bold">{(stats as any).this_month ?? 0}</div>
            </div>
          </div>

          {/* Bar Chart: Monthly distribution */}
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">每月記錄分佈</h3>
            <MonthlyBarChart data={monthlySeries} />
          </div>
          {/* Current Month Distribution */}
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">本月記錄分佈</h3>
            <DailyBarChart data={currentMonthSeries} days={currentMonthDays} />
          </div>
          {/* Previous Month Distribution */}
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">上月記錄分佈</h3>
            <DailyBarChart data={previousMonthSeries} days={previousMonthDays} />
          </div>
          {/* Badges */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">愛情成就徽章</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {badges.length > 0 ? badges.map((badge, index) => (
                <div key={index} className="flex items-center space-x-4 p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg border-2 border-yellow-200">
                  <div className="text-3xl">{badge.icon}</div>
                  <div>
                    <div className="font-bold text-gray-800">{badge.name}</div>
                    <div className="text-sm text-gray-600">{badge.desc}</div>
                  </div>
                </div>
              )) : (
                <div className="col-span-2 text-center py-8 text-gray-500">
                  開始記錄你們的愛情，解鎖更多成就徽章！
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Achievements Section */}
      {achievements && stats && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">成就進度</h2>
              <span className="text-2xl font-bold text-pink-600">
                {Math.round(achievements.completion_percentage)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-pink-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${achievements.completion_percentage}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              已解鎖 {achievements.unlocked_achievements} / {achievements.total_achievements} 個成就
            </p>
          </div>

          {/* Recent Achievements */}
          {achievements.recent_achievements.length > 0 && (
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
                    <span className="text-2xl mr-3">{achievement.icon}</span>
                    <div>
                      <h4 className="font-semibold text-gray-800">{achievement.title}</h4>
                      <p className="text-sm text-gray-600">{achievement.description}</p>
                    </div>
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>進度</span>
                      <span>{achievement.progress} / {achievement.max_progress}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          achievement.is_unlocked
                            ? 'bg-gradient-to-r from-green-400 to-green-600'
                            : 'bg-gradient-to-r from-gray-300 to-gray-400'
                        }`}
                        style={{
                          width: `${Math.min((achievement.progress / achievement.max_progress) * 100, 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                  {achievement.is_unlocked && (
                    <p className="text-xs text-green-600 font-medium">✅ 已解鎖</p>
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

// Simple responsive bar chart without external deps
function MonthlyBarChart({ data }: { data: number[] }) {
  const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const max = Math.max(1, ...data);
  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max * i) / ticks));

  return (
    <div className="w-full">
      <div className="flex gap-3 h-40 sm:h-48">
        {/* Y Axis */}
        <div className="w-8 sm:w-10 flex flex-col justify-between text-[10px] text-gray-400">
          {tickValues.slice().reverse().map((v, i) => (
            <div key={i} className="-translate-y-1">{v}</div>
          ))}
        </div>
        {/* Chart Area */}
        <div className="relative flex-1">
          {/* Horizontal grid lines */}
          {tickValues.map((v, i) => (
            <div
              key={i}
              className={`absolute left-0 right-0 border-t ${i === 0 ? 'border-gray-300' : 'border-gray-200/60'}`}
              style={{ bottom: `${(v / max) * 100}%` }}
            />
          ))}
          <div className="grid grid-cols-12 gap-2 items-end h-full relative">
            {data.map((value, idx) => {
              const height = (value / max) * 100;
              return (
                <div key={idx} className="group flex flex-col items-center h-full relative">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-pink-500 to-purple-500 transition-transform duration-200 group-hover:scale-y-105"
                    style={{ height: `${height}%`, minHeight: value > 0 ? '2px' : '0' }}
                  />
                  {/* Tooltip */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-gray-800 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ bottom: `calc(${height}% + 8px)` }}
                  >
                    {labels[idx]}月：{value}
                  </div>
                  <div className="mt-2 text-xs text-gray-600">{labels[idx]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 text-right text-xs text-gray-500">最高 {Math.max(...data)} 次</div>
    </div>
  );
}

function DailyBarChart({ data, days }: { data: number[]; days: number }) {
  const labels = Array.from({ length: days }, (_, i) => String(i + 1));
  const max = Math.max(1, ...data);
  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max * i) / ticks));
  return (
    <div className="w-full overflow-hidden">
      <div className="flex gap-3 h-32 sm:h-40">
        {/* Y Axis */}
        <div className="w-8 sm:w-10 flex flex-col justify-between text-[10px] text-gray-400">
          {tickValues.slice().reverse().map((v, i) => (
            <div key={i} className="-translate-y-1">{v}</div>
          ))}
        </div>
        {/* Chart Area */}
        <div className="relative flex-1">
          {tickValues.map((v, i) => (
            <div
              key={i}
              className={`absolute left-0 right-0 border-t ${i === 0 ? 'border-gray-300' : 'border-gray-200/60'}`}
              style={{ bottom: `${(v / max) * 100}%` }}
            />
          ))}
          <div className="grid items-end h-full" style={{ gridTemplateColumns: `repeat(${days}, minmax(8px, 1fr))` }}>
            {data.map((value, idx) => {
              const height = (value / max) * 100;
              return (
                <div key={idx} className="group flex flex-col items-center h-full relative">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-indigo-500 to-pink-500 transition-transform duration-200 group-hover:scale-y-105"
                    style={{ height: `${height}%`, minHeight: value > 0 ? '2px' : '0' }}
                  />
                  <div
                    className="absolute left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-gray-800 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ bottom: `calc(${height}% + 6px)` }}
                  >
                    第{labels[idx]}天：{value}
                  </div>
                  <div className="mt-1 text-[10px] text-gray-500">{labels[idx]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 text-right text-xs text-gray-500">最高 {Math.max(...data)} 次</div>
    </div>
  );
}