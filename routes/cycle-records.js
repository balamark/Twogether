const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logInfo, logError } = require('../lib/logger');
const { notifyPartnerAction } = require('../services/notificationService');

const router = express.Router();

router.use(authenticateToken);

// ISO date (YYYY-MM-DD) shape returned to the client. Postgres DATE columns
// arrive as Date objects on the pg driver, so we normalize.
function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shapeRow(row) {
  return {
    id: row.id,
    tracked_by: row.tracked_by,
    start_date: toIsoDate(row.start_date),
    length_days: row.length_days,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Create a period record
router.post('/', [
  body('start_date')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('start_date 必須為 YYYY-MM-DD 格式'),
  body('length_days')
    .optional()
    .isInt({ min: 1, max: 14 })
    .withMessage('length_days 必須為 1 到 14 之間的整數'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('備註不能超過 1000 個字符'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: '驗證失敗', errors: errors.array() });
    }

    const userId = req.user.id;
    const { start_date, length_days, notes } = req.body;

    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );
    const coupleId = coupleResult.rows.length > 0 ? coupleResult.rows[0].id : null;

    const id = uuidv4();
    const result = await db.query(`
      INSERT INTO cycle_records (id, couple_id, tracked_by, start_date, length_days, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, tracked_by, start_date, length_days, notes, created_at, updated_at
    `, [id, coupleId, userId, start_date, length_days || 5, notes || null]);

    logInfo('Cycle record created', { id, coupleId });

    notifyPartnerAction({
      actorId: userId,
      type: 'cycle_record_created',
      content: notes || (start_date ? `週期開始日：${start_date}` : null),
    });

    res.status(201).json({
      success: true,
      message: '週期紀錄已儲存',
      cycle_record: shapeRow(result.rows[0]),
    });
  } catch (error) {
    logError('Create cycle record failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '建立週期紀錄失敗' });
  }
});

// List cycle records for the requester's couple (or own if unpaired)
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );
    const coupleId = coupleResult.rows.length > 0 ? coupleResult.rows[0].id : null;

    let where, params;
    if (coupleId) {
      where = 'WHERE couple_id = $1 OR (couple_id IS NULL AND tracked_by = $2)';
      params = [coupleId, userId];
    } else {
      where = 'WHERE couple_id IS NULL AND tracked_by = $1';
      params = [userId];
    }

    const result = await db.query(`
      SELECT id, tracked_by, start_date, length_days, notes, created_at, updated_at
      FROM cycle_records
      ${where}
      ORDER BY start_date DESC
    `, params);

    res.json({
      success: true,
      cycle_records: result.rows.map(shapeRow),
    });
  } catch (error) {
    logError('Get cycle records failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '獲取週期紀錄失敗' });
  }
});

// Update a cycle record (owner-only)
router.put('/:id', [
  body('start_date')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('start_date 必須為 YYYY-MM-DD 格式'),
  body('length_days')
    .optional()
    .isInt({ min: 1, max: 14 })
    .withMessage('length_days 必須為 1 到 14 之間的整數'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('備註不能超過 1000 個字符'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: '驗證失敗', errors: errors.array() });
    }

    const userId = req.user.id;
    const id = req.params.id;

    const ownership = await db.query(
      'SELECT id FROM cycle_records WHERE id = $1 AND tracked_by = $2',
      [id, userId]
    );
    if (ownership.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到週期紀錄或您沒有權限修改' });
    }

    const updates = [];
    const values = [];
    let i = 1;
    ['start_date', 'length_days', 'notes'].forEach(field => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${i++}`);
        values.push(req.body[field]);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: '沒有提供要更新的欄位' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    await db.query(
      `UPDATE cycle_records SET ${updates.join(', ')} WHERE id = $${i}`,
      values
    );

    notifyPartnerAction({
      actorId: userId,
      type: 'cycle_record_updated',
      content: req.body.notes || null,
    });

    res.json({ success: true, message: '週期紀錄已更新' });
  } catch (error) {
    logError('Update cycle record failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '更新週期紀錄失敗' });
  }
});

// Delete (owner-only)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;

    const result = await db.query(
      'DELETE FROM cycle_records WHERE id = $1 AND tracked_by = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到週期紀錄或您沒有權限刪除' });
    }

    notifyPartnerAction({ actorId: userId, type: 'cycle_record_deleted' });

    res.json({ success: true, message: '週期紀錄已刪除' });
  } catch (error) {
    logError('Delete cycle record failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '刪除週期紀錄失敗' });
  }
});

module.exports = router;
