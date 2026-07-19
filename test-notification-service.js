#!/usr/bin/env node

// Focused unit test for services/notificationService.js — the partner-action
// notification seam. Runs as a plain Node script (like test-integration.js) so
// it needs no test runner and no live database: it stubs database/db.js,
// lineService and emailService through the require cache before loading the
// service, then asserts the branching that matters:
//   1. paired actor  → one notification row inserted for the PARTNER + LINE push
//   2. unpaired actor → nothing inserted, no push (no partner to tell)
//   3. unknown type   → no-op
//   4. DB insert throwing → never bubbles to the caller
//
// Run: node test-notification-service.js

const assert = require('assert');

process.env.NODE_ENV = 'test'; // keep the real logger quiet (< ERROR)

// --- Mutable test state driving the stubbed dependencies -------------------
const state = {
  partnerId: null,      // what getPartnerId's query returns
  inserts: [],          // captured INSERT INTO notifications calls
  linePushes: [],       // captured LINE pushes
  emails: [],           // captured emails
  failInsert: false,    // force the INSERT to throw
};

function resetState() {
  state.partnerId = null;
  state.inserts = [];
  state.linePushes = [];
  state.emails = [];
  state.failInsert = false;
}

// Inject a fake module at the path the service will require().
function mockModule(requireId, exports) {
  const resolved = require.resolve(requireId);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// Stub the pg wrapper. Dispatches on the SQL text the service actually issues.
mockModule('./database/db', {
  query: async (sql, params = []) => {
    if (/CREATE TABLE/i.test(sql)) return { rows: [] };
    if (/partner_id/i.test(sql)) {
      return { rows: state.partnerId ? [{ partner_id: state.partnerId }] : [] };
    }
    if (/SELECT nickname/i.test(sql)) {
      return { rows: [{ nickname: 'Alice' }] };
    }
    if (/INSERT INTO notifications/i.test(sql)) {
      if (state.failInsert) throw new Error('boom');
      state.inserts.push({ sql, params });
      return { rows: [] };
    }
    return { rows: [] };
  },
});

mockModule('./services/lineService', {
  excerpt: (t) => t,
  pushToUserIfLinked: (_db, userId, text) => { state.linePushes.push({ userId, text }); },
});

mockModule('./services/emailService', {
  getUserEmailIfOptedIn: async () => null, // opt-out path → skip email cleanly
  sendPartnerActionNotification: async (args) => { state.emails.push(args); },
});

const { notifyPartnerAction } = require('./services/notificationService');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  resetState();
  try {
    await fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`❌ ${name}\n   ${err.message}`);
  }
}

(async () => {
  await test('paired actor → inserts one row for the partner + LINE push', async () => {
    state.partnerId = 'partner-1';
    await notifyPartnerAction({ actorId: 'user-1', type: 'love_moment_created', content: '昨晚的約會' });
    assert.strictEqual(state.inserts.length, 1, 'expected exactly one insert');
    const { params } = state.inserts[0];
    // INSERT params: [user_id, notification_type, title, content, related_user_id, priority]
    assert.strictEqual(params[0], 'partner-1', 'recipient must be the partner');
    assert.strictEqual(params[1], 'love_moment_created', 'type preserved');
    assert.ok(params[2].includes('Alice'), 'title carries the actor nickname');
    assert.strictEqual(params[3], '昨晚的約會', 'content preserved');
    assert.strictEqual(params[4], 'user-1', 'related_user_id must be the actor');
    assert.strictEqual(state.linePushes.length, 1, 'LINE push fired');
    assert.strictEqual(state.linePushes[0].userId, 'partner-1', 'LINE push targets the partner');
  });

  await test('content omitted → falls back to the catalog line', async () => {
    state.partnerId = 'partner-1';
    await notifyPartnerAction({ actorId: 'user-1', type: 'love_moment_deleted' });
    assert.strictEqual(state.inserts.length, 1);
    assert.ok(state.inserts[0].params[3] && state.inserts[0].params[3].length > 0, 'fallback content present');
  });

  await test('unpaired actor → no insert, no push', async () => {
    state.partnerId = null;
    await notifyPartnerAction({ actorId: 'solo-1', type: 'love_moment_created', content: 'x' });
    assert.strictEqual(state.inserts.length, 0, 'no notification for a solo user');
    assert.strictEqual(state.linePushes.length, 0, 'no LINE push for a solo user');
  });

  await test('unknown type → no-op (no partner lookup side effects)', async () => {
    state.partnerId = 'partner-1';
    await notifyPartnerAction({ actorId: 'user-1', type: 'not_a_real_type' });
    assert.strictEqual(state.inserts.length, 0);
    assert.strictEqual(state.linePushes.length, 0);
  });

  await test('DB insert throwing never bubbles to the caller', async () => {
    state.partnerId = 'partner-1';
    state.failInsert = true;
    // Must resolve, not reject.
    await notifyPartnerAction({ actorId: 'user-1', type: 'custom_gift_created', content: 'g' });
    // Insert threw so nothing captured, but the LINE mirror still fires.
    assert.strictEqual(state.inserts.length, 0);
    assert.strictEqual(state.linePushes.length, 1, 'notification is best-effort; other channels still run');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
