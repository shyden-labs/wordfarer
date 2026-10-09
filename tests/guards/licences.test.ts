import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { committableFiles } from '../unit/tracked-files';
import { DISSOLVED } from '../unit/dissolved-company';
import { floorBreach } from '../floors';
import { searched } from '../searched';

/**
 * The sweep of every committable text file for the dissolved company's name (#49).
 * It reads the whole repository, a cost that grows with the tree, so it runs
 * in the guards suite (#515). The reader's tests on planted fixtures are unit
 * tests (tests/unit/licences.test.ts).
 */

/** Every committable text file, read from disk (a NUL byte marks binary). */
const committableText = () =>
  committableFiles()
    .filter((path) => existsSync(path))
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
    .filter(({ text }) => !text.includes('\0'));

describe('the rights holder is Shyden Labs (Refs #49)', () => {
  it('no committable file names the dissolved company or its old org handle', () => {
    const files = committableText();
    expect(
      files.map(({ path }) => path),
      'positive control: the sweep reads the whole repo',
    ).toEqual(
      expect.arrayContaining([
        'NOTICE',
        'README.md',
        'CLAUDE.md',
        'package.json',
        'tests/unit/licences.test.ts',
      ]),
    );
    // Measured 115 text files at b2a6f3f (#82). Lower it only in the commit that removes files.
    expect(files.length, 'text files read').toBeGreaterThan(114);
    const naming = files
      .filter(({ text }) => DISSOLVED.test(text))
      .map(({ path }) => path);
    expect(searched(naming, { of: files, what: 'text files' })).toEqual([]);
    expect(floorBreach('licences/text-files', files.length)).toBeUndefined();
  });
});
