import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import pacing from '../../vitest.pacing.config';
import { runOf } from './workflow-steps';

/**
 * The pacing suite stays wired (#35 AC4, AC6, AC7). A CI step removed, its
 * time limit dropped or its report no longer uploaded would let the pacing
 * checks pass by not running; this suite fails instead. The workflow is read
 * as parsed YAML, so a comment naming a command cannot stand in for a step.
 */

interface Step {
  name?: string;
  // YAML may type it otherwise: read it through runOf.
  run?: unknown;
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
  steps.flatMap((s, i) => (runOf(s) === command ? [i] : []));

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
    // !cancelled() first, so it uploads after a failed suite. The rest of the
    // condition is #360's docs-only skip, pinned whole in ci-fast-path.test.ts.
    expect(step?.if).toMatch(/^\$\{\{ !cancelled\(\) && /);
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
