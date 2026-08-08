const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();

// All coin routes require authentication
router.use(authenticateToken);

// Get coin balance for couple
router.get('/balance', async (req, res) => {
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

    // Calculate balance from transactions
    const result = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN amount ELSE -amount END), 0) as balance
      FROM coin_transactions
      WHERE couple_id = $1
    `, [coupleId]);

    const balance = parseInt(result.rows[0].balance) || 0;

    res.json({
      success: true,
      balance
    });

  } catch (error) {
    logError('Get coin balance failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取金幣餘額失敗'
    });
  }
});

// Get coin transaction history for couple
router.get('/transactions', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;

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

    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM coin_transactions WHERE couple_id = $1',
      [coupleId]
    );
    const total = parseInt(countResult.rows[0].total);

    // Get transactions
    const result = await db.query(`
      SELECT id, amount, transaction_type, earned_from, spent_on, description, transaction_date
      FROM coin_transactions
      WHERE couple_id = $1
      ORDER BY transaction_date DESC
      LIMIT $2 OFFSET $3
    `, [coupleId, parseInt(limit), offset]);

    res.json({
      success: true,
      transactions: result.rows,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (error) {
    logError('Get coin transactions failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取金幣交易記錄失敗'
    });
  }
});

// Add coins (for achievements, daily rewards, etc.)
router.post('/add', [
  body('amount')
    .isInt({ min: 1 })
    .withMessage('金幣數量必須是正整數'),
  body('reason')
    .isLength({ min: 1, max: 200 })
    .withMessage('原因描述必須在1-200個字符之間'),
  body('earned_from')
    .optional()
    .isLength({ max: 100 })
    .withMessage('獲得來源不能超過100個字符')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { amount, reason, earned_from } = req.body;

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

    // Record transaction
    const transactionId = uuidv4();
    await db.query(`
      INSERT INTO coin_transactions (id, couple_id, amount, transaction_type, earned_from, description, transaction_date)
      VALUES ($1, $2, $3, 'earn', $4, $5, NOW())
    `, [transactionId, coupleId, amount, earned_from, reason]);

    // Get updated balance
    const balanceResult = await db.query(`
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN amount ELSE -amount END), 0) as balance
      FROM coin_transactions
      WHERE couple_id = $1
    `, [coupleId]);
    const newBalance = parseInt(balanceResult.rows[0].balance);

    logInfo('Added coins', { coupleId, amount, reason });

    res.json({
      success: true,
      message: `獲得 ${amount} 金幣！`,
      amount,
      new_balance: newBalance
    });

  } catch (error) {
    logError('Add coins failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '添加金幣失敗'
    });
  }
});

// Spend coins
router.post('/spend', [
  body('amount')
    .isInt({ min: 1 })
    .withMessage('金幣數量必須是正整數'),
  body('reason')
    .isLength({ min: 1, max: 200 })
    .withMessage('原因描述必須在1-200個字符之間'),
  body('transaction_type')
    .isIn(['purchase', 'unlock', 'gift', 'other'])
    .withMessage('交易類型無效')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { amount, reason, transaction_type } = req.body;

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

    const balanceResult = await db.query(`
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN amount ELSE -amount END), 0) as balance
      FROM coin_transactions
      WHERE couple_id = $1
    `, [coupleId]);
    const currentBalance = parseInt(balanceResult.rows[0].balance) || 0;

    if (currentBalance < amount) {
      return res.status(400).json({
        success: false,
        message: '金幣餘額不足',
        current_balance: currentBalance,
        required: amount
      });
    }

    const transactionId = uuidv4();
    await db.query(`
      INSERT INTO coin_transactions (id, couple_id, amount, transaction_type, spent_on, description, transaction_date)
      VALUES ($1, $2, $3, 'spend', $4, $5, NOW())
    `, [transactionId, coupleId, amount, transaction_type, reason]);

    const updatedBalanceResult = await db.query(`
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN amount ELSE -amount END), 0) as balance
      FROM coin_transactions
      WHERE couple_id = $1
    `, [coupleId]);
    const newBalance = parseInt(updatedBalanceResult.rows[0].balance);

    logInfo('Coins spent', { coupleId, amount, reason });

    res.json({
      success: true,
      message: `花費 ${amount} 金幣`,
      amount,
      new_balance: newBalance
    });

  } catch (error) {
    logError('Spend coins failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '花費金幣失敗'
    });
  }
});

// Daily coin claim
router.post('/daily-claim', async (req, res) => {
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

    // Check if couple already claimed today
    const today = new Date().toISOString().split('T')[0];
    const claimResult = await db.query(`
      SELECT id FROM coin_transactions
      WHERE couple_id = $1
      AND earned_from = 'daily_reward'
      AND DATE(transaction_date) = $2
    `, [coupleId, today]);

    if (claimResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: '今日已經領取過每日金幣'
      });
    }

    const dailyAmount = 10; // 10 coins per day

    // Record daily reward transaction
    const transactionId = uuidv4();
    await db.query(`
      INSERT INTO coin_transactions (id, couple_id, amount, transaction_type, earned_from, description, transaction_date)
      VALUES ($1, $2, $3, 'earn', 'daily_reward', $4, NOW())
    `, [transactionId, coupleId, dailyAmount, '每日登入獎勵']);

    // Get updated balance
    const balanceResult = await db.query(`
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN amount ELSE -amount END), 0) as balance
      FROM coin_transactions
      WHERE couple_id = $1
    `, [coupleId]);
    const newBalance = parseInt(balanceResult.rows[0].balance);

    logInfo('Daily coins claimed', { coupleId, amount: dailyAmount });

    res.json({
      success: true,
      message: `領取每日 ${dailyAmount} 金幣！`,
      amount: dailyAmount,
      new_balance: newBalance
    });

  } catch (error) {
    logError('Daily coin claim failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '領取每日金幣失敗'
    });
  }
});

// Generic transaction endpoint (for frontend compatibility)
router.post('/transaction', [
  body('amount')
    .isInt({ min: 1 })
    .withMessage('金幣數量必須是正整數'),
  body('transaction_type')
    .isIn(['earn', 'spend'])
    .withMessage('交易類型必須是 earn 或 spend'),
  body('description')
    .isLength({ min: 1, max: 200 })
    .withMessage('描述必須在1-200個字符之間'),
  // Optional client-generated idempotency key (a UUID per user intent). When
  // present, a retried/duplicated request with the same key grants only once.
  body('idempotency_key')
    .optional({ nullable: true })
    .isString()
    .isLength({ min: 1, max: 128 })
    .withMessage('idempotency_key 格式錯誤')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { amount, transaction_type, description, idempotency_key } = req.body;

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

    // If spending, check balance first
    if (transaction_type === 'spend') {
      const balanceResult = await db.query(`
        SELECT COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN amount ELSE -amount END), 0) as balance
        FROM coin_transactions
        WHERE couple_id = $1
      `, [coupleId]);

      const currentBalance = parseInt(balanceResult.rows[0].balance) || 0;

      if (currentBalance < amount) {
        return res.status(400).json({
          success: false,
          message: '金幣餘額不足',
          current_balance: currentBalance,
          required: amount
        });
      }
    }

    // Record transaction. When an idempotency key is supplied, ON CONFLICT
    // makes a repeat of the same intent a no-op instead of a second grant —
    // the arbiter is the partial unique index from migration 085, so the WHERE
    // predicate must match it for inference. A null key never conflicts (each
    // keyless row inserts as before).
    const transactionId = uuidv4();
    const insertResult = await db.query(`
      INSERT INTO coin_transactions (id, couple_id, amount, transaction_type, description, transaction_date, earned_from, spent_on, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING id
    `, [
      transactionId,
      coupleId,
      amount,
      transaction_type,
      description,
      transaction_type === 'earn' ? description : null,
      transaction_type === 'spend' ? description : null,
      idempotency_key || null
    ]);

    // A key was given but nothing inserted → this exact request already ran.
    // Return success idempotently (with the balance that already reflects it)
    // so a client retry is a harmless no-op, never a double grant or an error.
    const deduped = !!idempotency_key && insertResult.rows.length === 0;

    // Get updated balance
    const balanceResult = await db.query(`
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN amount ELSE -amount END), 0) as balance
      FROM coin_transactions
      WHERE couple_id = $1
    `, [coupleId]);
    const newBalance = parseInt(balanceResult.rows[0].balance);

    const action = transaction_type === 'earn' ? '獲得' : '花費';
    if (deduped) {
      logWarn('Coin transaction deduped by idempotency key', { coupleId, action, amount, idempotency_key });
    } else {
      logInfo('Coin transaction', { coupleId, action, amount, description });
    }

    res.json({
      success: true,
      message: `${action} ${amount} 金幣`,
      amount,
      transaction_type,
      new_balance: newBalance,
      deduped
    });

  } catch (error) {
    logError('Coin transaction failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '金幣交易失敗'
    });
  }
});

module.exports = router;
