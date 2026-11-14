import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// 關係解方手冊 Relationship Playbook: public content (lib/playbooks/), the
// private saves + 我的經驗 reflections (migration 115), the server-rendered
// SEO pages, and the in-app library/detail views (signed out, guest, member).

const ROOT = path.resolve(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const playbooks = require('../lib/playbooks/index.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const render = require('../lib/playbooks/render.js');

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API = `${BACKEND_BASE}/api`;
const USER = { email: 'playbooks-a-e2e@twogether.app', nickname: 'PB A', password: 'test123456' };
const OTHER = { email: 'playbooks-b-e2e@twogether.app', nickname: 'PB B', password: 'test123456' };
const SLUG = 'silent-treatment';

type Pb = Record<string, unknown> & {
  slug: string;
  situation: { examples: unknown[] };
  hiddenFeelings: Record<'partnerA' | 'partnerB', { emotions: unknown[]; underlyingNeeds: unknown[] }>;
  negativeCycle: { steps: unknown[]; consequences: unknown[] };
  alternativeSolutions: { id: string }[];
  agreement: { statements: unknown[] };
  reflectionQuestions: unknown[];
  safetyNotes: unknown[];
  tags: unknown[];
  betterConversation: { elements?: unknown[] };
  relatedPlaybooks: string[];
};

async function loginOrRegister(ctx: APIRequestContext, user: { email: string; password: string; nickname?: string }) {
  let res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  if (!res.ok()) {
    await ctx.post(`${API}/auth/register`, { data: user });
    res = await ctx.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } });
  }
  if (!res.ok()) throw new Error(`login failed for ${user.email}: ${res.status()} ${await res.text()}`);
  return (await res.json()).token as string;
}

test.describe('playbook content', () => {
  test('every Playbook passes the schema, in both languages, with matching shape', () => {
    const zh: Pb[] = playbooks.LOCALES['zh-TW'];
    const en: Pb[] = playbooks.LOCALES.en;
    expect(zh.length).toBe(8);
    expect(en.map((p) => p.slug)).toEqual(zh.map((p) => p.slug));
    for (const list of [zh, en]) expect(list.flatMap(playbooks.validatePlaybook)).toEqual([]);
    const slugs = new Set(zh.map((p) => p.slug));
    const shape = (p: Pb) => [
      p.situation.examples.length,
      p.hiddenFeelings.partnerA.emotions.length, p.hiddenFeelings.partnerA.underlyingNeeds.length,
      p.hiddenFeelings.partnerB.emotions.length, p.hiddenFeelings.partnerB.underlyingNeeds.length,
      p.negativeCycle.steps.length, p.negativeCycle.consequences.length,
      p.alternativeSolutions.map((a) => a.id), p.agreement.statements.length,
      p.reflectionQuestions.length, p.safetyNotes.length, p.tags.length,
      (p.betterConversation.elements || []).length, p.relatedPlaybooks, p.apply, p.category, !!p.alternativesNote,
    ];
    zh.forEach((p, i) => {
      expect(shape(p), p.slug).toEqual(shape(en[i]));
      for (const r of p.relatedPlaybooks) expect(slugs.has(r), `${p.slug} → ${r}`).toBe(true);
    });
  });

  test('copy stays gender-neutral and dash-free (UX_PLAYBOOK R2)', () => {
    const zhText = JSON.stringify(playbooks.LOCALES['zh-TW']);
    // 他們 (they) and 其他 (other) are fine; a lone 他 / 她 assumes a gender.
    expect(zhText.match(/(?<!其)[他她](?!們)/g)).toBeNull();
    expect(zhText.match(/[—–]/g)).toBeNull();
    const enText = JSON.stringify(playbooks.LOCALES.en);
    expect(enText.match(/\b(he|she|him|her|his|husband|wife)\b/gi)).toBeNull();
  });

  test('the consent Playbook says alternatives are never owed', () => {
    for (const loc of ['zh-TW', 'en']) {
      const p = playbooks.getPlaybook('intimacy-feels-one-sided', loc);
      expect(p.alternativesNote).toBeTruthy();
      expect(p.safetyNotes.length).toBeGreaterThan(0);
      expect(p.apply).toBe('intimacy');
    }
  });
});

test.describe('server-rendered pages', () => {
  const template = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  test('detail page carries its own title, OG tags, hreflang and the article text', () => {
    const html: string = render.renderPlaybook(template, SLUG, { locale: 'zh-TW', host: 'twogether.fun' });
    expect(html).toContain('<title>當沉默變成回答 · 關係解方手冊 | Twogether</title>');
    expect(html).toContain('property="og:url" content="https://twogether.fun/playbooks/silent-treatment"');
    expect(html).toContain('rel="canonical" href="https://twogether.fun/playbooks/silent-treatment"');
    expect(html).toContain('hreflang="en" href="https://twogether.fun/playbooks/silent-treatment?lang=en"');
    expect(html).toContain('"@type":"Article"');
    expect((html.match(/<h2>/g) || []).length).toBe(7);
    expect(html).toContain('明天早上十點再好好談');
    const en: string = render.renderPlaybook(template, SLUG, { locale: 'en', host: 'twogether.fun' });
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('When Silence Becomes the Answer');
  });

  test('library page lists every Playbook; unknown slugs render nothing', () => {
    const html: string = render.renderLibrary(template, { locale: 'zh-TW', host: 'twogether.fun' });
    for (const p of playbooks.listPlaybooks('zh-TW')) expect(html).toContain(`href="/playbooks/${p.slug}"`);
    expect(render.renderPlaybook(template, 'no-such-playbook', { locale: 'zh-TW' })).toBeNull();
  });

  test('the server serves deep links with page tags and root-absolute bundle paths', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${BACKEND_BASE}/playbooks/${SLUG}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<title>當沉默變成回答 · 關係解方手冊 | Twogether</title>');
    // Vite's base './' would load /playbooks/assets/… (HTML) and leave a blank page.
    expect(html).toMatch(/src="\/assets\/[^"]+\.js"/);
    expect(html).not.toContain('"./assets/');
    expect((await ctx.get(`${BACKEND_BASE}/playbooks/no-such-playbook`)).status()).toBe(404);
    await ctx.dispose();
  });

  test('sitemap.xml includes the library and every Playbook in both languages', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${BACKEND_BASE}/sitemap.xml`);
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('/pricing</loc>');
    expect(xml).toContain('/playbooks</loc>');
    for (const p of playbooks.listPlaybooks('zh-TW')) {
      expect(xml).toContain(`/playbooks/${p.slug}</loc>`);
      expect(xml).toContain(`/playbooks/${p.slug}?lang=en</loc>`);
    }
    await ctx.dispose();
  });
});

test.describe('playbook API', () => {
  test.describe.configure({ mode: 'serial' });
  let anon: APIRequestContext;
  let me: APIRequestContext;
  let other: APIRequestContext;

  test.beforeAll(async () => {
    anon = await request.newContext();
    const t1 = await loginOrRegister(anon, USER);
    const t2 = await loginOrRegister(anon, OTHER);
    me = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${t1}` } });
    other = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${t2}` } });
    // Start clean: this account's saves/reflections from a previous run.
    await me.delete(`${API}/playbooks/${SLUG}/save`);
    const prev = await (await me.get(`${API}/playbooks/${SLUG}/reflections`)).json();
    for (const r of prev.reflections || []) await me.delete(`${API}/playbooks/reflections/${r.id}`);
  });

  test.afterAll(async () => {
    await Promise.all([anon.dispose(), me.dispose(), other.dispose()]);
  });

  test('library and detail are public, localized, and 404 with a specific code', async () => {
    const list = await anon.get(`${API}/playbooks`);
    expect(list.status()).toBe(200);
    const body = await list.json();
    expect(body.playbooks).toHaveLength(8);
    expect(body.categories.length).toBeGreaterThan(3);
    expect(body.playbooks[0]).not.toHaveProperty('betterConversation');

    const zh = await (await anon.get(`${API}/playbooks/${SLUG}`)).json();
    expect(zh.playbook.title).toBe('當沉默變成回答');
    expect(zh.playbook.related.length).toBeGreaterThan(0);
    const en = await (await anon.get(`${API}/playbooks/${SLUG}`, { headers: { 'X-Locale': 'en' } })).json();
    expect(en.playbook.title).toBe('When Silence Becomes the Answer');

    const missing = await anon.get(`${API}/playbooks/no-such-playbook`);
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error_code).toBe('PLAYBOOK_NOT_FOUND');
  });

  test('saves and reflections need an account', async () => {
    expect((await anon.get(`${API}/playbooks/me`)).status()).toBe(401);
    expect((await anon.put(`${API}/playbooks/${SLUG}/save`)).status()).toBe(401);
    expect((await anon.post(`${API}/playbooks/${SLUG}/reflections`, { data: { experience: 'x' } })).status()).toBe(401);
  });

  test('save / unsave is idempotent and only published slugs are accepted', async () => {
    expect((await me.put(`${API}/playbooks/${SLUG}/save`)).status()).toBe(200);
    expect((await me.put(`${API}/playbooks/${SLUG}/save`)).status()).toBe(200);
    let mine = await (await me.get(`${API}/playbooks/me`)).json();
    expect(mine.saved.map((s: { slug: string }) => s.slug)).toEqual([SLUG]);
    expect((await me.put(`${API}/playbooks/no-such-playbook/save`)).status()).toBe(404);
    expect((await me.delete(`${API}/playbooks/${SLUG}/save`)).status()).toBe(200);
    mine = await (await me.get(`${API}/playbooks/me`)).json();
    expect(mine.saved).toEqual([]);
  });

  test('reflections are private to their author and validated with specific codes', async () => {
    const empty = await me.post(`${API}/playbooks/${SLUG}/reflections`, { data: { experience: '   ' } });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).error_code).toBe('REFLECTION_EMPTY');
    const long = await me.post(`${API}/playbooks/${SLUG}/reflections`, { data: { experience: 'a'.repeat(4001) } });
    expect((await long.json()).error_code).toBe('REFLECTION_TOO_LONG');

    const created = await me.post(`${API}/playbooks/${SLUG}/reflections`, {
      data: {
        experience: '吵完架他去洗澡，我一直追問。',
        answers: [{ question: '什麼方法幫助我們冷靜下來？', answer: '約好 30 分鐘後再談' }, { question: 'skip', answer: '  ' }],
      },
    });
    expect(created.status()).toBe(201);
    const { reflection } = await created.json();
    expect(reflection.answers).toEqual([{ question: '什麼方法幫助我們冷靜下來？', answer: '約好 30 分鐘後再談' }]);

    const mine = await (await me.get(`${API}/playbooks/${SLUG}/reflections`)).json();
    expect(mine.reflections.map((r: { id: string }) => r.id)).toContain(reflection.id);
    const theirs = await (await other.get(`${API}/playbooks/${SLUG}/reflections`)).json();
    expect(theirs.reflections.map((r: { id: string }) => r.id)).not.toContain(reflection.id);
    const summary = await (await me.get(`${API}/playbooks/me`)).json();
    expect(summary.reflections).toEqual([expect.objectContaining({ slug: SLUG, count: 1 })]);

    const stolen = await other.delete(`${API}/playbooks/reflections/${reflection.id}`);
    expect(stolen.status()).toBe(404);
    expect((await stolen.json()).error_code).toBe('REFLECTION_NOT_FOUND');
    expect((await me.delete(`${API}/playbooks/reflections/${reflection.id}`)).status()).toBe(200);
  });

  test('English error messages come back translated', async () => {
    const res = await me.post(`${API}/playbooks/${SLUG}/reflections`, { data: { experience: '' }, headers: { 'X-Locale': 'en' } });
    expect((await res.json()).message).toBe('Write a sentence or two about what happened between you, then save.');
  });
});

// ── UI ─────────────────────────────────────────────────────────────────────

function watchLeaks(page: Page): string[] {
  // A guest may only reach public content; their saves/notes stay in the tab.
  const allowed = [/\/api\/auth\//, /\/api\/track\//, /\/api\/feature-flags$/, /\/api\/feedback\/approved$/,
    /\/api\/guest-ai\//, /\/api\/playbooks$/, /\/api\/playbooks\/(?!me$)[a-z0-9-]+$/, /\/api\/intimacy-plans\/samples$/,
    /\/api\/therapists$/, /\/api\/stories(\/[0-9a-f-]{36})?$/];
  const leaks: string[] = [];
  page.on('request', (r) => {
    const url = r.url().split('?')[0];
    if (!url.includes('/api/')) return;
    if (r.method() !== 'GET' && /\/api\/(auth|track|guest-ai)\//.test(url)) return;
    if (!allowed.some((re) => re.test(url)) || (r.method() !== 'GET' && /\/api\/playbooks/.test(url))) leaks.push(`${r.method()} ${url}`);
  });
  return leaks;
}

test.describe('playbook pages (guest mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('tw_guest_tour_seen', '1'));
  });

  test('library → detail with all seven sections, URL follows, save + reflection stay in the tab', async ({ page }) => {
    const leaks = watchLeaks(page);
    await page.goto('/playbooks');
    await expect(page.getByTestId('playbooks-library')).toBeVisible();
    await expect(page.locator('[data-testid^="playbook-card-"]')).toHaveCount(8);

    // The seeded guest already saved the 冷戰 Playbook.
    await expect(page.getByTestId('playbooks-saved')).toContainText('當沉默變成回答');

    await page.getByTestId('playbooks-search').fill('婆家');
    await expect(page.locator('[data-testid^="playbook-card-"]')).toHaveCount(1);
    await page.getByTestId('playbooks-search').fill('');

    await page.getByTestId('playbook-card-intimacy-feels-one-sided').click();
    await expect(page.getByTestId('playbook-detail')).toBeVisible();
    await expect(page).toHaveURL(/\/playbooks\/intimacy-feels-one-sided$/);
    for (let n = 1; n <= 7; n++) await expect(page.getByTestId(`playbook-section-${n}`)).toBeVisible();
    await expect(page.getByTestId('playbook-cycle')).toBeVisible();
    await expect(page.getByTestId('playbook-alternatives-note')).toContainText('不是交換條件');

    await page.getByTestId('playbook-save').click();
    await expect(page.getByTestId('playbook-save')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('playbook-alt-cuddle').click();
    await page.getByTestId('playbook-reflection-start').click();
    await page.getByTestId('playbook-reflection-input').fill('上週被拒絕後，我整晚都沒說話。');
    await page.getByTestId('playbook-reflection-save').click();
    await expect(page.getByTestId('playbook-reflection-item')).toHaveCount(1);
    await expect(page.getByTestId('playbook-reflection-item')).toContainText('抱抱或依偎五分鐘');

    await page.getByTestId('playbook-back').click();
    await expect(page).toHaveURL(/\/playbooks$/);
    await expect(page.getByTestId('playbooks-saved')).toContainText('當親密變成單方面的邀請');
    expect(leaks).toEqual([]);
  });

  test('a shared link opens the Playbook directly; "start a conversation" opens 說開一件事', async ({ page }) => {
    await page.goto('/playbooks/unequal-responsibilities');
    await expect(page.getByTestId('playbook-detail')).toHaveAttribute('data-slug', 'unequal-responsibilities');
    await page.getByTestId('playbook-apply-start').click();
    await expect(page.getByTestId('nav-tab-talk')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('menu and 成長 lead to the library', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-tab-grow').click();
    await page.getByTestId('grow-playbooks-entry').first().click();
    await expect(page.getByTestId('playbooks-library')).toBeVisible();
  });
});

test.describe('playbook pages (signed out, guest mode off)', () => {
  test('content is fully readable; saving and notes show a three-part gate', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('tw_guest_disabled', '1'));
    await page.goto('/playbooks/silent-treatment');
    await expect(page.getByTestId('playbook-detail')).toBeVisible();
    await expect(page.getByTestId('playbook-script-partnerB')).toContainText('明天早上十點');
    await expect(page.getByTestId('playbook-reflect-gate')).toBeVisible();
    await expect(page.getByTestId('playbook-reflect-signup')).toBeVisible();
    await page.getByTestId('playbook-save').click();
    await expect(page.getByText('收藏需要免費帳號')).toBeVisible();
  });
});
