import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import root from '../../vitest.config';
import guards from '../../vitest.guards.config';
import { runOf } from './workflow-steps';

/**
 * The guards suite stays wired (#475). Whole-repo guards, which read or parse
 * the whole tree, run as their own suite (global rule, 2026-10-08), out of
 * the unit suite and its limits, under one measured limit at their CI step
 * (held in suite-limits.test.ts, #476). A step removed, a docs-only skip
 * added (the guards read docs too), or a glob that lets a guard run twice or not at all would let
 * them pass by not running; this suite fails instead. The workflow is read
 * as parsed YAML, so a comment naming a command cannot stand in for a step.
 */

interface Step {
  name?: string;
  // YAML may type it otherwise: read it through runOf.
  run?: unknown;
  if?: string;
}

const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  jobs: Record<string, { steps: Step[] }>;
};
const steps = ci.jobs['build-and-test']?.steps ?? [];
const runs = (command: string): number[] =>
  steps.flatMap((s, i) => (runOf(s) === command ? [i] : []));

describe('the guards suite in CI (#475)', () => {
  it('runs as its own step, once, straight after the unit tests, on every change', () => {
    const unit = runs('npm run test:unit');
    const suite = runs('npm run test:guards');
    expect(unit, 'test:unit step').toHaveLength(1);
    expect(suite, 'test:guards step').toHaveLength(1);
    expect(suite[0]).toBe((unit[0] ?? -2) + 1);
    const step = steps[suite[0] ?? -1];
    expect(step?.name).toBe('Guards (whole-repo checks)');
    // Docs-only changes run it too: old-name and others read every file.
    expect(step?.if).toBeUndefined();
  });

  it('is what npm run test:guards runs: tests/guards and nothing else, which the unit suite leaves out', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['test:guards']).toBe(
      'vitest run -c vitest.guards.config.ts',
    );
    expect(guards.test?.include).toEqual(['tests/guards/**/*.test.ts']);
    expect(root.test?.exclude).toContain('tests/guards/**');
  });
});
