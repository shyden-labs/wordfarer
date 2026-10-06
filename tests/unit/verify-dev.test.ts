import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  NO_INDEX,
  basicAuthorization,
  gateJudgement,
  gateProblems,
  healthJudgement,
  healthProblems,
  leaked,
  roadmapJudgement,
  roadmapProblems,
  retiredJudgement,
  retiredProblems,
  robotsJudgement,
  robotsProblems,
  scriptJudgement,
  scriptProblems,
  SITE_PAGES,
  verifyDev,
  webJudgement,
  webProblems,
  type Probe,
} from '../../scripts/verify-dev';
import { floorBreach } from '../floors';
import { searched } from '../searched';

const SHA = 'd547bd669678987eb85b5807d1a26ea55eaeb987';
const OLD = '1f660b30f75d081ae6559d175e5c0c3e26acb84c';
const PASSWORD = 'pä:ss';
const ROBOTS = '# blocked\nUser-agent: *\nDisallow: /\n';
const page = (sha: string) =>
  `<!doctype html><html><head><meta name="yawelo-idle-commit" content="${sha}" /></head></html>`;
const probe = (
  status: number,
  body = '',
  headers: Record<string, string> = {},
): Probe => ({ status, body, headers: new Headers(headers) });
const challenge = { 'www-authenticate': 'Basic realm="Yawelo Idle Non-Prod"' };
const SCRIPT = '/play/assets/app.js';
const JAVASCRIPT = 'text/javascript; charset=utf-8';
/** A page as the fake site serves it: every page names the game's script. */
const shell = (sha: string) =>
  page(sha).replace(
    '</head>',
    `<script type="module" src="${SCRIPT}"></script></head>`,
  );
const noindex = { 'x-robots-tag': NO_INDEX };

describe('basicAuthorization', () => {
  it('encodes the password as UTF-8 after a fixed username', () => {
    const header = basicAuthorization(PASSWORD);
    expect(header.startsWith('Basic ')).toBe(true);
    const bytes = Uint8Array.from(atob(header.slice(6)), (c) =>
      c.charCodeAt(0),
    );
    expect(new TextDecoder().decode(bytes)).toBe(`verify-dev:${PASSWORD}`);
  });
});

describe('gateProblems', () => {
  it('accepts a 401 Basic challenge with no app in it', () => {
    const judged = gateJudgement('web', probe(401, 'testers only', challenge));
    expect(
      searched(judged.problems, { of: judged.checked, what: 'gate checks' }),
    ).toEqual([]);
    expect(
      floorBreach('verify-dev/gate-checks', judged.checked.length),
    ).toBeUndefined();
  });

  it('fails a 200, naming the missing gate', () => {
    expect(gateProblems('web', probe(200, page(SHA)))).toEqual([
      'web: answered 200, expected 401; the password gate is not in front of it',
      'web: no Basic WWW-Authenticate challenge',
      'web: the response carries app markup',
    ]);
  });

  it.each([
    ['a non-Basic challenge', { 'www-authenticate': 'Bearer' }],
    ['no challenge at all', {}],
  ])('fails a 401 with %s', (_case, headers) => {
    expect(gateProblems('web', probe(401, '', headers))).toEqual([
      'web: no Basic WWW-Authenticate challenge',
    ]);
  });

  it('fails a 401 that still carries the page', () => {
    expect(gateProblems('web', probe(401, page(SHA), challenge))).toEqual([
      'web: the response carries app markup',
    ]);
  });

  it('fails a redirect, which is not the challenge', () => {
    expect(gateProblems('web', probe(302, '', challenge))).toEqual([
      'web: answered 302, expected 401; the password gate is not in front of it',
    ]);
  });
});

describe('leaked', () => {
  it.each([
    [200, true],
    [204, true],
    [299, true],
    [301, false],
    [401, false],
    [500, false],
  ])('status %i leaked: %s', (status, expected) => {
    expect(leaked(probe(status))).toBe(expected);
  });
});

describe('robotsProblems', () => {
  it('accepts a robots.txt that blocks every crawler', () => {
    const judged = robotsJudgement(probe(200, ROBOTS));
    expect(
      searched(judged.problems, { of: judged.checked, what: 'robots checks' }),
    ).toEqual([]);
    expect(
      floorBreach('verify-dev/robots-checks', judged.checked.length),
    ).toBeUndefined();
  });

  it.each([
    ['allows everything', 'User-agent: *\nDisallow:\n'],
    ['blocks one crawler only', 'User-agent: Googlebot\nDisallow: /\n'],
    ['blocks a path only', 'User-agent: *\nDisallow: /admin\n'],
    ['is empty', ''],
  ])('fails one that %s', (_case, body) => {
    expect(robotsProblems(probe(200, body))).toEqual([
      'robots.txt: does not block every crawler',
    ]);
  });

  it('fails a challenge in place of robots.txt', () => {
    expect(robotsProblems(probe(401, ROBOTS))).toEqual([
      'robots.txt: status 401 without credentials, expected 200',
    ]);
  });
});

describe('webProblems', () => {
  it('accepts the expected commit with noindex', () => {
    const judged = webJudgement(probe(200, page(SHA), noindex), SHA);
    expect(
      searched(judged.problems, { of: judged.checked, what: 'web checks' }),
    ).toEqual([]);
    expect(
      floorBreach('verify-dev/web-checks', judged.checked.length),
    ).toBeUndefined();
  });

  it('names the stale commit when the previous deploy is still served', () => {
    expect(webProblems(probe(200, page(OLD), noindex), SHA)).toEqual([
      `web: serves commit ${OLD}, expected ${SHA}`,
    ]);
  });

  it('fails a page without the noindex header', () => {
    expect(webProblems(probe(200, page(SHA)), SHA)).toEqual([
      `web: X-Robots-Tag is null, expected "${NO_INDEX}"`,
    ]);
  });

  it('fails a page with no stamp, and a non-200', () => {
    expect(webProblems(probe(200, '<html></html>', noindex), SHA)).toEqual([
      'web: no yawelo-idle-commit meta tag in the page',
    ]);
    expect(webProblems(probe(401, '', noindex), SHA)).toEqual([
      'web: status 401 with the password, expected 200',
    ]);
  });
});

describe('scriptProblems (#332)', () => {
  it('accepts JavaScript with noindex, judging every check', () => {
    const ok = probe(200, 'export {};', {
      'content-type': JAVASCRIPT,
      ...noindex,
    });
    expect(scriptJudgement('web /x.js', ok)).toEqual({
      checked: ['status', 'content type', 'noindex'],
      problems: [],
    });
  });

  it('fails a non-200 and judges nothing after it', () => {
    expect(scriptJudgement('web /x.js', probe(404))).toEqual({
      checked: ['status'],
      problems: ['web /x.js: status 404 with the password, expected 200'],
    });
  });

  it.each([
    ['HTML', 'text/html; charset=utf-8'],
    ['a look-alike type', 'text/javascriptish'],
  ])('fails a script served as %s', (_case, type) => {
    const wrongType = probe(200, '', { 'content-type': type, ...noindex });
    expect(scriptProblems('web /x.js', wrongType)).toEqual([
      `web /x.js: Content-Type is ${JSON.stringify(type)}, expected text/javascript`,
    ]);
  });

  it('fails a script without the noindex header', () => {
    const bare = probe(200, '', { 'content-type': JAVASCRIPT });
    expect(scriptProblems('web /x.js', bare)).toEqual([
      'web /x.js: X-Robots-Tag is null, expected "noindex, nofollow, noarchive"',
    ]);
  });
});

describe('retiredProblems (#332)', () => {
  it('accepts a not-found that carries no game, judging both checks', () => {
    expect(retiredJudgement(probe(404, 'There is nothing here yet'))).toEqual({
      checked: ['status', 'no game'],
      problems: [],
    });
  });

  it.each([200, 301, 307, 399])(
    'fails a %s, which reaches past the gate',
    (status) => {
      expect(retiredProblems(probe(status))).toEqual([
        `game address: answered ${String(status)}; the game is reachable around the site's gate`,
      ]);
    },
  );

  it('fails an error page that still carries the game', () => {
    expect(retiredProblems(probe(500, page(SHA)))).toEqual([
      'game address: the response carries the game',
    ]);
  });
});

describe('healthProblems', () => {
  const healthy = JSON.stringify({ ok: true, commit: SHA, db: 'ok' });

  it('accepts ok, the commit, db ok and noindex', () => {
    const judged = healthJudgement(probe(200, healthy, noindex), SHA);
    expect(
      searched(judged.problems, { of: judged.checked, what: 'health checks' }),
    ).toEqual([]);
    expect(
      floorBreach('verify-dev/health-checks', judged.checked.length),
    ).toBeUndefined();
  });

  it.each([
    ['a stale commit', { ok: true, commit: OLD, db: 'ok' }],
    ['a D1 failure', { ok: false, commit: SHA, db: 'unreachable' }],
    ['an extra field', { ok: true, commit: SHA, db: 'ok', debug: 1 }],
  ])('fails %s', (_label, body) => {
    expect(
      healthProblems(probe(200, JSON.stringify(body), noindex), SHA),
    ).toHaveLength(1);
  });

  it('fails a healthy answer without the noindex header', () => {
    expect(
      healthProblems(probe(200, healthy, { 'x-robots-tag': 'noindex' }), SHA),
    ).toEqual([`sync: X-Robots-Tag is "noindex", expected "${NO_INDEX}"`]);
  });

  it('fails a non-JSON body and a non-200', () => {
    expect(healthProblems(probe(200, 'oops', noindex), SHA)).toEqual([
      'sync: /health did not return JSON',
    ]);
    expect(healthProblems(probe(503, healthy, noindex), SHA)).toEqual([
      'sync: /health status 503, expected 200',
    ]);
  });
});

describe('roadmapProblems (#341)', () => {
  const NOW = Date.parse('2026-10-06T13:00:00Z');
  const healthy = {
    lastEventAt: '2026-10-06T12:58:00.000Z',
    lastCheckAt: '2026-10-06T12:51:00.000Z',
    version: 3,
    drift: 0,
    driftTotal: 0,
    pendingDriftSince: null,
    readFailingSince: null,
    readError: null,
  };
  const health = (over: Record<string, unknown> = {}) =>
    probe(200, JSON.stringify({ ...healthy, ...over }), noindex);

  it('accepts a read board with no drift, no failing reads and a recent check', () => {
    const judged = roadmapJudgement(health(), NOW);
    expect(
      searched(judged.problems, { of: judged.checked, what: 'roadmap checks' }),
    ).toEqual([]);
    expect(
      floorBreach('verify-dev/roadmap-checks', judged.checked.length),
    ).toBeUndefined();
  });

  it('fails a board never read', () => {
    expect(roadmapProblems(health({ version: 0 }), NOW)).toEqual([
      'roadmap: version 0: the board has never been read',
    ]);
  });

  it('fails drift, naming a missed webhook, however old it is', () => {
    expect(roadmapProblems(health({ drift: 1, driftTotal: 1 }), NOW)).toEqual([
      'roadmap: drift 1 since a webhook last delivered a change: a board change reached the roadmap only through the 10-minute check, so a webhook was missed',
    ]);
  });

  it('fails reads that are failing, with the reason', () => {
    expect(
      roadmapProblems(
        health({
          readFailingSince: '2026-10-06T12:40:00.000Z',
          readError: 'GitHub refused POST /graphql: HTTP 502',
        }),
        NOW,
      ),
    ).toEqual([
      'roadmap: reads failing since 2026-10-06T12:40:00.000Z: GitHub refused POST /graphql: HTTP 502',
    ]);
  });

  it('fails a last check more than 20 minutes old', () => {
    expect(
      roadmapProblems(health({ lastCheckAt: '2026-10-06T12:39:59.000Z' }), NOW),
    ).toEqual([
      'roadmap: last check 2026-10-06T12:39:59.000Z, more than 20 minutes ago: the cron is not running',
    ]);
  });

  it('accepts a last check exactly 20 minutes old, at the recorded floor', () => {
    const judged = roadmapJudgement(
      health({ lastCheckAt: '2026-10-06T12:40:00.000Z' }),
      NOW,
    );
    expect(
      searched(judged.problems, { of: judged.checked, what: 'roadmap checks' }),
    ).toEqual([]);
    expect(
      floorBreach(
        'verify-dev/roadmap-checks-at-the-bound',
        judged.checked.length,
      ),
    ).toBeUndefined();
  });

  it('fails a check that never ran', () => {
    expect(roadmapProblems(health({ lastCheckAt: null }), NOW)).toEqual([
      'roadmap: last check null, more than 20 minutes ago: the cron is not running',
    ]);
  });

  it('fails a non-JSON body and a non-200', () => {
    expect(roadmapProblems(probe(200, 'oops', noindex), NOW)).toEqual([
      'roadmap: /api/roadmap/health did not return JSON',
    ]);
    expect(roadmapProblems(probe(401, '', noindex), NOW)).toEqual([
      'roadmap: /api/roadmap/health status 401, expected 200',
    ]);
  });

  it('fails a healthy answer without the noindex header', () => {
    expect(
      roadmapProblems(
        probe(200, JSON.stringify(healthy), { 'x-robots-tag': 'noindex' }),
        NOW,
      ),
    ).toEqual([`roadmap: X-Robots-Tag is "noindex", expected "${NO_INDEX}"`]);
  });
});

/**
 * verifyDev end to end over real HTTP: a local server stands in for both dev
 * hosts. `/health` is the ungated sync API; every other path is the web host,
 * which answers the Basic challenge unless the password is right, except
 * robots.txt. The `let`s below switch it between healthy and broken states.
 */
describe('verifyDev', () => {
  let server: Server;
  let base = '';
  let served = SHA;
  let gated = true;
  let tagged = true;
  /** Looks at the authorised page and at /health that still find OLD, each. */
  let staleLooks = 0;
  /** The authorised page request, counted from 1, whose connection is dropped. */
  let dropAuthorisedAt = 0;
  let dropRobots = false;
  /** The next unauthenticated page request is redirected instead of challenged. */
  let redirectGateOnce = false;
  /** The status the authorised page answers with. */
  let authorisedStatus = 200;
  let requests = 0;
  let authorisedRequests = 0;
  /** The retired game address still serves the game (#332). */
  let retiredServes = false;
  /** The Content-Type the game's script is served with. */
  let scriptType = JAVASCRIPT;
  /** A page path that keeps serving OLD after the home page turns current. */
  let stalePath = '';
  /** A page path served to anyone, as if the gate did not cover it. */
  let ungatedPath = '';
  /** The game shell names no script. */
  let noScript = false;
  const seenUrls: string[] = [];
  let webStale = 0;
  let healthStale = 0;
  const seenAuthorization: string[] = [];
  /** What /api/roadmap/health answers to an authorised request (#341). */
  let roadmap: Record<string, unknown> = {};

  beforeAll(async () => {
    server = createServer((req, res) => {
      requests += 1;
      seenUrls.push(req.url ?? '');
      const tag: Record<string, string> = tagged
        ? { 'x-robots-tag': NO_INDEX }
        : {};
      const authorization = req.headers.authorization ?? '';
      seenAuthorization.push(authorization);
      const authorised = authorization === basicAuthorization(PASSWORD);
      if (req.url === '/health') {
        healthStale += 1;
        const commit = healthStale <= staleLooks ? OLD : served;
        res.writeHead(200, { 'content-type': 'application/json', ...tag });
        res.end(JSON.stringify({ ok: true, commit, db: 'ok' }));
        return;
      }
      if (req.url === '/api/roadmap/health' && authorised) {
        res.writeHead(200, { 'content-type': 'application/json', ...tag });
        res.end(JSON.stringify(roadmap));
        return;
      }
      if (req.url === '/retired-game/') {
        res.writeHead(retiredServes ? 200 : 404, {
          'content-type': 'text/html',
        });
        res.end(retiredServes ? shell(served) : 'There is nothing here yet');
        return;
      }
      if (req.url === SCRIPT && authorised) {
        res.writeHead(200, { 'content-type': scriptType, ...tag });
        res.end('export {};');
        return;
      }
      if (req.url === '/robots.txt') {
        if (dropRobots) {
          req.socket.destroy();
          return;
        }
        res.writeHead(200, { 'content-type': 'text/plain', ...tag });
        res.end(ROBOTS);
        return;
      }
      if (authorised) {
        authorisedRequests += 1;
        if (authorisedRequests === dropAuthorisedAt) {
          req.socket.destroy();
          return;
        }
      }
      if (gated && !authorised && req.url !== ungatedPath) {
        if (redirectGateOnce && authorization === '') {
          redirectGateOnce = false;
          res.writeHead(302, { location: '/login', ...tag });
          res.end();
          return;
        }
        res.writeHead(401, { ...challenge, ...tag });
        res.end('testers only');
        return;
      }
      webStale += 1;
      res.writeHead(authorised ? authorisedStatus : 200, {
        'content-type': 'text/html',
        ...tag,
      });
      const commit =
        webStale <= staleLooks || req.url === stalePath ? OLD : served;
      res.end(noScript && req.url === '/play/' ? page(commit) : shell(commit));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(() => {
    server.close();
  });

  const target = () => ({
    webUrl: `${base}/`,
    syncUrl: base,
    gameUrl: `${base}/retired-game/`,
    sha: SHA,
    password: PASSWORD,
  });

  const reset = () => {
    served = SHA;
    gated = true;
    tagged = true;
    staleLooks = 0;
    dropAuthorisedAt = 0;
    dropRobots = false;
    redirectGateOnce = false;
    authorisedStatus = 200;
    requests = 0;
    authorisedRequests = 0;
    retiredServes = false;
    scriptType = JAVASCRIPT;
    stalePath = '';
    ungatedPath = '';
    noScript = false;
    seenUrls.length = 0;
    webStale = 0;
    healthStale = 0;
    seenAuthorization.length = 0;
    roadmap = {
      lastEventAt: null,
      lastCheckAt: new Date().toISOString(),
      version: 1,
      drift: 0,
      driftTotal: 0,
      pendingDriftSince: null,
      readFailingSince: null,
      readError: null,
    };
  };

  it('fails a site whose roadmap missed a webhook (#341)', async () => {
    reset();
    roadmap = { ...roadmap, drift: 1, driftTotal: 1 };
    expect(await verifyDev(target(), { polls: 1, pollMs: 0 })).toEqual([
      'roadmap: drift 1 since a webhook last delivered a change: a board change reached the roadmap only through the 10-minute check, so a webhook was missed',
    ]);
  });

  const notServed = (polls: number) =>
    `the expected commit ${SHA} was not served on both hosts after ${String(polls)} looks 0 ms apart`;

  it('passes a gated site serving the expected commit, judging each check once', async () => {
    reset();
    const problems = await verifyDev(target(), { polls: 3, pollMs: 0 });
    // The exact requests first: a floor that moved would otherwise stop the
    // test before they were checked (measured on #332).
    expect(seenUrls).toEqual([
      '/',
      '/',
      '/',
      '/health',
      '/robots.txt',
      ...SITE_PAGES,
      SCRIPT,
      '/play/',
      '/retired-game/',
      '/api/roadmap/health',
    ]);
    expect(seenAuthorization).toEqual([
      '',
      basicAuthorization(`${PASSWORD}x`),
      basicAuthorization(PASSWORD),
      '',
      '',
      ...SITE_PAGES.map(() => basicAuthorization(PASSWORD)),
      basicAuthorization(PASSWORD),
      '',
      '',
      basicAuthorization(PASSWORD),
    ]);
    expect(searched(problems, { of: requests, what: 'probes' })).toEqual([]);
    expect(
      floorBreach('verify-dev/healthy-site-probes', requests),
    ).toBeUndefined();
  });

  it('checks Indonesian, the roadmap and the game at /play/ (#332 AC7)', () => {
    expect(SITE_PAGES).toEqual(['/id/', '/roadmap', '/play/']);
  });

  it('fails when the retired game address still serves the game (#332)', async () => {
    reset();
    retiredServes = true;
    const problems = await verifyDev(target(), { polls: 3, pollMs: 0 });
    expect(problems).toEqual([
      "game address: answered 200; the game is reachable around the site's gate",
      'game address: the response carries the game',
    ]);
  });

  it('fails a page that still serves an old commit once the home page is current', async () => {
    reset();
    stalePath = '/roadmap';
    const problems = await verifyDev(target(), { polls: 3, pollMs: 0 });
    expect(problems).toEqual([
      `web /roadmap: serves commit ${OLD}, expected ${SHA}`,
    ]);
  });

  it('fails a game the gate does not cover', async () => {
    reset();
    ungatedPath = '/play/';
    const problems = await verifyDev(target(), { polls: 3, pollMs: 0 });
    expect(problems).toEqual([
      'game without credentials: answered 200, expected 401; the password gate is not in front of it',
      'game without credentials: no Basic WWW-Authenticate challenge',
      'game without credentials: the response carries app markup',
    ]);
  });

  it('fails a game script served as something other than JavaScript', async () => {
    reset();
    scriptType = 'text/html; charset=utf-8';
    const problems = await verifyDev(target(), { polls: 3, pollMs: 0 });
    expect(problems).toEqual([
      `web ${SCRIPT}: Content-Type is "text/html; charset=utf-8", expected text/javascript`,
    ]);
  });

  it('fails a game shell that names no script', async () => {
    reset();
    noScript = true;
    const problems = await verifyDev(target(), { polls: 3, pollMs: 0 });
    expect(problems).toEqual(['web /play/: no game script in the page']);
  });

  it('fails at once, without another look, when the gate is gone', async () => {
    reset();
    gated = false;
    const problems = await verifyDev(target(), { polls: 3, pollMs: 0 });
    expect(problems).toContain(
      'web without credentials: answered 200, expected 401; the password gate is not in front of it',
    );
    expect(problems).toContain(
      'web with a wrong password: answered 200, expected 401; the password gate is not in front of it',
    );
    expect(requests, 'the two gate probes of the first look').toBe(2);
  });

  it('waits for a stale deploy to turn current, then judges it once', async () => {
    reset();
    staleLooks = 2;
    const problems = await verifyDev(target(), { polls: 5, pollMs: 0 });
    // The exact count first: a floor that moved would otherwise stop the
    // test before it ran (measured on #332).
    expect(requests, 'two stale looks of four probes, then one of twelve').toBe(
      20,
    );
    expect(searched(problems, { of: requests, what: 'probes' })).toEqual([]);
    expect(
      floorBreach('verify-dev/stale-site-probes', requests),
    ).toBeUndefined();
  });

  it('fails a deploy still stale after the last look, naming each host’s commit', async () => {
    reset();
    served = OLD;
    expect(await verifyDev(target(), { polls: 3, pollMs: 0 })).toEqual([
      notServed(3),
      `web: serves commit ${OLD}, expected ${SHA}`,
      `sync: /health serves commit ${OLD}, expected ${SHA}`,
    ]);
    expect(requests, 'three looks of four probes').toBe(12);
  });

  it('fails at once when the page answers an error while the deploy is stale', async () => {
    reset();
    staleLooks = 5;
    authorisedStatus = 500;
    expect(await verifyDev(target(), { polls: 3, pollMs: 0 })).toEqual([
      'web: status 500 with the password, expected 200',
    ]);
    expect(requests, 'one look of four probes').toBe(4);
  });

  it('fails at once on a leak while the deploy is still stale', async () => {
    reset();
    gated = false;
    served = OLD;
    const problems = await verifyDev(target(), { polls: 3, pollMs: 0 });
    expect(problems).toContain(
      'web without credentials: answered 200, expected 401; the password gate is not in front of it',
    );
    expect(requests, 'the two gate probes of the first look').toBe(2);
  });

  it('fails a flaky gate that answers wrongly once, with no second look', async () => {
    reset();
    redirectGateOnce = true;
    expect(await verifyDev(target(), { polls: 3, pollMs: 0 })).toEqual([
      'web without credentials: answered 302, expected 401; the password gate is not in front of it',
      'web without credentials: no Basic WWW-Authenticate challenge',
    ]);
    expect(requests, 'one look of twelve probes').toBe(12);
  });

  it('fails at once when a host that has answered drops a connection', async () => {
    reset();
    staleLooks = 1;
    dropAuthorisedAt = 2;
    const problems = await verifyDev(target(), { polls: 5, pollMs: 0 });
    expect(problems).toEqual([
      expect.stringMatching(new RegExp(`^web: request to ${base}/ failed: `)),
    ]);
    expect(requests, 'one stale look, then the look that dropped').toBe(8);
  });

  it('fails at once when robots.txt drops its connection, with no second look', async () => {
    reset();
    dropRobots = true;
    const problems = await verifyDev(target(), { polls: 3, pollMs: 0 });
    expect(problems).toEqual([
      expect.stringMatching(
        new RegExp(`^robots\\.txt: request to ${base}/robots\\.txt failed: `),
      ),
    ]);
    expect(requests, 'one look of twelve probes').toBe(12);
  });

  it('fails when the noindex header is missing everywhere', async () => {
    reset();
    tagged = false;
    expect(await verifyDev(target(), { polls: 1, pollMs: 0 })).toEqual([
      'web: X-Robots-Tag is null, expected "noindex, nofollow, noarchive"',
      'sync: X-Robots-Tag is null, expected "noindex, nofollow, noarchive"',
      ...SITE_PAGES.map(
        (path) =>
          `web ${path}: X-Robots-Tag is null, expected "noindex, nofollow, noarchive"`,
      ),
      `web ${SCRIPT}: X-Robots-Tag is null, expected "noindex, nofollow, noarchive"`,
      'roadmap: X-Robots-Tag is null, expected "noindex, nofollow, noarchive"',
    ]);
  });

  it('refuses a wait of no looks', async () => {
    await expect(verifyDev(target(), { polls: 0, pollMs: 0 })).rejects.toThrow(
      'polls must be a whole number of at least 1, got 0',
    );
  });

  /** An origin that refuses connections: a port that was free a moment ago. */
  async function closedOrigin(): Promise<string> {
    const closed = createServer();
    await new Promise<void>((resolve) =>
      closed.listen(0, '127.0.0.1', resolve),
    );
    const port = String((closed.address() as AddressInfo).port);
    await new Promise((resolve) => closed.close(resolve));
    return `http://127.0.0.1:${port}`;
  }

  it('waits on a host that has never answered, then names its failure', async () => {
    reset();
    const unreachable = `${await closedOrigin()}/`;
    const problems = await verifyDev(
      { ...target(), webUrl: unreachable },
      { polls: 2, pollMs: 0 },
    );
    expect(problems).toEqual([
      notServed(2),
      expect.stringMatching(
        new RegExp(`^web: request to ${unreachable} failed: `),
      ),
    ]);
    expect(requests, 'the sync host, looked at twice').toBe(2);
  });

  it('never puts the password in a problem', async () => {
    const once = { polls: 1, pollMs: 0 };
    reset();
    gated = false;
    const leaking = await verifyDev(target(), once);
    reset();
    served = OLD;
    const stale = await verifyDev(target(), once);
    reset();
    tagged = false;
    const untagged = await verifyDev(target(), once);
    const origin = await closedOrigin();
    const unreachable = await verifyDev(
      { ...target(), webUrl: `${origin}/`, syncUrl: origin },
      once,
    );
    // Every kind of message: a judged leak, a wait, judged answers, failed requests.
    expect(leaking).toHaveLength(6);
    expect(stale).toHaveLength(3);
    expect(untagged).toHaveLength(7);
    expect(unreachable).toHaveLength(3);
    const reported = [...leaking, ...stale, ...untagged, ...unreachable];
    const credential = basicAuthorization(PASSWORD).slice(6);
    const showingPassword = reported.filter((p) => p.includes(PASSWORD));
    const showingCredential = reported.filter((p) => p.includes(credential));
    expect(
      searched(showingPassword, { of: reported, what: 'reported problems' }),
    ).toEqual([]);
    expect(
      searched(showingCredential, { of: reported, what: 'reported problems' }),
    ).toEqual([]);
    expect(
      floorBreach('verify-dev/broken-site-problems', reported.length),
    ).toBeUndefined();
  });
});
