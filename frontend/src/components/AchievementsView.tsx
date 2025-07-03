import React, { useState, useEffect } from 'react';
import apiService from '../services/api';

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
  total_days: number;
  total_months: number;
  average_per_month: number;
  average_per_week: number;
  longest_streak: number;
  current_streak: number;
  total_coins_earned: number;
  total_coins_spent: number;
  current_balance: number;
  favorite_activity?: string;
  most_active_month?: string;
  most_active_day?: string;
  first_record_date?: string;
  last_record_date?: string;
  total_duration_hours: number;
  average_duration_minutes: number;
}

export function AchievementsView() {
  const [achievements, setAchievements] = useState<AchievementStats | null>(null);
  const [stats, setStats] = useState<IntimacyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'achievements' | 'stats'>('achievements');

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

      setAchievements(achievementsData);
      setStats(statsData);
    } catch (err: any) {
      console.error('Failed to load achievements and stats:', err);
      setError(err.message || '載入數據失敗');
    } finally {
      setLoading(false);
    }
  };

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
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">成就與統計</h1>
        <p className="text-gray-600">查看您的愛情成就和詳細統計</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('achievements')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'achievements'
              ? 'text-pink-600 border-b-2 border-pink-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🏆 成就 ({achievements?.unlocked_achievements || 0}/{achievements?.total_achievements || 0})
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'stats'
              ? 'text-pink-600 border-b-2 border-pink-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📊 統計
        </button>
      </div>

      {/* Achievements Tab */}
      {activeTab === 'achievements' && achievements && (
        <div className="space-y-6">
          {/* Progress Overview */}
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

      {/* Stats Tab */}
      {activeTab === 'stats' && stats && (
        <div className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center">
                <span className="text-2xl mr-3">💕</span>
                <div>
                  <p className="text-sm text-gray-600">總記錄</p>
                  <p className="text-2xl font-bold text-gray-800">{stats.total_moments}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center">
                <span className="text-2xl mr-3">📅</span>
                <div>
                  <p className="text-sm text-gray-600">記錄天數</p>
                  <p className="text-2xl font-bold text-gray-800">{stats.total_days}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center">
                <span className="text-2xl mr-3">💰</span>
                <div>
                  <p className="text-sm text-gray-600">金幣餘額</p>
                  <p className="text-2xl font-bold text-gray-800">{stats.current_balance}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center">
                <span className="text-2xl mr-3">📊</span>
                <div>
                  <p className="text-sm text-gray-600">月平均</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {stats.average_per_month.toFixed(1)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">時間統計</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">總時長</span>
                  <span className="font-medium">{stats.total_duration_hours.toFixed(1)} 小時</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">平均時長</span>
                  <span className="font-medium">{stats.average_duration_minutes.toFixed(0)} 分鐘</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">記錄月數</span>
                  <span className="font-medium">{stats.total_months} 個月</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">週平均</span>
                  <span className="font-medium">{stats.average_per_week.toFixed(1)} 次</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">金幣統計</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">總賺取</span>
                  <span className="font-medium text-green-600">+{stats.total_coins_earned}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">總花費</span>
                  <span className="font-medium text-red-600">-{stats.total_coins_spent}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">當前餘額</span>
                  <span className="font-medium text-blue-600">{stats.current_balance}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Activity Insights */}
          <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">活動洞察</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stats.favorite_activity && (
                <div>
                  <p className="text-sm text-gray-600">最喜歡的活動</p>
                  <p className="font-medium">{stats.favorite_activity}</p>
                </div>
              )}
              {stats.most_active_month && (
                <div>
                  <p className="text-sm text-gray-600">最活躍月份</p>
                  <p className="font-medium">{stats.most_active_month}</p>
                </div>
              )}
              {stats.most_active_day && (
                <div>
                  <p className="text-sm text-gray-600">最活躍星期</p>
                  <p className="font-medium">{stats.most_active_day}</p>
                </div>
              )}
            </div>
          </div>

          {/* Date Range */}
          <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">記錄時間範圍</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.first_record_date && (
                <div>
                  <p className="text-sm text-gray-600">首次記錄</p>
                  <p className="font-medium">
                    {new Date(stats.first_record_date).toLocaleDateString('zh-TW')}
                  </p>
                </div>
              )}
              {stats.last_record_date && (
                <div>
                  <p className="text-sm text-gray-600">最近記錄</p>
                  <p className="font-medium">
                    {new Date(stats.last_record_date).toLocaleDateString('zh-TW')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 