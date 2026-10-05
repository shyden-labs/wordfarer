/**
 * Verifies a dev deploy from the outside, the way a tester's browser sees it.
 *
 * `wrangler deploy` exiting 0 says an upload happened. It does not say the
 * live URL serves THIS commit, that D1 answers, or that the password gate
 * (#39) still keeps the public out. Each of those is checked here:
 *
 * 1. The web host answers 401 with a Basic challenge and none of the app,
 *    both without credentials and with a wrong password.
 * 2. Its robots.txt blocks every crawler, without credentials.
 * 3. With the password, the page carries `yawelo-idle-commit` = the expected SHA
 *    and the noindex header.
 * 4. The sync API's /health reports ok, that SHA and db "ok", with the
 *    noindex header (the API is not password-gated, by operator decision).
 *
 * Nothing is retried (Refs #83). The one wait is for a named condition: both
 * hosts serving the expected commit, since the previous deploy can be served
 * for a few seconds after an upload. Each look waits on only two answers: an
 * older commit, and no answer from a host that has not yet answered in this
 * run (a new Custom Domain's DNS on its first deploy). Anything else fails at
 * once, by name: a status other than 200, a missing stamp, a dropped
 * connection from a host that has answered, and above all a page served
 * WITHOUT the password, which is a leak at any look. Once both hosts serve
 * the commit, every check is judged once, on that look's own answers.
 *
 * The password is sent, never printed: no problem message carries a header.
 */

export interface Probe {
  status: number;
  headers: Headers;
  body: string;
}

export interface Target {
  webUrl: string;
  syncUrl: string;
  sha: string;
  password: string;
}

export const NO_INDEX = 'noindex, nofollow, noarchive';

const COMMIT_STAMP = /<meta name="yawelo-idle-commit" content="([^"]*)"/;

/** Any sign that a response carries the app rather than a challenge. */
const APP_MARKUP = /<(?:!doctype|html|meta|script)\b/i;

export function basicAuthorization(password: string): string {
  const bytes = new TextEncoder().encode(`verify-dev:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

/** Problems with a response that should be the password challenge. */
export function gateProblems(label: string, probe: Probe): string[] {
  const problems: string[] = [];
  if (probe.status !== 401) {
    problems.push(
      `${label}: answered ${String(probe.status)}, expected 401; the password gate is not in front of it`,
    );
  }
  if (!/^Basic /i.test(probe.headers.get('www-authenticate') ?? '')) {
    problems.push(`${label}: no Basic WWW-Authenticate challenge`);
  }
  if (APP_MARKUP.test(probe.body)) {
    problems.push(`${label}: the response carries app markup`);
  }
  return problems;
}

/** A gate probe that came back 2xx served content without the password. */
export function leaked(probe: Probe): boolean {
  return probe.status >= 200 && probe.status < 300;
}

export function robotsProblems(probe: Probe): string[] {
  if (probe.status !== 200)
    return [
      `robots.txt: status ${String(probe.status)} without credentials, expected 200`,
    ];
  return /^User-agent: \*\nDisallow: \/$/m.test(probe.body)
    ? []
    : ['robots.txt: does not block every crawler'];
}

function noIndexProblems(label: string, probe: Probe): string[] {
  const tag = probe.headers.get('x-robots-tag');
  return tag === NO_INDEX
    ? []
    : [
        `${label}: X-Robots-Tag is ${JSON.stringify(tag)}, expected "${NO_INDEX}"`,
      ];
}

export function webProblems(probe: Probe, sha: string): string[] {
  if (probe.status !== 200)
    return [
      `web: status ${String(probe.status)} with the password, expected 200`,
    ];
  const stamp = COMMIT_STAMP.exec(probe.body)?.[1];
  return [
    ...(stamp === undefined
      ? ['web: no yawelo-idle-commit meta tag in the page']
      : stamp === sha
        ? []
        : [`web: serves commit ${stamp}, expected ${sha}`]),
    ...noIndexProblems('web', probe),
  ];
}

export function healthProblems(probe: Probe, sha: string): string[] {
  if (probe.status !== 200)
    return [`sync: /health status ${String(probe.status)}, expected 200`];
  let body: unknown;
  try {
    body = JSON.parse(probe.body);
  } catch {
    return ['sync: /health did not return JSON'];
  }
  const expected = { ok: true, commit: sha, db: 'ok' };
  return [
    ...(JSON.stringify(body) === JSON.stringify(expected)
      ? []
      : [
          `sync: /health returned ${JSON.stringify(body)}, expected ${JSON.stringify(expected)}`,
        ]),
    ...noIndexProblems('sync', probe),
  ];
}

async function probe(
  url: string,
  headers: Record<string, string> = {},
): Promise<Probe> {
  const response = await fetch(url, { headers, redirect: 'manual' });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}

interface Outcome {
  problems: string[];
  /** The probe, or null when the request failed outright. */
  answer: Probe | null;
}

/**
 * Probes `url` and judges the answer. A request that fails outright (a dropped
 * connection, DNS not yet resolving a new hostname) is reported, never thrown,
 * so the report names it.
 */
async function check(
  label: string,
  url: string,
  headers: Record<string, string>,
  judge: (probe: Probe) => string[],
): Promise<Outcome> {
  let answer: Probe;
  try {
    answer = await probe(url, headers);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      problems: [`${label}: request to ${url} failed: ${reason}`],
      answer: null,
    };
  }
  return { problems: judge(answer), answer };
}

/** How long to wait for the expected commit: `polls` looks, `pollMs` apart. */
export interface Wait {
  polls: number;
  pollMs: number;
}

/** The commit an answer reports, or a problem no wait will fix. */
type Reported = { commit: string } | { problem: string };

function webCommit(probe: Probe): Reported {
  if (probe.status !== 200)
    return {
      problem: `web: status ${String(probe.status)} with the password, expected 200`,
    };
  const stamp = COMMIT_STAMP.exec(probe.body)?.[1];
  return stamp === undefined
    ? { problem: 'web: no yawelo-idle-commit meta tag in the page' }
    : { commit: stamp };
}

function syncCommit(probe: Probe): Reported {
  if (probe.status !== 200)
    return {
      problem: `sync: /health status ${String(probe.status)}, expected 200`,
    };
  let body: unknown;
  try {
    body = JSON.parse(probe.body);
  } catch {
    return { problem: 'sync: /health did not return JSON' };
  }
  return typeof body === 'object' &&
    body !== null &&
    'commit' in body &&
    typeof body.commit === 'string'
    ? { commit: body.commit }
    : {
        problem: `sync: /health returned ${JSON.stringify(body)}, with no commit`,
      };
}

/** Where one host stands on the expected commit after one look. */
type Standing =
  | { kind: 'served' }
  | { kind: 'waiting'; problem: string }
  | { kind: 'failed'; problem: string };

export async function verifyDev(
  target: Target,
  { polls, pollMs }: Wait,
): Promise<string[]> {
  if (!Number.isInteger(polls) || polls < 1)
    throw new RangeError(
      `polls must be a whole number of at least 1, got ${String(polls)}`,
    );
  const healthUrl = new URL('/health', target.syncUrl).href;
  const robotsUrl = new URL('/robots.txt', target.webUrl).href;
  const right = { Authorization: basicAuthorization(target.password) };
  // Appending to the real password guarantees a different one.
  const wrong = { Authorization: basicAuthorization(`${target.password}x`) };

  /** Hosts that have answered in this run: a later failed request from one is a failure, not a wait. */
  const answered = new Set<'web' | 'sync'>();
  const look = async (
    host: 'web' | 'sync',
    label: string,
    url: string,
    headers: Record<string, string>,
    judge: (probe: Probe) => string[],
  ): Promise<Outcome & { unanswered: boolean }> => {
    const before = answered.has(host);
    const outcome = await check(label, url, headers, judge);
    if (outcome.answer !== null) answered.add(host);
    return { ...outcome, unanswered: outcome.answer === null && !before };
  };
  const standing = (
    outcome: Outcome & { unanswered: boolean },
    reported: (probe: Probe) => Reported,
    stale: (commit: string) => string,
  ): Standing => {
    if (outcome.answer === null)
      return {
        kind: outcome.unanswered ? 'waiting' : 'failed',
        problem: outcome.problems.join('; '),
      };
    const read = reported(outcome.answer);
    if ('problem' in read) return { kind: 'failed', problem: read.problem };
    return read.commit === target.sha
      ? { kind: 'served' }
      : { kind: 'waiting', problem: stale(read.commit) };
  };

  let waiting: string[] = [];
  for (let poll = 1; poll <= polls; poll += 1) {
    const gate = [
      await look('web', 'web without credentials', target.webUrl, {}, (p) =>
        gateProblems('web without credentials', p),
      ),
      await look(
        'web',
        'web with a wrong password',
        target.webUrl,
        wrong,
        (p) => gateProblems('web with a wrong password', p),
      ),
    ];
    if (gate.some(({ answer }) => answer !== null && leaked(answer)))
      return gate.flatMap((outcome) => outcome.problems);
    const web = await look('web', 'web', target.webUrl, right, (p) =>
      webProblems(p, target.sha),
    );
    const sync = await look('sync', 'sync', healthUrl, {}, (p) =>
      healthProblems(p, target.sha),
    );
    const hosts = [
      standing(
        web,
        webCommit,
        (c) => `web: serves commit ${c}, expected ${target.sha}`,
      ),
      standing(
        sync,
        syncCommit,
        (c) => `sync: /health serves commit ${c}, expected ${target.sha}`,
      ),
    ];
    const failed = hosts.flatMap((h) =>
      h.kind === 'failed' ? [h.problem] : [],
    );
    if (failed.length > 0) return failed;
    if (hosts.every((h) => h.kind === 'served')) {
      const robots = await look(
        'web',
        'robots.txt',
        robotsUrl,
        {},
        robotsProblems,
      );
      return [...gate, robots, web, sync].flatMap(
        (outcome) => outcome.problems,
      );
    }
    waiting = hosts.flatMap((h) => (h.kind === 'waiting' ? [h.problem] : []));
    if (poll < polls)
      await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return [
    `the expected commit ${target.sha} was not served on both hosts after ${String(polls)} looks ${String(pollMs)} ms apart`,
    ...waiting,
  ];
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '')
    throw new Error(`${name} is not set`);
  return value;
}

if (import.meta.main) {
  const problems = await verifyDev(
    {
      webUrl: required('DEV_WEB_URL'),
      syncUrl: required('DEV_SYNC_URL'),
      sha: required('EXPECTED_SHA'),
      password: required('DEV_BASIC_AUTH_PASSWORD'),
    },
    { polls: 36, pollMs: 5_000 },
  );
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✗ ${problem}`);
    process.exit(1);
  }
  console.log(
    '✓ dev is password-gated, blocks crawlers, serves the expected commit, and D1 answers',
  );
}
