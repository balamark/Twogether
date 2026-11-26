const SURFACE_TRANSLATION = 'translation';
const SURFACE_COUNSELOR = 'counselor';
const JUDGE_SURFACES = [SURFACE_TRANSLATION, SURFACE_COUNSELOR];

const SEVERITY_OK = 'ok';
const SEVERITY_SOFT = 'soft';
const SEVERITY_HARD = 'hard';
const SEVERITIES = [SEVERITY_OK, SEVERITY_SOFT, SEVERITY_HARD];

const MAX_CRITIQUE_CHARS = 400;
const MAX_ISSUES = 5;
const MAX_ISSUE_CHARS = 120;

function clean(v) {
  return (v == null ? '' : String(v)).trim();
}

function cap(v, max) {
  const s = clean(v);
  return s.length > max ? s.slice(0, max) : s;
}

function isJudgeSurface(surface) {
  return JUDGE_SURFACES.includes(surface);
}

function shapeJudgeVerdict(out, meta) {
  const rawSeverity = clean(out && out.severity).toLowerCase();
  const severity = SEVERITIES.includes(rawSeverity) ? rawSeverity : SEVERITY_OK;
  const issues = Array.isArray(out && out.issues)
    ? out.issues
        .map((i) => cap(i, MAX_ISSUE_CHARS))
        .filter((i) => i.length > 0)
        .slice(0, MAX_ISSUES)
    : [];
  return {
    pass: severity !== SEVERITY_HARD,
    severity,
    issues,
    critique: cap(out && out.critique, MAX_CRITIQUE_CHARS),
    _meta: meta,
  };
}

function passthroughVerdict(reason) {
  return {
    pass: true,
    severity: SEVERITY_OK,
    issues: [],
    critique: '',
    skipped: reason || 'skipped',
    _meta: { usage: {}, costUsd: 0, durationMs: 0 },
  };
}

function buildJudgeInstruction(critique) {
  const note = cap(critique, MAX_CRITIQUE_CHARS);
  return [
    '',
    '【第二層檢查回饋】上一版翻譯或回應被品質檢查判定有問題，請務必修正後重寫：',
    note || '視角或歸屬可能有誤，請重新確認每一句「我／你」對應的是正確的發話者。',
    '特別注意：只用發話者本人的視角說話，不要把某一方的感受或經歷寫成另一方的；緊扣對話真正發生的內容，不要編造。',
  ].join('\n');
}

module.exports = {
  SURFACE_TRANSLATION,
  SURFACE_COUNSELOR,
  JUDGE_SURFACES,
  SEVERITY_OK,
  SEVERITY_SOFT,
  SEVERITY_HARD,
  SEVERITIES,
  MAX_CRITIQUE_CHARS,
  isJudgeSurface,
  shapeJudgeVerdict,
  passthroughVerdict,
  buildJudgeInstruction,
};
