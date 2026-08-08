import { test, expect, request, APIRequestContext } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

// Drives the whole 一起收尾 state machine over HTTP against the real server and
// the local test DB (mock LLM provider). The UI specs stub the network; this one
// is the only place the actual transitions, the finalize race claim and the
// partial unique index get exercised.
//
// Tests run against the locked-down local test DB (see playwright.config.ts).
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true });

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

const STAMP = Date.now();
const A = { email: `closure-a-${STAMP}@twogether.app`, nickname: '迪索', password: 'test123456' };
const B = { email: `closure-b-${STAMP}@twogether.app`, nickname: '小湘', password: 'test123456' };

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set; cannot run closure-api spec');
  const url = new URL(dbUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`closure-api refusing to touch DB on host "${url.hostname}"`);
  }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function registerOrLogin(user: typeof A): Promise<string> {
  const base = await request.newContext();
  try {
    const reg = await base.post(`${API}/auth/register`, { data: user });
    if (reg.ok()) return (await reg.json()).token;
    const login = await base.post(`${API}/auth/login`, {
      data: { email: user.email, password: user.password },
    });
    if (!login.ok()) throw new Error(`login failed: ${login.status()} ${await login.text()}`);
    return (await login.json()).token;
  } finally {
    await base.dispose();
  }
}

function ctxFor(token: string) {
  return request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

async function pair(ctxA: APIRequestContext, ctxB: APIRequestContext) {
  const codeRes = await ctxA.post(`${API}/couples/pairing-code`, { data: {} });
  const code = (await codeRes.json())?.code;
  if (!code) throw new Error(`no pairing code: ${codeRes.status()} ${await codeRes.text()}`);
  const join = await ctxB.post(`${API}/couples`, { data: { pairing_code: code } });
  if (!join.ok()) throw new Error(`pairing join failed: ${join.status()} ${await join.text()}`);
}

async function createEvent(ctx: APIRequestContext, title: string) {
  const res = await ctx.post(`${API}/events`, {
    data: {
      title,
      summary: '孩子睡著了，要不要移動他，我們吵了起來。',
      ai_neutral: '我想聊聊剛才移動孩子的事。',
      ai_firm: '我需要你在動孩子前先問我一聲。',
      ai_warm: '剛才那樣我有點慌，可以聊聊嗎？',
      selected_version: 'warm',
      emotions: ['焦慮'],
      tags: ['育兒'],
    },
  });
  if (!res.ok()) throw new Error(`create event failed: ${res.status()} ${await res.text()}`);
  return (await res.json()).event.id as string;
}

let tokenA: string;
let tokenB: string;
let ctxA: APIRequestContext;
let ctxB: APIRequestContext;

test.beforeAll(async () => {
  tokenA = await registerOrLogin(A);
  tokenB = await registerOrLogin(B);
  ctxA = await ctxFor(tokenA);
  ctxB = await ctxFor(tokenB);
  await pair(ctxA, ctxB);
});

test.afterAll(async () => {
  await ctxA?.dispose();
  await ctxB?.dispose();
});

test.describe.serial('一起收尾 — the closure state machine over HTTP', () => {
  test('both partners submit → resolved, two active commitments, an insight', async () => {
    const eventId = await createEvent(ctxA, '孩子睡著後要不要移動');

    // One tap, either partner. No handshake, and crucially NOT resolved yet.
    const start = await ctxA.post(`${API}/events/${eventId}/closure/start`);
    expect(start.status()).toBe(201);

    const afterStart = await withDb((c) =>
      c.query(`SELECT status, resolved_at FROM events WHERE id = $1`, [eventId])
    );
    expect(afterStart.rows[0].status).toBe('closing');
    // 'closing' is not resolution — every metric keyed on resolved_at must stay
    // honest while the couple is still writing.
    expect(afterStart.rows[0].resolved_at).toBeNull();

    // A second tap is idempotent: same closure, deadline not reset.
    const restart = await ctxB.post(`${API}/events/${eventId}/closure/start`);
    expect(restart.status()).toBe(200);

    // Before A submits, A cannot see B's side — and there is nothing to see yet.
    const preSubmit = await (await ctxA.get(`${API}/events/${eventId}/closure`)).json();
    expect(preSubmit.closure.me.status).toBe('pending');
    expect(preSubmit.closure.partner.commitment).toBeNull();

    // 幫我想一個 is opt-in and deterministic under the mock provider.
    const assist = await ctxA.post(`${API}/events/${eventId}/closure/assist`, {
      data: { field: 'commitment' },
    });
    expect(assist.ok()).toBeTruthy();
    const assistBody = await assist.json();
    expect(assistBody.options.length).toBeGreaterThanOrEqual(2);

    // A submits a commitment + proposes the shared decision.
    const submitA = await ctxA.post(`${API}/events/${eventId}/closure/submit`, {
      data: {
        commitment: '即使很生氣，也不在人前責罵你',
        sharedDecision: '孩子睡著後若沒有立即危險就不移動',
      },
    });
    expect(submitA.ok()).toBeTruthy();

    // Still 'closing' — one partner submitting is not the whole ceremony.
    const midway = await withDb((c) =>
      c.query(`SELECT status FROM events WHERE id = $1`, [eventId])
    );
    expect(midway.rows[0].status).toBe('closing');

    // A double-submit updates the same row rather than creating a second
    // promise. This is what the partial unique index buys us.
    const resubmit = await ctxA.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '即使很生氣，也不在孩子面前說你' },
    });
    expect(resubmit.ok()).toBeTruthy();
    const aCommitments = await withDb((c) =>
      c.query(`SELECT id FROM commitments WHERE event_id = $1 AND owner_id IS NOT NULL`, [eventId])
    );
    expect(aCommitments.rows.length).toBe(1);

    // B still hasn't submitted, so B cannot see A's text.
    const bBeforeSubmit = await (await ctxB.get(`${API}/events/${eventId}/closure`)).json();
    expect(bBeforeSubmit.closure.partner.commitment).toBeNull();

    // B submits. Both are now 'submitted' but neither has reviewed, so the
    // event must NOT be resolved yet.
    const submitB = await ctxB.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '我會先跟你說一聲再抱孩子' },
    });
    expect(submitB.ok()).toBeTruthy();

    // Now B can see A's commitment.
    const bAfterSubmit = await (await ctxB.get(`${API}/events/${eventId}/closure`)).json();
    expect(bAfterSubmit.closure.partner.commitment?.text).toBe('即使很生氣，也不在孩子面前說你');

    // Each reviews the other. The last review finalizes.
    await ctxB.post(`${API}/events/${eventId}/closure/review`, {
      data: { target: 'commitment', verdict: 'agree' },
    });
    const lastReview = await ctxA.post(`${API}/events/${eventId}/closure/review`, {
      data: { target: 'commitment', verdict: 'agree' },
    });
    expect(lastReview.ok()).toBeTruthy();

    const done = await withDb((c) =>
      c.query(`SELECT status, resolved_at FROM events WHERE id = $1`, [eventId])
    );
    expect(done.rows[0].status).toBe('resolved');
    expect(done.rows[0].resolved_at).not.toBeNull();

    // Two commitments went active, each with the follow-up clock started at
    // resolution (~72h out, per migration 083 / Batch 3).
    const active = await withDb((c) =>
      c.query(
        `SELECT text, status, due_at,
                EXTRACT(EPOCH FROM (due_at - NOW())) / 3600 AS hours_out
           FROM commitments WHERE event_id = $1 ORDER BY created_at`,
        [eventId]
      )
    );
    expect(active.rows.length).toBe(2);
    for (const row of active.rows) {
      expect(row.status).toBe('active');
      expect(Number(row.hours_out)).toBeGreaterThan(70);
      expect(Number(row.hours_out)).toBeLessThan(73);
    }

    // The AI 見解 is written AFTER the finalize claim, so it exists but could
    // never have blocked resolution.
    const closure = await withDb((c) =>
      c.query(`SELECT status, insight, shared_decision FROM event_closures WHERE event_id = $1`, [eventId])
    );
    expect(closure.rows[0].status).toBe('finalized');
    expect(closure.rows[0].insight?.text).toBeTruthy();
    expect(closure.rows[0].shared_decision).toBe('孩子睡著後若沒有立即危險就不移動');
  });

  test('a skip still resolves and never voids the partner’s commitment', async () => {
    const eventId = await createEvent(ctxA, '週末行程沒有先講');

    await ctxA.post(`${API}/events/${eventId}/closure/start`);
    await ctxA.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '排行程之前我會先問你一句' },
    });
    const skip = await ctxB.post(`${API}/events/${eventId}/closure/skip`, {
      data: { reason: '現在沒力氣' },
    });
    expect(skip.ok()).toBeTruthy();

    const row = await withDb((c) =>
      c.query(`SELECT status FROM events WHERE id = $1`, [eventId])
    );
    expect(row.rows[0].status).toBe('resolved');

    // The surviving commitment still activates — skipping is your own choice
    // about your own promise, not a veto over your partner's.
    const commitments = await withDb((c) =>
      c.query(`SELECT status, text FROM commitments WHERE event_id = $1`, [eventId])
    );
    expect(commitments.rows.length).toBe(1);
    expect(commitments.rows[0].status).toBe('active');

    const participants = await withDb((c) =>
      c.query(`SELECT status FROM event_closure_participants WHERE event_id = $1 ORDER BY status`, [eventId])
    );
    expect(participants.rows.map((r) => r.status).sort()).toEqual(['skipped', 'submitted']);
  });

  test('cancel returns the event to open; it is refused once anyone has written', async () => {
    const eventId = await createEvent(ctxA, '洗碗又沒洗');

    await ctxA.post(`${API}/events/${eventId}/closure/start`);
    const cancel = await ctxB.post(`${API}/events/${eventId}/closure/cancel`);
    expect(cancel.ok()).toBeTruthy();

    const reopened = await withDb((c) =>
      c.query(`SELECT status FROM events WHERE id = $1`, [eventId])
    );
    expect(reopened.rows[0].status).toBe('open');
    const gone = await withDb((c) =>
      c.query(`SELECT 1 FROM event_closures WHERE event_id = $1`, [eventId])
    );
    expect(gone.rows.length).toBe(0);

    // Restart, write something, and cancel must now refuse — it can never
    // destroy what a partner already wrote.
    await ctxA.post(`${API}/events/${eventId}/closure/start`);
    await ctxA.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '吃完飯我會先把碗放進水槽' },
    });
    const refused = await ctxB.post(`${API}/events/${eventId}/closure/cancel`);
    expect(refused.status()).toBe(400);
    expect((await refused.json()).error_code).toBe('CLOSURE_ALREADY_STARTED');
  });

  test('unilateral finalize is refused inside the 24h grace window', async () => {
    const eventId = await createEvent(ctxA, '訊息已讀不回');

    await ctxA.post(`${API}/events/${eventId}/closure/start`);

    // My own part isn't done yet.
    const tooSoon = await ctxA.post(`${API}/events/${eventId}/closure/finalize`);
    expect(tooSoon.status()).toBe(400);
    expect((await tooSoon.json()).error_code).toBe('CLOSURE_NEEDS_YOUR_PART');

    await ctxA.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '看到訊息我會先回一個貼圖' },
    });
    const stillEarly = await ctxA.post(`${API}/events/${eventId}/closure/finalize`);
    expect(stillEarly.status()).toBe(400);
    expect((await stillEarly.json()).error_code).toBe('CLOSURE_FINALIZE_TOO_EARLY');

    // Backdate the start so the valve unlocks, then it works.
    await withDb((c) =>
      c.query(`UPDATE event_closures SET started_at = NOW() - INTERVAL '25 hours' WHERE event_id = $1`, [eventId])
    );
    const forced = await ctxA.post(`${API}/events/${eventId}/closure/finalize`);
    expect(forced.ok()).toBeTruthy();

    const row = await withDb((c) =>
      c.query(`SELECT status FROM events WHERE id = $1`, [eventId])
    );
    expect(row.rows[0].status).toBe('resolved');

    // The absent partner is 'auto_skipped', never 'skipped' — they didn't
    // decline, they just weren't there.
    const partner = await withDb((c) =>
      c.query(
        `SELECT status FROM event_closure_participants
          WHERE event_id = $1 AND status <> 'submitted'`,
        [eventId]
      )
    );
    expect(partner.rows[0].status).toBe('auto_skipped');
  });

  test('the 72h sweep auto-finalizes an abandoned closure off GET /api/events', async () => {
    const eventId = await createEvent(ctxA, '過年要回誰家');

    await ctxA.post(`${API}/events/${eventId}/closure/start`);
    await ctxA.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '過年安排我會提早一個月跟你討論' },
    });

    // B never comes back. Backdate the deadline and hit the endpoint the sweep
    // rides on (there is no cron in this app).
    await withDb((c) =>
      c.query(`UPDATE event_closures SET deadline_at = NOW() - INTERVAL '1 hour' WHERE event_id = $1`, [eventId])
    );
    await ctxA.get(`${API}/events`);

    await expect
      .poll(
        async () => {
          const r = await withDb((c) => c.query(`SELECT status FROM events WHERE id = $1`, [eventId]));
          return r.rows[0].status;
        },
        { timeout: 10000 }
      )
      .toBe('resolved');

    const commitments = await withDb((c) =>
      c.query(`SELECT status FROM commitments WHERE event_id = $1`, [eventId])
    );
    expect(commitments.rows[0].status).toBe('active');
  });

  test('reopening from closing abandons the closure but keeps active commitments', async () => {
    const eventId = await createEvent(ctxA, '買東西沒有先商量');

    await ctxA.post(`${API}/events/${eventId}/closure/start`);
    await ctxA.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '超過一千元的東西我會先問你' },
    });

    // Force one commitment to 'active' to prove reopen leaves promises already
    // made alone — only the half-written drafts are dropped.
    await withDb((c) =>
      c.query(`UPDATE commitments SET status = 'active', activated_at = NOW() WHERE event_id = $1`, [eventId])
    );
    await ctxB.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '我也會先跟你說一聲再下單' },
    });

    const reopen = await ctxB.post(`${API}/events/${eventId}/reopen`);
    expect(reopen.ok()).toBeTruthy();

    const event = await withDb((c) => c.query(`SELECT status FROM events WHERE id = $1`, [eventId]));
    expect(event.rows[0].status).toBe('open');

    const closure = await withDb((c) =>
      c.query(`SELECT status FROM event_closures WHERE event_id = $1`, [eventId])
    );
    expect(closure.rows[0].status).toBe('abandoned');

    const commitments = await withDb((c) =>
      c.query(`SELECT status FROM commitments WHERE event_id = $1 ORDER BY created_at`, [eventId])
    );
    expect(commitments.rows.map((r) => r.status)).toEqual(['active']);
  });

  test('一起收尾 can be started again after a reopen', async () => {
    const eventId = await createEvent(ctxA, '同一件事又發生了');

    await ctxA.post(`${API}/events/${eventId}/closure/start`);
    await ctxA.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '我會記得把鑰匙放回原位' },
    });
    await ctxB.post(`${API}/events/${eventId}/reopen`);

    // reopen leaves an 'abandoned' row behind. The second 一起收尾 used to insert
    // ON CONFLICT DO NOTHING against it, flipping the event to 'closing' with a
    // dead closure — every submit after that failed with CLOSURE_ALREADY_FINALIZED
    // and the sweep skipped it, so the event was stuck forever.
    const restart = await ctxA.post(`${API}/events/${eventId}/closure/start`);
    expect(restart.ok()).toBeTruthy();

    const reset = await withDb((c) =>
      c.query(
        `SELECT status, finalized_at, insight, shared_decision_status
           FROM event_closures WHERE event_id = $1`,
        [eventId]
      )
    );
    expect(reset.rows[0].status).toBe('collecting');
    expect(reset.rows[0].finalized_at).toBeNull();
    expect(reset.rows[0].insight).toBeNull();
    expect(reset.rows[0].shared_decision_status).toBe('none');

    const submitAgain = await ctxA.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '進門我會先把鑰匙掛上' },
    });
    expect(submitAgain.ok()).toBeTruthy();

    // ...but the reset must not fire on an idempotent re-tap of a LIVE closure,
    // or either partner could silently push the 72h deadline out forever.
    const before = await withDb((c) =>
      c.query(`SELECT deadline_at FROM event_closures WHERE event_id = $1`, [eventId])
    );
    const retap = await ctxB.post(`${API}/events/${eventId}/closure/start`);
    expect(retap.status()).toBe(200);
    const after = await withDb((c) =>
      c.query(`SELECT deadline_at, status FROM event_closures WHERE event_id = $1`, [eventId])
    );
    expect(after.rows[0].deadline_at.getTime()).toBe(before.rows[0].deadline_at.getTime());
    // And the re-tap didn't wipe the commitment that was already written.
    const survived = await withDb((c) =>
      c.query(`SELECT text FROM commitments WHERE event_id = $1`, [eventId])
    );
    expect(survived.rows.map((r) => r.text)).toEqual(['進門我會先把鑰匙掛上']);
  });

  test('取消收尾 after someone has written keeps the therapy note', async () => {
    const eventId = await createEvent(ctxA, '晚歸沒有先說一聲');

    // The couple discussed and earned an AI therapy note before收尾 began.
    const note = { summary: '你們都在意的是「有沒有被放在心上」。', companion: 'mock' };
    await withDb((c) =>
      c.query(`UPDATE events SET therapy_note = $2 WHERE id = $1`, [eventId, JSON.stringify(note)])
    );

    await ctxA.post(`${API}/events/${eventId}/closure/start`);
    await ctxA.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '會晚回家我會先傳個訊息' },
    });

    // cancel refuses now (someone has written), which is what used to push the
    // client onto /reopen — and /reopen nulls therapy_note. 取消收尾 and 重新開啟
    // are different intents, so abandon exists to mean only the first one.
    const refused = await ctxB.post(`${API}/events/${eventId}/closure/cancel`);
    expect(refused.status()).toBe(400);

    const abandon = await ctxB.post(`${API}/events/${eventId}/closure/abandon`);
    expect(abandon.ok()).toBeTruthy();

    const event = await withDb((c) =>
      c.query(`SELECT status, therapy_note, resolved_at FROM events WHERE id = $1`, [eventId])
    );
    expect(event.rows[0].status).toBe('open');
    expect(event.rows[0].therapy_note).toEqual(note);
    expect(event.rows[0].resolved_at).toBeNull();

    const closure = await withDb((c) =>
      c.query(`SELECT status FROM event_closures WHERE event_id = $1`, [eventId])
    );
    expect(closure.rows[0].status).toBe('abandoned');

    // Only the drafts go. Nothing is 'active' during closing, so nothing durable
    // was lost.
    const commitments = await withDb((c) =>
      c.query(`SELECT status FROM commitments WHERE event_id = $1`, [eventId])
    );
    expect(commitments.rows.length).toBe(0);
  });

  test('the sweep rescues a closure where both submitted but neither reviewed', async () => {
    const eventId = await createEvent(ctxA, '誰去接小孩');

    await ctxA.post(`${API}/events/${eventId}/closure/start`);
    await ctxA.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '接送安排我會前一天就確認' },
    });
    await ctxB.post(`${API}/events/${eventId}/closure/submit`, {
      data: { commitment: '臨時有事我會早點跟你說' },
    });

    // Neither reviews. The sweep's auto-skip only touches 'pending' rows, so it
    // flips nothing here — without force the finalize claim kept failing
    // NOT_TERMINAL_EXISTS and the event sat in 'closing' past its deadline
    // forever, re-occupying the LIMIT 20 window on every sweep.
    const stillClosing = await withDb((c) =>
      c.query(`SELECT status FROM events WHERE id = $1`, [eventId])
    );
    expect(stillClosing.rows[0].status).toBe('closing');

    await withDb((c) =>
      c.query(`UPDATE event_closures SET deadline_at = NOW() - INTERVAL '1 hour' WHERE event_id = $1`, [eventId])
    );
    await ctxA.get(`${API}/events`);

    await expect
      .poll(
        async () => {
          const r = await withDb((c) => c.query(`SELECT status FROM events WHERE id = $1`, [eventId]));
          return r.rows[0].status;
        },
        { timeout: 10000 }
      )
      .toBe('resolved');

    // Past the deadline the clock is the authority, but both promises still
    // count — forcing the finish must not throw away what they wrote.
    const commitments = await withDb((c) =>
      c.query(`SELECT status FROM commitments WHERE event_id = $1`, [eventId])
    );
    expect(commitments.rows.length).toBe(2);
    for (const row of commitments.rows) expect(row.status).toBe('active');
  });

  test('a private (solo) event has no closure flow', async () => {
    const res = await ctxA.post(`${API}/events`, {
      data: {
        title: '我自己想一下',
        summary: '這件事我想先自己整理。',
        ai_neutral: 'x',
        ai_firm: 'y',
        ai_warm: 'z',
        is_private: true,
      },
    });
    const eventId = (await res.json()).event.id;

    const start = await ctxA.post(`${API}/events/${eventId}/closure/start`);
    expect(start.status()).toBe(403);
    expect((await start.json()).error_code).toBe('PRIVATE_EVENT');
  });
});
