const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logInfo, logWarn, logError } = require('../lib/logger');
const { notifyPartnerAction } = require('../services/notificationService');

// 存款 — each partner has their own deposit account (rows in coin_transactions
// owned by owner_id, see migration 108). Money only ever moves by a person:
//   感謝存款 (thanks)  the partner deposits into my account       → confirmed at once
//   申請存款 (request) I ask the partner for a deposit            → pending until they confirm
//   兌換禮品 (redeem)  I spend on a gift from the shop            → pending until they agree
// Nothing in the app credits a balance automatically any more.

const router = express.Router();

router.use(authenticateToken);

const MAX_AMOUNT = 10000;

const NOT_PAIRED_MESSAGE = '存款需要另一半才能運作：配對後，TA 就能為你存入感謝存款。先到「設定」邀請另一半加入吧';

// The caller's couple and partner. `partnerId` is null until both seats are
// filled (a couple row can exist with only user1 while the invite is pending).
const findCouple = async (userId, client = db, { lock = false } = {}) => {
  const result = await client.query(
    `SELECT id, user1_id, user2_id FROM couples
      WHERE user1_id = $1 OR user2_id = $1
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [userId]
  );
  const couple = result.rows[0];
  if (!couple) return null;
  const partnerId = couple.user1_id === userId ? couple.user2_id : couple.user1_id;
  return { id: couple.id, partnerId: partnerId || null };
};

// balance   = confirmed deposits − confirmed redemptions
// available = balance − pending redemptions (reserved so one balance can't
//             back two redemptions waiting on the partner at the same time)
const accountFor = async (client, coupleId, ownerId) => {
  const result = await client.query(`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed' AND kind <> 'redeem'), 0) AS deposited,
      COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed' AND kind = 'redeem'), 0) AS spent,
      COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND kind = 'redeem'), 0) AS reserved
    FROM coin_transactions
    WHERE couple_id = $1 AND owner_id = $2
  `, [coupleId, ownerId]);
  const row = result.rows[0];
  const balance = parseInt(row.deposited) - parseInt(row.spent);
  return { balance, available: balance - parseInt(row.reserved) };
};

const toApiTransaction = (row, userId) => ({
  id: row.id,
  kind: row.kind,
  status: row.status,
  amount: row.amount,
  note: row.description,
  gift_icon: row.gift_icon,
  owner_id: row.owner_id,
  created_by: row.created_by,
  is_mine: row.owner_id === userId,
  created_at: row.transaction_date,
  responded_at: row.responded_at
});

const TRANSACTION_COLUMNS = 'id, kind, status, amount, description, gift_icon, owner_id, created_by, transaction_date, responded_at';

const rejectInvalid = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({
    success: false,
    message: errors.array()[0].msg,
    error_code: 'DEPOSIT_VALIDATION_FAILED',
    errors: errors.array()
  });
  return true;
};

const notPaired = (res) => res.status(409).json({
  success: false,
  message: NOT_PAIRED_MESSAGE,
  error_code: 'NOT_PAIRED'
});

const amountValidator = (field) => body(field)
  .isInt({ min: 1, max: MAX_AMOUNT })
  .withMessage(`金額必須是 1 到 ${MAX_AMOUNT} 之間的整數`)
  .toInt();

const idempotencyValidator = body('idempotency_key')
  .optional({ nullable: true })
  .isString()
  .isLength({ min: 1, max: 128 })
  .withMessage('idempotency_key 格式錯誤');

// Own balance (header chip). Unpaired users simply have an empty account.
router.get('/balance', async (req, res) => {
  try {
    const userId = req.user.id;
    const couple = await findCouple(userId);
    if (!couple || !couple.partnerId) {
      return res.json({ success: true, paired: false, balance: 0, available: 0 });
    }
    const account = await accountFor(db, couple.id, userId);
    res.json({ success: true, paired: true, ...account });
  } catch (error) {
    logError('Get deposit balance failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '讀取存款失敗，請稍後再試' });
  }
});

// Everything the 存款 page shows: both accounts, the read-only average, what's
// waiting on me / on my partner, and recent history.
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const couple = await findCouple(userId);
    if (!couple || !couple.partnerId) {
      return res.json({
        success: true,
        paired: false,
        me: { balance: 0, available: 0 },
        partner: null,
        average: 0,
        awaiting_me: [],
        awaiting_partner: [],
        recent: []
      });
    }

    const [me, partner, pendingResult, recentResult] = await Promise.all([
      accountFor(db, couple.id, userId),
      accountFor(db, couple.id, couple.partnerId),
      db.query(`
        SELECT ${TRANSACTION_COLUMNS} FROM coin_transactions
        WHERE couple_id = $1 AND status = 'pending'
        ORDER BY transaction_date DESC
      `, [couple.id]),
      db.query(`
        SELECT ${TRANSACTION_COLUMNS} FROM coin_transactions
        WHERE couple_id = $1 AND status <> 'pending'
        ORDER BY COALESCE(responded_at, transaction_date) DESC
        LIMIT 30
      `, [couple.id])
    ]);

    const pending = pendingResult.rows.map(r => toApiTransaction(r, userId));
    res.json({
      success: true,
      paired: true,
      me,
      partner: { balance: partner.balance },
      average: Math.round((me.balance + partner.balance) / 2),
      // Requests/redemptions the partner opened — only I can answer them.
      awaiting_me: pending.filter(t => !t.is_mine),
      awaiting_partner: pending.filter(t => t.is_mine),
      recent: recentResult.rows.map(r => toApiTransaction(r, userId))
    });
  } catch (error) {
    logError('Get deposit summary failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '讀取存款失敗，請稍後再試' });
  }
});

// 感謝存款 (into the partner's account) or 申請存款 (asking the partner to pay
// into mine).
router.post('/deposits', [
  body('kind')
    .isIn(['thanks', 'request'])
    .withMessage('存款類型必須是感謝存款或申請存款'),
  amountValidator('amount'),
  body('note')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('請寫下這筆存款的原因（1-100 個字）'),
  idempotencyValidator
], async (req, res) => {
  try {
    if (rejectInvalid(req, res)) return;

    const userId = req.user.id;
    const { kind, amount, note, idempotency_key } = req.body;
    const couple = await findCouple(userId);
    if (!couple || !couple.partnerId) {
      logInfo('Deposit blocked: not paired', { user_id: userId, kind });
      return notPaired(res);
    }

    const isThanks = kind === 'thanks';
    const ownerId = isThanks ? couple.partnerId : userId;
    const inserted = await db.query(`
      INSERT INTO coin_transactions
        (couple_id, owner_id, created_by, kind, status, amount, transaction_type, description, transaction_date, responded_at, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, $6, 'earn', $7, NOW(), $8, $9)
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING ${TRANSACTION_COLUMNS}
    `, [
      couple.id,
      ownerId,
      userId,
      kind,
      isThanks ? 'confirmed' : 'pending',
      amount,
      note,
      isThanks ? new Date() : null,
      idempotency_key || null
    ]);

    // Same key already ran: a retry, not a second deposit.
    if (inserted.rows.length === 0) {
      logWarn('Deposit deduped by idempotency key', { user_id: userId, kind, idempotency_key });
      return res.json({ success: true, deduped: true, message: isThanks ? '感謝存款已存入' : '已送出存款申請，等待對方確認' });
    }

    const transaction = inserted.rows[0];
    logInfo('Deposit created', { user_id: userId, couple_id: couple.id, kind, amount, transaction_id: transaction.id });

    notifyPartnerAction({
      actorId: userId,
      type: isThanks ? 'deposit_thanks' : 'deposit_requested',
      content: `${amount}｜${note}`,
      priority: isThanks ? undefined : 2,
      targetId: transaction.id
    });

    res.json({
      success: true,
      message: isThanks ? '感謝存款已存入' : '已送出存款申請，等待對方確認',
      transaction: toApiTransaction(transaction, userId)
    });
  } catch (error) {
    logError('Create deposit failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '存款失敗，請稍後再試' });
  }
});

// Spend my deposit on a gift from the shop. Needs the partner's agreement;
// until then the amount is reserved.
router.post('/redemptions', [
  body('gift_title')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('禮品名稱必須在1-100個字符之間'),
  body('gift_icon')
    .optional({ nullable: true })
    .isLength({ max: 10 })
    .withMessage('圖標不能超過10個字符'),
  amountValidator('cost'),
  idempotencyValidator
], async (req, res) => {
  try {
    if (rejectInvalid(req, res)) return;

    const userId = req.user.id;
    const { gift_title, gift_icon, cost, idempotency_key } = req.body;

    const outcome = await db.transaction(async (client) => {
      // Lock the couple row so concurrent redemptions/approvals see each
      // other's reservations instead of both passing the balance check.
      const couple = await findCouple(userId, client, { lock: true });
      if (!couple || !couple.partnerId) return { notPaired: true };

      const account = await accountFor(client, couple.id, userId);
      if (account.available < cost) return { insufficient: true, account };

      const inserted = await client.query(`
        INSERT INTO coin_transactions
          (couple_id, owner_id, created_by, kind, status, amount, transaction_type, description, gift_icon, transaction_date, idempotency_key)
        VALUES ($1, $2, $2, 'redeem', 'pending', $3, 'spend', $4, $5, NOW(), $6)
        ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
        RETURNING ${TRANSACTION_COLUMNS}
      `, [couple.id, userId, cost, gift_title, gift_icon || '🎁', idempotency_key || null]);
      return { couple, transaction: inserted.rows[0] || null };
    });

    if (outcome.notPaired) {
      logInfo('Redemption blocked: not paired', { user_id: userId });
      return notPaired(res);
    }
    if (outcome.insufficient) {
      const shortBy = cost - outcome.account.available;
      logInfo('Redemption blocked: insufficient deposit', { user_id: userId, cost, available: outcome.account.available });
      return res.status(400).json({
        success: false,
        message: `存款還差 ${shortBy}。可以向另一半申請存款，或先選一個價格較低的禮品`,
        error_code: 'INSUFFICIENT_DEPOSIT',
        available: outcome.account.available,
        required: cost
      });
    }
    if (!outcome.transaction) {
      logWarn('Redemption deduped by idempotency key', { user_id: userId, idempotency_key });
      return res.json({ success: true, deduped: true, message: '已送出兌換申請，等待對方同意' });
    }

    const transaction = outcome.transaction;
    logInfo('Redemption requested', { user_id: userId, couple_id: outcome.couple.id, cost, transaction_id: transaction.id });

    notifyPartnerAction({
      actorId: userId,
      type: 'redemption_requested',
      content: `${gift_icon || '🎁'} ${gift_title}｜${cost}`,
      priority: 2,
      targetId: transaction.id
    });

    res.json({
      success: true,
      message: '已送出兌換申請，等待對方同意',
      transaction: toApiTransaction(transaction, userId)
    });
  } catch (error) {
    logError('Create redemption failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '兌換申請送出失敗，請稍後再試' });
  }
});

// The partner answers a pending 申請存款 or 兌換申請.
router.post('/transactions/:id/respond', [
  param('id').isUUID().withMessage('找不到這筆存款紀錄，請重新整理後再試'),
  body('decision')
    .isIn(['confirm', 'decline'])
    .withMessage('請選擇同意或婉拒')
], async (req, res) => {
  try {
    if (rejectInvalid(req, res)) return;

    const userId = req.user.id;
    const { decision } = req.body;
    const transactionId = req.params.id;

    const outcome = await db.transaction(async (client) => {
      const couple = await findCouple(userId, client, { lock: true });
      if (!couple || !couple.partnerId) return { error: 'NOT_PAIRED' };

      const found = await client.query(
        `SELECT ${TRANSACTION_COLUMNS} FROM coin_transactions WHERE id = $1 AND couple_id = $2 FOR UPDATE`,
        [transactionId, couple.id]
      );
      const row = found.rows[0];
      if (!row) return { error: 'TRANSACTION_NOT_FOUND' };
      if (row.owner_id === userId) return { error: 'CANNOT_RESPOND_OWN', row };
      if (row.status !== 'pending') return { error: 'ALREADY_RESPONDED', row };

      if (decision === 'confirm' && row.kind === 'redeem') {
        const account = await accountFor(client, couple.id, row.owner_id);
        if (account.balance < row.amount) return { error: 'INSUFFICIENT_DEPOSIT', row, account };
      }

      const updated = await client.query(`
        UPDATE coin_transactions
        SET status = $2, responded_at = NOW()
        WHERE id = $1
        RETURNING ${TRANSACTION_COLUMNS}
      `, [transactionId, decision === 'confirm' ? 'confirmed' : 'declined']);
      return { row: updated.rows[0] };
    });

    if (outcome.error) {
      logInfo('Deposit response rejected', { user_id: userId, transaction_id: transactionId, decision, reason: outcome.error });
      if (outcome.error === 'NOT_PAIRED') return notPaired(res);
      if (outcome.error === 'TRANSACTION_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: '找不到這筆存款紀錄，可能已被對方取消；重新整理就能看到最新狀態',
          error_code: 'TRANSACTION_NOT_FOUND'
        });
      }
      if (outcome.error === 'CANNOT_RESPOND_OWN') {
        return res.status(403).json({
          success: false,
          message: '這筆要由另一半確認；你可以在「等待對方確認」裡取消它',
          error_code: 'CANNOT_RESPOND_OWN'
        });
      }
      if (outcome.error === 'ALREADY_RESPONDED') {
        return res.status(409).json({
          success: false,
          message: '這筆已經處理過了，重新整理就能看到最新狀態',
          error_code: 'ALREADY_RESPONDED'
        });
      }
      return res.status(409).json({
        success: false,
        message: `對方目前的存款只有 ${outcome.account.balance}，不足以兌換這份禮品。可以先婉拒，等存款足夠再兌換`,
        error_code: 'INSUFFICIENT_DEPOSIT'
      });
    }

    const row = outcome.row;
    const confirmed = decision === 'confirm';
    logInfo('Deposit response recorded', { user_id: userId, transaction_id: row.id, kind: row.kind, decision, amount: row.amount });

    // actorId is me, so the notification goes to the account owner.
    const type = row.kind === 'redeem'
      ? (confirmed ? 'redemption_approved' : 'redemption_declined')
      : (confirmed ? 'deposit_confirmed' : 'deposit_declined');
    notifyPartnerAction({
      actorId: userId,
      type,
      content: row.kind === 'redeem'
        ? `${row.gift_icon || '🎁'} ${row.description}｜${row.amount}`
        : `${row.amount}｜${row.description}`,
      targetId: row.id
    });

    const messages = {
      redemption_approved: '已同意兌換，對方的存款已扣除',
      redemption_declined: '已婉拒兌換，對方的存款不會被扣除',
      deposit_confirmed: '已確認，存款已存入對方帳戶',
      deposit_declined: '已婉拒這筆存款申請'
    };
    res.json({ success: true, message: messages[type], transaction: toApiTransaction(row, userId) });
  } catch (error) {
    logError('Respond to deposit failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '處理失敗，請稍後再試' });
  }
});

// The owner withdraws their own pending 申請存款 / 兌換申請.
router.post('/transactions/:id/cancel', [
  param('id').isUUID().withMessage('找不到這筆存款紀錄，請重新整理後再試')
], async (req, res) => {
  try {
    if (rejectInvalid(req, res)) return;

    const userId = req.user.id;
    const result = await db.query(`
      UPDATE coin_transactions
      SET status = 'cancelled', responded_at = NOW()
      WHERE id = $1 AND owner_id = $2 AND created_by = $2 AND status = 'pending'
      RETURNING ${TRANSACTION_COLUMNS}
    `, [req.params.id, userId]);

    if (result.rows.length === 0) {
      logInfo('Deposit cancel rejected', { user_id: userId, transaction_id: req.params.id });
      return res.status(409).json({
        success: false,
        message: '這筆已經無法取消（可能對方剛處理完），重新整理就能看到最新狀態',
        error_code: 'ALREADY_RESPONDED'
      });
    }

    logInfo('Deposit cancelled', { user_id: userId, transaction_id: req.params.id, kind: result.rows[0].kind });
    res.json({ success: true, message: '已取消', transaction: toApiTransaction(result.rows[0], userId) });
  } catch (error) {
    logError('Cancel deposit failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '取消失敗，請稍後再試' });
  }
});

// Full history for the couple (paginated).
router.get('/transactions', async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

    const couple = await findCouple(userId);
    if (!couple) {
      return res.json({ success: true, transactions: [], total: 0, page, limit });
    }

    const [countResult, rows] = await Promise.all([
      db.query('SELECT COUNT(*) AS total FROM coin_transactions WHERE couple_id = $1', [couple.id]),
      db.query(`
        SELECT ${TRANSACTION_COLUMNS} FROM coin_transactions
        WHERE couple_id = $1
        ORDER BY transaction_date DESC
        LIMIT $2 OFFSET $3
      `, [couple.id, limit, (page - 1) * limit])
    ]);

    res.json({
      success: true,
      transactions: rows.rows.map(r => toApiTransaction(r, userId)),
      total: parseInt(countResult.rows[0].total),
      page,
      limit
    });
  } catch (error) {
    logError('Get deposit transactions failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '讀取存款紀錄失敗，請稍後再試' });
  }
});

module.exports = router;
