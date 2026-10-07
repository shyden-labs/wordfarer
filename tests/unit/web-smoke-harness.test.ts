import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { webSmokeConfig } from '../../playwright.web.config';
import { runOf } from './workflow-steps';
import { floorBreach } from '../floors';
import { searched } from '../searched';

/**
 * The web smoke suite stays wired (#123 AC3), locally and against dev (#123
 * DoD: "the journey re-run against dev"). A Playwright project dropped from
 * the config, a server that is not the built game, a retry, or a CI step
 * removed would let the suite pass by not running what it claims; this fails
 * instead. The workflows are read as parsed YAML, so a comment naming the
 * command cannot stand in for the step. The build-and-test job's Playwright
 * image is held by tests/unit/cross-engine-harness.test.ts.
 */

interface Step {
  name?: string;
  // YAML may type it otherwise: read it through runOf.
  run?: unknown;
  env?: Record<string, unknown>;
}

interface Job {
  needs?: string | string[];
  container?: { image?: string };
  environment?: unknown;
  // A reusable-workflow call (`uses:`) has no steps of its own.
  steps?: Step[];
}

const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  jobs: Record<string, Job>;
};
const deployDev = parse(
  readFileSync('.github/workflows/deploy-dev.yml', 'utf8'),
) as { jobs: Record<string, Job> };

/** The suite as `npm run test:web` runs it: no dev URL in the environment. */
const local = () => webSmokeConfig({});
/** The suite as deploy-dev runs it against dev. */
const DEV_URL = 'https://dev.yawelo-idle.shyden.co.uk/';
const dev = () =>
  webSmokeConfig({
    WEB_SMOKE_URL: DEV_URL,
    DEV_BASIC_AUTH_PASSWORD: 'the dev password',
  });

const needsOf = (job: Job | undefined): string[] =>
  job?.needs === undefined
    ? []
    : Array.isArray(job.needs)
      ? job.needs
      : [job.needs];

/** The deploy-dev jobs with a step that runs `run`, by name. */
const jobsRunning = (run: string): [string, Job][] =>
  Object.entries(deployDev.jobs).filter(([, job]) =>
    (job.steps ?? []).some((step) => runOf(step) === run),
  );

describe('the web smoke suite (#123 AC3)', () => {
  it('runs on Chromium, Firefox and WebKit', () => {
    const engines = (local().projects ?? []).map(
      (p) => p.use?.defaultBrowserType,
    );
    expect([...engines].sort()).toEqual(['chromium', 'firefox', 'webkit']);
  });

  it('loads the built game from its own Worker config, started fresh', () => {
    const { webServer } = local();
    const server = Array.isArray(webServer) ? undefined : webServer;
    expect(server?.command).toMatch(
      /^npx wrangler dev --config apps\/web\/wrangler\.jsonc --ip 127\.0\.0\.1 --port \d+$/,
    );
    expect(server?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/play\/$/);
    expect(server?.reuseExistingServer).toBe(false);
    expect(local().use?.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(local().use?.httpCredentials).toBeUndefined();
  });

  it('retries nothing and refuses a focused test', () => {
    expect(local().retries).toBe(0);
    expect(local().forbidOnly).toBe(true);
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

describe('the web smoke suite against dev (#123 DoD)', () => {
  it('targets the address it is given, sends the dev password up front, and starts no server', () => {
    expect(dev().use?.baseURL).toBe(DEV_URL);
    // `always`: a 401 challenge first would be a failed load in the console.
    expect(dev().use?.httpCredentials).toEqual({
      username: 'smoke',
      password: 'the dev password',
      send: 'always',
    });
    expect(dev().webServer).toBeUndefined();
  });

  it('refuses a dev address without the dev password', () => {
    expect(() => webSmokeConfig({ WEB_SMOKE_URL: DEV_URL })).toThrow(
      /WEB_SMOKE_URL is set but DEV_BASIC_AUTH_PASSWORD is not/,
    );
  });

  it('runs on the same three engines, retrying nothing', () => {
    const engines = (dev().projects ?? []).map(
      (p) => p.use?.defaultBrowserType,
    );
    expect([...engines].sort()).toEqual(['chromium', 'firefox', 'webkit']);
    expect(dev().retries).toBe(0);
    expect(dev().forbidOnly).toBe(true);
  });

  it('is npm run test:web:dev, which builds nothing: dev already serves the build', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['test:web:dev']).toBe(
      'playwright test -c playwright.web.config.ts',
    );
  });

  it('runs once in deploy-dev, after verify, in CI’s Playwright image, with the dev environment’s password', () => {
    const running = jobsRunning('npm run test:web:dev');
    expect(running.map(([name]) => name)).toEqual(['smoke']);
    const job = deployDev.jobs['smoke'];
    expect(needsOf(job)).toEqual(['verify']);
    expect(job?.container?.image).toBe(
      ci.jobs['build-and-test']?.container?.image,
    );
    expect(job?.environment).toEqual(deployDev.jobs['verify']?.environment);
    expect(job?.environment).toMatchObject({ name: 'dev' });
    const steps = job?.steps ?? [];
    const smoke = steps.filter((s) => runOf(s) === 'npm run test:web:dev');
    expect(smoke).toHaveLength(1);
    expect(smoke[0]?.env).toEqual({
      WEB_SMOKE_URL: DEV_URL,
      DEV_BASIC_AUTH_PASSWORD: '${{ secrets.DEV_BASIC_AUTH_PASSWORD }}',
    });
    const installs = steps.filter((s) => /playwright install/.test(runOf(s)));
    expect(
      searched(installs, { of: steps, what: 'smoke job steps' }),
      'no step installs browsers: the image has them',
    ).toEqual([]);
    expect(
      floorBreach('web-smoke-harness/dev-smoke-steps', steps.length),
    ).toBeUndefined();
  });

  it('posts dev-verified only once the dev smoke has passed', () => {
    const posting = Object.entries(deployDev.jobs).filter(([, job]) =>
      (job.steps ?? []).some((step) =>
        /context=dev-verified\b/.test(runOf(step)),
      ),
    );
    expect(posting.map(([name]) => name)).toEqual(['dev-verified']);
    expect(needsOf(deployDev.jobs['dev-verified'])).toEqual(['smoke']);
  });
});
