const DIRECTIVE = /^\s*(eslint(-disable|-enable|-env)?\b|global\s|globals\s|exported\s|@ts-(expect-error|ignore|nocheck|check)\b|[#@]__PURE__|@vite-ignore|webpackChunkName|webpackIgnore|istanbul\s|c8\s|v8\s|prettier-ignore)/;
const REFERENCE = /^\/\s*<(reference|amd-module)\b/;

function isDirective(comment) {
  if (comment.type === 'Shebang') return true;
  if (comment.type === 'Line' && REFERENCE.test(comment.value)) return true;
  return DIRECTIVE.test(comment.value.replace(/^\*+/, ''));
}

function jsxContainerOf(sourceCode, comment) {
  const before = sourceCode.getTokenBefore(comment, { includeComments: true });
  const after = sourceCode.getTokenAfter(comment, { includeComments: true });
  if (!before || !after || before.value !== '{' || after.value !== '}') return null;
  const node = sourceCode.getNodeByRangeIndex(comment.range[0]);
  const container = node && node.type === 'JSXEmptyExpression' ? node.parent : node;
  return container && container.type === 'JSXExpressionContainer' && container.expression.type === 'JSXEmptyExpression'
    ? container
    : null;
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow code comments; record decisions in docs/adr instead (ADR 0001).',
    },
    schema: [],
    messages: {
      noComment:
        'No code comments (ADR 0001). Tautology/stale: delete it. Hack: delete it and file an issue. Decision: move it to docs/adr. Run /delete-comment.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (isDirective(comment)) continue;
          const container = jsxContainerOf(sourceCode, comment);
          context.report({ loc: (container || comment).loc, messageId: 'noComment' });
        }
      },
    };
  },
};
