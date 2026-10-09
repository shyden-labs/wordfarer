import { describe, expect, it } from 'vitest';
import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { coreDeterminismBlock } from '../../eslint.core-determinism';

/**
 * The determinism ban on packages/core/src (M1 design §2.1 and §3, #26 AC3).
 *
 * Each banned form is linted as real code at a core source path and must be
 * reported by one of the ban rules. Lint runs with type information off: the
 * bans are syntactic, and the project service refuses a path that is not on
 * disk. A fixture that fails to parse reports an error too, so every
 * expectation also asserts there was no fatal parse error; without that a
 * typo in a fixture would pass as a ban.
 */

const BAN_RULES = new Set([
  'no-restricted-properties',
  'no-restricted-syntax',
  'no-restricted-globals',
  'no-restricted-imports',
]);

const CORE_FIXTURE = 'packages/core/src/fixture.ts';

// The bans alone, under TypeScript's parser: loading eslint.config.js and
// every plugin it names ran past the unit hook limit under a full parallel
// run (#477). That the full config applies exactly this block to core's
// source is held in tests/guards/core-determinism-config.test.ts.
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
    coreDeterminismBlock,
  ],
});

async function lint(
  code: string,
  filePath: string,
): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(code, { filePath });
  if (result === undefined) throw new Error(`no lint result for ${filePath}`);
  const fatal = result.messages.filter((m) => m.fatal === true);
  expect(fatal, `fixture must parse: ${code}`).toEqual([]);
  return result.messages;
}

async function bans(code: string, filePath = CORE_FIXTURE) {
  const messages = await lint(code, filePath);
  return messages.filter((m) => m.ruleId !== null && BAN_RULES.has(m.ruleId));
}

const MATH = [
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
  'random',
];
const DECIMAL = ['pow', 'exp', 'ln', 'log', 'log10', 'log2'];
const GLOBALS = [
  'setTimeout',
  'setInterval',
  'fetch',
  'window',
  'document',
  'performance',
  'crypto',
];

const BANNED: [string, string][] = [
  ...MATH.map((f): [string, string] => [
    `Math.${f}`,
    `export const x = Math.${f}(2, 3);`,
  ]),
  ['Math destructuring', 'const { pow } = Math;\nexport const x = pow(2, 3);'],
  ['the ** operator', 'export const x = 2 ** 3;'],
  ['the **= operator', 'let y = 2;\ny **= 3;\nexport const x = y;'],
  ...DECIMAL.map((f): [string, string] => [
    `Decimal.${f} (static)`,
    `import Decimal from 'break_infinity.js';\nexport const x = Decimal.${f}(2, 3);`,
  ]),
  ...DECIMAL.map((f): [string, string] => [
    `.${f}() on an instance`,
    `declare const d: Record<string, (n: number) => unknown>;\nexport const x = d.${f}(2);`,
  ]),
  [
    'a computed Decimal member',
    "declare const d: Record<string, () => unknown>;\nexport const x = d['pow']();",
  ],
  ['Date.now', 'export const x = Date.now();'],
  ['zero-argument new Date()', 'export const x = new Date();'],
  ['Date() called as a function', 'export const x = Date();'],
  ...GLOBALS.map((g): [string, string] => [
    `the ${g} global`,
    `export const x = ${g};`,
  ]),
  ...GLOBALS.map((g): [string, string] => [
    `globalThis.${g}`,
    `export const x = globalThis.${g};`,
  ]),
  [
    'a node: built-in',
    "import { readFileSync } from 'node:fs';\nexport const x = readFileSync;",
  ],
  [
    'a bare Node built-in',
    "import { readFileSync } from 'fs';\nexport const x = readFileSync;",
  ],
];

describe('packages/core/src bans every non-deterministic form', () => {
  for (const [label, code] of BANNED) {
    it(label, async () => {
      expect(await bans(code), code).not.toEqual([]);
    });
  }

  it('an inline eslint-disable cannot switch a ban off', async () => {
    const code =
      '// eslint-disable-next-line no-restricted-properties\nexport const x = Math.random();';
    expect(await bans(code)).not.toEqual([]);
  });
});

describe('the ban leaves deterministic code alone', () => {
  const ALLOWED: [string, string][] = [
    [
      'new Date(wallMs) from an explicit argument',
      'declare const wallMs: number;\nexport const x = new Date(wallMs);',
    ],
    [
      'Math.sqrt, correctly rounded everywhere',
      'export const x = Math.sqrt(2);',
    ],
    [
      'Math.floor and Math.max',
      'export const x = Math.floor(Math.max(1.5, 2));',
    ],
    [
      'Num.pow, built on det-math',
      "import { Num } from './num';\nexport const x = Num.pow(Num.from(2), 3);",
    ],
    [
      'a det-math import',
      "import { pow } from './det-math';\nexport const x = pow(1.15, 3);",
    ],
  ];
  for (const [label, code] of ALLOWED) {
    it(label, async () => {
      expect(await bans(code), code).toEqual([]);
    });
  }

  it('is scoped to packages/core/src: the same code elsewhere is not banned', async () => {
    const code = 'export const x = Math.pow(2, 3) + Date.now();';
    expect(await bans(code, 'packages/core/test/fixture.test.ts')).toEqual([]);
    expect(await bans(code, 'apps/web/src/fixture.ts')).toEqual([]);
    // Liveness: the same text IS banned at a core source path.
    expect(await bans(code)).toHaveLength(2);
  });
});
