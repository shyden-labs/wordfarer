import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import config from '../../playwright.engines.config';
import { runOf } from './workflow-steps';

/**
 * The cross-engine check stays wired (#26 AC10). A Playwright project dropped
 * from the config, or a CI step removed, would let the check pass by not
 * running; this suite fails instead. The workflow is read as parsed YAML, so
 * a comment naming a command cannot stand in for the step.
 */

interface Step {
  name?: string;
  // YAML may type it otherwise: read it through runOf.
  run?: unknown;
}

const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  jobs: Record<string, { container?: { image?: string }; steps: Step[] }>;
};

describe('the cross-engine harness', () => {
  it('runs on Chromium, Firefox and WebKit', () => {
    const engines = (config.projects ?? []).map(
      (p) => p.use?.defaultBrowserType,
    );
    expect([...engines].sort()).toEqual(['chromium', 'firefox', 'webkit']);
  });

  it('runs in CI, in the Playwright image that carries all three browsers (#44)', () => {
    const job = ci.jobs['build-and-test'];
    expect(job?.container?.image ?? '', 'the job’s image').toMatch(
      /^mcr\.microsoft\.com\/playwright:v/,
    );
    const steps = job?.steps ?? [];
    expect(
      steps.filter((s) => runOf(s) === 'npm run test:engines'),
      'test:engines step',
    ).toHaveLength(1);
    expect(
      steps.filter((s) => /playwright install/.test(runOf(s))),
      'no step installs browsers: the image has them, and --with-deps reached an apt mirror',
    ).toEqual([]);
  });

  it('is what npm run test:engines runs', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['test:engines']).toBe(
      'playwright test -c playwright.engines.config.ts',
    );
  });
});
