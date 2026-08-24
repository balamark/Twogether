// Shaping + threshold contract for the reflection / LLM-as-judge second layer.
//
// Lives here, not inside a provider, so the claude provider and any future
// provider can't drift, and so the threshold logic is unit-testable without a
// live API call. Same reasoning as lib/deepDiveAi.js and lib/closureAi.js.
//
// The judge is a *second* LLM pass that reads the same speaker-labeled context
// the primary model saw plus the primary output, and grades it — chiefly for
// 你/我 perspective/attribution errors, which is the bug this feature exists to
// catch. A `hard` verdict means "regenerate once with the critique"; `soft`
// and `ok` are returned as-is (a soft fluency nit is not worth a costly regen).

// Which surfaces the judge knows how to grade. The value is passed to the
// provider so it can pick the right rubric emphasis, and is stored on feedback
// rows so bad cases stay attributable to a surface.
const SURFACE_TRANSLATION = 'translation';
const SURFACE_COUNSELOR = 'counselor';
const JUDGE_SURFACES = [SURFACE_TRANSLATION, SURFACE_COUNSELOR];

// Verdict severities, worst last. Only `hard` triggers a regeneration.
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

// Normalize the raw tool output into a stable verdict shape. This must NEVER
// throw: the judge is a quality gate, not a dependency the user's response can
// die on. A missing/garbled verdict is treated as `ok` (fail-open) so a flaky
// judge can never withhold a response that the primary model already produced.
//   out  → { severity?, issues?, critique? } from the judge tool_use block
//   meta → the provider _meta (tokens/cost) to fold into the caller's total
// Returns { pass, severity, issues, critique, _meta }.
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
    // pass=false ONLY on a hard verdict — the single case worth a regeneration.
    pass: severity !== SEVERITY_HARD,
    severity,
    issues,
    critique: cap(out && out.critique, MAX_CRITIQUE_CHARS),
    _meta: meta,
  };
}

// A verdict used when the judge could not run (disabled, error, timeout). Always
// passes so the primary output is returned untouched. Carries a zero-cost _meta
// so the caller's usage/cost accumulation stays correct.
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

// The extra directive appended to the primary prompt on regeneration. Kept as a
// standalone builder so the wording is shared across surfaces and testable. The
// critique is the judge's own words, so it is bounded before being echoed back.
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
