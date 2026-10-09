import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import guards from '../../vitest.guards.config';
import integration from '../../vitest.integration.config';
import pacing from '../../vitest.pacing.config';
import unit from '../../vitest.config';
import devHosts from '../../apps/dev-hosts/vitest.harness.config';
import site from '../../apps/site/vitest.harness.config';
import syncWorker from '../../apps/sync-worker/vitest.harness.config';
import web from '../../apps/web/vitest.harness.config';
import engines from '../../playwright.engines.config';
import { webSmokeConfig } from '../../playwright.web.config';
import { NON_UNIT_VITEST_CONFIGS } from './suite-configs';
import { runOf } from './workflow-steps';

/**
 * Every suite but the unit suite keeps one limit, at its CI step, and none of
 * its own (global rule, 2026-10-07; #476). The unit suite's 1 s limit is its
 * runner's (#477).
 *
 * Each step's minutes are the smallest whole number at least 3 times its
 * slowest measured run. Measured 2026-10-09 by .superpowers/sdd/476/steps.py
 * over the last 12 green PR runs of ci.yml and 8 of deploy-dev.yml: the
 * slowest is the larger of the two. A limit raised without a new measurement
 * fails the margin test; a suite left out of the table fails the step list.
 */

interface Step {
  name?: string;
  // YAML may type it otherwise: read it through runOf.
  run?: unknown;
  'timeout-minutes'?: unknown;
}

interface Workflow {
  jobs: Record<string, { steps?: Step[] }>;
}

const workflow = (file: string): Workflow =>
  parse(readFileSync(`.github/workflows/${file}`, 'utf8')) as Workflow;
const ci = workflow('ci.yml');
const deployDev = workflow('deploy-dev.yml');

const SUITES = [
  {
    suite: 'guards',
    run: 'npm run test:guards',
    job: 'build-and-test',
    minutes: 1,
    slowest: 8,
  },
  {
    suite: 'integration',
    run: 'npm run test:integration',
    job: 'build-and-test',
    minutes: 1,
    slowest: 11,
  },
  {
    suite: 'pacing',
    run: 'npm run test:pacing',
    job: 'build-and-test',
    minutes: 2,
    slowest: 40,
  },
  {
    suite: 'worker',
    run: 'npm run test:worker',
    job: 'build-and-test',
    minutes: 1,
    slowest: 12,
  },
  {
    suite: 'engines',
    run: 'npm run test:engines',
    job: 'build-and-test',
    minutes: 1,
    slowest: 20,
  },
  {
    suite: 'web smoke',
    run: 'npm run test:web',
    job: 'build-and-test',
    minutes: 1,
    slowest: 13,
  },
  {
    suite: 'web smoke on dev',
    run: 'npm run test:web:dev',
    job: 'smoke',
    minutes: 1,
    slowest: 13,
  },
] as const;

const jobOf = (job: string): Workflow['jobs'][string] | undefined =>
  job === 'smoke' ? deployDev.jobs[job] : ci.jobs[job];

describe('the unit suite’s limit is its runner’s: 1 s, judged with coverage off (#477 AC1, AC5)', () => {
  it('holds each test and each hook to 1 s', () => {
    expect(unit.test?.testTimeout).toBe(1_000);
    expect(unit.test?.hookTimeout).toBe(1_000);
  });

  it('runs in its own CI step, with no coverage to slow it', () => {
    const steps = ci.jobs['build-and-test']?.steps ?? [];
    const at = steps.filter((s) => runOf(s) === 'npm run test:unit');
    expect(at, 'test:unit step').toHaveLength(1);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['test:unit']).toBe('vitest run');
    expect(unit.test).not.toHaveProperty('coverage');
  });
});

describe('each non-unit suite’s one limit is its CI step’s (#476 AC1)', () => {
  it.each(SUITES)(
    '$suite: its step holds it to $minutes minute(s)',
    ({ run, job, minutes }) => {
      const steps = jobOf(job)?.steps ?? [];
      const at = steps.filter((s) => runOf(s) === run);
      expect(at, `${run} step in ${job}`).toHaveLength(1);
      expect(at[0]?.['timeout-minutes']).toBe(minutes);
    },
  );

  it.each(SUITES)(
    '$suite: $minutes minute(s) is the smallest whole number of minutes at least 3 times its slowest run, $slowest s',
    ({ minutes, slowest }) => {
      expect(minutes).toBe(Math.max(1, Math.ceil((3 * slowest) / 60)));
    },
  );

  it('lists every suite step in CI and deploy-dev, and only the unit suite is left to its runner', () => {
    const suiteRuns = [
      ...(ci.jobs['build-and-test']?.steps ?? []),
      ...Object.values(deployDev.jobs).flatMap((j) => j.steps ?? []),
    ]
      .map((s) => runOf(s))
      .filter((r) => r.startsWith('npm run test:'));
    expect(suiteRuns.sort()).toEqual(
      ['npm run test:unit', ...SUITES.map((s) => s.run)].sort(),
    );
  });
});

describe('no non-unit suite’s config sets a limit of its own (#476 AC2)', () => {
  const VITEST = [
    ['vitest.guards.config.ts', guards],
    ['vitest.integration.config.ts', integration],
    ['vitest.pacing.config.ts', pacing],
    ['apps/dev-hosts/vitest.harness.config.ts', devHosts],
    ['apps/site/vitest.harness.config.ts', site],
    ['apps/sync-worker/vitest.harness.config.ts', syncWorker],
    ['apps/web/vitest.harness.config.ts', web],
  ] as const;

  it.each(VITEST)(
    '%s turns off Vitest’s per-test and per-hook defaults',
    (_file, config) => {
      expect(config.test?.testTimeout).toBe(0);
      expect(config.test?.hookTimeout).toBe(0);
    },
  );

  // That this list is every one there is lists the tree: a guard (#530,
  // tests/guards/suite-configs.test.ts).
  it('tests every non-unit Vitest config the guard finds', () => {
    expect(VITEST.map(([file]) => file)).toEqual([...NON_UNIT_VITEST_CONFIGS]);
  });

  it('turns off Playwright’s per-test default in the cross-engine check', () => {
    expect(engines.timeout).toBe(0);
  });

  it('turns off Playwright’s per-test default in the web smoke, locally and against dev, and leaves its server start at Playwright’s own', () => {
    const local = webSmokeConfig({});
    const dev = webSmokeConfig({
      WEB_SMOKE_URL: 'https://dev.example/',
      DEV_BASIC_AUTH_PASSWORD: 'p',
    });
    expect(local.timeout).toBe(0);
    expect(dev.timeout).toBe(0);
    // Liveness: the local form starts a server, so its settings are read.
    expect(local.webServer).toMatchObject({ reuseExistingServer: false });
    expect(local.webServer).not.toHaveProperty('timeout');
  });

  it('covers every Playwright config', () => {
    expect(
      readdirSync('.')
        .filter((f) => /^playwright\..+\.config\.ts$/.test(f))
        .sort(),
    ).toEqual(['playwright.engines.config.ts', 'playwright.web.config.ts']);
  });
});
