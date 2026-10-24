import { test, expect, type Page } from '@playwright/test';

// 專屬諮商空間 — the couple's message thread with their dedicated therapist and
// the session page. All APIs are stubbed (scaffolding from events-reply.spec.ts)
// so this runs without a paired couple or an approved therapist.
//
// Flow covered: open 傳訊息給心理師 → send with 📌 on → the message lands in the
// thread AND 下次要談 → switch to 諮商頁 → the item is on the checklist →
// a message can be turned into 本次摘要 (auto-starts today's session).

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';
const LINK_ID = '44444444-4444-4444-4444-444444444444';
const now = () => new Date().toISOString();

const DEDICATED = {
  id: LINK_ID,
  therapistId: '55555555-5555-5555-5555-555555555555',
  displayName: '林心理師',
  title: '諮商心理師',
  photoUrl: null,
  canComment: false,
  addedBy: FAKE_USER.id,
  createdAt: now(),
  lastIncomingAt: now(),
  openAgendaCount: 0,
  sessionOpen: false,
};

const THERAPIST_MSG = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  senderId: '66666666-6666-6666-6666-666666666666',
  senderName: '林心理師',
  isTherapist: true,
  isMine: false,
  content: '這週可以先各自記下一次覺得不公平的時刻。',
  createdAt: now(),
};

async function stubApis(page: Page) {
  const space = {
    role: 'couple',
    therapist: { displayName: '林心理師', title: '諮商心理師', photoUrl: null },
    messages: [THERAPIST_MSG] as Record<string, unknown>[],
    agenda: [] as Record<string, unknown>[],
    session: null as Record<string, unknown> | null,
    pastSessions: [],
    sessionCount: 0,
    topics: [{ ref: 'topic:家事分工', kind: 'ai', title: '家事分工', why: '最近三次對話都提到', status: 'selected', notes: null }],
    summaries: [],
  };
  let seq = 0;

  await page.addInitScript((user) => {
    localStorage.setItem('authToken', 'fake-jwt');
    localStorage.setItem('authUser', JSON.stringify(user));
    localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }));
    localStorage.setItem('pairingPromptDismissed', 'true');
    localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
  }, FAKE_USER);

  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/**', (route) => route.fulfill(json({ success: true })));
  await page.route('**/api/auth/**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill(json({ success: true, user: FAKE_USER, partnerConnected: true }))
      : route.fallback()
  );
  await page.route('**/api/couples**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill(json({ success: true, couple: { id: COUPLE_ID, user1_id: FAKE_USER.id, user1_nickname: 'A', user2_id: '88888888-8888-8888-8888-888888888888', user2_nickname: 'B' } }))
      : route.fallback()
  );
  await page.route('**/api/therapists?**', (route) => route.fulfill(json({ success: true, therapists: [] })));
  await page.route('**/api/therapists/dedicated', (route) =>
    route.request().method() === 'GET' ? route.fulfill(json({ success: true, dedicated: DEDICATED })) : route.fallback()
  );
  await page.route('**/api/therapists/dedicated/space**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const sub = url.pathname.replace(/^.*\/dedicated\/space/, '');
    const body = req.postDataJSON?.() ?? {};
    if (req.method() === 'GET' && sub === '') return route.fulfill(json({ success: true, ...space }));
    if (req.method() === 'POST' && sub === '/messages') {
      const msg = { id: `bbbbbbbb-0000-0000-0000-00000000000${++seq}`, senderId: FAKE_USER.id, senderName: 'A', isTherapist: false, isMine: true, content: body.content, createdAt: now() };
      space.messages.push(msg);
      return route.fulfill(json({ success: true, message: msg }, 201));
    }
    if (req.method() === 'POST' && sub === '/agenda') {
      const item = { id: `cccccccc-0000-0000-0000-00000000000${++seq}`, content: body.content, source: body.source || 'manual', sourceMessageId: body.sourceMessageId || null, sourceRef: body.sourceRef || null, status: 'open', sessionId: null, createdBy: FAKE_USER.id, createdByName: 'A', createdAt: now() };
      space.agenda.push(item);
      return route.fulfill(json({ success: true, item }, 201));
    }
    if (req.method() === 'POST' && sub === '/session/append') {
      const msg = space.messages.find((m) => m.id === body.messageId) as { content: string; senderName: string };
      const started = !space.session;
      space.session = { id: 'dddddddd-0000-0000-0000-000000000001', notes: `• ${msg.content}（${msg.senderName}）`, startedAt: now(), updatedAt: now(), updatedByName: 'A', endedAt: null };
      return route.fulfill(json({ success: true, startedSession: started, session: space.session }));
    }
    return route.fulfill(json({ success: true }));
  });
}

test.describe('專屬諮商空間 (dedicated counseling space)', () => {
  test('message → 下次要談 → session page → 加進摘要', async ({ page }) => {
    await stubApis(page);
    await page.goto('/');
    await page.getByTestId('nav-tab-talk').click();
    await page.getByTestId('talk-therapists-entry').click();

    // Panel shows both entry points and the new-message badge.
    await expect(page.getByTestId('dedicated-new-badge')).toBeVisible();
    await page.getByTestId('dedicated-open-messages').click();
    await expect(page.getByTestId('dedicated-space-modal')).toBeVisible();
    await expect(page.getByTestId('dedicated-message')).toHaveCount(1);

    // Send with the 📌 toggle on (default) → message + agenda item.
    await page.getByTestId('dedicated-message-input').fill('這週又為了家事分工吵架，想下次談談。');
    await page.getByTestId('dedicated-message-send').click();
    await expect(page.getByTestId('dedicated-message')).toHaveCount(2);
    await expect(page.getByTestId('dedicated-message-pinned')).toHaveCount(1);
    await expect(page.getByTestId('dedicated-agenda-strip')).toContainText('1');

    // Session page: the pinned message is on the checklist; topics are a tap away.
    await page.getByTestId('dedicated-agenda-strip').click();
    await expect(page.getByTestId('dedicated-session-pane')).toBeVisible();
    await expect(page.getByTestId('dedicated-agenda-item')).toHaveCount(1);
    await page.getByTestId('dedicated-material-topics').click();
    await page.getByTestId('dedicated-topic-add').click();
    await expect(page.getByTestId('dedicated-agenda-item')).toHaveCount(2);

    // Turn the therapist's message into a line of 本次摘要 — starts the session.
    await page.getByTestId('dedicated-material-messages').click();
    await page.getByTestId('dedicated-message-to-notes').last().click();
    await expect(page.getByTestId('dedicated-notes-input')).toHaveValue(/林心理師/);
    await expect(page.getByTestId('dedicated-session-end')).toBeVisible();
  });
});
