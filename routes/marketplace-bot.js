// Server-to-server upload of a role-play script into the creator marketplace.
// Authenticated with MARKETPLACE_BOT_API_KEY (not a user JWT) and stored as a
// normal custom_scripts row owned by MARKETPLACE_BOT_AUTHOR_ID / _EMAIL, so it
// shows up and plays like one created in the app. See docs/MARKETPLACE_BOT_API.md.

const express = require('express');
const db = require('../database/db');
const { botAuth } = require('../middleware/botAuth');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const { logError, logInfo, logWarn } = require('../lib/logger');
const {
  validateBotScript,
  scriptUnchanged,
  successMessage,
  publicMarketUrl,
} = require('../lib/marketplaceBotScript');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Official account that owns bot uploads when no author env var is set.
// Logging into the app as this user is how those scripts are edited.
const DEFAULT_BOT_AUTHOR_EMAIL = 'wangmark510@gmail.com';

function authorMissingError(who) {
  return {
    status: 503,
    body: {
      success: false,
      message: `找不到作者帳號（${who}）。請確認這個帳號已經在這個環境註冊。`,
      error_code: 'BOT_AUTHOR_NOT_FOUND',
    },
  };
}

// The published script is attributed to a real users row so the marketplace
// can show a nickname and the account can edit or delete it in the app.
// couple_id stays NULL: attaching the author's couple would drop the whole
// catalog into that couple's private library and notify their partner.
async function resolveAuthor() {
  let id = (process.env.MARKETPLACE_BOT_AUTHOR_ID || '').trim();
  const email = (process.env.MARKETPLACE_BOT_AUTHOR_EMAIL || '').trim().toLowerCase()
    || DEFAULT_BOT_AUTHOR_EMAIL;
  // A blank or non-UUID id (for example an empty secret that envsubst turned
  // into a placeholder) must not block the default author email.
  if (id && !UUID_RE.test(id)) {
    logWarn('marketplace_bot.author_id_ignored', { reason: 'not_a_uuid' });
    id = '';
  }

  const result = id
    ? await db.query('SELECT id, nickname FROM users WHERE id = $1', [id])
    : await db.query('SELECT id, nickname FROM users WHERE LOWER(email) = $1', [email]);
  const author = result.rows[0];
  if (!author) return authorMissingError(id || email);
  return { author };
}

async function replaceCover(client, scriptId, url) {
  await client.query('DELETE FROM custom_script_photos WHERE script_id = $1', [scriptId]);
  if (url) {
    await client.query(
      'INSERT INTO custom_script_photos (script_id, url, sort_order) VALUES ($1, $2, 0)',
      [scriptId, url]
    );
  }
}

async function upsertScript(author, script) {
  return db.transaction(async (client) => {
    let existing = null;
    if (script.sourceKey) {
      const found = await client.query(
        `SELECT id, created_by, title, category, scenario, location, content, tags,
                duration, thumbnail_url, is_public
           FROM custom_scripts
          WHERE source_key = $1
          FOR UPDATE`,
        [script.sourceKey]
      );
      existing = found.rows[0] || null;
    }

    if (existing && String(existing.created_by).toLowerCase() !== String(author.id).toLowerCase()) {
      const err = new Error('SOURCE_KEY_OWNED');
      err.code = 'SOURCE_KEY_OWNED';
      throw err;
    }

    const thumbnailUrl = script.coverProvided
      ? script.thumbnailUrl
      : (existing ? existing.thumbnail_url : null);

    if (existing && scriptUnchanged(existing, script, thumbnailUrl)) {
      return { id: existing.id, created: false, updated: false, published: existing.is_public };
    }

    if (existing) {
      const params = [
        script.title,
        script.category,
        script.scenario,
        script.location,
        script.content,
        JSON.stringify(script.tags),
        script.duration,
        script.publish,
      ];
      let thumbnailSql = '';
      if (script.coverProvided) {
        params.push(script.thumbnailUrl);
        thumbnailSql = `, thumbnail_url = $${params.length}`;
      }
      params.push(existing.id);
      const updated = await client.query(
        `UPDATE custom_scripts
            SET title = $1,
                category = $2,
                scenario = $3,
                location = $4,
                content = $5,
                tags = $6,
                duration = $7,
                is_public = $8
                ${thumbnailSql}
          WHERE id = $${params.length}
          RETURNING id, is_public`,
        params
      );
      if (script.coverProvided) {
        await replaceCover(client, existing.id, script.thumbnailUrl);
      }
      return {
        id: updated.rows[0].id,
        created: false,
        updated: true,
        published: updated.rows[0].is_public,
      };
    }

    const inserted = await client.query(
      `INSERT INTO custom_scripts (
         couple_id, title, category, scenario, location, content, tags, duration,
         created_by, thumbnail_url, is_public, source_key
       ) VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, is_public`,
      [
        script.title,
        script.category,
        script.scenario,
        script.location,
        script.content,
        JSON.stringify(script.tags),
        script.duration,
        author.id,
        script.thumbnailUrl,
        script.publish,
        script.sourceKey,
      ]
    );
    const id = inserted.rows[0].id;
    if (script.thumbnailUrl) {
      await replaceCover(client, id, script.thumbnailUrl);
    }
    return {
      id,
      created: true,
      updated: false,
      published: inserted.rows[0].is_public,
    };
  });
}

function resultBody(author, script, result) {
  return {
    success: true,
    created: result.created,
    updated: result.updated,
    id: result.id,
    url: publicMarketUrl(result.id),
    published: result.published,
    sourceKey: script.sourceKey,
    author: { id: author.id, nickname: author.nickname },
    message: successMessage({
      created: result.created,
      updated: result.updated,
      publish: result.published,
    }),
  };
}

// POST /api/bot/marketplace/scripts
router.post('/scripts', botAuth, async (req, res) => {
  const validated = validateBotScript(req.body);
  if (!validated.ok) {
    logInfo('marketplace_bot.upsert.invalid', {
      error_code: validated.body.error_code,
      field: validated.body.errors[0]?.field || null,
    });
    return res.status(validated.status).json(validated.body);
  }
  const script = validated.value;

  try {
    const resolved = await resolveAuthor();
    if (!resolved.author) {
      logWarn('marketplace_bot.author_unavailable', { error_code: resolved.body.error_code });
      return res.status(resolved.status).json(resolved.body);
    }
    const { author } = resolved;

    logInfo('marketplace_bot.upsert.attempt', {
      authorId: author.id,
      sourceKey: script.sourceKey,
      publish: script.publish,
      titleLen: script.title.length,
      contentLen: script.content.length,
      actCount: script.acts.length,
    });

    let result;
    try {
      result = await upsertScript(author, script);
    } catch (err) {
      // Two uploads of a new sourceKey raced; the loser updates the winner's row.
      if (err.code === '23505' && err.constraint === 'idx_custom_scripts_source_key') {
        result = await upsertScript(author, script);
      } else {
        throw err;
      }
    }

    logInfo('marketplace_bot.upsert.success', {
      authorId: author.id,
      scriptId: result.id,
      sourceKey: script.sourceKey,
      created: result.created,
      updated: result.updated,
      published: result.published,
    });

    return res.status(result.created ? 201 : 200).json(resultBody(author, script, result));
  } catch (error) {
    if (error.code === 'SOURCE_KEY_OWNED') {
      logWarn('marketplace_bot.source_key_owned', { sourceKey: script.sourceKey });
      return res.status(409).json({
        success: false,
        message: '這個 sourceKey 已經屬於另一個帳號，請換一組外部編號，或改設定成原本的作者。',
        error_code: 'BOT_SOURCE_KEY_OWNED',
      });
    }
    logError('marketplace_bot.upsert.failed', {
      sourceKey: script.sourceKey,
      err: error.message,
    });
    logDbError('Marketplace bot upsert error:', error, { source_key: script.sourceKey });
    return res.status(500).json(errorResponseBody(
      '上傳劇本失敗，請稍後再試。若持續發生，請查看伺服器日誌裡的 marketplace_bot。',
      error
    ));
  }
});

module.exports = router;
