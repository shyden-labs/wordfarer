import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  absencesWritten,
  testsWritten,
  zerosWritten,
} from '../unit/absence-text';
import { readFileSync } from 'node:fs';
import {
  burnDownFindings,
  scalarZerosIn,
  searchSitesIn,
  type FiledSite,
  type Form,
  type SearchReading,
  type ZeroReading,
} from '../unit/floorless-searches';
import { UNPROVED } from '../unit/floorless-searches.burn-down';
import { scopeKey, walkDisagreements } from '../unit/burn-down';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { committableFiles } from '../unit/tracked-files';
import { codeWithoutLiterals } from '../unit/source-text';

/**
 * The floorless-searches meta-guard over the whole repository (#361), in the
 * guards suite (#475): it parses every TypeScript file git has, a cost that
 * grows with the tree. The reader's tests on planted fixtures are unit tests
 * (tests/unit/floorless-searches.test.ts).
 */

/**
 * Every TypeScript file git has, walked with a regex over its whole list,
 * and what the reader made of each. Read once, on first use inside a test:
 * nothing reaches workspace code while the file is collected.
 */
let walked:
  | {
      files: string[];
      readings: (SearchReading &
        ZeroReading & { file: string; code: string })[];
      sites: (FiledSite & { form: Form })[];
      tests: string[];
    }
  | undefined;
const repository = () => {
  if (walked !== undefined) return walked;
  const files = committableFiles().filter((path) => /\.[cm]?ts$/.test(path));
  const readings = files.map((file) => {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    return {
      file,
      code: codeWithoutLiterals(sf),
      ...searchSitesIn(sf),
      ...scalarZerosIn(sf),
    };
  });
  walked = {
    files,
    readings,
    sites: readings.flatMap(({ file, sites }) =>
      sites.map((site) => ({ file, ...site })),
    ),
    tests: readings.flatMap(({ file, tests }) =>
      tests.map((title) => scopeKey(file, title)),
    ),
  };
  return walked;
};

describe('every absence search is proved, or listed (#361)', () => {
  it('finds every scope holding exactly the unproved searches listed', () => {
    const { readings, sites: SITES } = repository();
    const refused = readings.flatMap(({ refused }) => refused);
    const findings = burnDownFindings(SITES, UNPROVED);
    expect(
      searched(refused, { of: SITES, what: 'absence sites' }),
      refused.join('\n'),
    ).toEqual([]);
    expect(
      searched(findings, { of: SITES, what: 'absence sites' }),
      findings.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('floorless-searches/sites', SITES.length),
    ).toBeUndefined();
  });
});

describe('the reader proves what it read (#361)', () => {
  it('reads as many absence sites in each file as its text writes, over every file git has', () => {
    const { readings, files: FILES } = repository();
    // Independent of the parse tree (control c): the constructs counted in
    // each file's code with literals and comments removed, against what the
    // reader returned for that file. The walk is checked against git's own
    // globs, a second reading of the same list.
    const misread = readings
      .filter(
        ({ code, sites, refusalChecks, unplaced }) =>
          absencesWritten(code) !== sites.length + refusalChecks + unplaced,
      )
      .map(
        ({ file, code, sites, refusalChecks, unplaced }) =>
          `${file}: ${String(absencesWritten(code))} written, ${String(sites.length + refusalChecks + unplaced)} read`,
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
    expect(
      floorBreach('floorless-searches/files', FILES.length),
    ).toBeUndefined();
  });

  it('reads every zero assertion its text writes, and ratchets the scalar ones (#367)', () => {
    const { readings, files: FILES } = repository();
    // A scalar zero is a count the reader cannot tell from an exit status or
    // a game value without guessing from names, so it is not a site. Its
    // count is recorded instead, so a new one fails until it is read and
    // recorded, and the count is checked per file against the text.
    const misread = readings
      .filter(
        ({ code, zeroAssertions }) => zerosWritten(code) !== zeroAssertions,
      )
      .map(
        ({ file, code, zeroAssertions }) =>
          `${file}: ${String(zerosWritten(code))} written, ${String(zeroAssertions)} read`,
      );
    const ZEROS = readings.flatMap(({ file, scalarZeros }) =>
      scalarZeros.map((zero) => `${file}: ${zero}`),
    );
    expect(
      searched(misread, { of: FILES, what: 'TypeScript files' }),
      misread.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('floorless-searches/zero-checked-files', FILES.length),
    ).toBeUndefined();
    expect(
      floorBreach('floorless-searches/scalar-zeros', ZEROS.length),
      ZEROS.join('\n'),
    ).toBeUndefined();
  });

  it('reads as many tests in each file as its text writes', () => {
    const { readings, tests: TESTS } = repository();
    // A site's scope is the test around it, so a test form the reader cannot
    // see sends its sites elsewhere.
    const misread = readings
      .filter(({ code, tests }) => testsWritten(code) !== tests.length)
      .map(
        ({ file, code, tests }) =>
          `${file}: ${String(testsWritten(code))} written, ${String(tests.length)} read`,
      );
    expect(
      searched(misread, { of: TESTS, what: 'tests read' }),
      misread.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('floorless-searches/tests', TESTS.length),
    ).toBeUndefined();
  });
});
