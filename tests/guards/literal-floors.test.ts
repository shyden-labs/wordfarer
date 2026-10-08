import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { walkDisagreements } from '../unit/burn-down';
import {
  comparisonsWritten,
  literalArgumentsWritten,
} from '../unit/comparison-text';
import {
  literalFloorFindings,
  literalMinimumsIn,
  type FiledMinimum,
  type MinimumReading,
} from '../unit/literal-floors';
import { LITERAL_MINIMUMS } from '../unit/literal-floors.burn-down';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { codeWithoutLiterals } from '../unit/source-text';
import { committableFiles } from '../unit/tracked-files';

const parse = (source: string, file: string) =>
  ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

/**
 * The literal-floors meta-guard over the whole repository (#378), in the
 * guards suite (#475): it parses every TypeScript file git has, a cost that
 * grows with the tree. The reader's tests on planted fixtures are unit tests
 * (tests/unit/literal-floors.test.ts).
 */

/**
 * Every TypeScript file git has, and what the reader made of each. Read once,
 * on first use inside a test: nothing reaches workspace code while the file
 * is collected.
 */
let walked:
  | {
      files: string[];
      readings: (MinimumReading & { file: string; code: string })[];
      comparisons: string[];
      minimums: FiledMinimum[];
    }
  | undefined;
const repository = () => {
  if (walked !== undefined) return walked;
  const files = committableFiles().filter((path) => /\.[cm]?ts$/.test(path));
  const readings = files.map((file) => {
    const sf = parse(readFileSync(file, 'utf8'), file);
    return { file, code: codeWithoutLiterals(sf), ...literalMinimumsIn(sf) };
  });
  walked = {
    files,
    readings,
    comparisons: readings.flatMap(({ file, comparisons }) =>
      Array.from(
        { length: comparisons },
        (_, n) => `${file} #${String(n + 1)}`,
      ),
    ),
    minimums: readings.flatMap(({ file, minimums }) =>
      minimums.map((minimum) => ({ file, ...minimum })),
    ),
  };
  return walked;
};

describe('every literal minimum of two or more is recorded, or listed (#378)', () => {
  it('finds every scope holding exactly the literal minimums listed', () => {
    const { readings, comparisons: COMPARISONS, minimums } = repository();
    const refused = readings.flatMap(({ refused }) => refused);
    const findings = literalFloorFindings(minimums, LITERAL_MINIMUMS);
    expect(
      searched(refused, { of: COMPARISONS, what: 'comparisons' }),
      refused.join('\n'),
    ).toEqual([]);
    expect(
      searched(findings, { of: COMPARISONS, what: 'comparisons' }),
      findings.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('literal-floors/comparisons', COMPARISONS.length),
    ).toBeUndefined();
  });
});

describe('the reader proves what it read (#378)', () => {
  it('reads as many comparisons and literal bounds in each file as its text writes, over every file git has', () => {
    const { readings, files: FILES } = repository();
    // Independent of the parse tree (control c): the matcher calls, and those
    // whose bound is a number written in place, counted in each file's code
    // with literals and comments removed, against the reader's counts for that
    // file. A bound folded through a name, a table or a test table is defined
    // by dataflow alone; a second reading of those would need the TypeScript
    // checker over a whole program, so the planted forms above stand for them.
    const misread = readings
      .filter(
        ({ code, comparisons, literalArguments }) =>
          comparisonsWritten(code) !== comparisons ||
          literalArgumentsWritten(code) !== literalArguments,
      )
      .map(
        ({ file, code, comparisons, literalArguments }) =>
          `${file}: ${String(comparisonsWritten(code))} comparisons and ` +
          `${String(literalArgumentsWritten(code))} literal bounds written, ` +
          `${String(comparisons)} and ${String(literalArguments)} read`,
      );
    const walk = walkDisagreements(
      FILES,
      committableFiles(['*.ts', '*.mts', '*.cts']),
    );
    expect(
      searched(misread, { of: FILES, what: 'TypeScript files' }),
      misread.join('\n'),
    ).toEqual([]);
    expect(
      searched(walk, { of: FILES, what: 'TypeScript files' }),
      walk.join('\n'),
    ).toEqual([]);
    expect(floorBreach('literal-floors/files', FILES.length)).toBeUndefined();
  });
});
