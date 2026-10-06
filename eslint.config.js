import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import svelteConfig from './apps/web/svelte.config.js';

/**
 * Determinism bans for packages/core/src (M1 design §2.1 and §3).
 *
 * Core must compute the same bits on every engine, because ranked replay runs
 * a phone's events on Cloudflare's V8. Math.pow and friends are
 * implementation-approximated and differed between V8 and JavaScriptCore in up
 * to 49% of results; det-math.ts holds the deterministic versions. Core also
 * reads no clock, timer, network or host object: time arrives as an explicit
 * wallMs argument. Math.sqrt and + - * / are correctly rounded everywhere and
 * stay allowed.
 */
const TRANSCENDENTAL =
  'is engine-approximated; use det-math.ts (M1 design §2.1)';
const IMPURE =
  'reads the host; core takes time and randomness as explicit inputs (M1 design §3)';
const MATH_BANNED = [
  'pow',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log10',
  'log2',
  'cbrt',
  'hypot',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
];
const DECIMAL_BANNED = ['pow', 'exp', 'ln', 'log', 'log10', 'log2'];
const HOST_GLOBALS = [
  'setTimeout',
  'setInterval',
  'fetch',
  'window',
  'document',
  'performance',
  'crypto',
];
const DECIMAL_MEMBER = `/^(${DECIMAL_BANNED.join('|')})$/`;

const coreDeterminism = {
  'no-restricted-properties': [
    'error',
    ...MATH_BANNED.map((property) => ({
      object: 'Math',
      property,
      message: `Math.${property} ${TRANSCENDENTAL}`,
    })),
    {
      object: 'Math',
      property: 'random',
      message: `Math.random ${IMPURE}; use rng.ts`,
    },
    { object: 'Date', property: 'now', message: `Date.now ${IMPURE}` },
    ...DECIMAL_BANNED.map((property) => ({
      object: 'Decimal',
      property,
      message: `Decimal.${property} ${TRANSCENDENTAL}; Num builds powers from it`,
    })),
    ...HOST_GLOBALS.map((property) => ({
      object: 'globalThis',
      property,
      message: `${property} ${IMPURE}`,
    })),
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "BinaryExpression[operator='**']",
      message: `** ${TRANSCENDENTAL}`,
    },
    {
      selector: "AssignmentExpression[operator='**=']",
      message: `**= ${TRANSCENDENTAL}`,
    },
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message: `new Date() ${IMPURE}`,
    },
    {
      selector: "CallExpression[callee.name='Date']",
      message: `Date() ${IMPURE}`,
    },
    {
      // break_infinity's instance forms (d.pow(2)). Num.pow is the
      // deterministic wrapper, so calls on the Num namespace are allowed;
      // Math.* and Decimal.* statics have their own entries above, and
      // excluding them here keeps each form reported once, by its own rule.
      selector: `CallExpression[callee.type='MemberExpression'][callee.property.name=${DECIMAL_MEMBER}]:not([callee.object.name=/^(Num|Math|Decimal)$/])`,
      message: `a Decimal power or logarithm ${TRANSCENDENTAL}; use Num.pow or det-math`,
    },
    {
      selector: `CallExpression[callee.computed=true][callee.property.value=${DECIMAL_MEMBER}]`,
      message: `a Decimal power or logarithm ${TRANSCENDENTAL}; use Num.pow or det-math`,
    },
  ],
  'no-restricted-globals': [
    'error',
    ...HOST_GLOBALS.map((name) => ({ name, message: `${name} ${IMPURE}` })),
  ],
  'no-restricted-imports': [
    'error',
    {
      paths: builtinModules.map((name) => ({
        name,
        message: 'core depends on no Node built-in (#26 AC1)',
      })),
      patterns: [
        {
          group: ['node:*'],
          message: 'core depends on no Node built-in (#26 AC1)',
        },
      ],
    },
  ],
};

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
  {
    files: ['packages/core/src/**/*.ts'],
    // An inline eslint-disable is ignored here and reported, so no ban can
    // be switched off one line at a time.
    linterOptions: { noInlineConfig: true },
    rules: coreDeterminism,
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
