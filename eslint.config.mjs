import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'release/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/main/**/*.js', 'src/preload/**/*.js', 'src/shared/**/*.js', 'scripts/**/*.js', 'test/**/*.js'],
    languageOptions: { sourceType: 'commonjs', ecmaVersion: 2025, globals: { ...globals.node } },
  },
  {
    // Playwright testleri sayfa bağlamında da kod çalıştırır.
    files: ['test/e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: { sourceType: 'module', ecmaVersion: 2025, globals: { ...globals.browser } },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', ecmaVersion: 2025, globals: { ...globals.node } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
