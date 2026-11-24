const en = require('./content.en');
const zh = require('./content.zh-TW');

const LOCALES = { en, 'zh-TW': zh };

const CATEGORIES = {
  intimacy: { 'zh-TW': '親密關係', en: 'Intimacy' },
  parenting: { 'zh-TW': '育兒教養', en: 'Parenting' },
  communication: { 'zh-TW': '衝突與溝通', en: 'Conflict & communication' },
  family: { 'zh-TW': '家庭與分工', en: 'Family & responsibilities' },
  money: { 'zh-TW': '金錢觀', en: 'Money' },
  emotional: { 'zh-TW': '情感支持', en: 'Emotional connection' },
  connection: { 'zh-TW': '相處時間', en: 'Quality time' },
};

const APPLY_TARGETS = new Set(['intimacy', 'event']);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isStr(v) { return typeof v === 'string' && v.trim().length > 0; }
function isStrArr(v, min = 1) { return Array.isArray(v) && v.length >= min && v.every(isStr); }

function validatePlaybook(p) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(`${p && p.slug}: ${msg}`); };
  need(p && typeof p === 'object', 'not an object');
  if (!p || typeof p !== 'object') return errs;
  need(isStr(p.id), 'id');
  need(isStr(p.slug) && SLUG_RE.test(p.slug), 'slug');
  need(Number.isInteger(p.version) && p.version > 0, 'version');
  need(['draft', 'review', 'published'].includes(p.status), 'status');
  need(Object.prototype.hasOwnProperty.call(CATEGORIES, p.category), 'category');
  for (const k of ['title', 'subtitle', 'hook', 'emoji']) need(isStr(p[k]), k);
  need(isStrArr(p.tags), 'tags');
  need(Number.isInteger(p.estimatedReadingMinutes), 'estimatedReadingMinutes');
  need(p.situation && isStr(p.situation.summary) && isStrArr(p.situation.examples), 'situation');
  const hf = p.hiddenFeelings || {};
  for (const side of ['partnerA', 'partnerB']) {
    const s = hf[side] || {};
    need(isStr(s.role) && isStrArr(s.emotions) && isStrArr(s.underlyingNeeds), `hiddenFeelings.${side}`);
  }
  need(isStr(hf.coreInsight), 'hiddenFeelings.coreInsight');
  need(p.negativeCycle && isStrArr(p.negativeCycle.steps, 3) && isStrArr(p.negativeCycle.consequences), 'negativeCycle');
  const bc = p.betterConversation || {};
  for (const side of ['partnerA', 'partnerB']) {
    need(bc[side] && isStr(bc[side].label) && isStr(bc[side].script), `betterConversation.${side}`);
  }
  if (bc.elements !== undefined) {
    need(Array.isArray(bc.elements) && bc.elements.every((e) => isStr(e.name) && isStr(e.desc)), 'betterConversation.elements');
  }
  need(
    Array.isArray(p.alternativeSolutions) && p.alternativeSolutions.length >= 3 &&
      p.alternativeSolutions.every((a) => isStr(a.id) && isStr(a.title) && isStr(a.emotionalNeedAddressed)),
    'alternativeSolutions',
  );
  need(p.agreement && isStr(p.agreement.title) && isStrArr(p.agreement.statements, 3), 'agreement');
  need(isStrArr(p.reflectionQuestions, 3), 'reflectionQuestions');
  need(Array.isArray(p.safetyNotes) && p.safetyNotes.every(isStr), 'safetyNotes');
  need(Array.isArray(p.relatedPlaybooks) && p.relatedPlaybooks.every((s) => SLUG_RE.test(s)), 'relatedPlaybooks');
  need(APPLY_TARGETS.has(p.apply), 'apply');
  return errs;
}

function normalizeLocale(locale) {
  return locale === 'en' ? 'en' : 'zh-TW';
}

function published(locale) {
  return LOCALES[normalizeLocale(locale)].filter((p) => p.status === 'published');
}

function withCategoryLabel(p, locale) {
  return { ...p, categoryLabel: CATEGORIES[p.category][normalizeLocale(locale)] };
}

function toSummary(p, locale) {
  return {
    id: p.id,
    slug: p.slug,
    emoji: p.emoji,
    category: p.category,
    categoryLabel: CATEGORIES[p.category][normalizeLocale(locale)],
    title: p.title,
    subtitle: p.subtitle,
    hook: p.hook,
    tags: p.tags,
    estimatedReadingMinutes: p.estimatedReadingMinutes,
  };
}

function listPlaybooks(locale) {
  return published(locale).map((p) => toSummary(p, locale));
}

function getPlaybook(slug, locale) {
  const p = published(locale).find((x) => x.slug === slug);
  if (!p) return null;
  const related = p.relatedPlaybooks
    .map((s) => published(locale).find((x) => x.slug === s))
    .filter(Boolean)
    .map((r) => toSummary(r, locale));
  return { ...withCategoryLabel(p, locale), related };
}

function isPublishedSlug(slug) {
  return typeof slug === 'string' && published('zh-TW').some((p) => p.slug === slug);
}

function listCategories(locale) {
  const used = new Set(published(locale).map((p) => p.category));
  return Object.entries(CATEGORIES)
    .filter(([key]) => used.has(key))
    .map(([key, labels]) => ({ key, label: labels[normalizeLocale(locale)] }));
}

module.exports = {
  CATEGORIES,
  LOCALES,
  validatePlaybook,
  listPlaybooks,
  getPlaybook,
  listCategories,
  isPublishedSlug,
  normalizeLocale,
  published,
};
