import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { LINE_HOME, lineReadersIn } from '../unit/line-of';
import { committableFiles } from '../unit/tracked-files';

/**
 * The line-of guard over every TypeScript file git has (#417 AC1).
 * It reads the whole repository, a cost that grows with the tree, so it runs
 * in the guards suite (#515). The reader's tests on planted fixtures are unit
 * tests (tests/unit/line-of.test.ts).
 */

const parse = (path: string, text: string): ts.SourceFile =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);

describe('no guard asks TypeScript for a line outside the one home (#417 AC1)', () => {
  it('finds none in any TypeScript file git has', () => {
    const files = committableFiles(['*.ts', '*.mts', '*.cts', '*.tsx']).filter(
      (path) => existsSync(path),
    );
    const readings = files
      .filter((path) => path !== LINE_HOME)
      .map((path) => lineReadersIn(parse(path, readFileSync(path, 'utf8'))));
    const findings = readings.flatMap(({ readers }) => readers);
    expect(
      searched(findings, { of: files, what: 'TypeScript files git has' }),
    ).toEqual([]);
    expect(
      floorBreach('line-of/typescript-files', files.length),
    ).toBeUndefined();
    // Liveness: a reader blind to member access would read none.
    const accesses = readings.reduce(
      (sum, reading) => sum + reading.accesses,
      0,
    );
    expect(floorBreach('line-of/accesses', accesses)).toBeUndefined();
  });
});
