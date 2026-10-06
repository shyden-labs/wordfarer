import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import { DEV_HOSTS, type DevBinding } from '../hosts';

/**
 * The dev hostname adapter (#429 AC1), compiled by `npm test` into .build and
 * served by wrangler's test harness. Each binding points at an echo Worker
 * (test/echo.ts) that reports what reached it; a request the adapter keeps
 * gets the adapter's own 404 instead, so a 200 from an echo is the only way a
 * request can have reached a Worker.
 *
 * Absolute URLs set the hostname the Function sees.
 */
const ECHO: Record<DevBinding, string> = {
  SITE: 'site-echo',
  SYNC: 'sync-echo',
};

const server = createTestHarness({
  root: new URL('..', import.meta.url).pathname,
  workers: [
    {
      config: {
        name: 'dev-hosts',
        main: './.build/index.js',
        compatibility_date: '2026-09-30',
        services: [
          { binding: 'SITE', service: ECHO.SITE },
          { binding: 'SYNC', service: ECHO.SYNC },
        ],
      },
    },
    ...Object.entries(ECHO).map(([binding, name]) => ({
      config: {
        name,
        main: './test/echo.ts',
        compatibility_date: '2026-09-30',
        vars: { WHO: binding },
      },
    })),
  ],
});

beforeAll(async () => {
  await server.listen();
});

afterAll(async () => {
  await server.close();
});

describe('the dev hostnames', () => {
  it('are exactly the site’s and the sync API’s, each with its binding (#429)', () => {
    expect([...DEV_HOSTS]).toEqual([
      ['dev.yawelo-idle.shyden.co.uk', 'SITE'],
      ['dev-api.yawelo-idle.shyden.co.uk', 'SYNC'],
    ]);
  });
});

describe('a dev hostname reaches its Worker with the request unchanged (#429 AC1)', () => {
  for (const [host, binding] of DEV_HOSTS) {
    it(`${host}: method, path, query, header and body reach ${binding}`, async () => {
      const response = await server.fetch(
        `https://${host}/some/path?q=1&r=two`,
        {
          method: 'POST',
          headers: { 'x-probe': 'kept' },
          body: 'payload',
        },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        who: binding,
        method: 'POST',
        host,
        pathname: '/some/path',
        search: '?q=1&r=two',
        probe: 'kept',
        body: 'payload',
      });
    });

    it(`${host}: the root path reaches ${binding}`, async () => {
      const response = await server.fetch(`https://${host}/`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        who: binding,
        method: 'GET',
        pathname: '/',
        search: '',
      });
    });
  }
});

/**
 * Hosts the adapter must keep to itself. Its own pages.dev name and every
 * preview deployment's are public (#429 comment, 2026-10-06 07:57).
 */
const UNKNOWN_HOSTS: readonly [host: string, why: string][] = [
  ['yawelo-idle-dev-hosts.pages.dev', 'the project’s own address'],
  ['a1b2c3d4.yawelo-idle-dev-hosts.pages.dev', 'a preview deployment'],
  ['yawelo-idle.shyden.co.uk', 'production’s name'],
  ['api.yawelo-idle.shyden.co.uk', 'production’s API name'],
  ['dev.yawelo-idle.shyden.co.uk.evil.example', 'a dev name as a prefix'],
  ['evil-dev.yawelo-idle.shyden.co.uk', 'a dev name as a suffix'],
  ['constructor', 'a key every plain object inherits'],
];

describe('any other host answers 404 and reaches neither Worker (#429 AC1)', () => {
  for (const [host, why] of UNKNOWN_HOSTS) {
    it(`${host} (${why})`, async () => {
      const response = await server.fetch(`https://${host}/play/?q=1`, {
        method: 'POST',
        body: 'payload',
      });
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('not found');
    });
  }
});
