import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import svelteConfig from './apps/web/svelte.config.js';
import { coreDeterminismBlock } from './eslint.core-determinism.ts';

/**
 * One flat config for the whole monorepo. `--max-warnings 0` in the lint
 * script makes every warning a failure (zero-warnings policy, spec §12).
 *
 * Type-aware rules (`strictTypeChecked`) use the TypeScript project service,
 * which finds the nearest tsconfig.json for each file, so every workspace is
 * linted against its own compiler options.
 *
 * Ignores come from `.gitignore` rather than a list kept here, so anything git
 * does not track (build output, wrangler state, local agent scratch) is never
 * linted.
 */
export default tseslint.config(
  includeIgnoreFile(fileURLToPath(new URL('.gitignore', import.meta.url))),
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...svelte.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte', '.astro'],
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { parser: tseslint.parser, svelteConfig },
    },
    rules: {
      // A component without <script lang="ts"> is compiled as JavaScript and
      // imports as `any` under strict TypeScript (measured while planning M0).
      'svelte/block-lang': ['error', { script: 'ts' }],
    },
  },
  {
    files: ['**/*.astro'],
    languageOptions: {
      globals: { ...globals.browser },
      // astro-eslint-parser has no projectService: it says so on every run
      // and falls back to the nearest tsconfig.json, which is what `project:
      // true` asks for outright (eslint-plugin-astro README, typed linting).
      parserOptions: {
        parser: tseslint.parser,
        projectService: false,
        project: true,
      },
    },
  },
  {
    files: ['apps/web/src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  coreDeterminismBlock,
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
