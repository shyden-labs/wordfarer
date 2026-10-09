import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { gitWalks, type GitWalks } from '../unit/git-walks';
import { codeWithoutLiterals } from '../unit/source-text';
import { committableFiles } from '../unit/tracked-files';

/**
 * The git-walks guard over every TypeScript file git has under tests/ and scripts/ (#385).
 * It reads the whole repository, a cost that grows with the tree, so it runs
 * in the guards suite (#515). The reader's tests on planted fixtures are unit
 * tests (tests/unit/git-walks.test.ts).
 */

/** The TypeScript the repository's tests and scripts are written in. */
/** Each file read and walked once, shared by both tests (#432: each re-walked every file). */
let walked: { path: string; text: string; walk: GitWalks }[] | undefined;

const sources = () =>
  (walked ??= committableFiles(['tests/*.ts', 'scripts/*.ts']).map((path) => {
    const text = readFileSync(path, 'utf8');
    return { path, text, walk: gitWalks(path, text) };
  }));

/**
 * A child-process call whose program is a literal, as the code spells it once
 * every literal is blanked to "" and every comment removed (codeWithoutLiterals).
 */
const PROGRAM_CALL_TEXT = /\b(?:execFileSync|spawnSync|execFile|spawn)\(\s*""/g;

describe('this repository’s git walks (#385)', () => {
  it('sees every uncommitted file: one ls-files home, every grep untracked', () => {
    const files = sources();
    const read = files.map(({ walk }) => walk);
    const calls = read.flatMap(({ calls }) => calls);
    const findings = read.flatMap(({ findings }) => findings);
    const unclassified = read.flatMap(({ unclassified }) => unclassified);
    expect(
      searched(unclassified, { of: files, what: 'source files' }),
      unclassified.join('\n'),
    ).toEqual([]);
    expect(
      searched(findings, { of: calls, what: 'git calls' }),
      findings.join('\n'),
    ).toEqual([]);
    expect(floorBreach('git-walks/files', files.length)).toBeUndefined();
    expect(floorBreach('git-walks/calls', calls.length)).toBeUndefined();
  });

  it('reads as many child-process calls in each file as its code spells', () => {
    const files = sources();
    const differ = files.flatMap(({ path, text, walk }) => {
      const code = codeWithoutLiterals(
        ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true),
      );
      const spelled = code.match(PROGRAM_CALL_TEXT)?.length ?? 0;
      const read = walk.programCalls;
      return spelled === read
        ? []
        : [
            `${path}: the code spells ${String(spelled)}, the reader read ${String(read)}`,
          ];
    });
    expect(
      searched(differ, { of: files, what: 'source files' }),
      differ.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('git-walks/cross-checked-files', files.length),
    ).toBeUndefined();
  });
});
