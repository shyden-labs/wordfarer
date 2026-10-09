/**
 * Every commit on a branch has each npm script the head's ci.yml runs (#518).
 *
 * The every-commit workflow (#348) runs the head's ci.yml against each
 * commit's tree. A branch whose later commit adds a step (`npm run <script>`)
 * and its script turns every earlier commit red on that step, although each
 * was green against its own pipeline: #123 (run 37553023215, `test:web`) and
 * #475 (run 37814355403, `test:guards`). The pre-push hook runs this first,
 * so the push is refused before anything reaches GitHub.
 *
 * `check` decides from three reads, which the unit tests stand in for; the
 * main below makes them with git. Anything it cannot read or classify is
 * refused by name: a ci.yml that does not parse, has no jobs or runs no
 * `npm run` step, a `run` YAML typed as other than text, an `npm run` form it
 * cannot name a root script from, a git log line, a package.json that does
 * not parse.
 *
 * Imports are Node's own and the repo's `yaml`, so the hook runs it with
 * `node` alone.
 */
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { type Commit, parseLog } from './every-commit.ts';

/** The reads the check makes, stood in by the unit tests. */
export interface Reads {
  /** The head's `.github/workflows/ci.yml`. */
  ciYaml(): string;
  /** The branch's commits, oldest first: `git log --format=%H%x09%h%x09%s`. */
  log(): string;
  /** A commit's `package.json`, or undefined when it has none. */
  packageJson(sha: string): string | undefined;
}

export interface Result {
  /** What was judged: the scripts and the commits, counted. */
  lines: string[];
  /** One line per commit that lacks a script; empty when the push may go. */
  problems: string[];
}

/** The commit range the branch brings, as the pre-push hook reads it. */
export const RANGE = 'origin/develop..HEAD';

/** `npm run`, as a whole word, and the rest of its command. */
const NPM_RUN = /\bnpm[ \t]+run\b([^\n;&|]*)/g;

/** The flags that may come before the script. */
const QUIET = new Set(['--silent', '-s']);

/** A root script's name, as this repo writes them (`test:guards`). */
const SCRIPT_NAME = /^[A-Za-z0-9][\w:.-]*$/;

/** Flags that point npm at a workspace's package.json, not the root's. */
const WORKSPACE = /^(--workspaces?|-ws?|--prefix)(=.*)?$/;

const quoted = (names: readonly string[]): string =>
  names.map((name) => JSON.stringify(name)).join(', ');

const counted = (count: number, noun: string): string =>
  `${String(count)} ${noun}${count === 1 ? '' : 's'}`;

const isText = (value: unknown): value is string => typeof value === 'string';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The script one `npm run` names, or undefined when it cannot be read. */
function scriptOf(rest: string): string | undefined {
  const words = rest
    .trim()
    .split(/[ \t]+/)
    .filter((word) => word !== '');
  let at = 0;
  while (QUIET.has(words[at] ?? '')) at += 1;
  const script = words[at];
  if (script === undefined || !SCRIPT_NAME.test(script)) return undefined;
  const end = words.indexOf('--');
  const own = words.slice(at + 1, end === -1 ? undefined : end);
  return own.some((word) => WORKSPACE.test(word)) ? undefined : script;
}

/** Every root npm script the workflow's steps run, once each, sorted. */
export function ciScripts(yamlText: string): string[] {
  let workflow: unknown;
  try {
    workflow = parse(yamlText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`the head's ci.yml does not parse: ${message}`, {
      cause: error,
    });
  }
  const jobs = isRecord(workflow) ? workflow['jobs'] : undefined;
  if (!isRecord(jobs)) throw new Error("the head's ci.yml has no jobs");
  const scripts = new Set<string>();
  for (const [job, body] of Object.entries(jobs)) {
    const steps = isRecord(body) ? body['steps'] : undefined;
    if (steps === undefined) continue;
    if (!Array.isArray(steps))
      throw new Error(`job "${job}": steps is not a list`);
    steps.forEach((step: unknown, index) => {
      const fields = isRecord(step) ? step : {};
      const name =
        [fields['name'], fields['uses']].find(isText) ??
        `#${String(index + 1)}`;
      const where = `job "${job}", step "${name}"`;
      const run = fields['run'];
      if (run === undefined) return;
      if (typeof run !== 'string')
        throw new Error(`${where}: run is not text: ${JSON.stringify(run)}`);
      for (const [, rest = ''] of run.matchAll(NPM_RUN)) {
        const script = scriptOf(rest);
        if (script === undefined)
          throw new Error(
            `${where}: cannot read \`${['npm run', rest.trim()].join(' ').trim()}\``,
          );
        scripts.add(script);
      }
    });
  }
  if (scripts.size === 0)
    throw new Error(
      "the head's ci.yml runs no `npm run` step: nothing to check",
    );
  return [...scripts].sort();
}

/** What one commit's package.json lacks, as at most one line. */
function problemOf(
  commit: Commit,
  scripts: readonly string[],
  text: string | undefined,
): string | undefined {
  if (text === undefined)
    return `${commit.label}: has no package.json, and the head's ci.yml runs ${quoted(scripts)}`;
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `${commit.label}: package.json does not parse: ${message}`;
  }
  const declared = (isRecord(manifest) ? manifest['scripts'] : undefined) ?? {};
  if (!isRecord(declared))
    return `${commit.label}: package.json scripts is not an object: ${JSON.stringify(declared)}`;
  const missing = scripts.filter((script) => !Object.hasOwn(declared, script));
  if (missing.length === 0) return undefined;
  return `${commit.label}: package.json has no ${quoted(missing)}, which the head's ci.yml runs`;
}

/** Each commit on the branch against every script the head's ci.yml runs. */
export function check(reads: Reads): Result {
  const scripts = ciScripts(reads.ciYaml());
  const commits = parseLog(reads.log());
  const problems = commits.flatMap((commit) => {
    const problem = problemOf(commit, scripts, reads.packageJson(commit.sha));
    return problem === undefined ? [] : [problem];
  });
  const checked = `checked ${counted(commits.length, 'commit')} on ${RANGE}`;
  return {
    lines: [
      `the head's ci.yml runs ${counted(scripts.length, 'npm script')}: ${scripts.join(', ')}`,
      commits.length === 0
        ? checked
        : `${checked}: ${commits.map((commit) => commit.label).join(', ')}`,
    ],
    problems,
  };
}

const git = (...args: string[]): string =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

if (import.meta.main) {
  try {
    const result = check({
      ciYaml: () => git('show', 'HEAD:.github/workflows/ci.yml'),
      log: () => git('log', '--reverse', '--format=%H%x09%h%x09%s', RANGE),
      packageJson: (sha) =>
        git('ls-tree', '--name-only', sha, '--', 'package.json').trim() === ''
          ? undefined
          : git('show', `${sha}:package.json`),
    });
    for (const line of result.lines) console.log(line);
    if (result.problems.length > 0) {
      for (const problem of result.problems) console.error(`✗ ${problem}`);
      console.error(
        "every-commit runs the head's ci.yml against each commit: add each script in the commit that adds its step, or before it (#518)",
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      `✗ ${error instanceof Error ? error.message.trim() : String(error)}`,
    );
    process.exit(1);
  }
}
