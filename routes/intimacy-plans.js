// 替代方案協商 — co-authored alternative intimacy plans.
//
// A couple proposes, edits and approves plans together; a plan only joins the
// shared list (status 'approved') once BOTH partners approved its current
// wording. Any edit resets approval to just the editor. Either partner can
// disable a plan at any time. Schema: migration 101.
//
// A plan's interaction can be free text, a linked roleplay script, or both.
//
//   GET    /api/intimacy-plans/samples         示範方案 (public, admin-managed)
//   GET    /api/intimacy-plans                 list the couple's plans
//   POST   /api/intimacy-plans                 propose a plan (counts as the author's approval)
//   PUT    /api/intimacy-plans/:id             edit (resets approval to the editor)
//   POST   /api/intimacy-plans/:id/approve     approve the revision you were shown
//   POST   /api/intimacy-plans/:id/disable     take it off the shared list
//   POST   /api/intimacy-plans/:id/reactivate  back to 待確認, needs both again

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { notifyPartnerAction } = require('../services/notificationService');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();

// 示範方案 — public (also shown on the logged-out showroom), so it's mounted
// before the auth gate. English columns fall back to 繁中 when blank.
router.get('/samples', async (req, res) => {
  const en = String(req.get('X-Locale') || '').toLowerCase().startsWith('en');
  try {
    const r = await db.query(
      `SELECT id, title, title_en, interaction, interaction_en, time_prep, time_prep_en,
              script_id, script_title
         FROM alternative_plan_samples
        WHERE active = TRUE
        ORDER BY sort_order, created_at`
    );
    const pick = (zh, enText) => (en && enText ? enText : zh);
    res.json({
      success: true,
      samples: r.rows.map((row) => ({
        id: row.id,
        sample_title: pick(row.title, row.title_en),
        interaction: pick(row.interaction, row.interaction_en),
        time_prep: pick(row.time_prep, row.time_prep_en),
        script_id: row.script_id,
        script_title: row.script_title,
      })),
    });
  } catch (error) {
    // Missing table on an unmigrated env → the client falls back to its copy.
    logWarn('intimacy_plans.samples_failed', { err: error.message });
    res.json({ success: true, samples: [] });
  }
});

router.use(authenticateToken);

// Generous cap — it exists to stop runaway inserts, not to ration the feature.
const MAX_PLANS_PER_COUPLE = 50;

// Belt-and-suspenders alongside migration 101, for envs that haven't migrated.
let tableEnsured = false;
async function ensurePlansTable() {
  if (tableEnsured) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS intimacy_alternative_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
        request_id UUID REFERENCES intimacy_requests(id) ON DELETE SET NULL,
        title VARCHAR(100) NOT NULL,
        interaction TEXT,
        time_prep TEXT,
        script_id VARCHAR(128),
        script_title VARCHAR(200),
        script_scenario TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        approved_by UUID[] NOT NULL DEFAULT '{}',
        revision INTEGER NOT NULL DEFAULT 1,
        disabled_at TIMESTAMP WITH TIME ZONE,
        disabled_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_intimacy_alt_plans_couple
        ON intimacy_alternative_plans(couple_id, updated_at DESC)
    `);
    tableEnsured = true;
  } catch (err) {
    logWarn('intimacy_plans.ensure_table_failed', { err: err.message });
  }
}

// The caller's complete couple, or null when unpaired / waiting for a partner.
async function getCouple(userId) {
  const r = await db.query(
    `SELECT id, user1_id, user2_id FROM couples
      WHERE (user1_id = $1 OR user2_id = $1) AND user2_id IS NOT NULL
      LIMIT 1`,
    [userId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    partnerId: row.user1_id === userId ? row.user2_id : row.user1_id,
  };
}

function noCouple(res) {
  return res.status(403).json({
    success: false,
    message: '替代方案需要和另一半一起建立，請先完成配對；配對前可以先看看示範方案',
    error_code: 'NO_COMPLETE_COUPLE',
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// pg parses uuid[] into an array; tolerate the raw '{a,b}' literal just in case.
function approvedIds(row) {
  const v = row.approved_by;
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return v.replace(/[{}]/g, '').split(',').filter(Boolean);
  return [];
}

function planStatus(row, userId, partnerId) {
  if (row.disabled_at) return 'disabled';
  const approved = approvedIds(row);
  return approved.includes(userId) && approved.includes(partnerId) ? 'approved' : 'pending';
}

function serializePlan(row, userId, partnerId) {
  const approved = approvedIds(row);
  return {
    id: row.id,
    request_id: row.request_id,
    title: row.title,
    interaction: row.interaction,
    time_prep: row.time_prep,
    script_id: row.script_id,
    script_title: row.script_title,
    script_scenario: row.script_scenario,
    status: planStatus(row, userId, partnerId),
    revision: row.revision,
    approved_by_me: approved.includes(userId),
    approved_by_partner: approved.includes(partnerId),
    created_by_me: row.created_by === userId,
    updated_by_me: row.updated_by === userId,
    disabled_by_me: row.disabled_by === userId,
    disabled_at: row.disabled_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const PLAN_COLUMNS = `id, request_id, title, interaction, time_prep, script_id, script_title, script_scenario,
  created_by, updated_by, approved_by, revision, disabled_at, disabled_by, created_at, updated_at`;

const planFieldValidators = (optional) => {
  const req = (chain) => (optional ? chain.optional() : chain);
  return [
    req(body('title'))
      .isString().trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('方案名稱需為 1–100 字，例如「週末劇本之夜」'),
    body('interaction').optional({ nullable: true }).isString().isLength({ max: 2000 })
      .withMessage('互動方式最多 2000 字，可以精簡後再送出'),
    body('time_prep').optional({ nullable: true }).isString().isLength({ max: 1000 })
      .withMessage('時間與準備最多 1000 字，可以精簡後再送出'),
    body('script_id').optional({ nullable: true }).isString().isLength({ max: 128 }),
    body('script_title').optional({ nullable: true }).isString().isLength({ max: 200 })
      .withMessage('劇本名稱過長，請重新選擇劇本'),
    body('script_scenario').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  ];
};

// A plan needs something to do: a description, a linked script, or both.
function missingContent(res) {
  return res.status(400).json({
    success: false,
    message: '請描述互動方式，或選一個角色扮演劇本，讓對方知道你想像的是什麼',
    error_code: 'PLAN_EMPTY',
  });
}

// The script snapshot from the body; script_title is the switch (null clears).
function scriptFields(body) {
  const title = nullableText(body.script_title) ?? null;
  return {
    script_id: title ? nullableText(body.script_id) ?? null : null,
    script_title: title,
    script_scenario: title ? nullableText(body.script_scenario) ?? null : null,
  };
}

function validationFailed(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  const first = errors.array()[0];
  res.status(400).json({
    success: false,
    message: first?.msg || '方案內容不完整，請檢查後再送出',
    error_code: 'VALIDATION_FAILED',
    errors: errors.array(),
  });
  return true;
}

const nullableText = (v) => {
  if (v === undefined) return undefined;
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : null;
};

// Load a plan that belongs to the caller's couple.
async function loadPlan(planId, coupleId) {
  if (!UUID_RE.test(String(planId))) return null;
  const r = await db.query(
    `SELECT ${PLAN_COLUMNS} FROM intimacy_alternative_plans WHERE id = $1 AND couple_id = $2`,
    [planId, coupleId]
  );
  return r.rows[0] || null;
}

function notFound(res) {
  return res.status(404).json({
    success: false,
    message: '找不到這個方案，可能已被移除，請重新整理後再試',
    error_code: 'PLAN_NOT_FOUND',
  });
}

const quoted = (title) => (title ? `《${title}》` : null);

router.get('/', async (req, res) => {
  const userId = req.user.id;
  try {
    await ensurePlansTable();
    const couple = await getCouple(userId);
    if (!couple) return noCouple(res);
    const r = await db.query(
      `SELECT ${PLAN_COLUMNS} FROM intimacy_alternative_plans
        WHERE couple_id = $1 ORDER BY updated_at DESC`,
      [couple.id]
    );
    const plans = r.rows.map((row) => serializePlan(row, userId, couple.partnerId));
    logInfo('intimacy_plans.list', {
      userId,
      coupleId: couple.id,
      total: plans.length,
      approved: plans.filter((p) => p.status === 'approved').length,
    });
    res.json({ success: true, plans });
  } catch (error) {
    logError('intimacy_plans.list_failed', { userId, err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '無法載入替代方案，請稍後重新整理再試' });
  }
});

router.post('/', [
  ...planFieldValidators(false),
  body('request_id').optional({ nullable: true }).isUUID().withMessage('request_id 格式錯誤'),
], async (req, res) => {
  if (validationFailed(req, res)) return;
  const userId = req.user.id;
  try {
    await ensurePlansTable();
    const couple = await getCouple(userId);
    if (!couple) return noCouple(res);
    const interaction = nullableText(req.body.interaction) ?? null;
    const script = scriptFields(req.body);
    if (!interaction && !script.script_title) return missingContent(res);
    logInfo('intimacy_plans.create.attempt', {
      userId, coupleId: couple.id, fromRequest: !!req.body.request_id, withScript: !!script.script_title,
    });

    const count = await db.query(
      'SELECT COUNT(*)::int AS n FROM intimacy_alternative_plans WHERE couple_id = $1',
      [couple.id]
    );
    if (count.rows[0].n >= MAX_PLANS_PER_COUPLE) {
      logInfo('intimacy_plans.limit', { userId, coupleId: couple.id, blocked: true });
      return res.status(409).json({
        success: false,
        message: `每對伴侶最多保存 ${MAX_PLANS_PER_COUPLE} 個替代方案，可以先修改或重用已停用的方案`,
        error_code: 'PLAN_LIMIT',
      });
    }

    // Only link a request that is actually this couple's.
    let requestId = null;
    if (req.body.request_id) {
      const r = await db.query(
        'SELECT id FROM intimacy_requests WHERE id = $1 AND couple_id = $2',
        [req.body.request_id, couple.id]
      );
      requestId = r.rows[0]?.id || null;
    }

    const r = await db.query(
      `INSERT INTO intimacy_alternative_plans
         (couple_id, request_id, title, interaction, time_prep, script_id, script_title, script_scenario,
          created_by, updated_by, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, ARRAY[$9]::uuid[])
       RETURNING ${PLAN_COLUMNS}`,
      [
        couple.id,
        requestId,
        req.body.title.trim(),
        interaction,
        nullableText(req.body.time_prep) ?? null,
        script.script_id,
        script.script_title,
        script.script_scenario,
        userId,
      ]
    );
    const plan = r.rows[0];
    logInfo('intimacy_plans.create.success', { userId, coupleId: couple.id, planId: plan.id, withScript: !!plan.script_title });
    notifyPartnerAction({ actorId: userId, type: 'alt_plan_proposed', content: quoted(plan.title) });
    res.status(201).json({
      success: true,
      message: '方案已提出，等另一半看過並認可後就會加入共同清單',
      plan: serializePlan(plan, userId, couple.partnerId),
    });
  } catch (error) {
    logError('intimacy_plans.create_failed', { userId, err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '方案沒有送出，請稍後再試；你寫的內容仍保留在畫面上' });
  }
});

router.put('/:id', planFieldValidators(true), async (req, res) => {
  if (validationFailed(req, res)) return;
  const userId = req.user.id;
  const planId = req.params.id;
  try {
    await ensurePlansTable();
    const couple = await getCouple(userId);
    if (!couple) return noCouple(res);
    const existing = await loadPlan(planId, couple.id);
    if (!existing) return notFound(res);
    if (existing.disabled_at) {
      return res.status(409).json({
        success: false,
        message: '這個方案已停用，請先重新啟用再修改',
        error_code: 'PLAN_DISABLED',
      });
    }

    const next = {
      title: req.body.title !== undefined ? req.body.title.trim() : existing.title,
      interaction: req.body.interaction !== undefined ? nullableText(req.body.interaction) : existing.interaction,
      time_prep: req.body.time_prep !== undefined ? nullableText(req.body.time_prep) : existing.time_prep,
      ...(req.body.script_title !== undefined
        ? scriptFields(req.body)
        : { script_id: existing.script_id, script_title: existing.script_title, script_scenario: existing.script_scenario }),
    };
    if (!next.interaction && !next.script_title) return missingContent(res);
    const changed = Object.keys(next).some((k) => (next[k] ?? null) !== (existing[k] ?? null));
    if (!changed) {
      return res.json({
        success: true,
        message: '內容沒有變動',
        plan: serializePlan(existing, userId, couple.partnerId),
      });
    }

    // New wording → only the editor has approved it; the partner must re-confirm.
    const r = await db.query(
      `UPDATE intimacy_alternative_plans
          SET title = $1, interaction = $2, time_prep = $3,
              script_id = $4, script_title = $5, script_scenario = $6,
              updated_by = $7, approved_by = ARRAY[$7]::uuid[], revision = revision + 1,
              updated_at = NOW()
        WHERE id = $8 AND couple_id = $9
        RETURNING ${PLAN_COLUMNS}`,
      [next.title, next.interaction, next.time_prep, next.script_id, next.script_title, next.script_scenario, userId, planId, couple.id]
    );
    const plan = r.rows[0];
    logInfo('intimacy_plans.update', {
      userId,
      coupleId: couple.id,
      planId,
      wasApproved: planStatus(existing, userId, couple.partnerId) === 'approved',
    });
    notifyPartnerAction({ actorId: userId, type: 'alt_plan_updated', content: quoted(plan.title) });
    res.json({
      success: true,
      message: '方案已更新，需要另一半重新認可',
      plan: serializePlan(plan, userId, couple.partnerId),
    });
  } catch (error) {
    logError('intimacy_plans.update_failed', { userId, planId, err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '方案沒有更新，請稍後再試；你修改的內容仍保留在畫面上' });
  }
});

router.post('/:id/approve', [
  body('revision').isInt({ min: 1 }).withMessage('請重新整理後再認可方案'),
], async (req, res) => {
  if (validationFailed(req, res)) return;
  const userId = req.user.id;
  const planId = req.params.id;
  try {
    await ensurePlansTable();
    const couple = await getCouple(userId);
    if (!couple) return noCouple(res);
    const existing = await loadPlan(planId, couple.id);
    if (!existing) return notFound(res);
    if (existing.disabled_at) {
      return res.status(409).json({
        success: false,
        message: '這個方案已停用，請先重新啟用再認可',
        error_code: 'PLAN_DISABLED',
      });
    }

    // Revision guard: approve only the wording the user actually saw.
    const r = await db.query(
      `UPDATE intimacy_alternative_plans
          SET approved_by = CASE WHEN $1 = ANY(approved_by) THEN approved_by
                                 ELSE array_append(approved_by, $1::uuid) END,
              updated_at = NOW()
        WHERE id = $2 AND couple_id = $3 AND revision = $4 AND disabled_at IS NULL
        RETURNING ${PLAN_COLUMNS}`,
      [userId, planId, couple.id, Number(req.body.revision)]
    );
    if (r.rows.length === 0) {
      logInfo('intimacy_plans.approve.stale', { userId, planId, sent: req.body.revision, current: existing.revision });
      const fresh = await loadPlan(planId, couple.id);
      return res.status(409).json({
        success: false,
        message: '另一半剛修改了這個方案，請先看過新內容再決定是否認可',
        error_code: 'PLAN_CHANGED',
        plan: fresh ? serializePlan(fresh, userId, couple.partnerId) : null,
      });
    }
    const plan = r.rows[0];
    const status = planStatus(plan, userId, couple.partnerId);
    logInfo('intimacy_plans.approve', { userId, coupleId: couple.id, planId, status });
    notifyPartnerAction({
      actorId: userId,
      type: 'alt_plan_approved',
      content: status === 'approved'
        ? `${quoted(plan.title) || '這個方案'}雙方都認可了，已加入共同方案清單`
        : quoted(plan.title),
    });
    res.json({
      success: true,
      message: status === 'approved'
        ? '雙方都認可了，方案已加入共同清單。每次實際互動前，仍會再確認彼此當下的意願'
        : '已記下你的認可，等另一半也認可後就會加入共同清單',
      plan: serializePlan(plan, userId, couple.partnerId),
    });
  } catch (error) {
    logError('intimacy_plans.approve_failed', { userId, planId, err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '認可沒有送出，請稍後再試' });
  }
});

router.post('/:id/disable', async (req, res) => {
  const userId = req.user.id;
  const planId = req.params.id;
  try {
    await ensurePlansTable();
    const couple = await getCouple(userId);
    if (!couple) return noCouple(res);
    const existing = await loadPlan(planId, couple.id);
    if (!existing) return notFound(res);
    if (existing.disabled_at) {
      return res.json({ success: true, message: '方案已經是停用狀態', plan: serializePlan(existing, userId, couple.partnerId) });
    }
    const r = await db.query(
      `UPDATE intimacy_alternative_plans
          SET disabled_at = NOW(), disabled_by = $1, updated_at = NOW()
        WHERE id = $2 AND couple_id = $3
        RETURNING ${PLAN_COLUMNS}`,
      [userId, planId, couple.id]
    );
    const plan = r.rows[0];
    logInfo('intimacy_plans.disable', {
      userId,
      coupleId: couple.id,
      planId,
      wasApproved: planStatus(existing, userId, couple.partnerId) === 'approved',
    });
    notifyPartnerAction({ actorId: userId, type: 'alt_plan_disabled', content: quoted(plan.title) });
    res.json({
      success: true,
      message: '方案已停用，不再出現在共同清單；之後想再討論可以重新啟用',
      plan: serializePlan(plan, userId, couple.partnerId),
    });
  } catch (error) {
    logError('intimacy_plans.disable_failed', { userId, planId, err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '停用沒有成功，請稍後再試' });
  }
});

router.post('/:id/reactivate', async (req, res) => {
  const userId = req.user.id;
  const planId = req.params.id;
  try {
    await ensurePlansTable();
    const couple = await getCouple(userId);
    if (!couple) return noCouple(res);
    const existing = await loadPlan(planId, couple.id);
    if (!existing) return notFound(res);
    if (!existing.disabled_at) {
      return res.json({ success: true, message: '方案目前已是啟用狀態', plan: serializePlan(existing, userId, couple.partnerId) });
    }
    // Back to 待確認: a plan someone stepped away from needs both yeses again.
    const r = await db.query(
      `UPDATE intimacy_alternative_plans
          SET disabled_at = NULL, disabled_by = NULL, approved_by = ARRAY[$1]::uuid[],
              revision = revision + 1, updated_by = $1, updated_at = NOW()
        WHERE id = $2 AND couple_id = $3
        RETURNING ${PLAN_COLUMNS}`,
      [userId, planId, couple.id]
    );
    const plan = r.rows[0];
    logInfo('intimacy_plans.reactivate', { userId, coupleId: couple.id, planId });
    notifyPartnerAction({ actorId: userId, type: 'alt_plan_reactivated', content: quoted(plan.title) });
    res.json({
      success: true,
      message: '方案已重新啟用，等另一半再次認可後會回到共同清單',
      plan: serializePlan(plan, userId, couple.partnerId),
    });
  } catch (error) {
    logError('intimacy_plans.reactivate_failed', { userId, planId, err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '重新啟用沒有成功，請稍後再試' });
  }
});

module.exports = router;
