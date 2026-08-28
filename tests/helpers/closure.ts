import type { Page, Route } from '@playwright/test';

// Shared route fixture for the 一起收尾 UI specs (events-closure, -escape,
// -quota). The closure ceremony is a six-screen state machine whose screens are
// chosen from ONE payload (GET /events/:id/closure), so the cheapest honest way
// to drive it from the UI is to serve that payload from a mutable fixture and
// let each spec decide what the server says next. The state machine itself is
// covered against the real server in events-closure-api.spec.ts; these specs
// cover the screens.
//
// NOT a *.spec.ts file, so Playwright's default testMatch never collects it.

export const FAKE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@x.test',
  nickname: '小美',
  selected_therapist: 'luma',
};
export const PARTNER_ID = '99999999-9999-9999-9999-999999999999';
export const COUPLE_ID = '33333333-3333-3333-3333-333333333333';
export const EVENT_ID = '22222222-2222-2222-2222-222222222222';
export const PARTNER_NICKNAME = '阿哲';
export const EVENT_TITLE = '接送小孩的分工';

export type Call = { method: string; url: string; body: string };

export const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();

export async function seedAuth(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('authToken', 'fake-jwt');
    localStorage.setItem('authUser', JSON.stringify(user));
    localStorage.setItem(
      'authState',
      JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }),
    );
    localStorage.setItem('pairingPromptDismissed', 'true');
    localStorage.setItem(
      'authTokenExpiresAt',
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    );
  }, FAKE_USER);

  // Catch-all first: Playwright matches routes in reverse registration order,
  // so everything registered after this one still wins.
  await page.route('**/api/**', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    }),
  );

  await page.route('**/api/couples**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        couple: {
          id: COUPLE_ID,
          user1_id: FAKE_USER.id,
          user1_nickname: FAKE_USER.nickname,
          user2_id: PARTNER_ID,
          user2_nickname: PARTNER_NICKNAME,
        },
      }),
    });
  });

  await page.route('**/api/auth/**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: true }),
    });
  });
}

export function makeEvent(over: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    couple_id: COUPLE_ID,
    created_by: FAKE_USER.id,
    title: EVENT_TITLE,
    summary: '早上約好一起送小孩上學，一方未及時起床。',
    emotions: ['失望'],
    tags: ['育兒'],
    toxicity_flags: [],
    versions: {
      neutral: '關於接送的事，我心裡有失望的感覺。',
      firm: '我感到失望。',
      warm: '我感到失望，等平靜後我願意再聊聊。',
    },
    selected_version: 'neutral',
    is_private: false,
    status: 'closing',
    content_edited_at: null,
    resolve_requested_by: null,
    resolve_requested_at: null,
    resolved_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    messages: [],
    ...over,
  };
}

export function makeCommitment(over: Record<string, unknown> = {}) {
  return {
    id: '55555555-5555-5555-5555-555555555555',
    userId: FAKE_USER.id,
    text: '要動孩子之前，我會先問你一聲',
    status: 'pending_review',
    reviewStatus: 'pending_review',
    reviewNote: null,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

export function makeClosure(over: Record<string, unknown> = {}) {
  return {
    eventId: EVENT_ID,
    status: 'collecting',
    eventStatus: 'closing',
    startedBy: FAKE_USER.id,
    startedAt: new Date().toISOString(),
    deadlineAt: hoursFromNow(72),
    canFinalizeAt: hoursFromNow(24),
    finalizedAt: null,
    therapyNote: null,
    insight: null,
    insightAt: null,
    me: { userId: FAKE_USER.id, status: 'pending', submittedAt: null, reviewedAt: null, commitment: null },
    partner: {
      userId: PARTNER_ID,
      nickname: PARTNER_NICKNAME,
      status: 'pending',
      submittedAt: null,
      reviewedAt: null,
      commitment: null,
    },
    sharedDecision: null,
    sharedDecisionBy: null,
    sharedDecisionStatus: null,
    sharedDecisionNote: null,
    canCancel: true,
    ...over,
  };
}

type Json = Record<string, unknown>;
type Reply = { status?: number; body?: Json };
type Handler = (body: Json, fx: ClosureFixture) => Reply | void | Promise<Reply | void>;

export interface ClosureFixture {
  calls: Call[];
  /** Every call to POST /events/:id/closure/<action>, in order. */
  actions: () => string[];
  event: () => Json;
  closure: () => Json;
  setEvent: (patch: Json) => void;
  setClosure: (patch: Json) => void;
  /** Override one action's response; return {status, body} or mutate + return nothing. */
  on: (action: string, handler: Handler) => void;
}

function errorBody(code: string, message: string): Json {
  return { success: false, error: message, message, error_code: code };
}

/** 429 + AI_DAILY_LIMIT_REACHED, the shape the quota spec drives assist with. */
export const AI_QUOTA_ERROR: Reply = {
  status: 429,
  body: errorBody('AI_DAILY_LIMIT_REACHED', '今日 AI 次數已用完，明天會自動補上。'),
};

export function apiError(status: number, code: string, message: string): Reply {
  return { status, body: errorBody(code, message) };
}

export async function seedClosure(
  page: Page,
  init: { event?: Json; closure?: Json } = {},
): Promise<ClosureFixture> {
  let event: Json = { ...makeEvent(), ...(init.event || {}) };
  let closure: Json = { ...makeClosure(), ...(init.closure || {}) };
  const calls: Call[] = [];
  const handlers = new Map<string, Handler>();

  const fx: ClosureFixture = {
    calls,
    actions: () =>
      calls
        .filter((c) => c.method === 'POST')
        .map((c) => c.url.replace(/^.*\/api\/events\/[^/]+\//, '')),
    event: () => event,
    closure: () => closure,
    setEvent: (patch) => {
      event = { ...event, ...patch };
    },
    setClosure: (patch) => {
      closure = { ...closure, ...patch };
    },
    on: (action, handler) => handlers.set(action, handler),
  };

  const record = (route: Route) => {
    const req = route.request();
    calls.push({ method: req.method(), url: req.url(), body: req.postData() || '' });
  };

  // ── reads ────────────────────────────────────────────────────────────────
  await page.route('**/api/events*', async (route) => {
    const req = route.request();
    // Only the list endpoint — /api/events/<id>/… has its own handlers.
    if (req.method() !== 'GET' || !/\/api\/events(\?[^/]*)?$/.test(req.url())) {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, events: [event], total: 1 }),
    });
  });

  await page.route(`**/api/events/${EVENT_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, event }),
    });
  });

  await page.route(`**/api/events/${EVENT_ID}/closure`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    // A resolved event still serves its closure — that's what Screen 6 renders
    // from. Only a cancelled/abandoned (back to open) event 400s, the way the
    // server does, so the panel bubbles up instead of showing a scary toast.
    if (event.status !== 'closing' && event.status !== 'resolved') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify(errorBody('EVENT_NOT_CLOSING', '這則對話目前不在收尾中')),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, closure }),
    });
  });

  // ── writes ───────────────────────────────────────────────────────────────
  const defaults: Record<string, Handler> = {
    start: (_b, f) => {
      f.setEvent({ status: 'closing' });
      return { status: 201, body: { success: true, closure } };
    },
    submit: (body, f) => {
      f.setClosure({
        me: {
          ...(closure.me as Json),
          status: 'submitted',
          submittedAt: new Date().toISOString(),
          commitment: makeCommitment({ text: body.commitment }),
        },
        sharedDecision: (body.sharedDecision as string) ?? null,
        sharedDecisionStatus: body.sharedDecision ? 'proposed' : null,
        sharedDecisionBy: body.sharedDecision ? FAKE_USER.id : null,
      });
    },
    review: (_b, f) => {
      f.setClosure({ me: { ...(closure.me as Json), reviewedAt: new Date().toISOString() } });
    },
    skip: (_b, f) => {
      f.setClosure({
        me: { ...(closure.me as Json), status: 'skipped', submittedAt: new Date().toISOString() },
      });
    },
    cancel: (_b, f) => {
      f.setEvent({ status: 'open' });
      return { body: { success: true, message: '已取消' } };
    },
    abandon: (_b, f) => {
      f.setEvent({ status: 'open' });
      return { body: { success: true, message: '已回到討論' } };
    },
    finalize: (_b, f) => {
      f.setEvent({ status: 'resolved', resolved_at: new Date().toISOString() });
      f.setClosure({
        status: 'finalized',
        eventStatus: 'resolved',
        finalizedAt: new Date().toISOString(),
        insight: '你們都提到了「先問一聲」，這是同一個需求的兩種說法。',
      });
    },
    assist: () => ({ body: { success: true, options: ['我會先問你一聲再動孩子', '出門前十分鐘我會叫你'] } }),
    insight: (_b, f) => {
      f.setClosure({ insight: '重新產生的一句觀察。' });
    },
  };

  for (const action of Object.keys(defaults)) {
    await page.route(`**/api/events/${EVENT_ID}/closure/${action}`, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      record(route);
      let body: Json = {};
      try {
        body = JSON.parse(route.request().postData() || '{}');
      } catch {
        body = {};
      }
      const handler = handlers.get(action) || defaults[action];
      const reply = (await handler(body, fx)) || {};
      return route.fulfill({
        status: reply.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(reply.body ?? { success: true, closure }),
      });
    });
  }

  return fx;
}

/** Serve the AI quota badge (AiQuotaHint) with a known remaining count. */
export async function seedQuota(page: Page, used: number, limit: number) {
  await page.route('**/api/ai-usage/today', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        usage: { tier: 'free', used, limit, remaining: Math.max(0, limit - used) },
      }),
    }),
  );
}

export async function openEventDetail(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('nav-tab-talk').click();
  await page.getByTestId('talk-events-entry').click();
  await page.locator(`text=${EVENT_TITLE}`).first().click();
}
