import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/**
 * build-and-test's docs-only fast path (#360 AC2, AC3, AC5), read as parsed
 * YAML so a comment cannot stand in for a condition.
 *
 * An early step, `classify`, writes `scope`. On docs-only, only checkout,
 * Node, the classifier, install, Format and the unit suite run; every other
 * step carries the skip. The skip reads `!= 'docs-only'`, so a scope that
 * is full, empty or missing runs the step: no skip can fire on anything but
 * a docs-only verdict. A step added without its own decision is not in the
 * docs-only list, so the list below goes red until someone decides.
 */

interface Step {
  id?: string;
  name?: string;
  if?: string;
  // YAML may type it otherwise: read it through runOf.
  run?: unknown;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

interface Job {
  uses?: string;
  with?: Record<string, unknown>;
  steps?: Step[];
}

interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
}

const read = (file: string) =>
  parse(readFileSync(`.github/workflows/${file}`, 'utf8')) as Workflow;
const steps = (): Step[] => read('ci.yml').jobs['build-and-test']?.steps ?? [];
/** A step's name, or its action without the pinned SHA. */
const idOf = (step: Step) => step.name ?? step.uses?.split('@')[0] ?? '?';

const SKIP = "steps.classify.outputs.scope != 'docs-only'";

/** Every step, in order: today's order with the classifier after Node. */
const ORDER = [
  'The default branch is develop',
  'actions/checkout',
  'actions/setup-node',
  'Classify the change as docs-only or full (#360)',
  'Install (a warning fails it)',
  'Format',
  'Lint (zero warnings)',
  'Typecheck (tsc, svelte-check)',
  'Unit tests',
  'Pacing bots (under 5 minutes)',
  'Upload the pacing report',
  'Worker tests (sync in workerd + local D1, site and game through the asset router)',
  'Cross-engine determinism (Node, Chromium, Firefox, WebKit)',
  'Web smoke (the built game in a local Worker, on Chromium, Firefox and WebKit)',
  'Build (a warning fails it)',
];

/** The steps a docs-only change runs (AC2). */
const DOCS_ONLY = [
  'The default branch is develop',
  'actions/checkout',
  'actions/setup-node',
  'Classify the change as docs-only or full (#360)',
  'Install (a warning fails it)',
  'Format',
  'Unit tests',
];

/** Every other step, and its whole condition. */
const SKIPPED: Record<string, string> = {
  'Lint (zero warnings)': `\${{ ${SKIP} }}`,
  'Typecheck (tsc, svelte-check)': `\${{ ${SKIP} }}`,
  'Pacing bots (under 5 minutes)': `\${{ ${SKIP} }}`,
  // The report uploads after a pacing run that passed or failed, but never on
  // docs-only, where nothing wrote it, nor when the pacing step never started
  // (#353).
  'Upload the pacing report': `\${{ !cancelled() && ${SKIP} && (steps.pacing.outcome == 'success' || steps.pacing.outcome == 'failure') }}`,
  'Worker tests (sync in workerd + local D1, site and game through the asset router)': `\${{ ${SKIP} }}`,
  'Cross-engine determinism (Node, Chromium, Firefox, WebKit)': `\${{ ${SKIP} }}`,
  'Web smoke (the built game in a local Worker, on Chromium, Firefox and WebKit)': `\${{ ${SKIP} }}`,
  'Build (a warning fails it)': `\${{ ${SKIP} }}`,
};

describe('build-and-test’s steps (#360 AC2)', () => {
  it('run in today’s order, the default-branch check first, the classifier after Node and before install', () => {
    expect(steps().map(idOf)).toEqual(ORDER);
  });

  it('on docs-only, run exactly the default-branch check, checkout, Node, the classifier, install, Format and the unit suite', () => {
    expect(
      steps()
        .filter((s) => s.if === undefined)
        .map(idOf),
    ).toEqual(DOCS_ONLY);
  });

  it('every other step carries the skip, each condition whole (AC5)', () => {
    const conditioned = steps().filter((s) => s.if !== undefined);
    expect(Object.fromEntries(conditioned.map((s) => [idOf(s), s.if]))).toEqual(
      SKIPPED,
    );
    // Both lists together are every step, so none escapes both.
    expect(conditioned.length + DOCS_ONLY.length).toBe(ORDER.length);
  });

  it('reads the scope nowhere but in a skip, so nothing can fire on a full verdict (AC5)', () => {
    const all = steps();
    const readers = all.filter((s) =>
      JSON.stringify(s).includes('steps.classify'),
    );
    expect(readers.map(idOf)).toEqual(Object.keys(SKIPPED));
    expect(all.map(idOf)).toEqual(ORDER);
  });
});

describe('the classifier step (#360 AC1)', () => {
  const classifier = () =>
    steps().find(
      (s) => idOf(s) === 'Classify the change as docs-only or full (#360)',
    ) ?? {};

  it('is the step the skips read, by its id', () => {
    expect(classifier().id).toBe('classify');
  });

  it('runs the classifier with Node alone, before npm ci', () => {
    expect(classifier().run).toBe('node scripts/ci-scope.ts');
  });

  it('is given the event, so only a pull_request can be docs-only (AC3)', () => {
    expect(classifier().env).toEqual({ EVENT: '${{ github.event_name }}' });
  });

  it('has the commit’s first parent to diff against: checkout fetches two levels', () => {
    const checkout = steps().find((s) => idOf(s) === 'actions/checkout');
    expect(checkout?.with).toEqual({
      ref: '${{ inputs.ref }}',
      'fetch-depth': 2,
    });
  });
});

describe('deploy-dev always tests in full (#360 AC3)', () => {
  it('runs only on a push, an event the classifier never makes docs-only', () => {
    expect(Object.keys(read('deploy-dev.yml').on)).toEqual(['push']);
  });

  it('calls build-and-test with no input', () => {
    const test = read('deploy-dev.yml').jobs['test'];
    expect(test?.uses).toBe('./.github/workflows/ci.yml');
    expect(test?.with).toBeUndefined();
  });
});

describe('the default-branch step (#460 AC2)', () => {
  const step = () =>
    steps().find((s) => idOf(s) === 'The default branch is develop') ?? {};
  /** The step's shell, run as Actions runs it: bash with -e. */
  const run = (branch: string) => {
    const script = step().run;
    if (typeof script !== 'string') throw new Error('the step has no run');
    try {
      const stdout = execFileSync('bash', ['-e', '-c', script], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, DEFAULT_BRANCH: branch },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, stdout };
    } catch (error) {
      const failed = error as { status: number; stdout: string };
      return { status: failed.status, stdout: failed.stdout };
    }
  };

  it('reads the repository’s default branch from the event', () => {
    expect(step().env).toEqual({
      DEFAULT_BRANCH: '${{ github.event.repository.default_branch }}',
    });
  });

  it('passes when the default branch is develop', () => {
    expect(run('develop')).toEqual({ status: 0, stdout: '' });
  });

  for (const branch of ['main', '', 'Develop', 'develop ', 'feature/develop'])
    it(`fails, naming the setting, when the default branch is ${JSON.stringify(branch)}`, () => {
      expect(run(branch)).toEqual({
        status: 1,
        stdout:
          `::error::The default branch is '${branch}', not develop, so ` +
          'Dependabot security fixes and its config live outside the develop ' +
          'gate (#460). Set it in Settings > General > Default branch.\n',
      });
    });
});
