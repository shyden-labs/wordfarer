/**
 * The docs-only fast path for build-and-test (#360).
 *
 * A pull request that changes only HANDOVER.md and Markdown under docs/
 * needs Format and the unit suite, and nothing else: no lint, typecheck,
 * pacing, worker, engine or build step reads those files. build-and-test
 * runs `node scripts/ci-scope.ts` early, and every other step is skipped
 * unless the scope it writes is something other than `docs-only`, so the
 * required check still runs and reports (a `paths-ignore` would leave it
 * pending and block the merge).
 *
 * The change judged is `HEAD^1..HEAD` of what the job checked out. On a
 * pull_request event that is GitHub's merge commit, whose first parent is
 * the base, so the diff is exactly what the pull request brings. Under
 * every-commit it is one commit against its parent. deploy-dev's call is a
 * push event and always runs in full, as does any event but pull_request.
 *
 * Every doubt is full: an empty diff, a change kind it does not judge, a
 * diff it cannot read or parse, a missing EVENT. A missing GITHUB_OUTPUT
 * fails the step, and the job with it. Nothing is retried. Imports are
 * Node's own, so the step runs before `npm ci`.
 */
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export type Scope = 'full' | 'docs-only';

/** One line of `git diff --name-status -z`: two paths for a rename or copy. */
export interface Change {
  status: string;
  paths: string[];
}

export interface Classification {
  scope: Scope;
  reason: string;
  /** Every path the classification looked at, in diff order. */
  judged: string[];
}

/** HANDOVER.md, or Markdown under docs/: nothing but Format and the unit suite reads them. */
export function onAllowlist(path: string): boolean {
  return (
    path === 'HANDOVER.md' || (path.startsWith('docs/') && path.endsWith('.md'))
  );
}

/** The change kinds judged path by path: added, modified, deleted. */
const JUDGED_KINDS = new Set(['A', 'M', 'D']);

const STATUS = /^[A-Z][0-9]*$/;

/** Reads `git diff --name-status -z`; anything malformed throws by name. */
export function parseNameStatus(text: string): Change[] {
  if (text === '') return [];
  if (!text.endsWith('\0'))
    throw new Error('name-status output does not end in NUL');
  const fields = text.slice(0, -1).split('\0');
  const changes: Change[] = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i] ?? '';
    if (!STATUS.test(status))
      throw new Error(`name-status field is not a status: ${status}`);
    const count = /^[RC]/.test(status) ? 2 : 1;
    const paths = fields.slice(i + 1, i + 1 + count);
    if (paths.length < count || paths.includes(''))
      throw new Error(
        `name-status ${status} needs ${String(count)} path(s), got: ${JSON.stringify(paths)}`,
      );
    changes.push({ status, paths });
    i += 1 + count;
  }
  return changes;
}

export function classify(changes: readonly Change[]): Classification {
  const judged = changes.flatMap(({ paths }) => paths);
  if (changes.length === 0)
    return {
      scope: 'full',
      reason: 'the diff is empty, so there is nothing to judge',
      judged,
    };
  const unjudged = changes.filter(({ status }) => !JUDGED_KINDS.has(status));
  if (unjudged.length > 0)
    return {
      scope: 'full',
      reason: `a change of a kind the fast path does not judge: ${unjudged
        .map(({ status, paths }) => `${status} ${paths.join(' -> ')}`)
        .join(', ')}`,
      judged,
    };
  const outside = judged.filter((path) => !onAllowlist(path));
  if (outside.length > 0)
    return {
      scope: 'full',
      reason: `outside the docs-only allowlist: ${outside.join(', ')}`,
      judged,
    };
  return {
    scope: 'docs-only',
    reason: 'every changed path is HANDOVER.md or Markdown under docs/',
    judged,
  };
}

/** The fast path applies to pull-request checks only; any doubt is full. */
export function scopeFor(
  event: string,
  readDiff: () => string,
): Classification {
  if (event !== 'pull_request')
    return {
      scope: 'full',
      reason: `the ${JSON.stringify(event)} event always tests in full`,
      judged: [],
    };
  try {
    return classify(parseNameStatus(readDiff()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      scope: 'full',
      reason: `the diff could not be read, so everything runs: ${message.trim()}`,
      judged: [],
    };
  }
}

/** What the checked-out commit changed against its first parent. */
export function readDiff(cwd: string): string {
  return execFileSync(
    'git',
    ['diff', '--no-renames', '--name-status', '-z', 'HEAD^1', 'HEAD'],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

/** The lines the step prints: the verdict, then each judged path and its side. */
export function report(result: Classification): string[] {
  return [
    `scope: ${result.scope} (${result.reason})`,
    `judged ${String(result.judged.length)} ${result.judged.length === 1 ? 'path' : 'paths'}:`,
    ...result.judged.map(
      (path) => `  ${onAllowlist(path) ? 'docs ' : 'other'}  ${path}`,
    ),
  ];
}

if (import.meta.main) {
  const output = process.env['GITHUB_OUTPUT'];
  if (output === undefined || output === '') {
    console.error('✗ GITHUB_OUTPUT is not set');
    process.exit(1);
  }
  const result = scopeFor(process.env['EVENT'] ?? '', () => readDiff('.'));
  for (const line of report(result)) console.log(line);
  appendFileSync(output, `scope=${result.scope}\n`);
}
