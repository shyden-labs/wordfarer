import { builtinModules } from 'node:module';
import type { Linter } from 'eslint';

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

export const coreDeterminism: Linter.RulesRecord = {
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
 * The block eslint.config.js applies to core's source. Its own module, so the
 * unit test lints against the bans alone, without loading every plugin the
 * full config does (#477); tests/guards/core-determinism-config.test.ts holds
 * the full config to this block.
 */
export const coreDeterminismBlock: Linter.Config = {
  files: ['packages/core/src/**/*.ts'],
  // An inline eslint-disable is ignored here and reported, so no ban can
  // be switched off one line at a time.
  linterOptions: { noInlineConfig: true },
  rules: coreDeterminism,
};
