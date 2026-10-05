/**
 * The non-prod lockdown for Yawelo Idle's Workers (#39).
 *
 * Ported from shyden.co.uk `functions/_lib/lockdown.js` and
 * `functions/_middleware.js` at 26b80e2, which ShyTalk shares. The behaviour
 * is the same: an exact, case-insensitive match on the production hostname
 * passes through untouched; every other host serves a blocking robots.txt
 * publicly and puts everything else behind HTTP Basic auth against one shared
 * password, failing closed when that password is not configured.
 *
 * Three deliberate differences from the source:
 * - the password is compared in constant time (SHA-256 both, then XOR-fold
 *   the digests), using only APIs that workerd and Node share;
 * - the `Basic` scheme is matched case-insensitively (RFC 7617 §2);
 * - the credentials are decoded as UTF-8, as browsers send them, so a
 *   password with non-ASCII characters can match.
 *
 * The sync API is not password-gated (operator decision, 2026-10-01): native
 * apps cannot answer a browser challenge. On non-prod hosts it carries the
 * noindex header and the blocking robots.txt only, as ShyTalk's API does.
 */

/** The production web hostname. Attaching it is the production pipeline's job. */
export const PROD_HOSTNAME = 'wordfarer.shyden.co.uk';

/** The production sync API hostname. */
export const PROD_API_HOSTNAME = 'api.wordfarer.shyden.co.uk';

/** Sent on every non-prod response: no index, no link crawl, no cached copy. */
export const NO_INDEX = 'noindex, nofollow, noarchive';

/** The realm a browser shows in its password prompt. */
export const REALM = 'Yawelo Idle Non-Prod';

/** The robots.txt every non-prod host serves, without credentials. */
export const BLOCKING_ROBOTS_TXT = [
  '# A non-prod Yawelo Idle environment, blocked from indexing.',
  '# The public robots.txt is served only on wordfarer.shyden.co.uk.',
  'User-agent: *',
  'Disallow: /',
  '',
].join('\n');

/** Serves a request once the gate has let it through. */
export type Serve = (request: Request) => Promise<Response>;

/**
 * True only when `hostname` is exactly `prodHostname`, ignoring case (DNS
 * does). Exact equality, never a prefix or suffix test, so neither
 * `dev.wordfarer.shyden.co.uk` nor `wordfarer.shyden.co.uk.evil.com` passes.
 */
export function isProdHost(hostname: string, prodHostname: string): boolean {
  return hostname.length > 0 && hostname.toLowerCase() === prodHostname;
}

/** Decodes standard base64 to UTF-8 text, or null if it is not both. */
function decodeBase64Utf8(encoded: string): string | null {
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    return null;
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
      bytes,
    );
  } catch {
    return null;
  }
}

/**
 * Compares two strings in time that depends on neither their contents nor
 * their lengths: both are hashed to 32 bytes, and every byte pair is folded
 * into one accumulator before the single comparison at the end.
 */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [given, expected].map(
      async (text) =>
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', encoder.encode(text)),
        ),
    ),
  );
  if (a === undefined || b === undefined) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return difference === 0;
}

/**
 * Whether an `Authorization` header carries Basic credentials whose password
 * is `expected`. The username is ignored (one shared secret), and the password
 * is everything after the FIRST colon, so a password containing `:` compares
 * intact.
 *
 * Fails closed: an unset or empty `expected` rejects every request, so a
 * deploy whose secret is missing stays locked rather than open.
 */
export async function basicAuthOk(
  authorization: string | null,
  expected: string | undefined,
): Promise<boolean> {
  if (expected === undefined || expected === '') return false;
  if (authorization === null) return false;
  const space = authorization.indexOf(' ');
  if (space < 0) return false;
  if (authorization.slice(0, space).toLowerCase() !== 'basic') return false;
  const token = authorization.slice(space + 1).trim();
  if (token === '') return false;
  const decoded = decodeBase64Utf8(token);
  if (decoded === null) return false;
  const colon = decoded.indexOf(':');
  if (colon < 0) return false;
  return sameSecret(decoded.slice(colon + 1), expected);
}

/** The blocking robots.txt, served on non-prod hosts without credentials. */
export function robotsResponse(): Response {
  return new Response(BLOCKING_ROBOTS_TXT, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Robots-Tag': NO_INDEX,
    },
  });
}

/** The 401 that makes a browser show its password prompt. No app bytes. */
export function challengeResponse(): Response {
  return new Response(
    'This is a non-prod Yawelo Idle environment for authorised testers. ' +
      'The game is at https://wordfarer.shyden.co.uk.',
    {
      status: 401,
      headers: {
        'WWW-Authenticate': `Basic realm="${REALM}"`,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': NO_INDEX,
      },
    },
  );
}

/** A copy of `response` with the noindex header set; status and body kept. */
export function withNoIndex(response: Response): Response {
  const tagged = new Response(response.body, response);
  tagged.headers.set('X-Robots-Tag', NO_INDEX);
  return tagged;
}

/**
 * The web Worker's gate. On the production host the request is served
 * untouched. On any other host `/robots.txt` is public and blocking, a
 * request without the password gets the challenge (and never reaches
 * `serve`, so no asset bytes leave), and an authorised one is served with
 * the noindex header added.
 */
export async function gateWebRequest(
  request: Request,
  password: string | undefined,
  serve: Serve,
): Promise<Response> {
  const { hostname, pathname } = new URL(request.url);
  if (isProdHost(hostname, PROD_HOSTNAME)) return serve(request);
  if (pathname === '/robots.txt') return robotsResponse();
  if (!(await basicAuthOk(request.headers.get('Authorization'), password))) {
    return challengeResponse();
  }
  return withNoIndex(await serve(request));
}

/**
 * The sync Worker's marking, with no password (operator decision). On the
 * production API host the request is served untouched; on any other host
 * `/robots.txt` is blocking and every other response carries noindex.
 */
export async function markApiRequest(
  request: Request,
  serve: Serve,
): Promise<Response> {
  const { hostname, pathname } = new URL(request.url);
  if (isProdHost(hostname, PROD_API_HOSTNAME)) return serve(request);
  if (pathname === '/robots.txt') return robotsResponse();
  return withNoIndex(await serve(request));
}
