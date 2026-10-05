import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { CALLED_JOB } from '../../scripts/every-commit';
import { runOf } from './workflow-steps';

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
  // YAML may type it otherwise: read it through runOf.
  run?: unknown;
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
  (steps ?? []).filter((s) => runOf(s) === command);
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
      (job('list').steps ?? []).filter((s) => /\bnpm\b/.test(runOf(s))),
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
    // fetch-depth 2 gives the docs-only classifier the commit's parents (#360).
    expect(checkout?.with).toEqual({
      ref: '${{ inputs.ref }}',
      'fetch-depth': 2,
    });
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
