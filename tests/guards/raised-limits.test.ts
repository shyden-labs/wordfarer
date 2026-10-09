import { existsSync, readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import unit from '../../vitest.config';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { raisedLimitsIn } from '../unit/raised-limits';
import { codeWithoutLiterals } from '../unit/source-text';
import { committableFiles } from '../unit/tracked-files';

/**
 * No unit test file or unit config raises a limit (#477 AC3, AC4): every unit
 * test runs in under 1 s, and no limit is ever raised (global rule,
 * 2026-10-07). It reads every file the unit suite loads, a cost that grows
 * with the tree, so it runs in the guards suite. The reader's planted forms
 * are unit tests (tests/unit/raised-limits.test.ts). There is no allow-list.
 *
 * The files are the unit config's own globs over the files git has, the
 * helpers beside the tests, the config and its setup files: a glob added to
 * the config widens the guard with it.
 */

const UNIT_CONFIG = 'vitest.config.ts';

const unitFiles = (): string[] => {
  const include = [
    ...(unit.test?.include ?? []),
    'tests/unit/**/*.ts',
    'packages/*/test/**/*.ts',
  ];
  const exclude = unit.test?.exclude ?? [];
  const setup = [unit.test?.setupFiles ?? []].flat();
  return committableFiles(['*.ts'])
    .filter((path) => existsSync(path))
    .filter(
      (path) =>
        path === UNIT_CONFIG ||
        setup.includes(path) ||
        (include.some((glob) => matchesGlob(path, glob)) &&
          !exclude.some((glob) => matchesGlob(path, glob))),
    );
};

/**
 * What each file writes, counted in its code without literals or comments:
 * each name called or declared, type arguments allowed, a function type in
 * them too (`it.each<[string, (b: B) => unknown]>(`).
 */
const WRITTEN = [
  /(?<![\w$.])(?:it|test|describe|suite)(?:\.[A-Za-z]+)*\s*(?:<[^;{}]*?>)?\s*\(/g,
  /(?<![\w$.])(?:beforeAll|afterAll|beforeEach|afterEach|onTestFinished|onTestFailed)\s*(?:<[^;{}]*?>)?\s*\(/g,
  /(?<![\w$])vi\s*\.\s*setConfig\b/g,
  /(?<![\w$.])(?:testTimeout|hookTimeout|teardownTimeout)\s*[:,}]/g,
];

let walked:
  | {
      files: string[];
      readings: {
        file: string;
        code: string;
        findings: string[];
        sites: number;
        declarations: number;
      }[];
    }
  | undefined;
const repository = (): NonNullable<typeof walked> => {
  if (walked !== undefined) return walked;
  const files = unitFiles();
  walked = {
    files,
    readings: files.map((file) => {
      const sf = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      return { file, code: codeWithoutLiterals(sf), ...raisedLimitsIn(sf) };
    }),
  };
  return walked;
};

describe('no unit test or unit config raises a limit (#477 AC3, AC4)', () => {
  it('finds none in any file the unit suite loads', () => {
    const { files, readings } = repository();
    const findings = readings.flatMap(({ findings }) => findings);
    expect(
      searched(findings, { of: files, what: 'unit suite files' }),
      findings.join('\n'),
    ).toEqual([]);
    expect(floorBreach('raised-limits/files', files.length)).toBeUndefined();
  });

  it('reads as many tests, suites, hooks and limit keys in each file as its text writes, every call judged and declarations counted', () => {
    const { files, readings } = repository();
    const written = (code: string): number =>
      WRITTEN.reduce(
        (sum, pattern) => sum + (code.match(pattern) ?? []).length,
        0,
      );
    const misread = readings
      .filter(
        ({ code, sites, declarations }) =>
          written(code) !== sites + declarations,
      )
      .map(
        ({ file, code, sites, declarations }) =>
          `${file}: ${String(written(code))} written, ${String(sites)} judged + ${String(declarations)} declared`,
      );
    expect(
      searched(misread, { of: files, what: 'unit suite files' }),
      misread.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('raised-limits/cross-checked-files', files.length),
    ).toBeUndefined();
    const sites = readings.reduce((sum, { sites }) => sum + sites, 0);
    expect(floorBreach('raised-limits/sites', sites)).toBeUndefined();
  });

  it('reads the unit config and the setup file it names', () => {
    const { files } = repository();
    const setup = [unit.test?.setupFiles ?? []].flat();
    expect(setup).toEqual(['tests/unit/setup.ts']);
    expect(
      files
        .filter((path) => path === UNIT_CONFIG || setup.includes(path))
        .sort(),
    ).toEqual([UNIT_CONFIG, ...setup].sort());
  });
});
