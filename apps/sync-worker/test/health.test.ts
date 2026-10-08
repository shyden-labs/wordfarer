import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'jsonc-parser';
import { createTestHarness } from 'wrangler';

/**
 * The dev sync Worker, served by wrangler's test harness from the real
 * wrangler.jsonc, on the workerd that wrangler itself deploys with and a real
 * local D1 (spec §12.4). Every case runs inside workerd (#506).
 *
 * Cases that need an environment no deploy has (another commit, a D1 that
 * throws) go to a second Worker in the same harness: test/injected-worker.ts,
 * which wraps the real one and makes the change the `x-inject` header names.
 * Its config, wrangler.injected.jsonc, differs from wrangler.jsonc only in
 * `name` and `main`, which the first test holds.
 */
const ROOT = new URL('..', import.meta.url).pathname;
const INJECTED = 'yawelo-idle-sync-injected';

const server = createTestHarness({
  root: ROOT,
  workers: [
    { configPath: './wrangler.jsonc' },
    { configPath: './wrangler.injected.jsonc' },
  ],
});

type Init = Parameters<typeof server.fetch>[1];

const call = (path: string, init?: Init) =>
  server.fetch(`https://sync.test${path}`, init);

const inject = (change: string, path = '/health') =>
  server
    .getWorker(INJECTED)
    .fetch(`https://sync.test${path}`, { headers: { 'x-inject': change } });

const config = (file: string): Record<string, unknown> =>
  parse(readFileSync(`${ROOT}${file}`, 'utf8')) as Record<string, unknown>;

beforeAll(async () => {
  await server.listen();
});

afterAll(async () => {
  await server.close();
});

describe('the injected Worker (test only)', () => {
  it('is the deployed config but for its name and entry point', () => {
    const deployed = config('wrangler.jsonc');
    const injected = config('wrangler.injected.jsonc');
    expect(injected).toMatchObject({
      name: INJECTED,
      main: 'test/injected-worker.ts',
    });
    expect({
      ...injected,
      name: deployed.name,
      main: deployed.main,
    }).toEqual(deployed);
  });

  it('refuses a change it does not know, so a typo cannot pass unchanged', async () => {
    const response = await inject('comit=abc');
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('unknown x-inject: comit=abc');
  });
});

describe('GET /health', () => {
  it('reports ok, the commit and a D1 that answers', async () => {
    const response = await call('/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      ok: true,
      commit: 'local',
      db: 'ok',
    });
  });

  it('reports the commit it was deployed with', async () => {
    const sha = 'd547bd669678987eb85b5807d1a26ea55eaeb987';
    const response = await inject(`commit=${sha}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ commit: sha });
  });

  it('answers 503, not 200, when D1 throws', async () => {
    const response = await inject('d1-throws');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      commit: 'local',
      db: 'unreachable',
    });
  });

  it('logs why D1 failed, so a 503 can be diagnosed from the Worker logs', async () => {
    const response = await inject('d1-throws');
    expect(JSON.parse(response.headers.get('x-console-error') ?? '')).toEqual([
      ['health: D1 query failed', '<the injected D1 error>'],
    ]);
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])(
    'refuses %s, naming GET as the one method it allows',
    async (method) => {
      const response = await call('/health', { method });
      expect(response.status, method).toBe(405);
      expect(response.headers.get('allow'), method).toBe('GET');
    },
  );

  it.each(['/', '/healthz', '/health/', '/HEALTH', '/health/extra'])(
    'answers 404 for %s',
    async (path) => {
      const response = await call(path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not_found' });
    },
  );
});

describe('non-prod marking (#39)', () => {
  const host = (origin: string, path: string) =>
    server.fetch(`${origin}${path}`);

  it.each(['/health', '/missing'])(
    'marks %s noindex on the dev API host, with no password asked',
    async (path) => {
      const response = await host(
        'https://yawelo-idle-sync-dev.shyden-labs-dev.workers.dev',
        path,
      );
      expect(response.status).not.toBe(401);
      expect(response.headers.get('x-robots-tag')).toBe(
        'noindex, nofollow, noarchive',
      );
    },
  );

  it('serves blocking robots.txt on the dev API host', async () => {
    const response = await host(
      'https://yawelo-idle-sync-dev.shyden-labs-dev.workers.dev',
      '/robots.txt',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('User-agent: *\nDisallow: /\n');
  });

  it('leaves the production API host unmarked, robots.txt included', async () => {
    const health = await host(
      'https://api.yawelo-idle.shyden.co.uk',
      '/health',
    );
    expect(health.status).toBe(200);
    expect(health.headers.get('x-robots-tag')).toBeNull();
    const robots = await host(
      'https://api.yawelo-idle.shyden.co.uk',
      '/robots.txt',
    );
    expect(robots.status).toBe(404);
    expect(robots.headers.get('x-robots-tag')).toBeNull();
  });
});
