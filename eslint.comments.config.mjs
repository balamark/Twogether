import globals from 'globals'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import noComments from './eslint-rules/no-comments.js'

export const COMMENT_LINT_IGNORES = [
  'dist',
  'node_modules',
  'ios-app',
  'design-prototypes',
  'database/migrations_backup',
  'playwright-report',
  'test-results',
  'public',
]

const local = { rules: { 'no-comments': noComments } }

export default tseslint.config([
  globalIgnores(COMMENT_LINT_IGNORES),
  {
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    plugins: {
      local,
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: { 'local/no-comments': 'error' },
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: { parser: tseslint.parser },
  },
])
