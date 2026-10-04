# CI #348: Every Commit Passes CI On Its Own Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CI tests every commit a pull request brings, not only its head, so no commit lands on `develop` with a failing step and `git bisect` never stops on a red commit. A required check, `every-commit`, is green only when each commit passed `build-and-test` on its own.

**Architecture:** `.github/workflows/every-commit.yml` has three jobs. `list` runs `node scripts/every-commit.ts list <base> <head>`, which writes the commits (`git log --reverse`, merge commits included) as a matrix. `commit` calls `ci.yml` once per commit (`uses: ./.github/workflows/ci.yml`, `with: ref: <sha>`), so each entry runs `build-and-test` itself, every step in its order and its Playwright image. `every-commit` (`needs` both, `if: ${{ !cancelled() }}`) runs `node scripts/every-commit.ts verdict`, which reads the run's jobs through the API and is green only when each listed commit has exactly one job named `<label> / build-and-test` and it succeeded. `ci.yml` gains an optional `ref` input; empty keeps the event's own commit.

**Tech Stack:** GitHub Actions (reusable workflow with a matrix), Node 24 running `scripts/every-commit.ts` by type stripping with Node's own modules only, Vitest, `yaml`.

**Spec:** Story #348 and its design note (issue comment 5983234899).

## Global Constraints

- Every commit green: each stage passes every CI step alone on a clean `npm ci` (global rule, 2026-10-04).
- Actions pinned to full SHAs with version comments, the same SHAs `ci.yml` uses (`supply-chain.test.ts`).
- Every job that runs steps has a `timeout-minutes` within `workflow-timeouts.test.ts`'s 30; a job calling a reusable workflow may not set one, and the called job's 20 applies.
- No retries. Anything the verdict cannot match or parse is red, by name.
- No event text reaches a `run:` line: commit subjects go only into a job `name:` and into `COMMITS` through `env:`, and every SHA passed to `ref:` is checked as 40 lower-case hex by `list` and again by `verdict`.
- One test per case (`it.each` for populations); tests first, seen red; every guard mutation-verified with predictions written before the run.
- `Refs #348` in commits and the PR; commits authored as Shyden.

## Review Focus

1. **The matrix calls `build-and-test`, it does not copy it (AC1, AC6).** A copied step list would need a guard to keep it in step; a call cannot drift. The guard pins that the matrix calls `ci.yml` at the entry's commit and that `ci.yml` holds exactly the job the verdict names (`CALLED_JOB`).
2. **The verdict reads jobs, not `needs.commit.result` alone (AC3).** GitHub's docs: a matrix of reusable-workflow calls returns only "the output set by the last successful completing reusable workflow", so the aggregate result cannot name a red commit. The verdict lists the run's jobs (`filter=latest`, paged) and matches `<label> / build-and-test`, the name measured on deploy-dev's run 37225177365 (`test / build-and-test`). A commit with no job, two jobs, a stray matrix-shaped job, an unfinished job, or a matrix result that disagrees with green jobs is red.
3. **The list fails closed (AC5).** No commits, more than GitHub's 256 matrix jobs ("A matrix will generate a maximum of 256 jobs per workflow run"), or two commits with one label: `list` fails by name, `commit` is skipped, and `every-commit` is red, never green on part of the list.
4. **The pacing artifact is named per commit.** One run may hold an artifact name once, and each matrix call uploads one, so a called run names it `pacing-report-<sha>`; pull requests and deploy-dev keep `pacing-report`.
5. **AC4 is the operator's.** The `wordfarer-agent` App holds `administration: read` only, by design, so it cannot require the check; and the check can only be required after this merges, or open pull requests would wait for a check their branches cannot produce.

## Decisions this plan makes

- **A label** is `<short SHA> <subject>`, cut to 72 graphemes (a git subject line's length) with an ellipsis; `%h` keeps short SHAs unique in the repository.
- **The matrix limit** is GitHub's own, 256 (`MATRIX_LIMIT`), not a lower number of ours.
- **The verdict's checkout** is the pull request's head, so the workflow and the script it runs come from one commit.
- **The list's range** is `base.sha..head.sha` from the event, so a branch that merged `develop` lists its merge commits too.

## Acceptance criteria → tasks (#348)

| AC  | What                                                                                                      | Task     | Proved by                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | each commit the PR brings runs every `build-and-test` step on its own, head included                      | 1, 2     | `every-commit.test.ts` "parseLog"; `every-commit-ci.test.ts` "lists the commits between the pull request’s base and head", "calls ci.yml at the entry’s commit", "calls build-and-test itself"; the live runs |
| 2   | a matrix, one job per commit, named by short SHA and subject; timeouts                                    | 1, 2     | "runs one entry per listed commit, and lets every entry finish", "names each entry by its commit"; "label"; "the jobs that run steps stop within minutes"                                                     |
| 3   | `every-commit` aggregate: `needs`, `!cancelled()`, green only when all green, names each non-green commit | 1, 2     | "verdict"; "needs the list and the matrix, and runs unless the run is cancelled", "judges with the verdict script"                                                                                            |
| 4   | `every-commit` required on `develop`, read back                                                           | operator | issue comment 5983234899 (the App's manifest: `administration: read`)                                                                                                                                         |
| 5   | a list above the matrix limit fails by name                                                               | 1        | "refuses a list one past the matrix limit by name, testing none of it (AC5)"                                                                                                                                  |
| 6   | a parsed-YAML guard, mutation-verified, a command left as a comment in one mutation                       | 2        | `every-commit-ci.test.ts`; mutations W1 (the verdict command left as a comment), W2-W6 and W8-W12                                                                                                             |
| 7   | live: three commits, the middle one red                                                                   | live     | the Live proofs section below: runs 37227057161 and 37227056948                                                                                                                                               |
| 8   | SHA-pinned actions covered by Dependabot                                                                  | 2        | `supply-chain.test.ts`                                                                                                                                                                                        |

## How this plan was reviewed

Every code block below is generated from this branch's stage commits, and a checker re-reads each one against its source after Prettier, with the AC table's test titles, mutation ids and paths, and planted errors of each kind to prove it catches them. Each stage was gated alone on a clean `npm ci` (every CI step), each task's tests were run red first, and the mutation table is generated from each mutation's saved log. The tools (`gen.py`, `check.py`, `tables.py`, `mutate.py`, `gate-stages.sh`) live in the git-ignored `.superpowers/sdd/m1-348/`.

| Pass | Findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 2026-10-04 19:17. Mechanical: 6 blocks match their stage commits after Prettier; 12 AC-table titles, every cited mutation id and path exist; five planted errors (a title, a mutation id, a path, a placeholder, an edited block) each caught. Read in full, five findings: (1) Task 1's red note claimed `parseCommits` was proved by mutations when none reached it, so P1-P3 were written, predicted and run (all CAUGHT as predicted); (2) the gate step named a git-ignored script, now it names CI's steps; (3) the AC6 row's "W1 to W12" implied a W7 that does not exist; (4) the AC7 row still said "after push"; (5) the review paragraph named tools without saying where they live. All fixed in the generator's sources. |
| 2    | 2026-10-04 19:20. Mechanical checks re-run on the regenerated plan: 6 blocks match, 12 titles, 36 mutation rows, every id and path exist, no placeholder. Read in full: the five pass-1 fixes read correctly. One finding: the mutation paragraph said every row reads CAUGHT as predicted and then that S23's first run did not; it now says each row's last run.                                                                                                                                                                                                                                                                                                                                                                    |
| 3    | 2026-10-04 19:20. Mechanical checks clean; a whitespace-blind diff showed only pass 2's two intended changes. Read in full, the 36 mutation rows included. One finding: the ids skip S6 and W7 with no word why; the paragraph now says both were dropped before any run, and that W7's case rests on an assertion, not a run.                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4    | 2026-10-04 19:20. Mechanical checks clean (6 blocks, 12 titles, 36 mutation rows, ids, paths, no placeholder); a whitespace-blind diff showed only pass 3's two intended changes, and the new sentence reads correctly. No findings: the plan is approved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

---

### Task 1: The commit list and the verdict

**Files:**

- Create: `scripts/every-commit.ts`, `tests/unit/every-commit.test.ts`

**Interfaces:**

- Produces: `MATRIX_LIMIT`, `LABEL_MAX`, `CALLED_JOB`, `Commit`, `Job`, `label`, `jobName`, `parseLog`, `listCommits`, `parseCommits`, `parseJobs`, `verdict`; the CLI `list <base> <head>` and `verdict`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/every-commit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CALLED_JOB,
  LABEL_MAX,
  MATRIX_LIMIT,
  jobName,
  label,
  listCommits,
  parseCommits,
  parseJobs,
  parseLog,
  verdict,
  type Commit,
  type Job,
} from '../../scripts/every-commit';

/**
 * Every commit a pull request brings passes CI on its own (#348). The
 * workflow lists the commits, runs build-and-test once per commit as a matrix
 * of calls to ci.yml, and an aggregate job judges the matrix by reading the
 * run's own jobs. These tests pin the two pure halves: the list (AC1, AC2,
 * AC5) and the verdict (AC3).
 */

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);
const line = (sha: string, short: string, subject: string) =>
  `${sha}\t${short}\t${subject}`;

const A: Commit = { sha: SHA_A, label: 'aaaaaaa first' };
const B: Commit = { sha: SHA_B, label: 'bbbbbbb second' };
const C: Commit = { sha: SHA_C, label: 'ccccccc third' };
const done = (name: string, conclusion: string): Job => ({
  name,
  status: 'completed',
  conclusion,
});
const green = (commit: Commit) => done(jobName(commit), 'success');
const judged = (over: Partial<Parameters<typeof verdict>[0]> = {}) =>
  verdict({
    listResult: 'success',
    commitResult: 'success',
    commits: [A, B, C],
    jobs: [green(A), green(B), green(C)],
    ...over,
  });

describe('the limits', () => {
  it('pins the matrix limit at GitHub’s 256 jobs per workflow run', () => {
    expect(MATRIX_LIMIT).toBe(256);
  });

  it('pins a label at 72 characters, a git subject line’s length', () => {
    expect(LABEL_MAX).toBe(72);
  });

  it('names the called job as ci.yml does', () => {
    expect(CALLED_JOB).toBe('build-and-test');
  });
});

describe('label', () => {
  it('is the short SHA, a space and the subject', () => {
    expect(label('abc1234', 'feat: a thing')).toBe('abc1234 feat: a thing');
  });

  it('keeps a label of exactly the limit whole', () => {
    const subject = 's'.repeat(LABEL_MAX - 'abc1234 '.length);
    expect(label('abc1234', subject)).toBe(`abc1234 ${subject}`);
    expect(label('abc1234', subject)).toHaveLength(LABEL_MAX);
  });

  it('cuts a label one past the limit to the limit, ending in an ellipsis', () => {
    const subject = 's'.repeat(LABEL_MAX - 'abc1234 '.length + 1);
    const cut = label('abc1234', subject);
    expect(cut).toHaveLength(LABEL_MAX);
    expect(cut).toBe(`abc1234 ${'s'.repeat(LABEL_MAX - 9)}…`);
  });

  it('keeps the short SHA whole however long the subject is', () => {
    expect(label('abc1234', 'x'.repeat(500)).startsWith('abc1234 ')).toBe(true);
  });

  it('cuts by character, never between the halves of an emoji', () => {
    expect(label('abc1234', '😀'.repeat(100))).toBe(
      `abc1234 ${'😀'.repeat(LABEL_MAX - 9)}…`,
    );
  });

  it('cuts by what a reader sees as one character, never inside a joined emoji', () => {
    const family = '👩‍👩‍👧';
    expect(label('abc1234', family.repeat(100))).toBe(
      `abc1234 ${family.repeat(LABEL_MAX - 9)}…`,
    );
  });

  it('drops trailing space left at the cut, so the ellipsis follows a word', () => {
    const subject = `${'w'.repeat(LABEL_MAX - 'abc1234 '.length - 2)} tail`;
    expect(label('abc1234', subject)).toBe(
      `abc1234 ${'w'.repeat(LABEL_MAX - 10)}…`,
    );
  });
});

describe('parseLog', () => {
  it('reads one commit per line of git log --format=%H%x09%h%x09%s', () => {
    expect(
      parseLog(
        `${line(SHA_A, 'aaaaaaa', 'first')}\n${line(SHA_B, 'bbbbbbb', 'second')}\n`,
      ),
    ).toEqual([A, B]);
  });

  it('keeps a tab inside a subject as part of the subject', () => {
    expect(parseLog(line(SHA_A, 'aaaaaaa', 'a\tb'))).toEqual([
      { sha: SHA_A, label: 'aaaaaaa a\tb' },
    ]);
  });

  it('reads an empty subject as an empty subject', () => {
    expect(parseLog(line(SHA_A, 'aaaaaaa', ''))).toEqual([
      { sha: SHA_A, label: 'aaaaaaa ' },
    ]);
  });

  it('reads no output as no commits', () => {
    expect(parseLog('')).toEqual([]);
  });

  it.each([
    ['a line with no tab', 'just text'],
    ['a line with no subject field', `${SHA_A}\taaaaaaa`],
    ['a SHA that is not 40 hex', line('abc', 'abc', 'x')],
    ['an upper-case SHA', line('A'.repeat(40), 'AAAAAAA', 'x')],
    [
      'a short SHA that is not a prefix of the SHA',
      line(SHA_A, 'bbbbbbb', 'x'),
    ],
    ['a short SHA under 7 characters', line(SHA_A, 'aaaa', 'x')],
  ])('refuses %s by name rather than skipping it', (_what, text) => {
    expect(() => parseLog(text)).toThrow(/^git log line 1 is not/);
  });
});

describe('listCommits', () => {
  const commits = (n: number): Commit[] =>
    Array.from({ length: n }, (_, i) => {
      const sha = i.toString(16).padStart(40, '0');
      return { sha, label: `${sha.slice(-7)} commit ${String(i)}` };
    });

  it('passes a list in order, untouched', () => {
    expect(listCommits([A, B, C])).toEqual({
      commits: [A, B, C],
      problems: [],
    });
  });

  it('passes a list of exactly the matrix limit', () => {
    expect(listCommits(commits(MATRIX_LIMIT)).problems).toEqual([]);
  });

  it('refuses a list one past the matrix limit by name, testing none of it (AC5)', () => {
    expect(listCommits(commits(MATRIX_LIMIT + 1))).toEqual({
      commits: [],
      problems: [
        `the pull request brings 257 commits, above the matrix limit of ${String(MATRIX_LIMIT)}: none were tested, so none is called green`,
      ],
    });
  });

  it('refuses an empty list, since a pull request always brings a commit', () => {
    expect(listCommits([])).toEqual({
      commits: [],
      problems: ['the pull request brings no commits: nothing to test'],
    });
  });

  it('refuses two commits with one label, which no verdict could tell apart', () => {
    expect(listCommits([A, { sha: SHA_B, label: A.label }])).toEqual({
      commits: [],
      problems: [`two commits carry the label "${A.label}"`],
    });
  });
});

describe('parseCommits', () => {
  it('reads back what the list job wrote, unchanged', () => {
    expect(parseCommits(JSON.stringify([A, B, C]))).toEqual([A, B, C]);
  });

  it('reads no output, from a list job that failed, as no commits', () => {
    expect(parseCommits('')).toEqual([]);
  });

  it.each([
    ['text that is not JSON', 'nope'],
    ['an object, not a list', '{}'],
    ['an entry with no label', JSON.stringify([{ sha: SHA_A }])],
    [
      'an entry whose SHA is not 40 hex',
      JSON.stringify([{ sha: 'abc', label: 'x' }]),
    ],
    ['an entry that is a string', JSON.stringify(['x'])],
  ])('refuses %s by name', (_what, text) => {
    expect(() => parseCommits(text)).toThrow(/^the commit list is not/);
  });
});

describe('parseJobs', () => {
  it('reads one job per line of gh api --jq output', () => {
    expect(
      parseJobs(
        '{"name":"x / build-and-test","status":"completed","conclusion":"success"}\n{"name":"list","status":"in_progress","conclusion":null}\n',
      ),
    ).toEqual([
      done('x / build-and-test', 'success'),
      { name: 'list', status: 'in_progress', conclusion: null },
    ]);
  });

  it.each([
    ['a line that is not JSON', 'nope'],
    ['a job with no name', '{"status":"completed","conclusion":"success"}'],
    ['a job with no status', '{"name":"x","conclusion":"success"}'],
    [
      'a conclusion that is a number',
      '{"name":"x","status":"completed","conclusion":1}',
    ],
  ])('refuses %s by name', (_what, text) => {
    expect(() => parseJobs(text)).toThrow(/^job line 1 is not/);
  });
});

describe('verdict', () => {
  it('is green when every commit’s job succeeded, and says how many it judged', () => {
    expect(judged()).toEqual({
      problems: [],
      summary: '3 of 3 commits green',
    });
  });

  it('names the matrix job as GitHub does: the caller’s name, then the called job', () => {
    expect(jobName(A)).toBe('aaaaaaa first / build-and-test');
  });

  it.each(['failure', 'cancelled', 'skipped', 'timed_out', 'neutral'])(
    'names a commit whose job concluded %s',
    (conclusion) => {
      expect(
        judged({
          commitResult: 'failure',
          jobs: [green(A), done(jobName(B), conclusion), green(C)],
        }).problems,
      ).toEqual([`${B.label}: ${conclusion}`]);
    },
  );

  it('names every commit that is not green, not only the first', () => {
    expect(
      judged({
        commitResult: 'failure',
        jobs: [
          done(jobName(A), 'failure'),
          green(B),
          done(jobName(C), 'cancelled'),
        ],
      }).problems,
    ).toEqual([`${A.label}: failure`, `${C.label}: cancelled`]);
  });

  it('names a commit whose job has not finished', () => {
    expect(
      judged({
        jobs: [
          green(A),
          { name: jobName(B), status: 'in_progress', conclusion: null },
          green(C),
        ],
      }).problems,
    ).toEqual([`${B.label}: in_progress`]);
  });

  it('names a commit with no job, so a renamed job cannot pass unseen', () => {
    expect(judged({ jobs: [green(A), green(C)] }).problems).toEqual([
      `${B.label}: no job named "${jobName(B)}" ran`,
    ]);
  });

  it('names a commit with two jobs of its name', () => {
    expect(
      judged({ jobs: [green(A), green(B), green(B), green(C)] }).problems,
    ).toEqual([`${B.label}: 2 jobs carry its name`]);
  });

  it('names a matrix-shaped job that belongs to no listed commit', () => {
    expect(
      judged({
        jobs: [
          green(A),
          green(B),
          green(C),
          done('zzz / build-and-test', 'success'),
        ],
      }).problems,
    ).toEqual(['job "zzz / build-and-test" belongs to no listed commit']);
  });

  it('ignores the run’s other jobs', () => {
    expect(
      judged({
        jobs: [
          done('list', 'success'),
          green(A),
          green(B),
          green(C),
          { name: 'every-commit', status: 'in_progress', conclusion: null },
        ],
      }).problems,
    ).toEqual([]);
  });

  it.each(['failure', 'cancelled', 'skipped'])(
    'is red when the list job’s result is %s, naming it',
    (result) => {
      expect(judged({ listResult: result, commits: [], jobs: [] })).toEqual({
        problems: [`the commit list was not made: list ${result}`],
        summary: '0 of 0 commits green',
      });
    },
  );

  it('is red on an empty list even when the list job succeeded', () => {
    expect(judged({ commits: [], jobs: [] }).problems).toEqual([
      'the commit list is empty: nothing was judged',
    ]);
  });

  it('is red when the matrix result disagrees with green jobs', () => {
    expect(judged({ commitResult: 'skipped' }).problems).toEqual([
      'every listed commit’s job succeeded, but the matrix result is skipped',
    ]);
  });

  it('counts only the green commits in its summary', () => {
    expect(
      judged({
        commitResult: 'failure',
        jobs: [green(A), done(jobName(B), 'failure'), green(C)],
      }).summary,
    ).toBe('2 of 3 commits green');
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/unit/every-commit.test.ts`

Seen red against a stub whose every export throws: 47 of 47 failed, 26 on the stub's throw and the rest on wrong constants or the wrong refusal. `parseCommits`'s tests and the no-subject case were written with their code, after that red run, so mutations stand in for their red: S10 (the no-subject check) and P1-P3 (`parseCommits`). The joined-emoji case was seen red against the code-point cut before the grapheme cut replaced it.

- [ ] **Step 3: Write the implementation**

`scripts/every-commit.ts`:

```ts
/**
 * Every commit a pull request brings passes CI on its own (#348).
 *
 * GitHub runs `build-and-test` once per pull request, on its head, and a
 * merge keeps every commit of the branch in develop's history. The
 * every-commit workflow closes that gap in three jobs:
 *
 * 1. `list` runs `node scripts/every-commit.ts list <base> <head>`, which
 *    writes the commits as a matrix, oldest first, merge commits included.
 * 2. `commit` calls ci.yml once per listed commit, checked out alone. Each
 *    call's job is named `<label> / build-and-test`, the label being the
 *    commit's short SHA and subject, so a red commit is named in the checks.
 * 3. `every-commit` runs `node scripts/every-commit.ts verdict`, which reads
 *    the run's own jobs and is green only when each listed commit has exactly
 *    one job of its name and that job succeeded.
 *
 * The verdict reads the jobs rather than `needs.commit.result` alone because
 * a matrix of reusable-workflow calls reports one result for the lot, and a
 * red commit must be named. Anything it cannot match or classify is red:
 * a commit with no job, two jobs of one name, a matrix-shaped job that
 * belongs to no commit, a line it cannot parse.
 *
 * Nothing is retried. Imports are Node's own, so the jobs run this with
 * `node` alone, no `npm ci`.
 */
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** GitHub's limit: a matrix generates at most 256 jobs per workflow run. */
export const MATRIX_LIMIT = 256;

/** A label's length, a git subject line's conventional 72 characters. */
export const LABEL_MAX = 72;

/** The job ci.yml defines, which each matrix call runs. */
export const CALLED_JOB = 'build-and-test';

export interface Commit {
  sha: string;
  label: string;
}

export interface Job {
  name: string;
  status: string;
  conclusion: string | null;
}

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * `<short> <subject>`, cut to LABEL_MAX characters with an ellipsis. A
 * character is what a reader sees as one (a grapheme), so the cut never
 * splits a joined emoji or a letter from its accent.
 */
export function label(short: string, subject: string): string {
  const whole = Array.from(
    graphemes.segment(`${short} ${subject}`),
    ({ segment }) => segment,
  );
  if (whole.length <= LABEL_MAX) return whole.join('');
  return `${whole
    .slice(0, LABEL_MAX - 1)
    .join('')
    .trimEnd()}…`;
}

/** The name GitHub gives a called job: the caller's name, then its own. */
export function jobName(commit: Commit): string {
  return `${commit.label} / ${CALLED_JOB}`;
}

const SHA = /^[0-9a-f]{40}$/;

/** Reads `git log --format=%H%x09%h%x09%s` output, one commit per line. */
export function parseLog(text: string): Commit[] {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map((text, i) => {
    const [sha = '', short = '', ...subject] = text.split('\t');
    const where = `git log line ${String(i + 1)} is not`;
    if (subject.length === 0)
      throw new Error(`${where} <sha>\\t<short>\\t<subject>: ${text}`);
    if (!SHA.test(sha))
      throw new Error(`${where} a 40-hex lower-case SHA: ${sha}`);
    if (short.length < 7 || !sha.startsWith(short))
      throw new Error(`${where} a short SHA of ${sha}: ${short}`);
    return { sha, label: label(short, subject.join('\t')) };
  });
}

/** The matrix, or the problems that stop any of it being tested. */
export function listCommits(commits: Commit[]): {
  commits: Commit[];
  problems: string[];
} {
  if (commits.length === 0)
    return {
      commits: [],
      problems: ['the pull request brings no commits: nothing to test'],
    };
  if (commits.length > MATRIX_LIMIT)
    return {
      commits: [],
      problems: [
        `the pull request brings ${String(commits.length)} commits, above the matrix limit of ${String(MATRIX_LIMIT)}: none were tested, so none is called green`,
      ],
    };
  const seen = new Set<string>();
  const twice = commits.filter(({ label }) => {
    if (seen.has(label)) return true;
    seen.add(label);
    return false;
  });
  if (twice.length > 0)
    return {
      commits: [],
      problems: twice.map(
        ({ label }) => `two commits carry the label "${label}"`,
      ),
    };
  return { commits, problems: [] };
}

/** Reads the list job's `commits` output; a failed list wrote none. */
export function parseCommits(text: string): Commit[] {
  if (text === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`the commit list is not JSON: ${text}`);
  }
  if (!Array.isArray(parsed))
    throw new Error(`the commit list is not a list: ${text}`);
  return parsed.map((entry: unknown, i) => {
    const { sha, label } = (
      typeof entry === 'object' && entry !== null ? entry : {}
    ) as Record<string, unknown>;
    if (typeof sha !== 'string' || !SHA.test(sha) || typeof label !== 'string')
      throw new Error(
        `the commit list is not {sha, label} at entry ${String(i + 1)}: ${JSON.stringify(entry)}`,
      );
    return { sha, label };
  });
}

/** Reads `gh api --jq '.jobs[]'` output, one JSON job per line. */
export function parseJobs(text: string): Job[] {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line, i) => {
      const where = `job line ${String(i + 1)} is not`;
      let job: unknown;
      try {
        job = JSON.parse(line);
      } catch {
        throw new Error(`${where} JSON: ${line}`);
      }
      const { name, status, conclusion } = (job ?? {}) as Record<
        string,
        unknown
      >;
      if (
        typeof name !== 'string' ||
        typeof status !== 'string' ||
        !(typeof conclusion === 'string' || conclusion === null)
      )
        throw new Error(
          `${where} a job with a name, a status and a conclusion: ${line}`,
        );
      return { name, status, conclusion };
    });
}

/** Green only when every listed commit has one job of its name, succeeded. */
export function verdict(input: {
  listResult: string;
  commitResult: string;
  commits: Commit[];
  jobs: Job[];
}): { problems: string[]; summary: string } {
  const { listResult, commitResult, commits, jobs } = input;
  const total = String(commits.length);
  if (listResult !== 'success')
    return {
      problems: [`the commit list was not made: list ${listResult}`],
      summary: `0 of ${total} commits green`,
    };
  if (commits.length === 0)
    return {
      problems: ['the commit list is empty: nothing was judged'],
      summary: '0 of 0 commits green',
    };
  const names = new Set(commits.map(jobName));
  const problems: string[] = [];
  let greens = 0;
  for (const commit of commits) {
    const mine = jobs.filter((job) => job.name === jobName(commit));
    const [job] = mine;
    if (job === undefined)
      problems.push(`${commit.label}: no job named "${jobName(commit)}" ran`);
    else if (mine.length > 1)
      problems.push(
        `${commit.label}: ${String(mine.length)} jobs carry its name`,
      );
    else if (job.status !== 'completed')
      problems.push(`${commit.label}: ${job.status}`);
    else if (job.conclusion !== 'success')
      problems.push(`${commit.label}: ${job.conclusion ?? 'no conclusion'}`);
    else greens += 1;
  }
  for (const job of jobs)
    if (job.name.endsWith(` / ${CALLED_JOB}`) && !names.has(job.name))
      problems.push(`job "${job.name}" belongs to no listed commit`);
  if (problems.length === 0 && commitResult !== 'success')
    problems.push(
      `every listed commit’s job succeeded, but the matrix result is ${commitResult}`,
    );
  return { problems, summary: `${String(greens)} of ${total} commits green` };
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '')
    throw new Error(`${name} is not set`);
  return value;
}

function fail(problems: string[]): never {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}

function list(base: string, head: string): void {
  const log = execFileSync(
    'git',
    ['log', '--reverse', '--format=%H%x09%h%x09%s', `${base}..${head}`],
    { encoding: 'utf8' },
  );
  const { commits, problems } = listCommits(parseLog(log));
  if (problems.length > 0) fail(problems);
  for (const commit of commits) console.log(`${commit.sha} ${commit.label}`);
  appendFileSync(
    required('GITHUB_OUTPUT'),
    `commits=${JSON.stringify(commits)}\n`,
  );
}

function verdictFromRun(): void {
  const listResult = required('LIST_RESULT');
  const commits = parseCommits(process.env['COMMITS'] ?? '');
  const jobs = parseJobs(
    execFileSync(
      'gh',
      [
        'api',
        '--paginate',
        `repos/${required('GITHUB_REPOSITORY')}/actions/runs/${required('GITHUB_RUN_ID')}/jobs?filter=latest&per_page=100`,
        '--jq',
        '.jobs[] | {name, status, conclusion}',
      ],
      { encoding: 'utf8' },
    ),
  );
  const { problems, summary } = verdict({
    listResult,
    commitResult: required('COMMIT_RESULT'),
    commits,
    jobs,
  });
  console.log(summary);
  if (problems.length > 0) fail(problems);
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'list' && args.length === 2)
    list(args[0] ?? '', args[1] ?? '');
  else if (command === 'verdict' && args.length === 0) verdictFromRun();
  else fail(['usage: every-commit.ts list <base> <head> | verdict']);
}
```

- [ ] **Step 4: Run it green, gate the stage alone, commit**

Run: `npx vitest run tests/unit/every-commit.test.ts`, then every CI step, in `ci.yml`'s order (format, lint, typecheck, unit, pacing, worker, engines, build), on this stage alone after a clean `npm ci`. Commit: `feat(ci): every-commit lists a pull request's commits and judges each one's job (Refs #348)`.

### Task 2: The workflow and its guard

**Files:**

- Create: `.github/workflows/every-commit.yml`, `tests/unit/every-commit-ci.test.ts`
- Modify: `.github/workflows/ci.yml`, `tests/unit/pacing-ci.test.ts`

**Interfaces:**

- Consumes: `CALLED_JOB` from Task 1. Produces: the `every-commit` check and `ci.yml`'s `ref` input.

- [ ] **Step 1: Write the failing guard**

`tests/unit/every-commit-ci.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { CALLED_JOB } from '../../scripts/every-commit';

/**
 * Every commit a pull request brings passes CI on its own (#348 AC1-AC3,
 * AC6). The workflows are read as parsed YAML, so a comment naming a command
 * cannot stand in for a step.
 *
 * The matrix does not copy build-and-test's steps: each entry CALLS ci.yml,
 * checked out at its commit, so it runs every step build-and-test runs, in
 * its order and its Playwright image, by construction. What is guarded here
 * is that the call stays a call to that job, at that commit, and that the
 * aggregate judges every entry.
 */

interface Step {
  id?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

interface Job {
  name?: string;
  needs?: string | string[];
  if?: string;
  uses?: string;
  with?: Record<string, unknown>;
  strategy?: { 'fail-fast'?: boolean; matrix?: Record<string, unknown> };
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  'timeout-minutes'?: number;
  steps?: Step[];
}

interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

const read = (file: string) =>
  parse(readFileSync(`.github/workflows/${file}`, 'utf8')) as Workflow;
const every = () => read('every-commit.yml');
const ci = () => read('ci.yml');
const job = (id: string): Job => every().jobs[id] ?? {};
const stepRunning = (steps: Step[] | undefined, command: string) =>
  (steps ?? []).filter((s) => (s.run ?? '').trim() === command);
const usesOf = (steps: Step[] | undefined, action: string) =>
  (steps ?? []).filter((s) => (s.uses ?? '').startsWith(`${action}@`));

describe('the every-commit workflow (#348)', () => {
  it('runs on every pull request, and on nothing else (AC1)', () => {
    expect(Object.keys(every().on)).toEqual(['pull_request']);
  });

  it('holds exactly the list, the matrix and the aggregate', () => {
    expect(Object.keys(every().jobs)).toEqual([
      'list',
      'commit',
      'every-commit',
    ]);
  });

  it('grants the workflow read access to contents and nothing more', () => {
    expect(every().permissions).toEqual({ contents: 'read' });
  });
});

describe('the list job (AC1, AC5)', () => {
  it('checks out the pull request’s head with its whole history', () => {
    const [checkout, ...more] = usesOf(job('list').steps, 'actions/checkout');
    expect(more).toEqual([]);
    expect(checkout?.with).toEqual({
      'fetch-depth': 0,
      ref: '${{ github.event.pull_request.head.sha }}',
    });
  });

  it('lists the commits between the pull request’s base and head', () => {
    const [list, ...more] = stepRunning(
      job('list').steps,
      'node scripts/every-commit.ts list "$BASE_SHA" "$HEAD_SHA"',
    );
    expect(more).toEqual([]);
    expect(list?.id).toBe('list');
    expect(list?.env).toEqual({
      BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    });
  });

  it('hands the list on as its commits output', () => {
    expect(job('list').outputs).toEqual({
      commits: '${{ steps.list.outputs.commits }}',
    });
  });

  it('runs Node from .nvmrc, with no npm ci', () => {
    const [node] = usesOf(job('list').steps, 'actions/setup-node');
    expect(node?.with).toEqual({ 'node-version-file': '.nvmrc' });
    expect(
      (job('list').steps ?? []).filter((s) => /\bnpm\b/.test(s.run ?? '')),
    ).toEqual([]);
  });
});

describe('the matrix job (AC1, AC2)', () => {
  it('needs the list', () => {
    expect(job('commit').needs).toBe('list');
  });

  it('runs one entry per listed commit, and lets every entry finish', () => {
    expect(job('commit').strategy).toEqual({
      'fail-fast': false,
      matrix: { commit: '${{ fromJSON(needs.list.outputs.commits) }}' },
    });
  });

  it('names each entry by its commit, so a red commit is named in the checks', () => {
    expect(job('commit').name).toBe('${{ matrix.commit.label }}');
  });

  it('calls ci.yml at the entry’s commit', () => {
    expect(job('commit').uses).toBe('./.github/workflows/ci.yml');
    expect(job('commit').with).toEqual({ ref: '${{ matrix.commit.sha }}' });
  });

  it('calls build-and-test itself: ci.yml holds that one job, the one the verdict names', () => {
    expect(Object.keys(ci().jobs)).toEqual([CALLED_JOB]);
  });

  it('passes ci.yml no more than read access to contents', () => {
    expect(job('commit').permissions).toEqual({ contents: 'read' });
  });
});

describe('ci.yml checks out the commit it is called with (AC1)', () => {
  it('takes an optional ref, empty unless a caller passes one', () => {
    const call = ci().on['workflow_call'] as {
      inputs?: Record<string, unknown>;
    };
    expect(call.inputs).toEqual({
      ref: {
        description: expect.any(String) as unknown,
        type: 'string',
        required: false,
        default: '',
      },
    });
  });

  it('checks out that ref, the event’s own commit when it is empty', () => {
    const [checkout, ...more] = usesOf(
      ci().jobs[CALLED_JOB]?.steps,
      'actions/checkout',
    );
    expect(more).toEqual([]);
    expect(checkout?.with).toEqual({ ref: '${{ inputs.ref }}' });
  });

  it('still runs on every pull request and for deploy-dev', () => {
    expect(Object.keys(ci().on)).toEqual(['pull_request', 'workflow_call']);
  });
});

describe('the aggregate job (AC3)', () => {
  it('is named every-commit, a stable name a required check can hold', () => {
    // A job with no `name` is listed under its id; a missing job also has
    // no name, so its presence is asserted first.
    expect(Object.keys(every().jobs)).toContain('every-commit');
    expect(job('every-commit').name).toBeUndefined();
  });

  it('needs the list and the matrix, and runs unless the run is cancelled', () => {
    expect(job('every-commit').needs).toEqual(['list', 'commit']);
    expect(job('every-commit').if).toBe('${{ !cancelled() }}');
  });

  it('judges with the verdict script, given the list, both results and a token', () => {
    const [verdict, ...more] = stepRunning(
      job('every-commit').steps,
      'node scripts/every-commit.ts verdict',
    );
    expect(more).toEqual([]);
    expect(verdict?.env).toEqual({
      COMMITS: '${{ needs.list.outputs.commits }}',
      LIST_RESULT: '${{ needs.list.result }}',
      COMMIT_RESULT: '${{ needs.commit.result }}',
      GH_TOKEN: '${{ github.token }}',
    });
  });

  it('may read the run’s jobs, and nothing it does not need', () => {
    expect(job('every-commit').permissions).toEqual({
      actions: 'read',
      contents: 'read',
    });
  });

  it('checks out the script without the pull request’s merge, at the head', () => {
    const [checkout] = usesOf(job('every-commit').steps, 'actions/checkout');
    expect(checkout?.with).toEqual({
      ref: '${{ github.event.pull_request.head.sha }}',
    });
  });
});

describe('the jobs that run steps stop within minutes (AC2)', () => {
  it('the list job', () => {
    expect(job('list')['timeout-minutes']).toBe(5);
  });

  it('the aggregate job', () => {
    expect(job('every-commit')['timeout-minutes']).toBe(5);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/unit/every-commit-ci.test.ts tests/unit/pacing-ci.test.ts`

Seen red on Task 1's tree: 22 of 27 failed (the workflow missing, `ci.yml` without its input, the old artifact name). One of the five passes was vacuous, "is named every-commit" passing for a missing job, so it now asserts the job exists first.

- [ ] **Step 3: Name the pacing artifact per commit in its guard (whole file at this stage)**

`tests/unit/pacing-ci.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import pacing from '../../vitest.pacing.config';

/**
 * The pacing suite stays wired (#35 AC4, AC6, AC7). A CI step removed, its
 * time limit dropped or its report no longer uploaded would let the pacing
 * checks pass by not running; this suite fails instead. The workflow is read
 * as parsed YAML, so a comment naming a command cannot stand in for a step.
 */

interface Step {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  'timeout-minutes'?: number;
  with?: Record<string, unknown>;
}

const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  jobs: Record<string, { steps: Step[] }>;
};
const steps = ci.jobs['build-and-test']?.steps ?? [];
const runs = (command: string): number[] =>
  steps.flatMap((s, i) => ((s.run ?? '').trim() === command ? [i] : []));

describe('the pacing suite in CI (#35)', () => {
  it('runs as its own step, once, after the unit tests (AC4)', () => {
    const unit = runs('npm run test:unit');
    const suite = runs('npm run test:pacing');
    expect(unit, 'test:unit step').toHaveLength(1);
    expect(suite, 'test:pacing step').toHaveLength(1);
    expect(suite[0]).toBeGreaterThan(unit[0] ?? Infinity);
  });

  it('holds the step to 5 minutes on the runner (AC7)', () => {
    const [at] = runs('npm run test:pacing');
    expect(steps[at ?? -1]?.['timeout-minutes']).toBe(5);
  });

  it('uploads pacing-report.json after it, even when the suite fails, and fails when the file is missing (AC6)', () => {
    const [suite] = runs('npm run test:pacing');
    const uploads = steps.flatMap((s, i) =>
      (s.uses ?? '').startsWith('actions/upload-artifact@') &&
      s.with?.['path'] === 'pacing-report.json'
        ? [i]
        : [],
    );
    expect(uploads, 'pacing-report upload step').toHaveLength(1);
    const [at] = uploads;
    expect(at).toBeGreaterThan(suite ?? Infinity);
    const step = steps[at ?? -1];
    expect(step?.if).toBe('${{ !cancelled() }}');
    // Called once per commit inside one every-commit run (#348), where an
    // artifact name may appear once, so a called run names its commit.
    expect(step?.with).toEqual({
      name: "${{ inputs.ref && format('pacing-report-{0}', inputs.ref) || 'pacing-report' }}",
      path: 'pacing-report.json',
      'if-no-files-found': 'error',
    });
  });

  it('is what npm run test:pacing runs: the pacing tests and nothing else', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['test:pacing']).toBe(
      'vitest run -c vitest.pacing.config.ts',
    );
    expect(pacing.test?.include).toEqual(['packages/bots/pacing/**/*.test.ts']);
  });
});
```

- [ ] **Step 4: Write the workflow**

`.github/workflows/every-commit.yml`:

```yaml
# Every commit a pull request brings passes CI on its own (#348).
#
# GitHub runs build-and-test once per pull request, on its head, and a merge
# keeps every commit of the branch in develop's history, so a red commit in
# the middle of a branch would land unseen and stop `git bisect`. This
# workflow lists the commits (`list`), calls ci.yml once per commit, checked
# out alone (`commit`), and judges the lot (`every-commit`, the required
# check). The head commit is in the list, so the verdict does not lean on
# build-and-test.
#
# The matrix limit is GitHub's, 256 jobs per run (MATRIX_LIMIT in
# scripts/every-commit.ts). A pull request bringing more fails `list` by
# name and tests none of them, so `every-commit` is red, never green on part
# of the list.
#
# Every third-party `uses:` is a full commit SHA with its version comment,
# the same SHAs as ci.yml (tests/unit/supply-chain.test.ts).
name: every-commit
on:
  pull_request:

permissions:
  contents: read

jobs:
  list:
    runs-on: ubuntu-latest
    # A checkout with history and one git log: seconds.
    timeout-minutes: 5
    outputs:
      commits: ${{ steps.list.outputs.commits }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha }}
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: '.nvmrc'
      - name: List the commits the pull request brings, oldest first
        id: list
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: node scripts/every-commit.ts list "$BASE_SHA" "$HEAD_SHA"

  commit:
    needs: list
    # The job's checks-list name is `<short SHA> <subject> / build-and-test`.
    name: ${{ matrix.commit.label }}
    strategy:
      # Every commit runs to its own verdict: one red commit must not hide
      # whether the others are green.
      fail-fast: false
      matrix:
        commit: ${{ fromJSON(needs.list.outputs.commits) }}
    # ci.yml's own job, so every step build-and-test runs, in its order and
    # its Playwright image, with its 20-minute timeout.
    uses: ./.github/workflows/ci.yml
    with:
      ref: ${{ matrix.commit.sha }}
    permissions:
      contents: read

  every-commit:
    needs: [list, commit]
    # Runs when the list or a commit failed, which is when it must be red.
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    # One paged read of the run's jobs: seconds.
    timeout-minutes: 5
    permissions:
      actions: read
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: '.nvmrc'
      - name: Green only when every listed commit's job succeeded
        env:
          COMMITS: ${{ needs.list.outputs.commits }}
          LIST_RESULT: ${{ needs.list.result }}
          COMMIT_RESULT: ${{ needs.commit.result }}
          GH_TOKEN: ${{ github.token }}
        run: node scripts/every-commit.ts verdict
```

- [ ] **Step 5: Give ci.yml its ref input (whole file at this stage)**

`.github/workflows/ci.yml`:

```yaml
# Every third-party `uses:` is a full 40-hex commit SHA with a trailing
# `# vX.Y.Z` comment. A tag is mutable and can be repointed by anyone who can
# push to that action's repo; the SHA is the only immutable reference. The
# comment is what makes a Dependabot bump reviewable by a human rather than an
# opaque hex swap -- so never remove it, and never let it drift from the SHA.
#
# Runs on every PR (the required `build-and-test` check) and is called by
# deploy-dev.yml before each dev deploy, so develop never deploys a tree that
# has not passed here.
name: build-and-test
on:
  pull_request:
  workflow_call:
    inputs:
      ref:
        description: The commit to test; empty tests the event's own commit (every-commit.yml passes each commit of a pull request, #348)
        type: string
        required: false
        default: ''

permissions:
  contents: read

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    # GitHub's default is 360 minutes (#44). The pacing step alone may take
    # up to 5 (#35 AC7), so the job allows 20.
    timeout-minutes: 20
    # The browsers and their system libraries come baked into Playwright's own
    # image, so no step downloads from an apt mirror. `--with-deps` did, and a
    # starved mirror held four runs for up to 35 minutes on 2026-10-01 (#44).
    # The tag must be the @playwright/test version the lockfile installs, and
    # the digest pins it (both enforced by tests/unit/supply-chain.test.ts).
    # It runs as uid 1001, the runner's own user, as probed in run 36923761040.
    container:
      image: mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
      options: --user 1001
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ inputs.ref }}
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - name: Install (a warning fails it)
        run: scripts/fail-on-warnings.sh npm ci
      - name: Format
        run: npm run format:check
      - name: Lint (zero warnings)
        run: npm run lint
      - name: Typecheck (tsc, svelte-check)
        run: npm run typecheck
      - name: Unit tests
        run: npm run test:unit
      # The personas play the real core and the spec's pacing targets are
      # checked (#35); AC7 holds the suite under 5 minutes on the runner.
      - name: Pacing bots (under 5 minutes)
        timeout-minutes: 5
        run: npm run test:pacing
      - name: Upload the pacing report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          # every-commit.yml calls this once per commit in one run, where an
          # artifact name may appear once, so a called run names its commit.
          name: ${{ inputs.ref && format('pacing-report-{0}', inputs.ref) || 'pacing-report' }}
          path: pacing-report.json
          if-no-files-found: error
      - name: Worker tests (sync in workerd + local D1, web gate through the asset router)
        run: npm run test:worker
      - name: Cross-engine determinism (Node, Chromium, Firefox, WebKit)
        run: npm run test:engines
      - name: Build (a warning fails it)
        run: scripts/fail-on-warnings.sh npm run build
```

- [ ] **Step 6: Run it green, gate the stage alone, commit**

Run: `npx vitest run tests/unit/every-commit-ci.test.ts tests/unit/pacing-ci.test.ts`, then every CI step, in `ci.yml`'s order (format, lint, typecheck, unit, pacing, worker, engines, build), on this stage alone after a clean `npm ci`. Commit: `ci: every-commit calls build-and-test once per commit a pull request brings (Refs #348)`.

## Mutations (36, unit suite of 4,536 tests, run whole each time)

Predictions were written before the first run; each row's last run reads CAUGHT as predicted with the whole suite's denominator unchanged. S23 was caught on its first run, but two more tests went red than its prediction named (both also read `CALLED_JOB`); the prediction was corrected after that run, said so in `mutations.py`, and the rerun matched it exactly. P1-P3 were added in review pass 1, when it found no mutation reaching `parseCommits`; their predictions were written before they ran. S6 and W7 were drafted and dropped before any run: S6 (the grapheme cut) is covered by the joined-emoji test, seen red against the code-point cut; W7 (a second job in `ci.yml`) was not run, and rests on "calls build-and-test itself", which asserts `ci.yml`'s job list equals `[CALLED_JOB]`.

| Mutation                                                  | File                                 | Change                                                                                                                      | Tests it turned red                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-limit-257                                              | `scripts/every-commit.ts`            | `MATRIX_LIMIT = 256;` → `MATRIX_LIMIT = 257;`                                                                               | pins the matrix limit at GitHub’s 256 jobs per workflow run; refuses a list one past the matrix limit by name, testing none of it (AC5)                                                                                                                                                                                       |
| S2-limit-ge                                               | `scripts/every-commit.ts`            | `commits.length > MATRIX_LIMIT` → `commits.length >= MATRIX_LIMIT`                                                          | passes a list of exactly the matrix limit                                                                                                                                                                                                                                                                                     |
| S3-label-80                                               | `scripts/every-commit.ts`            | `LABEL_MAX = 72;` → `LABEL_MAX = 80;`                                                                                       | pins a label at 72 characters, a git subject line’s length                                                                                                                                                                                                                                                                    |
| S4-label-lt                                               | `scripts/every-commit.ts`            | `whole.length <= LABEL_MAX` → `whole.length < LABEL_MAX`                                                                    | keeps a label of exactly the limit whole                                                                                                                                                                                                                                                                                      |
| S5-no-trim                                                | `scripts/every-commit.ts`            | `.join('')⏎    .trimEnd()}…`` → `.join('')}…``                                                                              | drops trailing space left at the cut, so the ellipsis follows a word                                                                                                                                                                                                                                                          |
| S7-sha-case                                               | `scripts/every-commit.ts`            | `const SHA = /^[0-9a-f]{40}$/;` → `const SHA = /^[0-9a-fA-F]{40}$/;`                                                        | refuses an upper-case SHA by name rather than skipping it                                                                                                                                                                                                                                                                     |
| S8-short-len                                              | `scripts/every-commit.ts`            | `short.length < 7 \|\|` removed                                                                                             | refuses a short SHA under 7 characters by name rather than skipping it                                                                                                                                                                                                                                                        |
| S9-short-prefix                                           | `scripts/every-commit.ts`            | `\|\| !sha.startsWith(short)` removed                                                                                       | refuses a short SHA that is not a prefix of the SHA by name rather than skipping it                                                                                                                                                                                                                                           |
| S10-no-subject                                            | `scripts/every-commit.ts`            | `if (subject.length === 0)` → `if (false)`                                                                                  | refuses a line with no subject field by name rather than skipping it                                                                                                                                                                                                                                                          |
| S11-dupes                                                 | `scripts/every-commit.ts`            | `if (twice.length > 0)` → `if (false)`                                                                                      | refuses two commits with one label, which no verdict could tell apart                                                                                                                                                                                                                                                         |
| S12-empty-list                                            | `scripts/every-commit.ts`            | `if (commits.length === 0)⏎    return {⏎      commits: [],` → `if (false)⏎    return {⏎      commits: [],`                  | refuses an empty list, since a pull request always brings a commit                                                                                                                                                                                                                                                            |
| S13-null-conclusion                                       | `scripts/every-commit.ts`            | `\|\|⏎        !(typeof conclusion === 'string' \|\| conclusion === null` → `\|\|⏎        !(typeof conclusion === 'string')` | reads one job per line of gh api --jq output                                                                                                                                                                                                                                                                                  |
| S14-no-status                                             | `scripts/every-commit.ts`            | `typeof status !== 'string' \|\|` removed                                                                                   | refuses a job with no status by name                                                                                                                                                                                                                                                                                          |
| S15-list-failure-only                                     | `scripts/every-commit.ts`            | `if (listResult !== 'success')` → `if (listResult === 'failure')`                                                           | is red when the list job’s result is cancelled, naming it; is red when the list job’s result is skipped, naming it                                                                                                                                                                                                            |
| S16-empty-verdict                                         | `scripts/every-commit.ts`            | `if (commits.length === 0)⏎    return {⏎      problems:` → `if (false)⏎    return {⏎      problems:`                        | is red on an empty list even when the list job succeeded                                                                                                                                                                                                                                                                      |
| S17-two-jobs                                              | `scripts/every-commit.ts`            | `else if (mine.length > 1)` → `else if (false)`                                                                             | names a commit with two jobs of its name                                                                                                                                                                                                                                                                                      |
| S18-status                                                | `scripts/every-commit.ts`            | `else if (job.status !== 'completed')` → `else if (false)`                                                                  | names a commit whose job has not finished                                                                                                                                                                                                                                                                                     |
| S19-stray-job                                             | `scripts/every-commit.ts`            | `if (job.name.endsWith(` / ${CALLED_JOB}`) && !names.has(job.name))` → `if (false)`                                         | names a matrix-shaped job that belongs to no listed commit                                                                                                                                                                                                                                                                    |
| S20-matrix-result                                         | `scripts/every-commit.ts`            | `problems.length === 0 && commitResult !== 'success'` → `false`                                                             | is red when the matrix result disagrees with green jobs                                                                                                                                                                                                                                                                       |
| S21-separator                                             | `scripts/every-commit.ts`            | `return `${commit.label} / ${CALLED_JOB}`;` → `return `${commit.label}/${CALLED_JOB}`;`                                     | names the matrix job as GitHub does: the caller’s name, then the called job                                                                                                                                                                                                                                                   |
| S22-count                                                 | `scripts/every-commit.ts`            | `else greens += 1;` → `else greens += 0;`                                                                                   | counts only the green commits in its summary; is green when every commit’s job succeeded, and says how many it judged                                                                                                                                                                                                         |
| S23-called-job (prediction corrected after the first run) | `scripts/every-commit.ts`            | `CALLED_JOB = 'build-and-test';` → `CALLED_JOB = 'build';`                                                                  | calls build-and-test itself: ci.yml holds that one job, the one the verdict names; checks out that ref, the event’s own commit when it is empty; names a matrix-shaped job that belongs to no listed commit; names the called job as ci.yml does; names the matrix job as GitHub does: the caller’s name, then the called job |
| P1-commits-any-sha                                        | `scripts/every-commit.ts`            | `!SHA.test(sha) \|\|` removed                                                                                               | refuses an entry whose SHA is not 40 hex by name                                                                                                                                                                                                                                                                              |
| P2-commits-not-a-list                                     | `scripts/every-commit.ts`            | `if (!Array.isArray(parsed))` → `if (false)`                                                                                | refuses an object, not a list by name                                                                                                                                                                                                                                                                                         |
| P3-commits-empty-parsed                                   | `scripts/every-commit.ts`            | `if (text === '') return [];` removed                                                                                       | reads no output, from a list job that failed, as no commits                                                                                                                                                                                                                                                                   |
| W1-verdict-commented                                      | `.github/workflows/every-commit.yml` | `run: node scripts/every-commit.ts verdict` → `# run: node scripts/every-commit.ts verdict⏎        run: echo judged`        | judges with the verdict script, given the list, both results and a token                                                                                                                                                                                                                                                      |
| W2-if-success                                             | `.github/workflows/every-commit.yml` | `if: ${{ !cancelled() }}` → `if: ${{ success() }}`                                                                          | needs the list and the matrix, and runs unless the run is cancelled                                                                                                                                                                                                                                                           |
| W3-fail-fast                                              | `.github/workflows/every-commit.yml` | `fail-fast: false` → `fail-fast: true`                                                                                      | runs one entry per listed commit, and lets every entry finish                                                                                                                                                                                                                                                                 |
| W4-no-ref                                                 | `.github/workflows/every-commit.yml` | `with:⏎      ref: ${{ matrix.commit.sha }}` removed                                                                         | calls ci.yml at the entry’s commit                                                                                                                                                                                                                                                                                            |
| W5-ci-checkout                                            | `.github/workflows/ci.yml`           | `with:⏎          ref: ${{ inputs.ref }}` removed                                                                            | checks out that ref, the event’s own commit when it is empty                                                                                                                                                                                                                                                                  |
| W6-artifact-name                                          | `.github/workflows/ci.yml`           | `name: ${{ inputs.ref && format('pacing-report-{0}', inputs.ref) \|\| '` → `name: pacing-report`                            | uploads pacing-report.json after it, even when the suite fails, and fails when the file is missing (AC6)                                                                                                                                                                                                                      |
| W8-base-ref                                               | `.github/workflows/every-commit.yml` | `BASE_SHA: ${{ github.event.pull_request.base.sha }}` → `BASE_SHA: ${{ github.event.pull_request.base.ref }}`               | lists the commits between the pull request’s base and head                                                                                                                                                                                                                                                                    |
| W9-shallow                                                | `.github/workflows/every-commit.yml` | `fetch-depth: 0` removed                                                                                                    | checks out the pull request’s head with its whole history                                                                                                                                                                                                                                                                     |
| W10-no-actions-read                                       | `.github/workflows/every-commit.yml` | `actions: read` removed                                                                                                     | may read the run’s jobs, and nothing it does not need                                                                                                                                                                                                                                                                         |
| W11-push-too                                              | `.github/workflows/every-commit.yml` | `on:⏎  pull_request:⏎⏎permissions` → `on:⏎  pull_request:⏎  push:⏎⏎permissions`                                             | runs on every pull request, and on nothing else (AC1)                                                                                                                                                                                                                                                                         |
| W12-no-name                                               | `.github/workflows/every-commit.yml` | `name: ${{ matrix.commit.label }}` removed                                                                                  | names each entry by its commit, so a red commit is named in the checks                                                                                                                                                                                                                                                        |

## Live proofs (AC1, AC3, AC7)

Predictions were written before the runs (`throwaway.md`): the list holds exactly the three commits, C2's job red, `every-commit` red naming only C2, `build-and-test` green.

| Run                                                                              | What                                                      | Result                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [37227024097](https://github.com/shyden-labs/wordfarer/actions/runs/37227024097) | `every-commit` on this story's own PR (#351), two commits | `list`, `256f3ad … / build-and-test`, `7d07d1a … / build-and-test` and `every-commit` all success                                                                                                                                |
| [37227057161](https://github.com/shyden-labs/wordfarer/actions/runs/37227057161) | `every-commit` on the throwaway (#352), three commits     | C1 `063eb60` success; **C2 `8ebe634` failure at Unit tests**; C3 `eeec547` success; `every-commit` failure, its log: `2 of 3 commits green`, `✗ 8ebe634 test: throwaway C2, the same test made to fail (Refs #348 AC7): failure` |
| [37227056948](https://github.com/shyden-labs/wordfarer/actions/runs/37227056948) | `build-and-test` on the throwaway                         | success; with `inputs.ref` empty it checked out the merge ref (`HEAD is now at e8c6c74 Merge eeec547… into 7d07d1a…`), as before this story                                                                                      |

The throwaway was closed unmerged and its branch deleted. One finding outside this story: C2's `Upload the pacing report` also failed, because the pacing step was skipped and `if-no-files-found: error` (#35 AC6) found no report. Filed as #353.

## Finishing

- [ ] Open the PR into `develop` with this plan, the AC table, the mutation table and the live runs; wait for CI on its head SHA with `wait-run.sh`, read every step by name for both `build-and-test` and `every-commit`, merge, verify the dev deploy.
- [ ] AC4, Shyden's step: add `every-commit` to `develop`'s required checks (issue comment 5983234899 has the exact setting); the agent reads the protection back and records it on #348.
