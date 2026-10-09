import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import pacing from '../../vitest.pacing.config';
import { runOf } from './workflow-steps';

/**
 * The pacing suite stays wired (#35 AC4, AC6; its time limit, AC7, is held in
 * suite-limits.test.ts, #476). A CI step removed or its report no longer
 * uploaded would let the pacing
 * checks pass by not running; this suite fails instead. The workflow is read
 * as parsed YAML, so a comment naming a command cannot stand in for a step.
 */

interface Step {
  id?: string;
  name?: string;
  // YAML may type it otherwise: read it through runOf.
  run?: unknown;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
}

const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  jobs: Record<string, { steps: Step[] }>;
};
const steps = ci.jobs['build-and-test']?.steps ?? [];
const runs = (command: string): number[] =>
  steps.flatMap((s, i) => (runOf(s) === command ? [i] : []));

describe('the pacing suite in CI (#35)', () => {
  it('runs as its own step, once, after the unit tests (AC4)', () => {
    const unit = runs('npm run test:unit');
    const suite = runs('npm run test:pacing');
    expect(unit, 'test:unit step').toHaveLength(1);
    expect(suite, 'test:pacing step').toHaveLength(1);
    expect(suite[0]).toBeGreaterThan(unit[0] ?? Infinity);
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
    // !cancelled() first, so it uploads after a failed suite. Whole, with
    // #360's docs-only skip, in ci-fast-path.test.ts; the pacing step's own
    // outcome in the test below (#353).
    expect(step?.if).toMatch(/^\$\{\{ !cancelled\(\) && /);
    // Called once per commit inside one every-commit run (#348), where an
    // artifact name may appear once, so a called run names its commit.
    expect(step?.with).toEqual({
      name: "${{ inputs.ref && format('pacing-report-{0}', inputs.ref) || 'pacing-report' }}",
      path: 'pacing-report.json',
      'if-no-files-found': 'error',
    });
  });

  it('uploads only when the pacing step ran, passed or failed, and skips when it never started (#353 AC1)', () => {
    const [suite] = runs('npm run test:pacing');
    expect(steps[suite ?? -1]?.id).toBe('pacing');
    const upload = steps.find((s) => s.name === 'Upload the pacing report');
    expect(upload?.if).toBe(
      "${{ !cancelled() && steps.classify.outputs.scope != 'docs-only' && " +
        "(steps.pacing.outcome == 'success' || steps.pacing.outcome == 'failure') }}",
    );
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
