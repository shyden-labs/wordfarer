import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import { BLOCKING_ROBOTS_TXT, NO_INDEX } from '@yawelo-idle/lockdown';

/**
 * The dev web Worker, served by wrangler's test harness from the real
 * wrangler.jsonc and the built ./dist. Requests go through the server, so
 * Cloudflare's asset router decides whether the Worker runs at all: this is
 * the layer `run_worker_first` configures, and the only one where its absence
 * shows. (vitest-pool-workers' `exports.default.fetch` and `SELF` call the
 * Worker directly, below the router; measured 2026-10-01, both stayed green
 * with `run_worker_first: false`.)
 *
 * Absolute URLs set the hostname the Worker sees.
 */
const DEV = 'https://dev.wordfarer.shyden.co.uk';
const PROD = 'https://wordfarer.shyden.co.uk';
const PASSWORD = 'test-only-password';

const authorised = { Authorization: `Basic ${btoa(`tester:${PASSWORD}`)}` };
const wrong = { Authorization: `Basic ${btoa('tester:not-it')}` };

const server = createTestHarness({
  root: new URL('..', import.meta.url).pathname,
  workers: [
    { configPath: './wrangler.jsonc', secrets: { DEV_PASSWORD: PASSWORD } },
  ],
});

const get = (url: string, headers: Record<string, string> = {}) =>
  server.fetch(url, { headers });

beforeAll(async () => {
  await server.listen();
});

/**
 * The built script dist/index.html loads, read through the gate with the
 * password. Found once and shared, but inside the tests that need it, so a
 * broken Worker fails each test on its own instead of skipping them all.
 */
let script: Promise<{ path: string; body: string }> | undefined;
function builtScript(): Promise<{ path: string; body: string }> {
  script ??= (async () => {
    const html = await (await get(`${DEV}/`, authorised)).text();
    const path =
      /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1] ?? '';
    const body = await (await get(`${DEV}${path}`, authorised)).text();
    return { path, body };
  })();
  return script;
}

afterAll(async () => {
  await server.close();
});

describe('the dev web Worker gate, through the asset router', () => {
  it('found a real built script to probe (liveness)', async () => {
    const { path, body } = await builtScript();
    expect(path).toMatch(/^\/assets\/.+\.js$/);
    expect(body.length).toBeGreaterThan(1000);
  });

  it('serves the app with the password, noindex added', async () => {
    const response = await get(`${DEV}/`, authorised);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBe(NO_INDEX);
    expect(await response.text()).toContain('<meta name="yawelo-idle-commit"');
  });

  it.each([
    ['without credentials', {}],
    ['with a wrong password', wrong],
  ])(
    'refuses a real built asset %s and sends none of its bytes',
    async (_case, headers) => {
      const { path, body: scriptBody } = await builtScript();
      const response = await get(`${DEV}${path}`, headers);
      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toBe(
        'Basic realm="Yawelo Idle Non-Prod"',
      );
      expect(response.headers.get('X-Robots-Tag')).toBe(NO_INDEX);
      const body = await response.text();
      expect(body).not.toContain(scriptBody.slice(0, 200));
      expect(body.length).toBeLessThan(200);
    },
  );

  it.each(['/', '/index.html', '/some/client/route'])(
    'refuses the page %s without credentials',
    async (path) => {
      const response = await get(`${DEV}${path}`);
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain('<');
    },
  );

  it('serves blocking robots.txt without credentials', async () => {
    const response = await get(`${DEV}/robots.txt`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(BLOCKING_ROBOTS_TXT);
  });

  it('serves index.html for a client route once authorised', async () => {
    const response = await get(`${DEV}/some/client/route`, authorised);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<meta name="yawelo-idle-commit"');
  });

  it('passes the production host through untouched', async () => {
    const { path, body } = await builtScript();
    const response = await get(`${PROD}${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBeNull();
    expect(await response.text()).toBe(body);
  });
});
