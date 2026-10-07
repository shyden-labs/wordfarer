import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import config from '../../playwright.web.config';
import { runOf } from './workflow-steps';

/**
 * The web smoke suite stays wired (#123 AC3). A Playwright project dropped
 * from the config, a server that is not the built game, a retry, or a CI step
 * removed would let the suite pass by not running what it claims; this fails
 * instead. The workflow is read as parsed YAML, so a comment naming the
 * command cannot stand in for the step. The job's Playwright image is held by
 * tests/unit/cross-engine-harness.test.ts.
 */

interface Step {
  name?: string;
  // YAML may type it otherwise: read it through runOf.
  run?: unknown;
}

const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  jobs: Record<string, { steps: Step[] }>;
};

describe('the web smoke suite (#123 AC3)', () => {
  it('runs on Chromium, Firefox and WebKit', () => {
    const engines = (config.projects ?? []).map(
      (p) => p.use?.defaultBrowserType,
    );
    expect([...engines].sort()).toEqual(['chromium', 'firefox', 'webkit']);
  });

  it('loads the built game from its own Worker config, started fresh', () => {
    const server = Array.isArray(config.webServer)
      ? undefined
      : config.webServer;
    expect(server?.command).toMatch(
      /^npx wrangler dev --config apps\/web\/wrangler\.jsonc --ip 127\.0\.0\.1 --port \d+$/,
    );
    expect(server?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/play\/$/);
    expect(server?.reuseExistingServer).toBe(false);
  });

  it('retries nothing and refuses a focused test', () => {
    expect(config.retries).toBe(0);
    expect(config.forbidOnly).toBe(true);
  });

  it('builds the game, then runs the suite, as npm run test:web', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['test:web']).toBe(
      'npm run build --workspace @yawelo-idle/web && playwright test -c playwright.web.config.ts',
    );
  });

  it('runs in CI, once, after the cross-engine check', () => {
    const steps = ci.jobs['build-and-test']?.steps ?? [];
    const runs = steps.map((s) => runOf(s));
    expect(runs.filter((run) => run === 'npm run test:web')).toHaveLength(1);
    expect(runs.indexOf('npm run test:web')).toBe(
      runs.indexOf('npm run test:engines') + 1,
    );
  });
});
