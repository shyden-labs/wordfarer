/**
 * Proves the dev Cloudflare token reaches the dev account and nothing else,
 * before anything is deployed (#395).
 *
 *     CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/token-reach.ts
 *
 * Cloudflare narrows Workers and D1 permissions to an ACCOUNT, never to one
 * Worker or database, so dev and production live in separate accounts and the
 * dev token may reach the dev account alone (operator, 2026-10-05: nothing
 * dev may be able to touch prod). Yawelo dev's first token could write to the
 * account holding shyden.co.uk's production database. This re-proves the
 * separation on every deploy: the token lists the accounts it reaches, and
 * anything but exactly the dev account, all of it, stops the job.
 *
 * Ported from shyden.co.uk `scripts/token-reach.mjs` (#415), with one change:
 * an account entry with no id is refused by name rather than dropped.
 *
 * One request, with a time limit and no retry (operator rule, 2026-10-02): a
 * listing that does not arrive is a failed proof, not a reason to ask again.
 */

/** Cloudflare's v4 account listing; one page holds every account a token reaches. */
const ACCOUNTS = 'https://api.cloudflare.com/client/v4/accounts?per_page=50';

/** A listing that has not arrived in this long is not coming. */
const LIMIT_MS = 30_000;

const NOT_A_LISTING = 'the answer is not a Cloudflare account listing';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface Verdict {
  readonly ok: boolean;
  readonly reason: string;
}

/** What Cloudflare's `GET /accounts` answer says about the token's reach. */
export function reachVerdict(body: unknown, devAccountId: string): Verdict {
  if (!isRecord(body) || typeof body['success'] !== 'boolean')
    return { ok: false, reason: NOT_A_LISTING };
  if (!body['success']) {
    const errors = Array.isArray(body['errors']) ? body['errors'] : [];
    const said = errors
      .filter(isRecord)
      .map((error) => `${String(error['code'])} ${String(error['message'])}`)
      .join('; ');
    return {
      ok: false,
      reason: `Cloudflare refused the listing: ${said || 'no reason given'}`,
    };
  }
  const result = body['result'];
  if (!Array.isArray(result)) return { ok: false, reason: NOT_A_LISTING };
  const ids: string[] = [];
  for (const entry of result as unknown[]) {
    const id = isRecord(entry) ? entry['id'] : undefined;
    if (typeof id !== 'string' || id === '')
      return {
        ok: false,
        reason: `the listing holds an account with no id: ${JSON.stringify(entry)}`,
      };
    ids.push(id);
  }
  // The total, not the page: a token reaching more accounts than one page
  // holds must not pass on the page it happened to return.
  const info = isRecord(body['result_info']) ? body['result_info'] : {};
  const total =
    typeof info['total_count'] === 'number' ? info['total_count'] : ids.length;
  const reached = Math.max(total, ids.length);
  if (reached === 0)
    return {
      ok: false,
      reason:
        'the token lists no account, so what it reaches is unproven; a dev token must list the dev account',
    };
  if (reached > 1)
    return {
      ok: false,
      reason: `the token reaches ${String(reached)} accounts; it must reach the dev account alone`,
    };
  return ids[0] === devAccountId
    ? { ok: true, reason: 'the token reaches 1 account, the dev one' }
    : {
        ok: false,
        reason: 'the token reaches 1 account, and it is not the dev one',
      };
}

if (import.meta.main) {
  const token = process.env['CLOUDFLARE_API_TOKEN'];
  const account = process.env['CLOUDFLARE_ACCOUNT_ID'];
  if (!token || !account)
    throw new Error(
      'usage: CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/token-reach.ts',
    );
  let body: unknown;
  try {
    const response = await fetch(ACCOUNTS, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(LIMIT_MS),
    });
    body = await response.json();
  } catch (error) {
    console.error(
      `::error::the account listing did not arrive: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  const { ok, reason } = reachVerdict(body, account);
  if (!ok) {
    console.error(`::error::the dev token's reach is not proven: ${reason}`);
    process.exit(1);
  }
  console.log(`✓ dev token reach: ${reason}`);
}
