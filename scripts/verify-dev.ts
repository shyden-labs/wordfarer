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
/**
 * What one judgement ran and found (#372): the checks it judged, by name, and
 * the problems they found. A check that fails a gate (a wrong status, a body
 * that is not JSON) stops the ones after it, which are then not judged, so
 * `checked` is the population an absence of problems was drawn from.
 */
export interface Judgement {
  readonly checked: readonly string[];
  readonly problems: readonly string[];
}

/** One check: its name, the problem it finds or undefined, and whether a problem stops the rest. */
interface Check {
  readonly name: string;
  readonly problem: () => string | undefined;
  readonly gate?: boolean;
}

function judge(checks: readonly Check[]): Judgement {
  const checked: string[] = [];
  const problems: string[] = [];
  for (const { name, problem, gate } of checks) {
    checked.push(name);
    const found = problem();
    if (found === undefined) continue;
    problems.push(found);
    if (gate === true) break;
  }
  return { checked, problems };
}

export function gateJudgement(label: string, probe: Probe): Judgement {
  return judge([
    {
      name: 'status',
      problem: () =>
        probe.status === 401
          ? undefined
          : `${label}: answered ${String(probe.status)}, expected 401; the password gate is not in front of it`,
    },
    {
      name: 'challenge',
      problem: () =>
        /^Basic /i.test(probe.headers.get('www-authenticate') ?? '')
          ? undefined
          : `${label}: no Basic WWW-Authenticate challenge`,
    },
    {
      name: 'markup',
      problem: () =>
        APP_MARKUP.test(probe.body)
          ? `${label}: the response carries app markup`
          : undefined,
    },
  ]);
}

export function gateProblems(label: string, probe: Probe): string[] {
  return [...gateJudgement(label, probe).problems];
}

/** A gate probe that came back 2xx served content without the password. */
export function leaked(probe: Probe): boolean {
  return probe.status >= 200 && probe.status < 300;
}

export function robotsJudgement(probe: Probe): Judgement {
  return judge([
    {
      name: 'status',
      gate: true,
      problem: () =>
        probe.status === 200
          ? undefined
          : `robots.txt: status ${String(probe.status)} without credentials, expected 200`,
    },
    {
      name: 'blocks every crawler',
      problem: () =>
        /^User-agent: \*\nDisallow: \/$/m.test(probe.body)
          ? undefined
          : 'robots.txt: does not block every crawler',
    },
  ]);
}

export function robotsProblems(probe: Probe): string[] {
  return [...robotsJudgement(probe).problems];
}

const noIndexCheck = (label: string, probe: Probe): Check => ({
  name: 'noindex',
  problem: () => {
    const tag = probe.headers.get('x-robots-tag');
    return tag === NO_INDEX
      ? undefined
      : `${label}: X-Robots-Tag is ${JSON.stringify(tag)}, expected "${NO_INDEX}"`;
  },
});

export function webJudgement(probe: Probe, sha: string): Judgement {
  return judge([
    {
      name: 'status',
      gate: true,
      problem: () =>
        probe.status === 200
          ? undefined
          : `web: status ${String(probe.status)} with the password, expected 200`,
    },
    {
      name: 'commit',
      problem: () => {
        const stamp = COMMIT_STAMP.exec(probe.body)?.[1];
        if (stamp === undefined)
          return 'web: no yawelo-idle-commit meta tag in the page';
        return stamp === sha
          ? undefined
          : `web: serves commit ${stamp}, expected ${sha}`;
      },
    },
    noIndexCheck('web', probe),
  ]);
}

export function webProblems(probe: Probe, sha: string): string[] {
  return [...webJudgement(probe, sha).problems];
}

export function healthJudgement(probe: Probe, sha: string): Judgement {
  let body: unknown;
  const expected = { ok: true, commit: sha, db: 'ok' };
  return judge([
    {
      name: 'status',
      gate: true,
      problem: () =>
        probe.status === 200
          ? undefined
          : `sync: /health status ${String(probe.status)}, expected 200`,
    },
    {
      name: 'JSON',
      gate: true,
      problem: () => {
        try {
          body = JSON.parse(probe.body);
          return undefined;
        } catch {
          return 'sync: /health did not return JSON';
        }
      },
    },
    {
      name: 'body',
      problem: () =>
        JSON.stringify(body) === JSON.stringify(expected)
          ? undefined
          : `sync: /health returned ${JSON.stringify(body)}, expected ${JSON.stringify(expected)}`,
    },
    noIndexCheck('sync', probe),
  ]);
}

export function healthProblems(probe: Probe, sha: string): string[] {
  return [...healthJudgement(probe, sha).problems];
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
