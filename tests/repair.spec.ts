import { test, expect, request, APIRequestContext, type Page } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

// 回頭接住 Repair attempts (migration 117, routes/repair.js): 冷靜後提醒我 →
// lazy reminder sweep → a short note to the partner → one answer back. API
// half runs against the real server + local test DB; the UI half runs in 訪客
// 模式 so it needs no account and proves nothing leaks to the network.
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true });

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

const STAMP = Date.now();
const A = { email: `repair-a-${STAMP}@twogether.app`, nickname: '阿凱', password: 'test123456' };
const B = { email: `repair-b-${STAMP}@twogether.app`, nickname: '小晴', password: 'test123456' };
const SOLO = { email: `repair-solo-${STAMP}@twogether.app`, nickname: '單人', password: 'test123456' };

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set; cannot run repair spec');
  const url = new URL(dbUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`repair spec refusing to touch DB on host "${url.hostname}"`);
  }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function register(user: typeof A): Promise<APIRequestContext> {
  const base = await request.newContext();
  let token: string;
  try {
    const reg = await base.post(`${API}/auth/register`, { data: user });
    if (reg.ok()) token = (await reg.json()).token;
    else {
      const login = await base.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
      if (!login.ok()) throw new Error(`login failed: ${login.status()} ${await login.text()}`);
      token = (await login.json()).token;
    }
  } finally {
    await base.dispose();
  }
  return request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

let a: APIRequestContext;
let b: APIRequestContext;
let solo: APIRequestContext;

test.describe('repair API', () => {
  test.beforeAll(async () => {
    a = await register(A);
    b = await register(B);
    solo = await register(SOLO);
    const code = (await (await a.post(`${API}/couples/pairing-code`, { data: {} })).json())?.code;
    if (!code) throw new Error('no pairing code');
    const join = await b.post(`${API}/couples`, { data: { pairing_code: code } });
    expect(join.ok(), await join.text()).toBe(true);
  });

  test.afterAll(async () => {
    await a?.dispose();
    await b?.dispose();
    await solo?.dispose();
  });

  test('reminder window, cap and cancel each have their own error_code', async () => {
    const soon = await a.post(`${API}/repair/reminders`, { data: { remind_at: new Date(Date.now() + 60_000).toISOString() } });
    expect(soon.status()).toBe(400);
    expect((await soon.json()).error_code).toBe('REPAIR_REMIND_TIME_INVALID');

    const ids: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const r = await a.post(`${API}/repair/reminders`, { data: { remind_at: new Date(Date.now() + i * 3600_000).toISOString() } });
      expect(r.status(), await r.text()).toBe(201);
      ids.push((await r.json()).reminder.id);
    }
    const fourth = await a.post(`${API}/repair/reminders`, { data: { remind_at: new Date(Date.now() + 5 * 3600_000).toISOString() } });
    expect(fourth.status()).toBe(409);
    expect((await fourth.json()).error_code).toBe('REPAIR_REMINDER_LIMIT');

    // Only the owner sees (and can cancel) a reminder.
    const partnerView = await (await b.get(`${API}/repair`)).json();
    expect(partnerView.reminders).toEqual([]);
    const stolen = await b.delete(`${API}/repair/reminders/${ids[0]}`);
    expect(stolen.status()).toBe(404);

    for (const id of ids) expect((await a.delete(`${API}/repair/reminders/${id}`)).status()).toBe(200);
    expect((await (await a.get(`${API}/repair`)).json()).reminders).toEqual([]);
  });

  test('a due reminder is swept into the owner\'s inbox exactly once', async () => {
    const set = await a.post(`${API}/repair/reminders`, { data: { remind_at: new Date(Date.now() + 15 * 60_000).toISOString() } });
    const id = (await set.json()).reminder.id;
    await withDb((c) => c.query(`UPDATE repair_attempts SET remind_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [id]));

    await a.get(`${API}/intimacy-requests/notifications/unread-count`);
    await a.get(`${API}/repair`);
    const list = await (await a.get(`${API}/intimacy-requests/notifications?notification_type=repair_reminder`)).json();
    const mine = (list.notifications || []).filter((n: { notification_type: string }) => n.notification_type === 'repair_reminder');
    expect(mine).toHaveLength(1);

    const overview = await (await a.get(`${API}/repair`)).json();
    const due = overview.reminders.find((r: { id: string }) => r.id === id);
    expect(due.reminded_at).toBeTruthy();

    // Writing the note turns that same reminder into the sent row.
    const sent = await a.post(`${API}/repair`, { data: { kind: 'validate', text: '我想了一下，你會生氣是有原因的。', reminder_id: id } });
    expect(sent.status(), await sent.text()).toBe(201);
    expect((await sent.json()).note).toMatchObject({ id, status: 'sent', direction: 'outgoing' });
    expect((await (await a.get(`${API}/repair`)).json()).reminders).toEqual([]);
  });

  test('send → partner sees it → answers once → sender sees the answer', async () => {
    const empty = await a.post(`${API}/repair`, { data: { kind: 'thanks', text: '   ' } });
    expect((await empty.json()).error_code).toBe('REPAIR_TEXT_EMPTY');
    const badKind = await a.post(`${API}/repair`, { data: { kind: 'win', text: '你辛苦了' } });
    expect((await badKind.json()).error_code).toBe('REPAIR_KIND_INVALID');
    const long = await a.post(`${API}/repair`, { data: { kind: 'thanks', text: 'x'.repeat(501) } });
    expect((await long.json()).error_code).toBe('REPAIR_TEXT_TOO_LONG');

    const sent = await a.post(`${API}/repair`, { data: { kind: 'thanks', text: '你最近真的辛苦了。' } });
    expect(sent.status()).toBe(201);
    const noteId = (await sent.json()).note.id;

    const inbox = await (await b.get(`${API}/intimacy-requests/notifications?notification_type=repair_sent`)).json();
    expect((inbox.notifications || []).some((n: { notification_type: string }) => n.notification_type === 'repair_sent')).toBe(true);

    const bView = await (await b.get(`${API}/repair`)).json();
    const incoming = bView.notes.find((n: { id: string }) => n.id === noteId);
    expect(incoming).toMatchObject({ direction: 'incoming', text: '你最近真的辛苦了。', response: null });

    // The sender can't answer their own note.
    expect((await a.post(`${API}/repair/${noteId}/respond`, { data: { response: 'received' } })).status()).toBe(404);
    const bad = await b.post(`${API}/repair/${noteId}/respond`, { data: { response: 'whatever' } });
    expect((await bad.json()).error_code).toBe('REPAIR_RESPONSE_INVALID');

    const ok = await b.post(`${API}/repair/${noteId}/respond`, { data: { response: 'received' } });
    expect(ok.status(), await ok.text()).toBe(200);
    const again = await b.post(`${API}/repair/${noteId}/respond`, { data: { response: 'talk' } });
    expect(again.status()).toBe(409);
    expect((await again.json()).error_code).toBe('REPAIR_ALREADY_RESPONDED');

    const aView = await (await a.get(`${API}/repair`)).json();
    expect(aView.notes.find((n: { id: string }) => n.id === noteId)).toMatchObject({ response: 'received', direction: 'outgoing' });
    expect(aView.stats.caught).toBeGreaterThanOrEqual(1);
    const aInbox = await (await a.get(`${API}/intimacy-requests/notifications?notification_type=repair_response_received`)).json();
    expect((aInbox.notifications || []).length).toBeGreaterThanOrEqual(1);
  });

  test('unpaired: reminders work, sending explains how to reach the partner', async () => {
    const r = await solo.post(`${API}/repair/reminders`, { data: { remind_at: new Date(Date.now() + 3600_000).toISOString() } });
    expect(r.status()).toBe(201);
    const send = await solo.post(`${API}/repair`, { data: { kind: 'validate', text: '你會生氣是有原因的。' } });
    expect(send.status()).toBe(403);
    const body = await send.json();
    expect(body.error_code).toBe('REPAIR_NOT_PAIRED');
    expect(body.message).toContain('LINE');
    const view = await (await solo.get(`${API}/repair`)).json();
    expect(view.paired).toBe(false);
    expect(view.reminders).toHaveLength(1);
  });

  test('English clients get the English message for a repair error', async () => {
    const res = await a.post(`${API}/repair`, { data: { kind: 'thanks', text: '' }, headers: { 'X-Locale': 'en' } });
    expect((await res.json()).message).toBe('Write a line you\'d like to say to your partner first, then send.');
  });
});

// ── UI, in 訪客模式 ───────────────────────────────────────────────────────────
const GUEST_ALLOWED = [
  /\/api\/auth\//, /\/api\/track\//, /\/api\/feature-flags$/, /\/api\/feedback\/approved$/,
  /\/api\/intimacy-plans\/samples$/, /\/api\/guest-ai\//, /\/api\/therapists$/, /\/api\/stories(\/[0-9a-f-]{36})?$/,
  /\/api\/playbooks(\/(?!me$)[a-z0-9-]+)?$/,
];

function watchNetwork(page: Page): string[] {
  const leaks: string[] = [];
  page.on('request', (r) => {
    const url = r.url().split('?')[0];
    if (!url.includes('/api/')) return;
    if (!GUEST_ALLOWED.some((re) => re.test(url))) leaks.push(`${r.method()} ${url}`);
  });
  return leaks;
}

test.describe('repair UI (guest)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('tw_guest_tour_seen', '1'));
  });

  test('the partner\'s note waits on 今天; answering it is instant and offers a reply', async ({ page }) => {
    const leaks = watchNetwork(page);
    await page.goto('/');
    const card = page.getByTestId('home-repair-card');
    await expect(card.getByTestId('repair-incoming')).toBeVisible();
    await expect(card.getByTestId('repair-incoming-text')).toContainText('其實是有原因的');

    await card.getByTestId('repair-respond-received').click();
    await expect(card.getByTestId('repair-answered')).toBeVisible();
    await card.getByTestId('repair-reply-back').click();

    const composer = page.getByTestId('repair-composer');
    await expect(composer).toBeVisible();
    // The validation template is prefilled; a 「但是」 earns a gentle on-device hint.
    await expect(composer.getByTestId('repair-text')).toHaveValue(/其實是有原因的/);
    await composer.getByTestId('repair-text').fill('你會生氣是有原因的，但是你也有錯');
    await expect(composer.getByTestId('repair-wording-hint')).toBeVisible();
    await composer.getByTestId('repair-kind-thanks').click();
    await composer.getByTestId('repair-text').fill('你最近真的辛苦了。');
    await expect(composer.getByTestId('repair-wording-hint')).toHaveCount(0);
    await composer.getByTestId('repair-send').click();
    await expect(composer).toHaveCount(0);

    await expect(card.getByTestId('repair-last-outgoing')).toContainText('你最近真的辛苦了');
    await expect(card.getByTestId('repair-stats')).toBeVisible();
    expect(leaks).toEqual([]);
  });

  test('冷靜後提醒我 schedules a reminder that can be cancelled', async ({ page }) => {
    const leaks = watchNetwork(page);
    await page.goto('/');
    const card = page.getByTestId('home-repair-card');
    // Answer the seeded note first so the card falls back to its entry state.
    await card.getByTestId('repair-respond-need_time').click();
    await card.getByRole('button', { name: /^好$/ }).click();

    await card.getByTestId('repair-entry-open').click();
    await card.getByTestId('repair-remind-me').click();
    await card.getByTestId('repair-remind-1h').click();
    await expect(card.getByTestId('repair-upcoming')).toBeVisible();
    await card.getByTestId('repair-upcoming-cancel').click();
    await expect(card.getByTestId('repair-upcoming')).toHaveCount(0);
    expect(leaks).toEqual([]);
  });

  test('說開一件事 offers the lighter 回頭接住 path', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-tab-talk').click();
    await page.getByTestId('events-repair-entry').click();
    await expect(page.getByTestId('repair-composer')).toBeVisible();
    await page.getByTestId('repair-why-toggle').click();
    await expect(page.getByTestId('repair-why')).toContainText('Gottman');
    await page.getByTestId('repair-later').click();
    await expect(page.getByTestId('repair-composer')).toHaveCount(0);
  });
});
