import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    // Phase 1: keep app lint actionable; infra/edge lint lives under `npm run lint:all`.
    'supabase/functions/**',
    'cloudflare/**',
    // Legacy feature experiments contain non-standard syntax; keep out of core lint.
    'src/features/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Phase 1: keep lint signal high without blocking on legacy infra/UI constraints.
      'react-refresh/only-export-components': 'off',
      // The purity plugin is extremely strict for state setters and time/random usage in UI.
      'react-hooks/purity': 'off',
      // This rule conflicts with common React patterns used across the repo.
      'react-hooks/set-state-in-effect': 'off',
      // Gradual migration: allow `any` in legacy engine/providers; keep as warning.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-unsafe-finally': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
      'no-unsafe-finally': 'off',
    },
  },
])
