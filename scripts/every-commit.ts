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
