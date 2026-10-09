import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { coreDeterminism } from '../../eslint.core-determinism';

/**
 * The full eslint.config.js applies the determinism bans to core's source
 * (M1 design §2.1 and §3, #26 AC3) exactly as eslint.core-determinism.ts
 * writes them. It loads the full config and every plugin it names, which ran
 * past the unit hook limit under a full parallel run, so this real run moved
 * here when the unit test was cut to the bans alone (#477; a cut keeps the
 * real run). Type information is off, as in the unit test: the bans are
 * syntactic, and the project service refuses a path that is not on disk.
 */

const CORE_FIXTURE = 'packages/core/src/fixture.ts';

const eslint = new ESLint({
  overrideConfig: [
    { files: ['**/*.ts'], ...tseslint.configs.disableTypeChecked },
  ],
});
let computed: Promise<Linter.Config> | undefined;
const config = (): Promise<Linter.Config> =>
  (computed ??= eslint.calculateConfigForFile(
    CORE_FIXTURE,
  ) as Promise<Linter.Config>);

describe('the full ESLint config holds core’s source to the bans (#477, #26 AC3)', () => {
  it('has the four bans to apply', () => {
    expect(Object.keys(coreDeterminism)).toEqual([
      'no-restricted-properties',
      'no-restricted-syntax',
      'no-restricted-globals',
      'no-restricted-imports',
    ]);
  });

  it.each(Object.keys(coreDeterminism))(
    'applies %s to core’s source as written, as an error',
    async (rule) => {
      const [, ...options] = [coreDeterminism[rule]].flat();
      expect((await config()).rules?.[rule]).toEqual([2, ...options]);
    },
  );

  it('ignores an inline eslint-disable in core’s source', async () => {
    expect((await config()).linterOptions?.noInlineConfig).toBe(true);
  });

  it('reports a banned form linted through it, and nothing else', async () => {
    const [result] = await eslint.lintText(
      'export const x = Math.random();\n',
      { filePath: CORE_FIXTURE },
    );
    expect(result?.messages.map((m) => m.ruleId)).toEqual([
      'no-restricted-properties',
    ]);
  });
});
