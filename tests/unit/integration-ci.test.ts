import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import root from '../../vitest.config';
import integration from '../../vitest.integration.config';
import { runOf } from './workflow-steps';

/**
 * The integration suite stays wired (#490). A unit test starts no process
 * (global rule, 2026-10-08), so the tests where a process is the thing tested
 * run as their own suite, under one measured limit at their CI step and none
 * of their own. A step removed, its limit dropped, a per-test limit turned
 * back on, or a glob that lets a test run twice or not at all would let them
 * pass by not running; this suite fails instead. The workflow is read as
 * parsed YAML, so a comment naming a command cannot stand in for a step.
 */

interface Step {
  name?: string;
  // YAML may type it otherwise: read it through runOf.
  run?: unknown;
  if?: string;
  'timeout-minutes'?: number;
}

const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  jobs: Record<string, { steps: Step[] }>;
};
const steps = ci.jobs['build-and-test']?.steps ?? [];
const runs = (command: string): number[] =>
  steps.flatMap((s, i) => (runOf(s) === command ? [i] : []));

describe('the integration suite in CI (#490)', () => {
  it('runs as its own step, once, straight after the guards', () => {
    const guards = runs('npm run test:guards');
    const suite = runs('npm run test:integration');
    expect(guards, 'test:guards step').toHaveLength(1);
    expect(suite, 'test:integration step').toHaveLength(1);
    expect(suite[0]).toBe((guards[0] ?? -2) + 1);
    expect(steps[suite[0] ?? -1]?.name).toBe('Integration tests');
  });

  it('skips a docs-only change, which no integration test reads', () => {
    const [at] = runs('npm run test:integration');
    expect(steps[at ?? -1]?.if).toBe(
      "${{ steps.classify.outputs.scope != 'docs-only' }}",
    );
  });

  it('holds the step to its one measured limit on the runner', () => {
    const [at] = runs('npm run test:integration');
    expect(steps[at ?? -1]?.['timeout-minutes']).toBe(1);
  });

  it('is what npm run test:integration runs: tests/integration and nothing else, which the unit suite leaves out', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['test:integration']).toBe(
      'vitest run -c vitest.integration.config.ts',
    );
    expect(integration.test?.include).toEqual([
      'tests/integration/**/*.test.ts',
    ]);
    expect(root.test?.exclude).toContain('tests/integration/**');
  });

  it('sets no per-test limit: the CI step’s is the one', () => {
    expect(integration.test?.testTimeout).toBe(0);
  });
});
