import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { gitWalks, WALK_HOME } from './git-walks';
import { codeWithoutLiterals } from './source-text';
import { committableFiles } from './tracked-files';

/**
 * Every git file walk in tests/ and scripts/ sees a file before it is
 * committed (#385): `git ls-files` lives only in committableFiles(), with
 * --others, and every `git grep` passes --untracked.
 */

const ELSEWHERE = 'tests/unit/elsewhere.test.ts';

describe('gitWalks', () => {
  it('passes the one walk home, which lists untracked files', () => {
    expect(
      gitWalks(
        WALK_HOME,
        `execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);`,
      ),
    ).toEqual({
      programCalls: 1,
      calls: ['line 1: git ls-files'],
      findings: [],
      unclassified: [],
    });
  });

  it('refuses git ls-files in any other file', () => {
    expect(
      gitWalks(ELSEWHERE, `execFileSync('git', ['ls-files', '--others']);`)
        .findings,
    ).toEqual([
      `${ELSEWHERE}:1: git ls-files outside ${WALK_HOME}; walk with committableFiles()`,
    ]);
  });

  it('refuses git ls-files without --others, even in its home', () => {
    expect(
      gitWalks(WALK_HOME, `execFileSync('git', ['ls-files', '-z']);`).findings,
    ).toEqual([
      `${WALK_HOME}:1: git ls-files without --others cannot see an uncommitted file`,
    ]);
  });

  it('refuses git grep without --untracked', () => {
    expect(
      gitWalks(ELSEWHERE, `spawnSync('git', ['grep', '-l', 'x']);`).findings,
    ).toEqual([
      `${ELSEWHERE}:1: git grep without --untracked cannot see an uncommitted file`,
    ]);
  });

  it('passes git grep with --untracked', () => {
    expect(
      gitWalks(ELSEWHERE, `spawnSync('git', ['grep', '--untracked', 'x']);`),
    ).toEqual({
      programCalls: 1,
      calls: ['line 1: git grep'],
      findings: [],
      unclassified: [],
    });
  });

  it('reads a call through a module namespace, child.execFileSync', () => {
    expect(
      gitWalks(ELSEWHERE, `child.execFileSync('git', ['grep', 'x']);`).findings,
    ).toEqual([
      `${ELSEWHERE}:1: git grep without --untracked cannot see an uncommitted file`,
    ]);
  });

  it('leaves a git subcommand that walks no files alone', () => {
    expect(
      gitWalks(ELSEWHERE, `spawnSync('git', ['check-ignore', '-q', 'x']);`),
    ).toEqual({
      programCalls: 1,
      calls: ['line 1: git check-ignore'],
      findings: [],
      unclassified: [],
    });
  });

  it('refuses git called with arguments it cannot read', () => {
    expect(gitWalks(ELSEWHERE, `spawnSync('git', ARGS);`).unclassified).toEqual(
      [
        `${ELSEWHERE}:1: git's arguments are not an array starting with a string`,
      ],
    );
  });

  it('refuses git called with a subcommand it cannot read', () => {
    expect(
      gitWalks(ELSEWHERE, `spawnSync('git', [sub, '-l']);`).unclassified,
    ).toEqual([
      `${ELSEWHERE}:1: git's arguments are not an array starting with a string`,
    ]);
  });

  it('follows a wrapper that passes its rest parameter to git', () => {
    expect(
      gitWalks(
        ELSEWHERE,
        [
          `const git = (...args: string[]) => execFileSync('git', args);`,
          `git('init', '-q');`,
          `git('grep', '-l', 'x');`,
        ].join('\n'),
      ),
    ).toEqual({
      programCalls: 1,
      calls: ['line 2: git init', 'line 3: git grep'],
      findings: [
        `${ELSEWHERE}:3: git grep without --untracked cannot see an uncommitted file`,
      ],
      unclassified: [],
    });
  });

  it('refuses a wrapper call whose subcommand it cannot read', () => {
    expect(
      gitWalks(
        ELSEWHERE,
        [
          `function git(...args: string[]) { return spawnSync('git', args); }`,
          `git(sub);`,
        ].join('\n'),
      ).unclassified,
    ).toEqual([
      `${ELSEWHERE}:2: git's arguments are not an array starting with a string`,
    ]);
  });

  it('is not satisfied or tripped by a comment', () => {
    expect(
      gitWalks(
        ELSEWHERE,
        `// spawnSync('git', ['grep', 'x']);\n/* execFileSync('git', ['ls-files']) */`,
      ),
    ).toEqual({ programCalls: 0, calls: [], findings: [], unclassified: [] });
  });
});

/** The TypeScript the repository's tests and scripts are written in. */
const sources = () =>
  committableFiles(['tests/*.ts', 'scripts/*.ts']).map((path) => ({
    path,
    text: readFileSync(path, 'utf8'),
  }));

/**
 * A child-process call whose program is a literal, as the code spells it once
 * every literal is blanked to "" and every comment removed (codeWithoutLiterals).
 */
const PROGRAM_CALL_TEXT = /\b(?:execFileSync|spawnSync|execFile|spawn)\(\s*""/g;

describe('this repository’s git walks (#385)', () => {
  it('sees every uncommitted file: one ls-files home, every grep untracked', () => {
    const files = sources();
    const read = files.map(({ path, text }) => gitWalks(path, text));
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
    const differ = files.flatMap(({ path, text }) => {
      const code = codeWithoutLiterals(
        ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true),
      );
      const spelled = code.match(PROGRAM_CALL_TEXT)?.length ?? 0;
      const read = gitWalks(path, text).programCalls;
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
