import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { walkDisagreements } from '../unit/burn-down';
import {
  ALLOWANCE_KEYS,
  grepCounts,
  judge,
  linesNaming,
  readText,
  walkTree,
} from '../unit/old-name';
import { committableFiles } from '../unit/tracked-files';

/**
 * The old-name walk over every file git has (#356), and the allowances it proves still cover an occurrence.
 * It reads the whole repository, a cost that grows with the tree, so it runs
 * in the guards suite (#515). The reader's tests on planted fixtures are unit
 * tests (tests/unit/old-name.test.ts).
 */

/**
 * Every file the walk finds, read and judged once, on first use inside a
 * test: nothing reaches the file system while the file is collected.
 */
let repo:
  | {
      files: string[];
      refused: string[];
      findings: string[];
      allowed: Record<string, number>;
      naming: Map<string, number>;
    }
  | undefined;

const repository = () => {
  if (repo !== undefined) return repo;
  const files = walkTree();
  const refused: string[] = [];
  const findings: string[] = [];
  const allowed: Record<string, number> = {};
  const naming = new Map<string, number>();
  for (const path of files) {
    const reading = readText(path, readFileSync(path));
    if ('refused' in reading) {
      refused.push(reading.refused);
      continue;
    }
    const verdict = judge(path, reading.text);
    findings.push(...verdict.findings);
    for (const [key, count] of Object.entries(verdict.allowed))
      allowed[key] = (allowed[key] ?? 0) + count;
    const lines = linesNaming(reading.text);
    if (lines > 0) naming.set(path, lines);
  }
  repo = { files, refused, findings, allowed, naming };
  return repo;
};

describe('the repository names the game Yawelo Idle (#356)', () => {
  it('walks every file git has, reads each, and finds the old name only where an allowance covers it', () => {
    const { files, refused, findings } = repository();
    // Control c: the walk against git's own list of the same files.
    const walk = walkDisagreements(files, committableFiles());
    expect(
      searched(walk, { of: files, what: 'walked files' }),
      walk.join('\n'),
    ).toEqual([]);
    expect(
      searched(refused, { of: files, what: 'walked files' }),
      refused.join('\n'),
    ).toEqual([]);
    expect(
      searched(findings, { of: files, what: 'walked files' }),
      findings.join('\n'),
    ).toEqual([]);
    expect(floorBreach('old-name/files', files.length)).toBeUndefined();
  });

  it('reads as many lines naming it in each file as a fixed-string grep counts', () => {
    const { files, naming } = repository();
    // Control c, per file: a grep's count of the same lines, sharing no code
    // with the reader. git grep's own count is compared with this one in
    // tests/integration/old-name.test.ts (#491).
    const grep = grepCounts(files);
    const named = [...new Set([...naming.keys(), ...grep.keys()])].sort();
    const misread = named
      .filter((path) => (naming.get(path) ?? 0) !== (grep.get(path) ?? 0))
      .map(
        (path) =>
          `${path}: grep counts ${String(grep.get(path) ?? 0)}, the reader ${String(naming.get(path) ?? 0)}`,
      );
    expect(
      searched(misread, { of: named, what: 'files naming the old name' }),
      misread.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('old-name/files-naming-it', named.length),
    ).toBeUndefined();
  });
});

describe('every allowance still covers an occurrence (#356)', () => {
  for (const key of ALLOWANCE_KEYS)
    it(`${key} covers an occurrence`, () => {
      expect(repository().allowed[key] ?? 0).toBeGreaterThan(0);
    });
});
