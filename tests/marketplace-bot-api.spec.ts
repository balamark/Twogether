import { test, expect, request, type APIRequestContext } from '@playwright/test';

async function botLib() {
  return import('../lib/marketplaceBotScript.js') as Promise<{
    validateBotScript: (body: unknown) => {
      ok: boolean;
      value: { content: string; tags: string[]; category: string };
      body: { error_code: string; message: string; errors: Array<{ field: string }> };
    };
    roleTokens: (a: { gender: string | null }, b: { gender: string | null }) => { a: string; b: string };
    botAuthorRef: (id: string | undefined, email: string | undefined) => { id: string | null; email: string | null };
    DEFAULT_BOT_AUTHOR_EMAIL: string;
    LIMITS: Record<string, number>;
  }>;
}

async function authLib() {
  return import('../middleware/botAuth.js') as Promise<{
    timingSafeEqualSecret: (a: string, b: string) => boolean;
    botAuth: (req: { headers: Record<string, string | undefined> }, res: unknown, next: () => void) => void;
  }>;
}

const API = 'http://localhost:8080/api';
const BOT_KEY = 'test-marketplace-bot-key';
const TEST_USER = { email: 'test-e2e@twogether.app', password: 'test123456' };

// Dialogue lines the player treats as speech: a short name, then a colon.
// Mirrors DIALOGUE_LINE_REGEX in src/utils/script.ts. Narration in parentheses
// must not match.
const DIALOGUE_LINE = /^([^：:()（）[\]【】\s]{1,12})\s*[：:]\s*(.*)$/;

const createdIds: string[] = [];

function sampleScript(overrides: Record<string, unknown> = {}) {
  return {
    sourceKey: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    publish: true,
    title: `Bot 劇本 ${Date.now()}`,
    summary: '演唱會結束後的更衣室，粉絲和剛下台的偶像。',
    genre: 'bold',
    intensity: 'explicit',
    tags: ['偶像', '後台'],
    location: '後台',
    duration: '20-30分鐘',
    coverImageUrl: 'https://example.com/covers/backstage.jpg',
    safewordNotes: '紅燈就停，黃燈放慢。',
    roleA: { name: '小安', description: '興奮的粉絲', gender: 'female' },
    roleB: { name: '阿哲', description: '剛下台的偶像', gender: 'male' },
    acts: [
      {
        title: '闖入',
        narration: '更衣室的燈還亮著。',
        lines: [
          { role: 'a', text: '天啊，真的是你。' },
          { role: 'b', text: '你怎麼進來的？', direction: '輕笑' },
        ],
      },
      {
        title: '靠近',
        narration: '距離縮短了。',
        lines: [
          { role: 'a', text: '我想待久一點。' },
          { role: 'b', text: '那就別動。' },
        ],
      },
      {
        title: '試探',
        narration: '兩人都沒有退開。',
        lines: [
          { role: 'b', text: '你知道這代表什麼。' },
          { role: 'a', text: '我知道，我還是想要。' },
        ],
      },
      {
        title: '留下',
        narration: '門外的人聲遠了。',
        lines: [
          { role: 'a', text: '今晚就到這裡，好嗎？' },
          { role: 'b', text: '好。安全詞我記得。' },
        ],
      },
    ],
    ...overrides,
  };
}

async function allowAdultScripts(api: APIRequestContext) {
  const { token } = await userToken(api);
  const res = await api.put(`${API}/auth/user/show-adult-scripts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { show_adult_scripts: true },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return token;
}

async function userToken(api: APIRequestContext) {
  const res = await api.post(`${API}/auth/login`, { data: TEST_USER });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = await res.json();
  return { token: body.token as string, user: body.user };
}

async function botPost(api: APIRequestContext, data: unknown, key = BOT_KEY) {
  return api.post(`${API}/bot/marketplace/scripts`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    data,
  });
}

test.describe('marketplace bot script mapping', () => {
  test('renders four acts as playable dialogue and keeps narration out of the speaker slot', async () => {
    const { validateBotScript } = await botLib();
    const validated = validateBotScript(sampleScript({ sourceKey: '2026-11-23-JUR-925' }));
    expect(validated.ok).toBe(true);
    const { content, tags, category } = validated.value;
    expect(category).toBe('bold');
    expect(tags).toEqual(expect.arrayContaining(['偶像', '後台', '18+', '強度:露骨']));
    expect(content).toContain('【角色】');
    expect(content).toContain('【尺度】18+・露骨・雙方合意');
    expect(content).toContain('（安全詞：紅燈就停，黃燈放慢。）');
    expect(content).toContain('第一幕　闖入');
    expect(content).toContain('第四幕　留下');
    expect(content).toContain('[女]: 天啊，真的是你。');
    expect(content).toContain('[男]（輕笑）：「你怎麼進來的？」');
    expect(content).toContain('（旁白：更衣室的燈還亮著。）');

    const spoken = content
      .replaceAll('[女]', '小美')
      .replaceAll('[男]', '馬克')
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => DIALOGUE_LINE.test(line) || /（[^）]+）：「/.test(line));
    expect(spoken.length).toBeGreaterThanOrEqual(8);
    expect(content.split('\n').some((line: string) => line.trim().startsWith('（旁白：') && DIALOGUE_LINE.test(line.trim()))).toBe(false);
  });

  test('uses partner tokens unless the two roles are one man and one woman', async () => {
    const { roleTokens } = await botLib();
    expect(roleTokens(
      { gender: 'female' },
      { gender: 'male' },
    )).toEqual({ a: '[女]', b: '[男]' });
    expect(roleTokens(
      { gender: 'female' },
      { gender: 'female' },
    )).toEqual({ a: '[partner1]', b: '[partner2]' });
    expect(roleTokens({ gender: null }, { gender: null })).toEqual({ a: '[partner1]', b: '[partner2]' });
  });

  test('accepts every field at the tripled maximum and rejects one character or item over', async () => {
    const { validateBotScript, LIMITS } = await botLib();
    const fill = (n: number) => '字'.repeat(n);
    const line = (text: string, direction?: string) => ({ role: 'a' as const, text, ...(direction ? { direction } : {}) });
    const act = (lines: Array<{ role: 'a'; text: string; direction?: string }>, narration = '旁白') => ({
      title: '幕',
      narration,
      lines,
    });
    const atMax = sampleScript({
      title: fill(LIMITS.title),
      summary: fill(LIMITS.summary),
      location: fill(LIMITS.location),
      duration: fill(LIMITS.duration),
      safewordNotes: fill(LIMITS.safeword),
      sourceKey: `k${'a'.repeat(LIMITS.sourceKey - 1)}`,
      coverImageUrl: `https://example.com/${'a'.repeat(LIMITS.coverUrl - 'https://example.com/'.length)}`,
      tags: Array.from({ length: LIMITS.tags }, (_, i) => `${i}${fill(LIMITS.tag)}`.slice(0, LIMITS.tag)),
      roleA: { name: fill(LIMITS.name), description: fill(LIMITS.description), gender: 'female' },
      roleB: { name: fill(LIMITS.name), description: fill(LIMITS.description), gender: 'male' },
      acts: [act([
        line(fill(LIMITS.line), fill(LIMITS.direction)),
        line('第二句'),
      ], fill(LIMITS.narration))],
    });
    const accepted = validateBotScript(atMax);
    expect(accepted.ok, JSON.stringify(accepted.ok ? null : accepted.body.errors)).toBe(true);

    const over: Array<[string, Record<string, unknown>]> = [
      ['title', { title: fill(LIMITS.title + 1) }],
      ['summary', { summary: fill(LIMITS.summary + 1) }],
      ['location', { location: fill(LIMITS.location + 1) }],
      ['duration', { duration: fill(LIMITS.duration + 1) }],
      ['safewordNotes', { safewordNotes: fill(LIMITS.safeword + 1) }],
      ['sourceKey', { sourceKey: `k${'a'.repeat(LIMITS.sourceKey)}` }],
      ['coverImageUrl', { coverImageUrl: `https://example.com/${'a'.repeat(LIMITS.coverUrl)}` }],
      ['tags', { tags: Array.from({ length: LIMITS.tags + 1 }, (_, i) => `t${i}`) }],
      ['roleA.name', { roleA: { name: fill(LIMITS.name + 1), description: '粉絲', gender: 'female' } }],
      ['roleA.description', { roleA: { name: '小安', description: fill(LIMITS.description + 1), gender: 'female' } }],
      ['acts', { acts: Array.from({ length: LIMITS.acts + 1 }, () => act([line('一'), line('二')])) }],
      ['acts[0].narration', { acts: [act([line('一'), line('二')], fill(LIMITS.narration + 1))] }],
      ['acts[0].lines[0].text', { acts: [act([line(fill(LIMITS.line + 1)), line('二')])] }],
      ['acts[0].lines[0].direction', { acts: [act([line('一', fill(LIMITS.direction + 1)), line('二')])] }],
    ];
    for (const [field, override] of over) {
      const rejected = validateBotScript(sampleScript(override));
      expect(rejected.ok, field).toBe(false);
      expect(rejected.body.errors.some((e) => e.field === field), field).toBe(true);
    }

    const manyLines = validateBotScript(sampleScript({
      acts: [act(Array.from({ length: LIMITS.linesPerAct }, (_, i) => line(`句${i}`)))],
    }));
    expect(manyLines.ok, JSON.stringify(manyLines.ok ? null : manyLines.body.errors)).toBe(true);
    const tooManyLines = validateBotScript(sampleScript({
      acts: [act(Array.from({ length: LIMITS.linesPerAct + 1 }, (_, i) => line(`句${i}`)))],
    }));
    expect(tooManyLines.ok).toBe(false);
    expect(tooManyLines.body.errors.some((e) => e.field === 'acts[0].lines')).toBe(true);

    const perAct = Math.ceil(LIMITS.linesTotal / LIMITS.acts);
    const full = validateBotScript(sampleScript({
      acts: Array.from({ length: LIMITS.acts }, () => act(
        Array.from({ length: perAct }, (_, i) => line(`句${i}`)),
      )),
    }));
    expect(full.ok, JSON.stringify(full.ok ? null : full.body.errors)).toBe(true);
  });

  test('a line at the new maximum still parses as dialogue', async () => {
    const { validateBotScript, LIMITS } = await botLib();
    const text = '對'.repeat(LIMITS.line);
    const validated = validateBotScript(sampleScript({
      acts: [{
        title: '長句',
        narration: '旁白',
        lines: [
          { role: 'a', text },
          { role: 'b', text: '收到。', direction: '慢'.repeat(LIMITS.direction) },
        ],
      }],
    }));
    expect(validated.ok).toBe(true);
    // Same steps as parseScript in src/utils/script.ts: swap the role token,
    // then keep the whole line after the colon (the (.*) group has no cap).
    const played = validated.value.content.split('\n').map((raw: string) => {
      const line = raw.trim().replaceAll('[女]', '小安').replaceAll('[男]', '阿哲');
      const match = line.match(DIALOGUE_LINE);
      if (!match) return line;
      const [, speaker, dialogue] = match;
      return `${speaker}: "${dialogue}"`;
    }).join('\n');
    expect(played).toContain(`小安: "${text}"`);
    expect(played).toContain(`（${'慢'.repeat(LIMITS.direction)}）：「收到。」`);
  });

  test('rejects a script that cannot be played and names the field', async () => {
    const { validateBotScript } = await botLib();
    const missing = validateBotScript({ title: '' });
    expect(missing.ok).toBe(false);
    expect(missing.body.error_code).toBe('BOT_SCRIPT_INVALID');
    expect(missing.body.errors.map((e: { field: string }) => e.field)).toContain('title');

    const oneLine = validateBotScript(sampleScript({
      acts: [{ title: '只有一句', narration: '太短。', lines: [{ role: 'a', text: '嗨。' }] }],
    }));
    expect(oneLine.ok).toBe(false);
    expect(oneLine.body.message).toContain('至少寫兩句');
  });

  test('a missing or placeholder author id falls back to wangmark510@gmail.com', async () => {
    const { botAuthorRef, DEFAULT_BOT_AUTHOR_EMAIL } = await botLib();
    const uuid = '8f1c2c2e-3b4a-4d5e-9f60-112233445566';
    expect(DEFAULT_BOT_AUTHOR_EMAIL).toBe('wangmark510@gmail.com');
    expect(botAuthorRef(undefined, undefined)).toEqual({ id: null, email: 'wangmark510@gmail.com' });
    expect(botAuthorRef('', '')).toEqual({ id: null, email: 'wangmark510@gmail.com' });
    expect(botAuthorRef('null', 'null')).toEqual({ id: null, email: 'wangmark510@gmail.com' });
    expect(botAuthorRef('$_MARKETPLACE_BOT_AUTHOR_ID', '$_MARKETPLACE_BOT_AUTHOR_EMAIL'))
      .toEqual({ id: null, email: 'wangmark510@gmail.com' });
    expect(botAuthorRef('${_MARKETPLACE_BOT_AUTHOR_ID}', '')).toEqual({ id: null, email: 'wangmark510@gmail.com' });
    expect(botAuthorRef('not-a-uuid', 'Other@Example.com')).toEqual({ id: null, email: 'other@example.com' });
    expect(botAuthorRef(uuid, 'other@example.com')).toEqual({ id: uuid, email: null });
  });

  test('compares the API key in constant time, including different lengths', async () => {
    const { timingSafeEqualSecret } = await authLib();
    expect(timingSafeEqualSecret('same-key', 'same-key')).toBe(true);
    expect(timingSafeEqualSecret('same-key', 'same-kez')).toBe(false);
    expect(timingSafeEqualSecret('short', 'short-but-longer')).toBe(false);
    expect(timingSafeEqualSecret('', 'present')).toBe(false);
  });

  test('botAuth returns 401 for a missing or wrong key and 503 when unset', async () => {
    const { botAuth } = await authLib();
    const prev = process.env.MARKETPLACE_BOT_API_KEY;
    const capture = () => {
      const result: { status?: number; body?: { error_code?: string } } = {};
      const res = {
        status(code: number) { result.status = code; return this; },
        json(body: { error_code?: string }) { result.body = body; return this; },
      };
      return { res, result };
    };

    process.env.MARKETPLACE_BOT_API_KEY = '';
    const disabled = capture();
    botAuth({ headers: {} }, disabled.res, () => { throw new Error('should not pass'); });
    expect(disabled.result.status).toBe(503);
    expect(disabled.result.body?.error_code).toBe('BOT_API_DISABLED');

    process.env.MARKETPLACE_BOT_API_KEY = 'expected-key';
    const missing = capture();
    botAuth({ headers: {} }, missing.res, () => { throw new Error('should not pass'); });
    expect(missing.result.status).toBe(401);
    expect(missing.result.body?.error_code).toBe('BOT_API_UNAUTHORIZED');

    const wrong = capture();
    botAuth(
      { headers: { authorization: 'Bearer wrong-key' } },
      wrong.res,
      () => { throw new Error('should not pass'); }
    );
    expect(wrong.result.status).toBe(401);

    let passed = false;
    const ok = capture();
    botAuth(
      { headers: { authorization: 'Bearer expected-key' } },
      ok.res,
      () => { passed = true; }
    );
    expect(passed).toBe(true);

    if (prev === undefined) delete process.env.MARKETPLACE_BOT_API_KEY;
    else process.env.MARKETPLACE_BOT_API_KEY = prev;
  });
});

test.describe('marketplace bot API', () => {
  test.afterAll(async () => {
    if (!createdIds.length) return;
    const api = await request.newContext();
    const { token } = await userToken(api);
    while (createdIds.length) {
      const id = createdIds.pop();
      await api.delete(`${API}/custom-scripts/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    await api.dispose();
  });

  test('rejects a missing or invalid key with 401', async ({ request }) => {
    const missing = await botPost(request, sampleScript(), '');
    expect(missing.status()).toBe(401);
    expect((await missing.json()).error_code).toBe('BOT_API_UNAUTHORIZED');

    const wrong = await botPost(request, sampleScript(), 'not-the-key');
    expect(wrong.status()).toBe(401);
    expect((await wrong.json()).error_code).toBe('BOT_API_UNAUTHORIZED');
  });

  test('returns a field error when the title is missing', async ({ request }) => {
    const res = await botPost(request, sampleScript({ title: '   ' }));
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('BOT_SCRIPT_INVALID');
    expect(body.message).toContain('標題');
    expect(body.errors.some((e: { field: string }) => e.field === 'title')).toBe(true);
  });

  test('publishes a script, updates it by sourceKey, and no-ops when unchanged', async ({ request }) => {
    const sourceKey = `2026-11-23-JUR-${Date.now()}`;
    const title = `Bot 市集 ${Date.now()}`;
    const first = await botPost(request, sampleScript({ sourceKey, title }));
    expect(first.status(), await first.text()).toBe(201);
    const created = await first.json();
    expect(created.success).toBe(true);
    expect(created.created).toBe(true);
    expect(created.published).toBe(true);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.url).toBe(`http://localhost:5174/?market=${created.id}`);
    expect(created.sourceKey).toBe(sourceKey);
    createdIds.push(created.id);

    const token = await allowAdultScripts(request);
    const detail = await request.get(`${API}/marketplace/scripts/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(detail.status(), await detail.text()).toBe(200);
    const script = (await detail.json()).script;
    expect(script.title).toBe(title);
    expect(script.category).toBe('bold');
    expect(script.scenario).toContain('更衣室');
    expect(script.location).toBe('後台');
    expect(script.tags).toEqual(expect.arrayContaining(['18+', '強度:露骨', '偶像']));
    expect(script.thumbnailUrl).toBe('https://example.com/covers/backstage.jpg');
    expect(script.script).toContain('第一幕　闖入');
    expect(script.script).toContain('[女]: 天啊，真的是你。');
    expect(script.isPublic).toBe(true);

    const list = await request.get(`${API}/marketplace/scripts`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: title },
    });
    const listed = (await list.json()).scripts as Array<{ id: string }>;
    expect(listed.filter((s) => s.id === created.id)).toHaveLength(1);

    const mine = await request.get(`${API}/custom-scripts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mineRow = (await mine.json()).custom_scripts.find((s: { id: string }) => s.id === created.id);
    expect(mineRow.photos).toEqual(['https://example.com/covers/backstage.jpg']);

    const renamed = `${title} 改`;
    const second = await botPost(request, sampleScript({ sourceKey, title: renamed }));
    expect(second.status(), await second.text()).toBe(200);
    const updated = await second.json();
    expect(updated.created).toBe(false);
    expect(updated.updated).toBe(true);
    expect(updated.id).toBe(created.id);

    const again = await request.get(`${API}/marketplace/scripts`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: renamed },
    });
    const againRows = (await again.json()).scripts as Array<{ id: string }>;
    expect(againRows.filter((s) => s.id === created.id)).toHaveLength(1);

    const third = await botPost(request, sampleScript({ sourceKey, title: renamed }));
    expect(third.status()).toBe(200);
    const noop = await third.json();
    expect(noop.created).toBe(false);
    expect(noop.updated).toBe(false);
    expect(noop.id).toBe(created.id);
    expect(noop.message).toContain('沒有另外建立');
  });

  test('a draft stays off the marketplace until publish is true', async ({ request }) => {
    const sourceKey = `draft-${Date.now()}`;
    const title = `Bot 草稿 ${Date.now()}`;
    const draft = await botPost(request, sampleScript({
      sourceKey,
      title,
      publish: false,
      coverImageUrl: undefined,
    }));
    expect(draft.status(), await draft.text()).toBe(201);
    const body = await draft.json();
    expect(body.published).toBe(false);
    createdIds.push(body.id);

    const { token } = await userToken(request);
    const hidden = await request.get(`${API}/marketplace/scripts/${body.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(hidden.status()).toBe(404);

    const published = await botPost(request, sampleScript({ sourceKey, title, publish: true, coverImageUrl: undefined }));
    expect(published.status(), await published.text()).toBe(200);
    expect((await published.json()).published).toBe(true);

    await allowAdultScripts(request);
    const visible = await request.get(`${API}/marketplace/scripts/${body.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(visible.status(), await visible.text()).toBe(200);
  });

  test('saves a script at the new column maxima and lets the app editor keep it', async ({ request }) => {
    const { LIMITS } = await botLib();
    const fill = (n: number) => '長'.repeat(n);
    const title = fill(LIMITS.title);
    const summary = fill(LIMITS.summary);
    const location = fill(LIMITS.location);
    const duration = fill(LIMITS.duration);
    const sourceKey = `k${'b'.repeat(LIMITS.sourceKey - 1)}`;
    const narration = fill(LIMITS.narration);
    const lineText = fill(LIMITS.line);
    const createdRes = await botPost(request, sampleScript({
      title,
      summary,
      location,
      duration,
      sourceKey,
      publish: false,
      coverImageUrl: undefined,
      acts: [{
        title: '長幕',
        narration,
        lines: [
          { role: 'a', text: lineText },
          { role: 'b', text: '收到。' },
        ],
      }],
    }));
    expect(createdRes.status(), await createdRes.text()).toBe(201);
    const created = await createdRes.json();
    createdIds.push(created.id);

    const { token } = await userToken(request);
    const mine = await request.get(`${API}/custom-scripts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const row = (await mine.json()).custom_scripts.find((s: { id: string }) => s.id === created.id);
    expect(row.title).toBe(title);
    expect(row.scenario).toBe(summary);
    expect(row.location).toBe(location);
    expect(row.duration).toBe(duration);
    expect(row.script).toContain(narration);
    expect(row.script).toContain(lineText);

    const saved = await request.put(`${API}/custom-scripts/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title,
        category: row.category,
        scenario: summary,
        location,
        content: row.script,
        duration,
        tags: row.tags,
        isPublic: false,
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    const updated = (await saved.json()).custom_script;
    expect(updated.title).toBe(title);
    expect(updated.script).toContain(lineText);
    expect(updated.duration).toBe(duration);
  });

  test('?market= opens the published script like any other marketplace detail', async ({ page, request }) => {
    const title = `Bot 連結 ${Date.now()}`;
    const createdRes = await botPost(request, sampleScript({ title, sourceKey: `link-${Date.now()}` }));
    expect(createdRes.status(), await createdRes.text()).toBe(201);
    const created = await createdRes.json();
    createdIds.push(created.id);

    await allowAdultScripts(request);
    const { token, user } = await userToken(request);
    await page.addInitScript(({ token: authToken, user: authUser }) => {
      const storedUser = {
        id: authUser.id,
        email: authUser.email,
        nickname: authUser.nickname,
        createdAt: authUser.created_at || new Date().toISOString(),
      };
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('authUser', JSON.stringify(authUser));
      localStorage.setItem('authState', JSON.stringify({
        user: storedUser,
        isAuthenticated: true,
        partnerConnected: false,
      }));
      localStorage.setItem('pairingPromptDismissed', 'true');
    }, { token, user });

    await page.goto(`/?market=${created.id}`);
    const modal = page.getByTestId('marketplace-detail-modal');
    await expect(modal).toBeVisible({ timeout: 20000 });
    await expect(modal).toContainText(title);
    await expect(modal).toContainText('天啊，真的是你');
    await expect(modal).toContainText('18+');
    await expect(page.getByTestId('marketplace-detail-play-button')).toBeVisible();
  });
});
