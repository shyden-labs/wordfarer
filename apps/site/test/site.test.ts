import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import {
  BLOCKING_ROBOTS_TXT,
  challengeResponse,
  NO_INDEX,
} from '@yawelo-idle/lockdown';
import { COPY } from '../src/copy';
import {
  otherLocale,
  pagePath,
  SITE,
  type Locale,
  type Page,
} from '../src/i18n';
import { EXEMPT_PATHS } from '../worker/routes';

/**
 * The dev site Worker, served by wrangler's test harness from the real
 * wrangler.jsonc and the built ./dist. Requests go through the server, so
 * Cloudflare's asset router decides whether the Worker runs at all: this is
 * the layer `run_worker_first` configures, and the only one where its absence
 * shows. (vitest-pool-workers' `exports.default.fetch` and `SELF` call the
 * Worker directly, below the router; measured 2026-10-01, both stayed green
 * with `run_worker_first: false`.)
 *
 * The GAME binding points at test/game-echo.ts, which reports what reached
 * it (that file says why the real game cannot run beside the site here).
 *
 * Absolute URLs set the hostname the Worker sees.
 */
const DEV = 'https://yawelo-idle-site-dev.shyden-labs-dev.workers.dev';
const PROD = SITE;
const PASSWORD = 'test-only-password';

const authorised = { Authorization: `Basic ${btoa(`tester:${PASSWORD}`)}` };
const wrong = { Authorization: `Basic ${btoa('tester:not-it')}` };

const server = createTestHarness({
  root: new URL('..', import.meta.url).pathname,
  workers: [
    {
      configPath: './wrangler.jsonc',
      secrets: { DEV_PASSWORD: PASSWORD },
      bindingOverrides: { GAME: 'game-echo' },
    },
    {
      config: {
        name: 'game-echo',
        main: './test/game-echo.ts',
        compatibility_date: '2026-09-30',
      },
    },
  ],
});

const get = (url: string, headers: Record<string, string> = {}) =>
  server.fetch(url, { headers, redirect: 'manual' });

beforeAll(async () => {
  await server.listen();
});

afterAll(async () => {
  await server.close();
});

/** What the stand-in game reported, or undefined if the game was not reached. */
async function reachedGame(
  // The harness answers with miniflare's Response, not the DOM's.
  response: Pick<Response, 'json'>,
): Promise<object | undefined> {
  const body: unknown = await response.json().catch(() => undefined);
  return typeof body === 'object' && body !== null && 'game' in body
    ? body
    : undefined;
}

const PAGES: [Locale, Page][] = [
  ['en', 'home'],
  ['en', 'roadmap'],
  ['en', 'privacy'],
  ['id', 'home'],
  ['id', 'roadmap'],
  ['id', 'privacy'],
];

describe('the dev site Worker gate, through the asset router', () => {
  it('serves the home page with the password, noindex added', async () => {
    const response = await get(`${DEV}/`, authorised);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBe(NO_INDEX);
    expect(await response.text()).toContain('<meta name="yawelo-idle-commit"');
  });

  it.each([
    ['without credentials', {}],
    ['with a wrong password', wrong],
  ])(
    'refuses a real built page %s and sends none of its bytes',
    async (_case, headers) => {
      const page = await (await get(`${DEV}/roadmap`, authorised)).text();
      expect(page).toContain(COPY.en.roadmapSoon);
      const response = await get(`${DEV}/roadmap`, headers);
      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toBe(
        'Basic realm="Yawelo Idle Non-Prod"',
      );
      expect(response.headers.get('X-Robots-Tag')).toBe(NO_INDEX);
      expect(await response.text()).toBe(await challengeResponse().text());
    },
  );

  it.each(['/', '/id/', '/index.html', '/privacy', '/no/such/page'])(
    'refuses the page %s without credentials',
    async (path) => {
      const response = await get(`${DEV}${path}`);
      expect(response.status).toBe(401);
      expect(await response.text()).toBe(await challengeResponse().text());
    },
  );

  it.each(['/play', '/play/', '/play/assets/index.js'])(
    'refuses the game path %s without credentials and never forwards it',
    async (path) => {
      const response = await get(`${DEV}${path}`);
      expect(response.status).toBe(401);
      expect(await reachedGame(response)).toBeUndefined();
    },
  );

  it('serves blocking robots.txt without credentials', async () => {
    const response = await get(`${DEV}/robots.txt`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(BLOCKING_ROBOTS_TXT);
  });

  it('passes the production host through untouched', async () => {
    const page = await (await get(`${DEV}/roadmap`, authorised)).text();
    const response = await get(`${PROD}/roadmap`);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBeNull();
    expect(await response.text()).toBe(page);
  });
});

describe('the paths exempt from the gate (#341 signs them instead)', () => {
  it.each(EXEMPT_PATHS)(
    '%s reaches its handler without credentials, which takes POST only',
    async (path) => {
      const response = await get(`${DEV}${path}`);
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('POST');
      expect(response.headers.get('WWW-Authenticate')).toBeNull();
    },
  );

  it.each(['/hooks/github/', '/hooks/github/x', '/hooks/githubx', '/hooks'])(
    'gates %s, which only looks like an exempt path',
    async (path) => {
      const response = await get(`${DEV}${path}`);
      expect(response.status).toBe(401);
    },
  );
});

describe('the game, forwarded through the GAME binding after the gate', () => {
  it.each(['/play', '/play/', '/play/assets/index.js', '/play/a/client/route'])(
    'forwards %s with its path and the credentials unchanged',
    async (path) => {
      const response = await get(`${DEV}${path}?x=1`, authorised);
      expect(response.status).toBe(200);
      expect(await reachedGame(response)).toEqual({
        game: true,
        method: 'GET',
        pathname: path,
        search: '?x=1',
        authorization: authorised.Authorization,
      });
    },
  );

  it('adds noindex to what the game answers on dev', async () => {
    const response = await get(`${DEV}/play/`, authorised);
    expect(response.headers.get('X-Robots-Tag')).toBe(NO_INDEX);
  });

  it.each(['/playground', '/plays', '/id/play/'])(
    'keeps %s on the site, which only looks like a game path',
    async (path) => {
      const response = await get(`${DEV}${path}`, authorised);
      expect(response.status).toBe(404);
      expect(await reachedGame(response)).toBeUndefined();
    },
  );
});

describe('the placeholder pages, in both languages (#332 AC1, AC2)', () => {
  it.each(PAGES)('%s %s is served at its own path', async (locale, page) => {
    const response = await get(`${DEV}${pagePath(locale, page)}`, authorised);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<html lang="${locale}"`);
    expect(html).toContain(`<title>${COPY[locale].titles[page]}</title>`);
  });

  it.each(PAGES)(
    '%s %s carries the development strip in its language',
    async (locale, page) => {
      const html = await (
        await get(`${DEV}${pagePath(locale, page)}`, authorised)
      ).text();
      expect(html).toContain(
        `<p class="dev-strip" data-dev-strip>${COPY[locale].devStrip}</p>`,
      );
    },
  );

  it.each(PAGES)(
    '%s %s switches language to the same page',
    async (locale, page) => {
      const other = otherLocale(locale);
      const html = await (
        await get(`${DEV}${pagePath(locale, page)}`, authorised)
      ).text();
      expect(html).toContain(
        `<a href="${pagePath(other, page)}" hreflang="${other}" lang="${other}" data-language-switch>`,
      );
    },
  );

  it.each(PAGES)(
    '%s %s lists every language as an hreflang alternate',
    async (locale, page) => {
      const html = await (
        await get(`${DEV}${pagePath(locale, page)}`, authorised)
      ).text();
      const links = [...html.matchAll(/<link rel="alternate"[^>]*>/g)].map(
        ([link]) => link,
      );
      expect(links).toEqual([
        `<link rel="alternate" hreflang="en" href="${SITE}${pagePath('en', page)}">`,
        `<link rel="alternate" hreflang="id" href="${SITE}${pagePath('id', page)}">`,
        `<link rel="alternate" hreflang="x-default" href="${SITE}${pagePath('en', page)}">`,
      ]);
    },
  );

  it.each([
    ['en', '/no/such/page'],
    ['id', '/id/no/such/page'],
  ] as const)(
    'answers an unknown %s path %s with that language’s 404 page',
    async (locale, path) => {
      const response = await get(`${DEV}${path}`, authorised);
      expect(response.status).toBe(404);
      const html = await response.text();
      expect(html).toContain(`<html lang="${locale}"`);
      expect(html).toContain(COPY[locale].notFoundTitle);
      expect(html).toContain(COPY[locale].devStrip);
    },
  );
});
