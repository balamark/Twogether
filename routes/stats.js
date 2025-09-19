const express = require('express');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All stats routes require authentication
router.use(authenticateToken);

// Get couple statistics
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Find user's couple
    const coupleResult = await db.query(
      'SELECT id, created_at, anniversary_date FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    if (coupleResult.rows.length === 0) {
      return res.json({
        success: true,
        stats: {
          days_together: 0,
          love_moments: 0,
          photos: 0,
          achievements: 0,
          total_coins: 0
        }
      });
    }

    const couple = coupleResult.rows[0];
    const coupleId = couple.id;

    // Calculate days together
    const daysTogether = Math.floor((new Date() - new Date(couple.created_at)) / (1000 * 60 * 60 * 24));

    // Get comprehensive stats (using correct Supabase schema)
    const statsResult = await db.query(`
      SELECT
        COUNT(DISTINCT lm.id) as love_moments_count,
        COUNT(DISTINCT p.id) as photos_count,
        COUNT(DISTINCT a.id) as achievements_count,
        COALESCE(SUM(CASE WHEN ct.transaction_type = 'earn' THEN ct.amount ELSE -ct.amount END), 0) as total_coins
      FROM couples c
      LEFT JOIN love_moments lm ON c.id = lm.couple_id
      LEFT JOIN photos p ON c.id = p.couple_id
      LEFT JOIN achievements a ON c.id = a.couple_id
      LEFT JOIN coin_transactions ct ON c.id = ct.couple_id
      WHERE c.id = $1
      GROUP BY c.id
    `, [coupleId]);

    const stats = statsResult.rows[0] || {
      love_moments_count: 0,
      photos_count: 0,
      achievements_count: 0,
      total_coins: 0
    };

    // Get monthly breakdown of love moments
    const monthlyResult = await db.query(`
      SELECT
        DATE_TRUNC('month', moment_date) as month,
        COUNT(*) as count
      FROM love_moments
      WHERE couple_id = $1
      AND moment_date >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', moment_date)
      ORDER BY month DESC
    `, [coupleId]);

    // Get recent activity
    const recentActivityResult = await db.query(`
      SELECT
        'love_moment' as type,
        moment_date as date,
        'recorded a love moment' as description,
        u.nickname as user_nickname
      FROM love_moments lm
      JOIN users u ON lm.recorded_by = u.id
      WHERE lm.couple_id = $1

      UNION ALL

      SELECT
        'photo' as type,
        upload_date as date,
        'uploaded a photo' as description,
        '' as user_nickname
      FROM photos p
      WHERE p.couple_id = $1

      UNION ALL

      SELECT
        'achievement' as type,
        earned_date as date,
        'unlocked achievement: ' || badge_type as description,
        '' as user_nickname
      FROM achievements a
      WHERE a.couple_id = $1

      ORDER BY date DESC
      LIMIT 10
    `, [coupleId]);

    res.json({
      success: true,
      stats: {
        days_together: daysTogether,
        love_moments: parseInt(stats.love_moments_count) || 0,
        photos: parseInt(stats.photos_count) || 0,
        achievements: parseInt(stats.achievements_count) || 0,
        total_coins: parseInt(stats.total_coins) || 0,
        anniversary_date: couple.anniversary_date
      },
      monthly_breakdown: monthlyResult.rows.map(row => ({
        month: row.month,
        count: parseInt(row.count)
      })),
      recent_activity: recentActivityResult.rows.map(row => ({
        type: row.type,
        date: row.date,
        description: row.description,
        user_nickname: row.user_nickname
      }))
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: '獲取統計數據失敗'
    });
  }
});

// Get detailed achievement progress
router.get('/achievements', async (req, res) => {
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

    // Get achievement progress stats
    const progressResult = await db.query(`
      SELECT
        COUNT(DISTINCT lm.id) as total_love_moments,
        COUNT(DISTINCT p.id) as total_photos,
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

    const progress = progressResult.rows[0] || {
      total_love_moments: 0,
      total_photos: 0,
      days_together: 0,
      active_days: 0,
      total_coins: 0
    };

    // Get earned achievements
    const earnedResult = await db.query(`
      SELECT badge_type, earned_date, milestone_value
      FROM achievements
      WHERE couple_id = $1
      ORDER BY earned_date DESC
    `, [coupleId]);

    res.json({
      success: true,
      progress: {
        total_love_moments: parseInt(progress.total_love_moments) || 0,
        total_photos: parseInt(progress.total_photos) || 0,
        days_together: parseInt(progress.days_together) || 0,
        active_days: parseInt(progress.active_days) || 0,
        total_coins: parseInt(progress.total_coins) || 0
      },
      earned_achievements: earnedResult.rows.map(row => ({
        badge_type: row.badge_type,
        earned_date: row.earned_date,
        milestone_value: row.milestone_value
      }))
    });

  } catch (error) {
    console.error('Get achievement stats error:', error);
    res.status(500).json({
      success: false,
      message: '獲取成就統計失敗'
    });
  }
});

module.exports = router;