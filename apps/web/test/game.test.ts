import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import { floorBreach } from '../../../tests/floors';
import { searched } from '../../../tests/searched';

/**
 * The dev game Worker, served by wrangler's test harness from the real
 * wrangler.jsonc and the built ./dist. Requests go through the server, so
 * Cloudflare's asset router decides whether the Worker's script runs at all:
 * it runs only for a path with no file.
 *
 * In production the game is reached only through the site Worker's GAME
 * binding, after the dev gate (apps/site/test/site.test.ts proves the
 * forwarding; scripts/verify-dev.ts proves the two together on dev). Here
 * it runs alone, because local workerd serves static assets for the harness's
 * primary Worker only (measured with wrangler 4.145.0, #332).
 */
const HOST = 'https://yawelo-idle-site-dev.shyden-labs-dev.workers.dev';

const server = createTestHarness({
  root: new URL('..', import.meta.url).pathname,
  workers: [{ configPath: './wrangler.jsonc' }],
});

const get = (path: string) =>
  server.fetch(`${HOST}${path}`, { redirect: 'manual' });

beforeAll(async () => {
  await server.listen();
});

afterAll(async () => {
  await server.close();
});

/**
 * The script the built shell loads. Found once and shared, but inside the
 * tests that need it, so a broken build fails each test on its own instead
 * of skipping them all.
 */
let script: Promise<string> | undefined;
function builtScript(): Promise<string> {
  script ??= (async () => {
    const html = await (await get('/play/')).text();
    return (
      /<script[^>]+src="(\/play\/assets\/[^"]+\.js)"/.exec(html)?.[1] ?? ''
    );
  })();
  return script;
}

describe('the game Worker, under /play/ (#332 AC4)', () => {
  it('serves the game shell at /play/, stamped with its commit', async () => {
    const response = await get('/play/');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/html; charset=utf-8',
    );
    expect(await response.text()).toContain('<meta name="yawelo-idle-commit"');
  });

  it('loads its script from /play/assets/ as JavaScript', async () => {
    const path = await builtScript();
    expect(path).toMatch(/^\/play\/assets\/.+\.js$/);
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/javascript; charset=utf-8',
    );
  });

  it('redirects /play to /play/', async () => {
    const response = await get('/play');
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('/play/');
  });

  it('serves the shell for a client route under /play/', async () => {
    const shell = await (await get('/play/')).text();
    const response = await get('/play/a/client/route');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(shell);
  });

  it.each([
    '/',
    '/index.html',
    '/robots.txt',
    '/assets/index.js',
    '/playground',
  ])('has nothing outside /play/: %s is not found', async (path) => {
    const response = await get(path);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });

  it.each([
    ['the roadmap', 'href="/roadmap"'],
    ['the launch list', 'href="/#launch-list"'],
    ['the Indonesian roadmap', 'href="/id/roadmap"'],
    ['the Indonesian launch list', 'href="/id/#launch-list"'],
  ])('says coming soon and links to %s (#332 AC6)', async (_name, href) => {
    const body = await (await get(await builtScript())).text();
    expect(body).toContain('Coming soon.');
    expect(body).toContain(href);
  });
});

/**
 * The first policy (#123 AC5); #153 owns the full one and the other headers.
 * Pinned as a literal: a value read from the Worker would move with it.
 */
const POLICY =
  "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

describe('the game Worker sets a Content Security Policy (#123 AC5)', () => {
  it.each([
    ['the shell', '/play/'],
    ['a client route', '/play/a/client/route'],
    ['the redirect from /play', '/play'],
    ['a path outside /play/', '/'],
  ])('on %s', async (_name, path) => {
    const response = await get(path);
    expect(response.headers.get('Content-Security-Policy')).toBe(POLICY);
  });

  it('on the script the shell loads, a file the asset router serves', async () => {
    const response = await get(await builtScript());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toBe(POLICY);
  });

  it('the shell needs nothing inline: every script has a src, no style element or attribute, no handler', async () => {
    const html = await (await get('/play/')).text();
    const tags = html.match(/<[a-zA-Z][^>]*>/g) ?? [];
    const inline = tags.filter(
      (tag) =>
        (/^<script\b/i.test(tag) && !/\ssrc=/i.test(tag)) ||
        /^<style\b/i.test(tag) ||
        /\sstyle=/i.test(tag) ||
        /\son[a-z]+=/i.test(tag),
    );
    expect(
      searched(inline, { of: tags, what: 'tags in the served shell' }),
    ).toEqual([]);
    expect(floorBreach('game-html/tags', tags.length)).toBeUndefined();
  });
});
