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
