import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unstable_readConfig } from 'wrangler';
import { parse } from 'yaml';
import { isIgnored } from './tracked-files';
import { runOf } from './workflow-steps';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { DEV_HOSTS } from '../../apps/dev-hosts/hosts';

/**
 * The dev deploy configs (three Workers and the Pages hostname adapter,
 * #429), read the way wrangler reads them
 * (comments stripped, defaults applied), so no comment can satisfy or trip a
 * guard (#39 AC2, AC7).
 */
const ROOT = new URL('../..', import.meta.url).pathname;

/**
 * The "Shyden Labs Dev" account's workers.dev subdomain, read from the
 * account 2026-10-05 (#395): dev lives there, beside dev only, never in the
 * production account.
 */
const DEV_WORKERS_SUBDOMAIN = 'shyden-labs-dev';

/**
 * The fields these guards read, declared here rather than imported: wrangler's
 * own `Config` type comes from `@cloudflare/workers-utils`, which it bundles
 * without shipping its declarations, so it does not resolve.
 */
interface DeployConfig {
  name: string;
  main: string | undefined;
  workers_dev: unknown;
  preview_urls: unknown;
  routes: unknown;
  assets: Record<string, unknown> | undefined;
  vars: Record<string, unknown>;
  d1_databases: unknown;
  services: unknown;
  /** Pages only (#429); wrangler resolves it to an absolute path. */
  pages_build_output_dir: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readDeployConfig(path: string): DeployConfig {
  const raw: unknown = unstable_readConfig({ config: path });
  if (!isRecord(raw)) throw new Error(`${path}: not a config object`);
  const {
    name,
    main,
    workers_dev,
    preview_urls,
    routes,
    assets,
    vars,
    d1_databases,
    services,
    pages_build_output_dir,
  } = raw;
  if (typeof name !== 'string') throw new Error(`${path}: no name`);
  if (main !== undefined && typeof main !== 'string')
    throw new Error(`${path}: main is not a path`);
  if (assets !== undefined && !isRecord(assets))
    throw new Error(`${path}: assets is not an object`);
  if (!isRecord(vars)) throw new Error(`${path}: vars is not an object`);
  return {
    name,
    main,
    workers_dev,
    preview_urls,
    routes,
    assets,
    vars,
    d1_databases,
    services,
    pages_build_output_dir,
  };
}

/** Every wrangler config in the repo, found on disk rather than listed. */
function wranglerConfigs(dir = ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return wranglerConfigs(path);
    return /^wrangler\.(jsonc?|toml)$/.test(entry.name) ? [path] : [];
  });
}

const configs = wranglerConfigs().map((path) => ({
  file: relative(ROOT, path),
  config: readDeployConfig(path),
}));

/** The dev hostname that reaches a binding (apps/dev-hosts/hosts.ts). */
function devHost(binding: string): string {
  const found = [...DEV_HOSTS].find(([, each]) => each === binding);
  if (found === undefined)
    throw new Error(`no dev hostname reaches ${binding}`);
  return found[0];
}

function byName(name: string): DeployConfig {
  const found = configs.find(({ config }) => config.name === name);
  if (found === undefined) throw new Error(`no wrangler config named ${name}`);
  return found.config;
}

describe('the dev Workers’ deploy configs', () => {
  it('finds the three dev Workers and the hostname adapter on disk (liveness)', () => {
    expect(configs.map(({ file }) => file).sort()).toEqual([
      'apps/dev-hosts/wrangler.jsonc',
      'apps/site/wrangler.jsonc',
      'apps/sync-worker/wrangler.jsonc',
      'apps/web/wrangler.jsonc',
    ]);
  });

  it('serves the site Worker on workers.dev with no route, gate first (#332)', () => {
    const site = byName('yawelo-idle-site-dev');
    expect(site.routes).toBeUndefined();
    expect(site.main).toMatch(/apps\/site\/worker\/index\.ts$/);
    expect(site.assets).toMatchObject({
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: '404-page',
    });
  });

  it('reaches the game only through the site Worker’s GAME binding (#332)', () => {
    expect(byName('yawelo-idle-site-dev').services).toEqual([
      { binding: 'GAME', service: 'yawelo-idle-web-dev' },
    ]);
    const game = byName('yawelo-idle-web-dev');
    expect(game.workers_dev).toBe(false);
    expect(game.routes).toBeUndefined();
  });

  it('runs the game’s script before its files, so every response carries the CSP (#123, #332)', () => {
    const game = byName('yawelo-idle-web-dev');
    expect(game.main).toMatch(/apps\/web\/worker\/index\.ts$/);
    expect(game.assets).toEqual({
      directory: './dist',
      binding: 'ASSETS',
      run_worker_first: true,
    });
  });

  it('serves the sync Worker on workers.dev with no route (#395)', () => {
    expect(byName('yawelo-idle-sync-dev').routes).toBeUndefined();
  });

  it('keeps each public dev Worker’s workers.dev address, and the game at none, with no preview URLs (#395, #332, #429)', () => {
    // The Pages adapter sets neither key: Pages has no workers.dev address,
    // and its own pages.dev address answers 404 (apps/dev-hosts/test).
    expect(
      configs
        .map(({ config }) => [
          config.name,
          config.workers_dev,
          config.preview_urls,
        ])
        .sort(),
    ).toEqual([
      ['yawelo-idle-dev-hosts', undefined, undefined],
      ['yawelo-idle-site-dev', true, false],
      ['yawelo-idle-sync-dev', true, false],
      ['yawelo-idle-web-dev', false, false],
    ]);
  });

  it('verifies dev at its dev hostnames, and the game’s own address in the dev account (#429, #332)', () => {
    const verify = verifySteps().find(
      (step) => runOf(step) === 'node scripts/verify-dev.ts',
    );
    const game = `https://${byName('yawelo-idle-web-dev').name}.${DEV_WORKERS_SUBDOMAIN}.workers.dev`;
    expect(verify?.env).toMatchObject({
      DEV_WEB_URL: `https://${devHost('SITE')}/`,
      DEV_SYNC_URL: `https://${devHost('SYNC')}`,
      DEV_GAME_URL: `${game}/`,
    });
  });

  it('names the site’s dev hostname as the dev environment’s address, in both jobs (#429)', () => {
    const workflow = parse(
      readFileSync(join(ROOT, '.github/workflows/deploy-dev.yml'), 'utf8'),
    ) as { jobs: Record<string, { environment?: unknown }> };
    const dev = { name: 'dev', url: `https://${devHost('SITE')}` };
    expect(workflow.jobs['deploy']?.environment).toEqual(dev);
    expect(workflow.jobs['verify']?.environment).toEqual(dev);
  });

  it('serves the dev hostnames through a Pages project bound to the site and sync Workers (#429)', () => {
    const adapter = byName('yawelo-idle-dev-hosts');
    expect(adapter.main).toBeUndefined();
    expect(adapter.pages_build_output_dir).toBe(
      join(ROOT, 'apps/dev-hosts/public'),
    );
    expect(adapter.services).toEqual([
      { binding: 'SITE', service: byName('yawelo-idle-site-dev').name },
      { binding: 'SYNC', service: byName('yawelo-idle-sync-dev').name },
    ]);
  });

  it('binds every Worker a dev hostname names (#429)', () => {
    const declared = byName('yawelo-idle-dev-hosts').services as {
      binding: string;
    }[];
    expect([...new Set(DEV_HOSTS.values())].sort()).toEqual(
      declared.map(({ binding }) => binding).sort(),
    );
  });

  it('declares no secret as a plain var (the password is a Worker secret)', () => {
    const declared = configs.flatMap(({ file, config }) =>
      Object.keys(config.vars).map((name) => ({ file, name })),
    );
    expect(declared).toContainEqual({
      file: 'apps/sync-worker/wrangler.jsonc',
      name: 'COMMIT',
    });
    const secrets = declared.filter(({ name }) =>
      /PASSWORD|SECRET|TOKEN|KEY/i.test(name),
    );
    expect(searched(secrets, { of: declared, what: 'declared vars' })).toEqual(
      [],
    );
    expect(
      floorBreach('dev-config/declared-vars', declared.length),
    ).toBeUndefined();
  });
});

/** The deploy job's steps, read as parsed YAML so no comment counts. */
interface Step {
  name?: string;
  uses?: string;
  run?: unknown;
  'working-directory'?: string;
  env?: Record<string, unknown>;
}
/** A deploy-dev.yml job's steps. */
const jobSteps = (job: 'deploy' | 'verify'): Step[] => {
  const workflow = parse(
    readFileSync(join(ROOT, '.github/workflows/deploy-dev.yml'), 'utf8'),
  ) as { jobs: Record<string, { steps?: Step[] }> };
  const steps = workflow.jobs[job]?.steps;
  if (steps === undefined) throw new Error(`deploy-dev.yml: no ${job} steps`);
  return steps;
};
const deploySteps = (): Step[] => jobSteps('deploy');
const verifySteps = (): Step[] => jobSteps('verify');

describe('the dev D1 database, created by the pipeline (#357 AC1)', () => {
  const DATABASE = 'yawelo-idle-dev';
  /** Written at deploy beside wrangler.jsonc by scripts/d1-binding.ts. */
  const DEPLOY_CONFIG = 'wrangler.deploy.jsonc';

  it('is bound by name alone, with no id copied in by hand', () => {
    expect(byName('yawelo-idle-sync-dev').d1_databases).toEqual([
      { binding: 'DB', database_name: DATABASE, migrations_dir: 'migrations' },
    ]);
  });

  it('is created in Asia Pacific, from the root, before its migrations are applied', () => {
    const runs = deploySteps().map((step) => ({
      run: runOf(step),
      cwd: step['working-directory'],
    }));
    const create = runs.findIndex(
      ({ run }) => run === `node scripts/ensure-d1.ts ${DATABASE} apac`,
    );
    const migrate = runs.findIndex(
      ({ run }) =>
        run ===
        `npx wrangler d1 migrations apply ${DATABASE} --remote --config ${DEPLOY_CONFIG}`,
    );
    expect(create).toBeGreaterThanOrEqual(0);
    expect(runs[create]?.cwd).toBeUndefined();
    expect(migrate).toBeGreaterThan(create);
    expect(runs[migrate]?.cwd).toBe('apps/sync-worker');
  });

  it('is bound by id at deploy: resolved after it exists, then read by the migrations and the sync deploy (#391)', () => {
    const runs = deploySteps().map((step) => ({
      run: runOf(step),
      cwd: step['working-directory'],
    }));
    const create = runs.findIndex(
      ({ run }) => run === `node scripts/ensure-d1.ts ${DATABASE} apac`,
    );
    const bind = runs.findIndex(
      ({ run }) =>
        run ===
        `node scripts/d1-binding.ts ${DATABASE} apps/sync-worker/wrangler.jsonc apps/sync-worker/${DEPLOY_CONFIG}`,
    );
    const migrate = runs.findIndex(({ run }) =>
      run.startsWith(`npx wrangler d1 migrations apply ${DATABASE} `),
    );
    const deploy = runs.findIndex(
      ({ run }) =>
        run ===
        `npx wrangler deploy --config ${DEPLOY_CONFIG} --var "COMMIT:\${GITHUB_SHA}"`,
    );
    expect(create).toBeGreaterThanOrEqual(0);
    expect(bind).toBeGreaterThan(create);
    expect(runs[bind]?.cwd).toBeUndefined();
    expect(migrate).toBeGreaterThan(bind);
    expect(deploy).toBeGreaterThan(migrate);
    expect(runs[deploy]?.cwd).toBe('apps/sync-worker');
  });

  it('keeps the generated deploy config, which holds the id, out of git (#391)', () => {
    // As git check-ignore answers, read in-process (#491); the same answers
    // from git itself are compared in tests/integration/tracked-files.test.ts.
    expect(isIgnored(`apps/sync-worker/${DEPLOY_CONFIG}`, ROOT)).toBe(true);
    expect(isIgnored('apps/sync-worker/wrangler.jsonc', ROOT)).toBe(false);
  });
});

describe('the dev Cloudflare token, proven and held only where it is used (#395)', () => {
  const CLOUDFLARE = {
    CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
    CLOUDFLARE_ACCOUNT_ID: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
  };

  it('is not in the deploy job’s own env, so npm ci and the build never hold it', () => {
    const workflow = parse(
      readFileSync(join(ROOT, '.github/workflows/deploy-dev.yml'), 'utf8'),
    ) as { jobs: Record<string, { env?: Record<string, unknown> }> };
    expect(Object.keys(workflow.jobs['deploy']?.env ?? {})).toEqual([
      'WRANGLER_SEND_METRICS',
    ]);
  });

  it('is held by exactly the steps that call Cloudflare, the reach check first', () => {
    const holds = (run: string) => ({
      run,
      env: expect.objectContaining(CLOUDFLARE) as unknown,
    });
    expect(
      deploySteps()
        .filter((step) =>
          Object.keys(step.env ?? {}).some((name) =>
            name.startsWith('CLOUDFLARE_'),
          ),
        )
        .map((step) => ({ run: runOf(step), env: step.env })),
    ).toEqual([
      holds('node scripts/token-reach.ts'),
      holds('node scripts/ensure-d1.ts yawelo-idle-dev apac'),
      holds(
        'node scripts/d1-binding.ts yawelo-idle-dev apps/sync-worker/wrangler.jsonc apps/sync-worker/wrangler.deploy.jsonc',
      ),
      holds(
        'npx wrangler d1 migrations apply yawelo-idle-dev --remote --config wrangler.deploy.jsonc',
      ),
      holds(
        'npx wrangler deploy --config wrangler.deploy.jsonc --var "COMMIT:${GITHUB_SHA}"',
      ),
      holds('npx wrangler deploy'),
      holds(
        'npx wrangler deploy --secrets-file "$RUNNER_TEMP/site-secrets.json"',
      ),
      holds(
        'npx wrangler pages deploy --branch main --commit-hash "$GITHUB_SHA"',
      ),
    ]);
  });

  it('is proven to reach the dev account alone before any step that uses it', () => {
    const steps = deploySteps();
    const reach = steps.findIndex(
      (step) => runOf(step) === 'node scripts/token-reach.ts',
    );
    const firstCloudflare = steps.findIndex((step) =>
      /wrangler|ensure-d1|d1-binding/.test(runOf(step)),
    );
    expect(reach).toBeGreaterThanOrEqual(0);
    expect(reach).toBeLessThan(firstCloudflare);
  });
});

describe('the dev password, uploaded by the deploy (#357)', () => {
  const FILE = '"$RUNNER_TEMP/site-secrets.json"';

  it('is written from the dev environment secret, then deployed with the site Worker (#332)', () => {
    const steps = deploySteps();
    const write = steps.findIndex(
      (step) => runOf(step) === `node scripts/dev-secrets.ts ${FILE}`,
    );
    const deploy = steps.findIndex(
      (step) => runOf(step) === `npx wrangler deploy --secrets-file ${FILE}`,
    );
    expect(write).toBeGreaterThanOrEqual(0);
    expect(steps[write]?.env).toEqual({
      DEV_PASSWORD: '${{ secrets.DEV_BASIC_AUTH_PASSWORD }}',
    });
    expect(deploy).toBeGreaterThan(write);
    expect(steps[deploy]?.['working-directory']).toBe('apps/site');
  });
});

describe('the hostname adapter, deployed after the Workers it binds (#429)', () => {
  const DEPLOY =
    'npx wrangler pages deploy --branch main --commit-hash "$GITHUB_SHA"';

  it('deploys to the project’s production branch from apps/dev-hosts, after the site and sync Workers', () => {
    const steps = deploySteps();
    const adapter = steps.findIndex((step) => runOf(step) === DEPLOY);
    const workerIn = (dir: string) =>
      steps.findIndex(
        (step) =>
          step['working-directory'] === dir &&
          runOf(step).startsWith('npx wrangler deploy'),
      );
    const site = workerIn('apps/site');
    const sync = workerIn('apps/sync-worker');
    expect(steps[adapter]?.['working-directory']).toBe('apps/dev-hosts');
    expect(site).toBeGreaterThanOrEqual(0);
    expect(sync).toBeGreaterThanOrEqual(0);
    expect(adapter).toBeGreaterThan(site);
    expect(adapter).toBeGreaterThan(sync);
  });

  it('makes the empty static directory it uploads, holding no token, just before', () => {
    const steps = deploySteps();
    const adapter = steps.findIndex((step) => runOf(step) === DEPLOY);
    expect(steps[adapter - 1]).toMatchObject({
      'working-directory': 'apps/dev-hosts',
      run: 'mkdir -p public',
    });
    expect(steps[adapter - 1]?.env).toBeUndefined();
  });
});

describe('the game and the site, deployed in binding order (#332 AC7)', () => {
  const deployIn = (dir: string) =>
    deploySteps().findIndex(
      (step) =>
        step['working-directory'] === dir &&
        runOf(step).startsWith('npx wrangler deploy'),
    );

  it('deploys the game before the site, whose GAME binding names it', () => {
    const game = deployIn('apps/web');
    expect(game).toBeGreaterThanOrEqual(0);
    expect(deployIn('apps/site')).toBeGreaterThan(game);
  });

  it('builds each app, stamped with this commit, before deploying it', () => {
    const builds = deploySteps().flatMap((step, index) =>
      step.env?.['YAWELO_IDLE_COMMIT'] === '${{ github.sha }}'
        ? [{ index, run: runOf(step) }]
        : [],
    );
    expect(builds.map(({ run }) => run)).toEqual([
      'npm run build --workspace @yawelo-idle/web',
      'npm run build --workspace @yawelo-idle/site',
    ]);
    expect(builds[0]?.index).toBeLessThan(deployIn('apps/web'));
    expect(builds[1]?.index).toBeLessThan(deployIn('apps/site'));
  });
});
