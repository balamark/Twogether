const express = require('express');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logInfo, logError } = require('../lib/logger');

const router = express.Router();

// All achievement routes require authentication
router.use(authenticateToken);

// Define achievement types and their requirements
const ACHIEVEMENT_TYPES = {
  'first_moment': {
    name: '初戀',
    description: '記錄第一次親密時光',
    icon: '💕',
    category: 'milestone',
    points: 10
  },
  'one_week': {
    name: '一週年',
    description: '在一起一週年',
    icon: '🎂',
    category: 'anniversary',
    points: 50
  },
  'consistent_month': {
    name: '月月相愛',
    description: '連續記錄30天',
    icon: '📅',
    category: 'consistency',
    points: 100
  },
  'first_photo': {
    name: '攝影師',
    description: '上傳第一張照片',
    icon: '📸',
    category: 'media',
    points: 20
  },
  'coin_collector': {
    name: '金幣收集家',
    description: '累積100金幣',
    icon: '🪙',
    category: 'coins',
    points: 30
  },
  'love_master': {
    name: '親密達人',
    description: '記錄100次親密時光',
    icon: '🔥',
    category: 'milestone',
    points: 200
  },
  'perfect_couple': {
    name: '完美情侶',
    description: '完成所有成就',
    icon: '👑',
    category: 'special',
    points: 500
  }
};

// Get achievements for couple
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Find user's couple
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    if (coupleResult.rows.length === 0) {
      return res.json({
        success: true,
        achievements: []
      });
    }

    const coupleId = coupleResult.rows[0].id;

    // Get earned achievements from Supabase achievements table
    const result = await db.query(`
      SELECT
        badge_type,
        earned_date,
        milestone_value
      FROM achievements
      WHERE couple_id = $1
      ORDER BY earned_date
    `, [coupleId]);

    // Build achievement list with earned status
    const achievements = Object.entries(ACHIEVEMENT_TYPES).map(([key, achievement]) => {
      const earned = result.rows.find(row => row.badge_type === key);
      return {
        id: key,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        category: achievement.category,
        points: achievement.points,
        unlocked: !!earned,
        unlocked_at: earned?.earned_date || null,
        milestone_value: earned?.milestone_value || null
      };
    });

    // Group achievements by category
    const groupedAchievements = achievements.reduce((acc, achievement) => {
      if (!acc[achievement.category]) {
        acc[achievement.category] = [];
      }
      acc[achievement.category].push(achievement);
      return acc;
    }, {});

    // Calculate total points
    const totalPoints = achievements
      .filter(a => a.unlocked)
      .reduce((sum, a) => sum + a.points, 0);

    const unlockedCount = achievements.filter(a => a.unlocked).length;

    // Get recent achievements (last 5 unlocked, sorted by unlock date)
    const recentAchievements = achievements
      .filter(a => a.unlocked)
      .sort((a, b) => new Date(b.unlocked_at) - new Date(a.unlocked_at))
      .slice(0, 5);

    res.json({
      success: true,
      achievements: groupedAchievements,
      stats: {
        total_achievements: achievements.length,
        unlocked_achievements: unlockedCount,
        total_points: totalPoints,
        completion_rate: Math.round((unlockedCount / achievements.length) * 100),
        recent_achievements: recentAchievements
      }
    });

  } catch (error) {
    logError('Get achievements failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取成就失敗'
    });
  }
});

// Check and unlock achievements
router.post('/check', async (req, res) => {
  try {
    const userId = req.user.id;

    // Find user's couple
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    if (coupleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '您還沒有情侶關係'
      });
    }

    const coupleId = coupleResult.rows[0].id;

    // Get couple stats for achievement checking
    const statsResult = await db.query(`
      SELECT
        COUNT(DISTINCT lm.id) as love_moments_count,
        COUNT(DISTINCT p.id) as photos_count,
        EXTRACT(DAY FROM (NOW() - c.created_at)) as days_together,
        COUNT(DISTINCT DATE(lm.moment_date)) as active_days,
        COALESCE(SUM(CASE WHEN ct.transaction_type = 'earn' THEN ct.amount ELSE -ct.amount END), 0) as total_coins
      FROM couples c
      LEFT JOIN love_moments lm ON c.id = lm.couple_id
      LEFT JOIN photos p ON c.id = p.couple_id
      LEFT JOIN coin_transactions ct ON c.id = ct.couple_id
      WHERE c.id = $1
      GROUP BY c.id, c.created_at
    `, [coupleId]);

    const stats = statsResult.rows[0] || {
      love_moments_count: 0,
      photos_count: 0,
      days_together: 0,
      active_days: 0,
      total_coins: 0
    };

    // Define achievement conditions mapped to badge_type
    const achievementChecks = [
      {
        condition: parseInt(stats.love_moments_count) >= 1,
        badge_type: 'first_moment',
        milestone_value: 1
      },
      {
        condition: parseInt(stats.photos_count) >= 1,
        badge_type: 'first_photo',
        milestone_value: 1
      },
      {
        condition: parseInt(stats.days_together) >= 7,
        badge_type: 'one_week',
        milestone_value: 7
      },
      {
        condition: parseInt(stats.active_days) >= 30,
        badge_type: 'consistent_month',
        milestone_value: 30
      },
      {
        condition: parseInt(stats.total_coins) >= 100,
        badge_type: 'coin_collector',
        milestone_value: 100
      },
      {
        condition: parseInt(stats.love_moments_count) >= 100,
        badge_type: 'love_master',
        milestone_value: 100
      }
    ];

    const newlyUnlocked = [];

    for (const check of achievementChecks) {
      if (check.condition) {
        // Check if already unlocked in Supabase achievements table
        const existingResult = await db.query(
          'SELECT id FROM achievements WHERE couple_id = $1 AND badge_type = $2',
          [coupleId, check.badge_type]
        );

        if (existingResult.rows.length === 0) {
          // Unlock achievement by inserting into achievements table
          await db.query(
            'INSERT INTO achievements (couple_id, badge_type, earned_date, milestone_value) VALUES ($1, $2, NOW(), $3)',
            [coupleId, check.badge_type, check.milestone_value]
          );

          // Get achievement details from our constants
          const achievementDetails = ACHIEVEMENT_TYPES[check.badge_type];
          if (achievementDetails) {
            newlyUnlocked.push({
              badge_type: check.badge_type,
              name: achievementDetails.name,
              description: achievementDetails.description,
              icon: achievementDetails.icon,
              points: achievementDetails.points,
              milestone_value: check.milestone_value
            });
          }
        }
      }
    }

    logInfo('Achievement check complete', { coupleId, unlockedCount: newlyUnlocked.length });

    res.json({
      success: true,
      newly_unlocked: newlyUnlocked,
      stats
    });

  } catch (error) {
    logError('Check achievements failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '檢查成就失敗'
    });
  }
});

module.exports = router;
