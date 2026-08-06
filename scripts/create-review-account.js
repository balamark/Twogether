#!/usr/bin/env node

/**
 * Reviewer test account (審核用測試帳號)
 * ---------------------------------------------------------------------------
 * Payment-gateway shop reviews (藍新金流 / 綠界) ask for a working account +
 * password so their reviewer can walk the real purchase flow. Premium checkout
 * requires a COMPLETE couple, so a single account is not enough: this script
 * seeds two paired accounts (the reviewer and a stand-in partner), marks both
 * email-verified, and drops in a little sample data so the app isn't an empty
 * shell when they log in.
 *
 * It is idempotent — re-running resets the password and re-pairs if needed,
 * without duplicating users or sample rows. Safe to run against production,
 * which is the point: the reviewer tests the live site.
 *
 * Usage:
 *   node scripts/create-review-account.js            # generates a password
 *   REVIEW_ACCOUNT_PASSWORD='...' node scripts/create-review-account.js
 *
 * Env:
 *   REVIEW_ACCOUNT_EMAIL     default newebpay-review@twogether.fun
 *   REVIEW_PARTNER_EMAIL     default newebpay-review-partner@twogether.fun
 *   REVIEW_ACCOUNT_PASSWORD  default: a fresh random one, printed at the end
 *
 * The printed credentials are what you send to the gateway's 客服信箱. Rotate
 * them (re-run) once the review is done.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

const EMAIL = (process.env.REVIEW_ACCOUNT_EMAIL || 'newebpay-review@twogether.fun').toLowerCase();
const PARTNER_EMAIL = (process.env.REVIEW_PARTNER_EMAIL || 'newebpay-review-partner@twogether.fun').toLowerCase();

// Readable but not guessable: 3 base32-ish chunks. Only ever printed to the
// operator's terminal, never logged server-side.
function genPassword() {
  const raw = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '');
  return `Review-${raw}`;
}

// Create the user, or reset the existing one's password. Either way the account
// ends up verified so the reviewer never hits the "verify your email" banner.
async function upsertUser(client, { email, nickname, passwordHash }) {
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) {
    await client.query(
      `UPDATE users
          SET password_hash = $2, nickname = $3, email_verified = true,
              email_verification_token = NULL
        WHERE id = $1`,
      [existing.rows[0].id, passwordHash, nickname]
    );
    return { id: existing.rows[0].id, created: false };
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO users (id, nickname, email, password_hash, created_at, last_login, email_verified)
     VALUES ($1, $2, $3, $4, $5, $5, true)`,
    [id, nickname, email, passwordHash, now]
  );
  return { id, created: true };
}

// Pair the two accounts if they aren't already a complete couple. Any draft
// (single-user) couples they hold are removed first — a user may only belong to
// one couple, and a leftover draft would block the pairing.
async function ensureCouple(client, userAId, userBId) {
  const paired = await client.query(
    `SELECT id FROM couples
      WHERE user2_id IS NOT NULL
        AND ((user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1))`,
    [userAId, userBId]
  );
  if (paired.rows[0]) return { coupleId: paired.rows[0].id, created: false };

  await client.query(
    `DELETE FROM couples
      WHERE user2_id IS NULL AND (user1_id = $1 OR user1_id = $2)`,
    [userAId, userBId]
  );

  const coupleId = uuidv4();
  await client.query(
    `INSERT INTO couples (id, user1_id, user2_id, couple_name, anniversary_date, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [coupleId, userAId, userBId, '審核測試帳號', '2024-02-14']
  );
  return { coupleId, created: true };
}

// A few records so the dashboard, calendar and stats have something to show.
// Keyed by notes text so a re-run doesn't pile up duplicates.
async function ensureSampleMoments(client, coupleId, recordedBy) {
  const samples = [
    { daysAgo: 2, notes: '審核測試資料：一起看電影的晚上' },
    { daysAgo: 9, notes: '審核測試資料：週末散步' },
    { daysAgo: 21, notes: '審核測試資料：紀念日晚餐' },
  ];
  let inserted = 0;
  for (const s of samples) {
    const dup = await client.query(
      'SELECT 1 FROM love_moments WHERE couple_id = $1 AND notes = $2',
      [coupleId, s.notes]
    );
    if (dup.rows.length) continue;
    await client.query(
      `INSERT INTO love_moments (id, couple_id, recorded_by, moment_date, notes, created_at)
       VALUES ($1, $2, $3, NOW() - make_interval(days => $4), $5, NOW())`,
      [uuidv4(), coupleId, recordedBy, s.daysAgo, s.notes]
    );
    inserted += 1;
  }
  return inserted;
}

async function main() {
  const password = process.env.REVIEW_ACCOUNT_PASSWORD || genPassword();
  const passwordHash = await bcrypt.hash(password, 12);

  let host = 'unknown';
  try {
    host = new URL(process.env.DATABASE_URL).host;
  } catch {
    /* DATABASE_URL malformed or unset — db.query below will report it properly */
  }
  console.log(`Seeding reviewer accounts against ${host}…`);

  const summary = await db.transaction(async (client) => {
    const reviewer = await upsertUser(client, {
      email: EMAIL,
      nickname: '審核測試帳號',
      passwordHash,
    });
    const partner = await upsertUser(client, {
      email: PARTNER_EMAIL,
      nickname: '審核測試夥伴',
      passwordHash,
    });
    const couple = await ensureCouple(client, reviewer.id, partner.id);

    let moments = 0;
    try {
      moments = await ensureSampleMoments(client, couple.coupleId, reviewer.id);
    } catch (err) {
      // Sample data is a nicety; the credentials are the deliverable. Don't let
      // a schema drift in love_moments cost us the accounts.
      console.warn(`  (sample data skipped: ${err.message})`);
    }

    return { reviewer, partner, couple, moments };
  });

  console.log('');
  console.log('審核用測試帳號已就緒（可直接提供給金流客服）');
  console.log('---------------------------------------------------------------');
  console.log(`主帳號   帳號：${EMAIL}`);
  console.log(`         密碼：${password}`);
  console.log(`夥伴帳號 帳號：${PARTNER_EMAIL}`);
  console.log(`         密碼：${password}`);
  console.log('---------------------------------------------------------------');
  console.log(`配對狀態：已配對（couple_id ${summary.couple.coupleId}）`);
  console.log(`帳號狀態：${summary.reviewer.created ? '新建' : '已存在，已重設密碼'} / ${summary.partner.created ? '新建' : '已存在，已重設密碼'}`);
  console.log(`範例紀錄：新增 ${summary.moments} 筆`);
  console.log('');
  console.log('提醒：兩個帳號皆為免費方案，登入後可於「升級 Premium」實際走完付款流程。');
  console.log('      審核結束後請重新執行本腳本以輪換密碼。');
}

main()
  .then(() => db.close())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Failed to seed reviewer accounts:', err.message);
    try { await db.close(); } catch { /* already closing */ }
    process.exit(1);
  });
