import { test, expect, request, APIRequestContext } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// Two changes to 說開一件事, driven over HTTP against the real server and the
// local test DB (mock LLM provider):
//
// 1. A long draft keeps a 完整經過 (`detail`) panel alongside the short summary,
//    so a 1000–2000 字 vent doesn't collapse into three sentences.
// 2. A private (solo) event stays usable: the author can keep adding messages
//    and invite the AI companion WITHOUT having to share it with the partner
//    first. The genuinely two-person flows stay blocked.
//
// Tests run against the locked-down local test DB (see playwright.config.ts).
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true });

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;

const STAMP = Date.now();
const A = { email: `priv-a-${STAMP}@twogether.app`, nickname: '阿哲', password: 'test123456' };
const B = { email: `priv-b-${STAMP}@twogether.app`, nickname: '小圓', password: 'test123456' };

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

async function createPrivateEvent(ctx: APIRequestContext, extra: Record<string, unknown> = {}) {
  const res = await ctx.post(`${API}/events`, {
    data: {
      title: '我先自己想一下',
      summary: '這件事我想先自己整理，還沒準備好讓對方看到。',
      ai_neutral: 'x',
      ai_firm: 'y',
      ai_warm: 'z',
      is_private: true,
      ...extra,
    },
  });
  if (!res.ok()) throw new Error(`create event failed: ${res.status()} ${await res.text()}`);
  return (await res.json()).event;
}

let ctxA: APIRequestContext;
let ctxB: APIRequestContext;

test.beforeAll(async () => {
  const tokenA = await registerOrLogin(A);
  const tokenB = await registerOrLogin(B);
  ctxA = await ctxFor(tokenA);
  ctxB = await ctxFor(tokenB);
  await pair(ctxA, ctxB);
});

test.afterAll(async () => {
  await ctxA?.dispose();
  await ctxB?.dispose();
});

test.describe('說開一件事 — 長文的完整經過', () => {
  test('a long draft gets a detail panel; a short one does not', async () => {
    // The mock provider mirrors the real 400-char threshold.
    const longRaw = '我真的受不了了。'.repeat(60); // ~480 chars
    const long = await ctxA.post(`${API}/events/icebreaker`, { data: { rawText: longRaw } });
    expect(long.ok()).toBeTruthy();
    const longPreview = (await long.json()).preview;
    expect(longPreview.detail).toBeTruthy();
    // The whole point: it is NOT a short summary of the draft.
    expect(longPreview.detail.length).toBeGreaterThan(longPreview.summary.length);

    const short = await ctxA.post(`${API}/events/icebreaker`, {
      data: { rawText: '今天他又忘記倒垃圾，我有點煩。' },
    });
    expect(short.ok()).toBeTruthy();
    expect((await short.json()).preview.detail || '').toBe('');
  });

  test('detail round-trips through create and shows up on the event', async () => {
    const detail = '我想把這件事完整說清楚。第一件事是上週的行程，第二件事是昨天的對話。';
    const event = await createPrivateEvent(ctxA, { detail, is_private: false, selected_version: 'warm' });
    expect(event.detail).toBe(detail);

    const fetched = await ctxA.get(`${API}/events/${event.id}`);
    expect((await fetched.json()).event.detail).toBe(detail);
  });

  test('an event created without a detail keeps it null', async () => {
    const event = await createPrivateEvent(ctxA);
    expect(event.detail).toBeNull();
  });
});

test.describe('私人對話 — 一個人也能繼續寫、跟 AI 討論', () => {
  test('the author can keep adding messages to a private event', async () => {
    const event = await createPrivateEvent(ctxA);

    const post = await ctxA.post(`${API}/events/${event.id}/messages`, {
      data: { content: '再補充一點：其實我最在意的是被忽略的感覺。' },
    });
    expect(post.status()).toBe(201);

    const detail = await ctxA.get(`${API}/events/${event.id}`);
    const messages = (await detail.json()).event.messages;
    expect(messages.some((m: { content: string }) => m.content.includes('最在意的是被忽略'))).toBeTruthy();
  });

  test('the author can edit their own message in a private event', async () => {
    const event = await createPrivateEvent(ctxA);
    const post = await ctxA.post(`${API}/events/${event.id}/messages`, {
      data: { content: '第一版的想法。' },
    });
    const msgId = (await post.json()).message.id;

    const edit = await ctxA.patch(`${API}/events/${event.id}/messages/${msgId}`, {
      data: { content: '想清楚之後的第二版。' },
    });
    expect(edit.ok()).toBeTruthy();
    expect((await edit.json()).message.content).toBe('想清楚之後的第二版。');
  });

  test('the AI companion can be invited into a private event', async () => {
    const event = await createPrivateEvent(ctxA);
    await ctxA.post(`${API}/events/${event.id}/messages`, {
      data: { content: '我不知道該不該把這件事說出來。' },
    });

    const preview = await ctxA.post(`${API}/events/${event.id}/ai-comment/preview`);
    expect(preview.ok()).toBeTruthy();
    const comment = (await preview.json()).comment;
    expect(typeof comment).toBe('string');
    expect(comment.length).toBeGreaterThan(0);

    const posted = await ctxA.post(`${API}/events/${event.id}/ai-comment`, {
      data: { content: comment },
    });
    expect(posted.status()).toBe(201);
    expect((await posted.json()).message.is_ai).toBeTruthy();
  });

  test('a private event stays invisible to the partner even with messages on it', async () => {
    const event = await createPrivateEvent(ctxA);
    await ctxA.post(`${API}/events/${event.id}/messages`, { data: { content: '只有我看得到。' } });

    // 403「此為私人對話」 is the deliberate denial for a partner; the point of
    // this test is that adding messages/AI turns never widens that.
    const asPartner = await ctxB.get(`${API}/events/${event.id}`);
    expect(asPartner.status()).toBe(403);
    expect(await asPartner.text()).not.toContain('只有我看得到');

    const list = await ctxB.get(`${API}/events`);
    const ids = (await list.json()).events.map((e: { id: string }) => e.id);
    expect(ids).not.toContain(event.id);
  });

  test('the two-person flows stay blocked on a private event', async () => {
    const event = await createPrivateEvent(ctxA);
    // 一起收尾 is a ceremony between two people.
    const closure = await ctxA.post(`${API}/events/${event.id}/closure/start`);
    expect(closure.status()).toBe(403);
    // 情緒翻譯 is a shared lens over the partner's messages.
    const translation = await ctxA.patch(`${API}/events/${event.id}/translation`, {
      data: { enabled: true },
    });
    expect(translation.status()).toBe(403);
  });
});
