import { describe, expect, it } from 'vitest';
import { reachVerdict } from '../../scripts/token-reach';

/**
 * The dev deploy proves its Cloudflare token reaches the dev account and
 * nothing else before anything deploys (#395). Yawelo dev's first token could
 * write to the account that holds shyden.co.uk's production database; this is
 * the check that would have refused it. Each case is Cloudflare's own
 * `GET /accounts` answer shape.
 */

const DEV = 'ed8dcf3e1ce9159757f7492bc2d4930d';
const PROD = '9315582c39b627dca58dfa83602db385';

const listing = (ids: string[], total = ids.length) => ({
  success: true,
  errors: [],
  result: ids.map((id) => ({ id, name: `account ${id.slice(0, 4)}` })),
  result_info: { page: 1, per_page: 50, count: ids.length, total_count: total },
});

describe('reachVerdict', () => {
  it('passes a token that reaches the dev account alone', () => {
    expect(reachVerdict(listing([DEV]), DEV)).toEqual({
      ok: true,
      reason: 'the token reaches 1 account, the dev one',
    });
  });

  it('refuses a token that reaches the dev account and another', () => {
    expect(reachVerdict(listing([DEV, PROD]), DEV)).toEqual({
      ok: false,
      reason:
        'the token reaches 2 accounts; it must reach the dev account alone',
    });
  });

  it('refuses on the total, not the page, when the page shows only the dev account', () => {
    expect(reachVerdict(listing([DEV], 2), DEV)).toEqual({
      ok: false,
      reason:
        'the token reaches 2 accounts; it must reach the dev account alone',
    });
  });

  it('refuses a token that reaches one account that is not the dev one', () => {
    expect(reachVerdict(listing([PROD]), DEV)).toEqual({
      ok: false,
      reason: 'the token reaches 1 account, and it is not the dev one',
    });
  });

  it('refuses a token that lists no account', () => {
    expect(reachVerdict(listing([]), DEV)).toEqual({
      ok: false,
      reason:
        'the token lists no account, so what it reaches is unproven; a dev token must list the dev account',
    });
  });

  it('refuses a listing Cloudflare refused, quoting its errors', () => {
    expect(
      reachVerdict(
        {
          success: false,
          errors: [{ code: 1000, message: 'Invalid API Token' }],
          result: null,
        },
        DEV,
      ),
    ).toEqual({
      ok: false,
      reason: 'Cloudflare refused the listing: 1000 Invalid API Token',
    });
  });

  it('refuses a refused listing that gives no reason', () => {
    expect(reachVerdict({ success: false }, DEV)).toEqual({
      ok: false,
      reason: 'Cloudflare refused the listing: no reason given',
    });
  });

  it('refuses an answer that is not a listing', () => {
    expect(reachVerdict('<html>', DEV)).toEqual({
      ok: false,
      reason: 'the answer is not a Cloudflare account listing',
    });
  });

  it('refuses a successful answer whose result is not a list', () => {
    expect(reachVerdict({ success: true, result: {} }, DEV)).toEqual({
      ok: false,
      reason: 'the answer is not a Cloudflare account listing',
    });
  });

  it('refuses an account entry with no id rather than skipping it', () => {
    expect(
      reachVerdict({ success: true, result: [{ name: 'no id' }] }, DEV),
    ).toEqual({
      ok: false,
      reason: 'the listing holds an account with no id: {"name":"no id"}',
    });
  });
});
