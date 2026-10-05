import { describe, expect, it } from 'vitest';
import {
  databaseNames,
  ensureDatabase,
  type Wrangler,
} from '../../scripts/ensure-d1';

/**
 * The dev D1 database is created by the deploy pipeline, never by hand
 * (#357 AC1). These cases drive the decision with wrangler's own output; the
 * first real deploy proves the commands against Cloudflare.
 */

const NAME = 'yawelo-idle-dev';
/** `wrangler d1 list --json` prints the API's database objects, indented. */
const list = (...names: string[]) =>
  JSON.stringify(
    names.map((name, index) => ({
      uuid: `00000000-0000-0000-0000-00000000000${String(index)}`,
      name,
      created_at: '2026-10-05T00:00:00.000Z',
    })),
    null,
    2,
  );

/** Answers each call with the next scripted output, and records the calls. */
function scripted(...outputs: string[]): {
  wrangler: Wrangler;
  calls: string[][];
} {
  const calls: string[][] = [];
  const wrangler: Wrangler = (args) => {
    calls.push([...args]);
    const output = outputs[calls.length - 1];
    if (output === undefined)
      throw new Error(`unscripted call: wrangler ${args.join(' ')}`);
    return output;
  };
  return { wrangler, calls };
}

describe('databaseNames', () => {
  it('reads every database name from the list', () => {
    expect(databaseNames(list('a-dev', NAME))).toEqual(['a-dev', NAME]);
  });

  it('refuses output that is not JSON, quoting it', () => {
    expect(() => databaseNames('⛅️ wrangler 4.145.0')).toThrow(
      'wrangler d1 list --json printed something that is not JSON: ⛅️ wrangler 4.145.0',
    );
  });

  it('refuses JSON that is not a list', () => {
    expect(() => databaseNames('{"name":"x"}')).toThrow(
      'wrangler d1 list --json did not print a list',
    );
  });

  it('refuses an entry with no name, rather than skipping it', () => {
    expect(() => databaseNames('[{"uuid":"u"}]')).toThrow(
      'wrangler d1 list --json printed a database with no name: {"uuid":"u"}',
    );
  });
});

describe('ensureDatabase', () => {
  /** What `wrangler d1 create` prints, as its source writes it (4.145). */
  const created = (region: string) =>
    `✅ Successfully created DB '${NAME}' in region ${region}\nCreated your new D1 database.\n`;
  const CREATE = ['d1', 'create', NAME, '--location', 'apac'];

  it('finds a database that exists and creates nothing', () => {
    const { wrangler, calls } = scripted(list('other', NAME));
    expect(ensureDatabase(NAME, 'apac', wrangler)).toBe('found');
    expect(calls).toEqual([['d1', 'list', '--json']]);
  });

  it('does not take a longer name for the one asked for', () => {
    const { wrangler, calls } = scripted(
      list(`${NAME}-old`),
      created('APAC'),
      list(`${NAME}-old`, NAME),
    );
    expect(ensureDatabase(NAME, 'apac', wrangler)).toBe('created');
    expect(calls[1]).toEqual(CREATE);
  });

  it('creates a missing database at its location, then reads it back', () => {
    const { wrangler, calls } = scripted(
      list('other'),
      created('APAC'),
      list(NAME),
    );
    expect(ensureDatabase(NAME, 'apac', wrangler)).toBe('created');
    expect(calls).toEqual([
      ['d1', 'list', '--json'],
      CREATE,
      ['d1', 'list', '--json'],
    ]);
  });

  it('creates the database in an account that has none', () => {
    const { wrangler, calls } = scripted(list(), created('APAC'), list(NAME));
    expect(ensureDatabase(NAME, 'apac', wrangler)).toBe('created');
    expect(calls[1]).toEqual(CREATE);
  });

  it('passes the location it is given', () => {
    const { wrangler, calls } = scripted(list(), created('OC'), list(NAME));
    expect(ensureDatabase(NAME, 'oc', wrangler)).toBe('created');
    expect(calls[1]).toEqual(['d1', 'create', NAME, '--location', 'oc']);
  });

  it('fails when Cloudflare placed the database in another region', () => {
    const { wrangler, calls } = scripted(list(), created('WNAM'), list(NAME));
    expect(() => ensureDatabase(NAME, 'apac', wrangler)).toThrow(
      `wrangler d1 create ${NAME} placed it in region WNAM, not APAC: delete it and deploy again`,
    );
    expect(calls).toHaveLength(2);
  });

  it('fails when the create reports no region at all', () => {
    const { wrangler } = scripted(
      list(),
      `✅ Successfully created DB '${NAME}' using primary location hint apac\n`,
      list(NAME),
    );
    expect(() => ensureDatabase(NAME, 'apac', wrangler)).toThrow(
      `wrangler d1 create ${NAME} reported no region, so APAC cannot be confirmed`,
    );
  });

  it('refuses a location D1 does not offer, creating nothing', () => {
    // Scripted with no output: any wrangler call would throw "unscripted
    // call" instead, so this message proves nothing was listed or created.
    const { wrangler } = scripted();
    expect(() => ensureDatabase(NAME, 'asia', wrangler)).toThrow(
      'asia is not a D1 location (weur, eeur, apac, oc, wnam, enam)',
    );
  });

  it('fails when the database is still missing after the create', () => {
    const { wrangler } = scripted(
      list('other'),
      created('APAC'),
      list('other'),
    );
    expect(() => ensureDatabase(NAME, 'apac', wrangler)).toThrow(
      `wrangler d1 create ${NAME} returned, but the list still does not hold it`,
    );
  });

  it('lets a failed list stop everything, creating nothing', () => {
    const calls: string[][] = [];
    const wrangler: Wrangler = (args) => {
      calls.push([...args]);
      throw new Error('Authentication error [code: 10000]');
    };
    expect(() => ensureDatabase(NAME, 'apac', wrangler)).toThrow(
      'Authentication error [code: 10000]',
    );
    expect(calls).toEqual([['d1', 'list', '--json']]);
  });
});
