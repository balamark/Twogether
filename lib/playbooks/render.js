// Server-rendered shell for the public 關係解方手冊 pages (/playbooks,
// /playbooks/:slug). Search engines and LINE / Facebook / Threads scrapers
// don't run JS, so each page gets its own <title>, description, canonical,
// hreflang, Open Graph tags and JSON-LD, plus the full Playbook text as plain
// HTML inside #root. React's createRoot replaces that markup on boot, so
// visitors see the readable article instantly and then the interactive app.

const playbooks = require('./index');

const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const paras = (text) => String(text).split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('');
const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

const COPY = {
  'zh-TW': {
    libraryTitle: '關係解方手冊 · 伴侶常卡住的 8 種循環與說法模板 | Twogether',
    libraryDesc: '親密被拒、育兒觀念不同、冷戰、家事分工、金錢觀、婆家界線、不被看見、沒有相處時間。看懂你們卡住的循環，拿到可以直接說出口的話、替代方案與共同約定。免註冊就能看。',
    libraryH1: '每對伴侶都有卡住的循環，每個循環都有更好的出路',
    libraryLead: '實用的關係解方手冊：看懂彼此、換一種說法，一起建立更健康的相處模式。',
    sections: ['發生了什麼', '雙方真正的感受', '為什麼一直重複', '換個方式說', '替代方案', '建立共同約定', '一起回顧'],
    insight: '關鍵洞察',
    emotions: '可能的感受',
    needs: '底下真正的需要',
    minutes: (n) => `${n} 分鐘閱讀`,
    safety: '如果你正在經歷暴力、威脅或被強迫，請先照顧自己的安全：台灣可撥 113 保護專線，或 1925 安心專線。',
    cta: '在 Twogether 免費開始，把這份手冊變成你們的對話',
    langName: 'zh-Hant',
    ogLocale: 'zh_TW',
  },
  en: {
    libraryTitle: 'Relationship Playbook · 8 patterns couples get stuck in, and what to say instead | Twogether',
    libraryDesc: 'Intimacy rejection, parenting differences, the silent treatment, unequal chores, money, in-laws, feeling unseen, no time together. Understand the cycle, get words you can actually say, alternatives and a shared agreement. Free, no sign-up needed.',
    libraryH1: 'Every couple has patterns. Every pattern can change.',
    libraryLead: 'Practical guides to help you understand each other, communicate better, and build healthier patterns together.',
    sections: ['The situation', 'The hidden feelings', 'The negative cycle', 'The better conversation', 'Alternative solutions', 'Make an agreement', 'Reflect together'],
    insight: 'Core insight',
    emotions: 'Possible feelings',
    needs: 'Underlying needs',
    minutes: (n) => `${n} min read`,
    safety: 'If you are experiencing violence, threats or coercion, please put your safety first. In Taiwan call 113 (protection hotline) or 1925; elsewhere, contact your local emergency number.',
    cta: 'Start free on Twogether and turn this playbook into a conversation together',
    langName: 'en',
    ogLocale: 'en_US',
  },
};

const STYLE = `<style>.pb-ssr{max-width:44rem;margin:0 auto;padding:24px 16px 48px;font-family:'Noto Sans TC',Manrope,system-ui,sans-serif;color:#2A2520;line-height:1.7;background:#FBF7F2}.pb-ssr h1{font-family:'Noto Serif TC',Fraunces,serif;font-weight:400;font-size:1.9rem;line-height:1.25;margin:.3em 0}.pb-ssr h2{font-family:'Noto Serif TC',Fraunces,serif;font-weight:500;font-size:1.25rem;margin:1.8em 0 .5em}.pb-ssr h3{font-size:1rem;margin:1em 0 .3em}.pb-ssr .meta,.pb-ssr small{color:#8A7E72;font-size:.85rem}.pb-ssr blockquote{margin:.6em 0;padding:.6em 1em;border-left:3px solid #D4938A;background:#fff}.pb-ssr a{color:#B86E64}</style>`;

function baseUrl(host) {
  return `https://${host || 'twogether.fun'}`;
}

function urlFor(host, slug, locale) {
  const path = slug ? `/playbooks/${slug}` : '/playbooks';
  return `${baseUrl(host)}${path}${locale === 'en' ? '?lang=en' : ''}`;
}

function setHead(html, { title, description, canonical, locale, alternates, jsonLd }) {
  const c = COPY[locale];
  const replaceMeta = (h, attr, key, value) => h.replace(
    new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`),
    `$1${esc(value)}$2`,
  );
  let out = html
    .replace(/<html lang="[^"]*">/, `<html lang="${c.langName}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${esc(canonical)}" />\n    ${alternates}`);
  out = replaceMeta(out, 'name', 'description', description);
  out = replaceMeta(out, 'property', 'og:type', 'article');
  out = replaceMeta(out, 'property', 'og:locale', c.ogLocale);
  out = replaceMeta(out, 'property', 'og:title', title);
  out = replaceMeta(out, 'property', 'og:description', description);
  out = replaceMeta(out, 'property', 'og:url', canonical);
  out = replaceMeta(out, 'name', 'twitter:title', title);
  out = replaceMeta(out, 'name', 'twitter:description', description);
  // Swap the homepage WebApplication JSON-LD for this page's own.
  out = out.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  );
  return out;
}

function alternateLinks(host, slug) {
  return [
    `<link rel="alternate" hreflang="zh-Hant" href="${esc(urlFor(host, slug, 'zh-TW'))}" />`,
    `<link rel="alternate" hreflang="en" href="${esc(urlFor(host, slug, 'en'))}" />`,
    `<link rel="alternate" hreflang="x-default" href="${esc(urlFor(host, slug, 'zh-TW'))}" />`,
  ].join('\n    ');
}

function injectBody(html, inner) {
  return html.replace('<div id="root"></div>', `<div id="root">${STYLE}<main class="pb-ssr">${inner}</main></div>`);
}

function renderLibrary(template, { locale, host }) {
  const loc = playbooks.normalizeLocale(locale);
  const c = COPY[loc];
  const items = playbooks.listPlaybooks(loc);
  const canonical = urlFor(host, null, loc);
  const inner = [
    `<h1>${esc(c.libraryH1)}</h1>`,
    `<p>${esc(c.libraryLead)}</p>`,
    '<ul>',
    ...items.map((p) => `<li><h2><a href="${esc(urlFor(host, p.slug, loc).replace(baseUrl(host), ''))}">${esc(`${p.emoji} ${p.title}`)}</a></h2><p class="meta">${esc(p.categoryLabel)} · ${esc(c.minutes(p.estimatedReadingMinutes))}</p><p>${esc(p.hook)}</p></li>`),
    '</ul>',
  ].join('');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: c.libraryTitle,
    description: c.libraryDesc,
    url: canonical,
    inLanguage: c.langName,
    hasPart: items.map((p) => ({ '@type': 'Article', headline: p.title, url: urlFor(host, p.slug, loc) })),
  };
  return injectBody(
    setHead(template, { title: c.libraryTitle, description: c.libraryDesc, canonical, locale: loc, alternates: alternateLinks(host, null), jsonLd }),
    inner,
  );
}

function renderPlaybook(template, slug, { locale, host }) {
  const loc = playbooks.normalizeLocale(locale);
  const p = playbooks.getPlaybook(slug, loc);
  if (!p) return null;
  const c = COPY[loc];
  const s = c.sections;
  const canonical = urlFor(host, p.slug, loc);
  const colon = loc === 'en' ? ': ' : '：';
  const sep = loc === 'en' ? ', ' : '、';
  const side = (x) => `<h3>${esc(x.role)}</h3><p><strong>${esc(c.emotions)}${colon}</strong>${esc(x.emotions.join(sep))}</p><p><strong>${esc(c.needs)}${colon}</strong>${esc(x.underlyingNeeds.join(sep))}</p>`;
  const convo = (x) => `<h3>${esc(x.label)}</h3><blockquote>${paras(x.script)}</blockquote>`;
  const bc = p.betterConversation;
  const inner = [
    `<p class="meta"><a href="${loc === 'en' ? '/playbooks?lang=en' : '/playbooks'}">${loc === 'en' ? 'Relationship Playbook' : '關係解方手冊'}</a> · ${esc(p.categoryLabel)} · ${esc(c.minutes(p.estimatedReadingMinutes))}</p>`,
    `<h1>${esc(`${p.emoji} ${p.title}`)}</h1>`,
    `<p>${esc(p.subtitle)}</p>`,
    `<h2>1. ${esc(s[0])}</h2>`, `<p>${esc(p.situation.summary)}</p>`, list(p.situation.examples),
    `<h2>2. ${esc(s[1])}</h2>`, side(p.hiddenFeelings.partnerA), side(p.hiddenFeelings.partnerB),
    `<p><strong>${esc(c.insight)}${colon}</strong>${esc(p.hiddenFeelings.coreInsight)}</p>`,
    `<h2>3. ${esc(s[2])}</h2>`, `<ol>${p.negativeCycle.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`, list(p.negativeCycle.consequences),
    `<h2>4. ${esc(s[3])}</h2>`,
    // Order the two scripts the way the content lists them (PB-001 starts with B).
    ...Object.keys(bc).filter((k) => k === 'partnerA' || k === 'partnerB').map((k) => convo(bc[k])),
    `<h2>5. ${esc(s[4])}</h2>`,
    `<ul>${p.alternativeSolutions.map((a) => `<li>${esc(a.title)} <small>(${esc(a.emotionalNeedAddressed)})</small></li>`).join('')}</ul>`,
    p.alternativesNote ? `<p><small>${esc(p.alternativesNote)}</small></p>` : '',
    `<h2>6. ${esc(s[5])}</h2>`, `<h3>${esc(p.agreement.title)}</h3>`, list(p.agreement.statements),
    `<h2>7. ${esc(s[6])}</h2>`, `<ol>${p.reflectionQuestions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>`,
    ...p.safetyNotes.map((n) => `<p><small>${esc(n)}</small></p>`),
    `<p><small>${esc(c.safety)}</small></p>`,
    `<p><a href="/">${esc(c.cta)}</a></p>`,
  ].join('');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title,
    description: p.subtitle,
    url: canonical,
    inLanguage: c.langName,
    datePublished: p.publishedAt,
    keywords: p.tags.join(', '),
    publisher: { '@type': 'Organization', name: 'Twogether', url: baseUrl(host) },
  };
  const title = `${p.title} · ${loc === 'en' ? 'Relationship Playbook' : '關係解方手冊'} | Twogether`;
  return injectBody(
    setHead(template, { title, description: `${p.subtitle} ${p.hook}`, canonical, locale: loc, alternates: alternateLinks(host, p.slug), jsonLd }),
    inner,
  );
}

/** <url> entries for the sitemap: the library + every published Playbook, both languages. */
function sitemapEntries(host) {
  const lastmod = (p) => p.publishedAt;
  const items = playbooks.published('zh-TW');
  const newest = items.map(lastmod).sort().pop();
  const entry = (loc, date) => `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${date}</lastmod>\n  </url>`;
  return [
    entry(urlFor(host, null, 'zh-TW'), newest),
    entry(urlFor(host, null, 'en'), newest),
    ...items.flatMap((p) => [entry(urlFor(host, p.slug, 'zh-TW'), lastmod(p)), entry(urlFor(host, p.slug, 'en'), lastmod(p))]),
  ].join('\n');
}

module.exports = { renderLibrary, renderPlaybook, sitemapEntries, urlFor };
