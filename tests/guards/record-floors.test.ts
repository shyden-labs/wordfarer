import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
  FLOORS_MODULE,
  TYPESCRIPT_FILES,
  readFloorCaller,
} from '../../scripts/record-floors';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { codeWithoutLiterals } from '../unit/source-text';
import { committableFiles } from '../unit/tracked-files';

/**
 * The floor recorder's reading of every TypeScript file git has (#448).
 * It reads the whole repository, a cost that grows with the tree, so it runs
 * in the guards suite (#515). The reader's tests on planted fixtures are unit
 * tests (tests/unit/record-floors.test.ts).
 */

describe('the recorder over this repository', () => {
  it('reads every TypeScript file git has, refuses none, and misses no file whose code names floorBreach (#448)', () => {
    const files = committableFiles([...TYPESCRIPT_FILES]).filter((path) =>
      existsSync(path),
    );
    const readings = files.map((path) => {
      const source = readFileSync(path, 'utf8');
      const sf = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      return {
        path,
        reading: readFloorCaller(path, sf),
        // The cross-check, read from the text with literals and comments gone.
        named: /\bfloorBreach\b/.test(codeWithoutLiterals(sf)),
      };
    });
    const findings = readings.filter(
      ({ path, reading, named }) =>
        reading.refusals.length > 0 ||
        (named && !reading.calls && path !== `${FLOORS_MODULE}.ts`),
    );
    expect(
      searched(findings, { of: files, what: 'TypeScript files git has' }),
    ).toEqual([]);
    expect(
      floorBreach('record-floors/typescript-files', files.length),
    ).toBeUndefined();
    const callers = readings.filter(({ reading }) => reading.calls);
    expect(
      floorBreach('record-floors/callers', callers.length),
    ).toBeUndefined();
  });
});
