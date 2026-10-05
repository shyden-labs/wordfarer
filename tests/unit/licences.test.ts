import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { trackedFiles } from './tracked-files';

/**
 * The licence set promised by spec D17 is present and is the real text
 * (Refs #2).
 *
 * The repository is public. A missing or wrong licence file is a legal fact
 * about every copy already cloned, so these files are guarded like code. Each
 * check reads the file's own opening line, never a filename alone: an empty
 * file or a pasted MIT text would otherwise pass.
 */

const firstLine = (path: string) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');

describe('the licence set (D17)', () => {
  it('the code is Apache-2.0, with the canonical text', () => {
    const text = readFileSync('LICENSE', 'utf8');
    expect(firstLine('LICENSE')).toBe('Apache License');
    expect(text).toContain('Version 2.0, January 2004');
    expect(text).toContain('END OF TERMS AND CONDITIONS');
  });

  it('package.json declares the same code licence', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      license?: string;
    };
    expect(pkg.license).toBe('Apache-2.0');
  });

  it('both content licences ship as full legal code', () => {
    expect(firstLine('LICENSES/CC-BY-SA-4.0.txt')).toBe(
      'Attribution-ShareAlike 4.0 International',
    );
    expect(firstLine('LICENSES/CC-BY-NC-SA-4.0.txt')).toBe(
      'Attribution-NonCommercial-ShareAlike 4.0 International',
    );
  });

  it('the content rule names exactly the two allowed licences', () => {
    const rule = readFileSync('LICENSE-CONTENT.md', 'utf8');
    const ids = [...rule.matchAll(/`(CC-[A-Z-]+-4\.0)`/g)].map(
      (match) => match[1],
    );
    expect([...new Set(ids)].sort()).toEqual([
      'CC-BY-NC-SA-4.0',
      'CC-BY-SA-4.0',
    ]);
  });

  it('the notice and the trademark reservation are present', () => {
    expect(existsSync('NOTICE'), 'Apache-2.0 section 4(d)').toBe(true);
    expect(firstLine('NOTICE')).toBe('Yawelo Idle');
    expect(firstLine('TRADEMARKS.md')).toBe('# Trademarks');
  });
});

/**
 * The former limited company is dissolved and its GitHub org was renamed to
 * `shyden-labs` (Refs #49). GitHub redirects the old handle only until someone
 * else claims it, so an old link can come to point at a stranger's org, and a
 * notice naming a company that no longer exists names no holder at all.
 *
 * The old names are assembled from parts below so that this file, which the
 * sweep also reads, does not trip its own guard.
 */
const DISSOLVED = /shyden[\s_-]*(?:ltd|limited)\b/i;
const OLD_COMPANY = ['Shyden', 'Ltd'].join(' ');
const OLD_HANDLE = ['Shyden', 'Ltd'].join('-');

/** Every tracked text file, read from disk (a NUL byte marks binary). */
const trackedText = () =>
  trackedFiles()
    .filter((path) => existsSync(path))
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
    .filter(({ text }) => !text.includes('\0'));

describe('the rights holder is Shyden Labs (Refs #49)', () => {
  for (const name of [
    OLD_COMPANY,
    OLD_HANDLE,
    OLD_HANDLE.toLowerCase(),
    ['Shyden', 'Limited'].join(' '),
  ])
    it(`the pattern catches the old spelling ${name}`, () => {
      expect(DISSOLVED.test(`by ${name}.`), name).toBe(true);
    });

  it('the pattern leaves the new names alone', () => {
    expect(DISSOLVED.test('Shyden Labs and shyden-labs')).toBe(false);
  });

  it('no tracked file names the dissolved company or its old org handle', () => {
    const files = trackedText();
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
    expect(
      files.filter(({ text }) => DISSOLVED.test(text)).map(({ path }) => path),
    ).toEqual([]);
  });

  it('NOTICE, TRADEMARKS.md and LICENSE-CONTENT.md name Shyden Labs', () => {
    const notice = readFileSync('NOTICE', 'utf8');
    expect(notice).toContain(
      'Copyright 2026 Shyden Labs (https://shyden.co.uk)',
    );
    expect(notice).toContain('trademarks of Shyden Labs and are not licensed');

    const marks = readFileSync('TRADEMARKS.md', 'utf8');
    expect(marks).toContain('trademarks of Shyden Labs.');
    expect(marks).toContain('endorsement by Shyden Labs.');
    expect(marks).toContain('contact Shyden Labs via https://shyden.co.uk');

    const content = readFileSync('LICENSE-CONTENT.md', 'utf8');
    expect(content).toContain('Original work by Shyden Labs:');
    expect(content).toContain('**"Yawelo Idle, Shyden Labs"**');
  });
});
