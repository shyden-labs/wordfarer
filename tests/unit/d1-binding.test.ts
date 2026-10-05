import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';
import { unstable_readConfig } from 'wrangler';
import {
  bindDeployConfig,
  databaseId,
  withDatabaseId,
} from '../../scripts/d1-binding';
import type { Wrangler } from '../../scripts/ensure-d1';

/**
 * The sync Worker's deploy binds its D1 database by id, resolved by name at
 * deploy time (#391). Bound by name alone, wrangler 4.145 inherits the id of
 * the binding already deployed, and fails with 7404 once that database has
 * been deleted and recreated.
 */

const NAME = 'yawelo-idle-dev';
const ID = '907b5e93-0000-4000-8000-000000000001';
const OTHER_ID = '11111111-0000-4000-8000-000000000002';
const SOURCE = new URL('../../apps/sync-worker/wrangler.jsonc', import.meta.url)
  .pathname;

/** `wrangler d1 list --json` prints the API's database objects, indented. */
const list = (...databases: { name: string; uuid?: unknown }[]) =>
  JSON.stringify(
    databases.map((database) => ({
      ...database,
      created_at: '2026-10-05T00:00:00.000Z',
    })),
    null,
    2,
  );

describe('databaseId', () => {
  it('reads the id of the database with that name', () => {
    expect(
      databaseId(
        list({ name: 'other', uuid: OTHER_ID }, { name: NAME, uuid: ID }),
        NAME,
      ),
    ).toBe(ID);
  });

  it('does not take a longer name for the one asked for', () => {
    expect(() =>
      databaseId(list({ name: `${NAME}-old`, uuid: OTHER_ID }), NAME),
    ).toThrow(`no D1 database named ${NAME} in wrangler d1 list --json`);
  });

  it('refuses a missing database by name', () => {
    expect(() => databaseId(list(), NAME)).toThrow(
      `no D1 database named ${NAME} in wrangler d1 list --json`,
    );
  });

  it('refuses two databases with the same name', () => {
    expect(() =>
      databaseId(
        list({ name: NAME, uuid: ID }, { name: NAME, uuid: OTHER_ID }),
        NAME,
      ),
    ).toThrow(
      `2 D1 databases are named ${NAME} (${ID}, ${OTHER_ID}): delete the one not in use`,
    );
  });

  it('refuses a list that is not JSON, quoting it', () => {
    expect(() => databaseId('⛅️ wrangler 4.145.0', NAME)).toThrow(
      'wrangler d1 list --json printed something that is not JSON: ⛅️ wrangler 4.145.0',
    );
  });

  it('refuses the named database when it carries no id', () => {
    expect(() => databaseId(list({ name: NAME }), NAME)).toThrow(
      `wrangler d1 list --json printed ${NAME} with no uuid`,
    );
  });

  it('refuses an id that is not a UUID', () => {
    expect(() =>
      databaseId(list({ name: NAME, uuid: 'not-a-uuid' }), NAME),
    ).toThrow(`wrangler d1 list --json printed ${NAME} with no uuid`);
  });
});

describe('withDatabaseId', () => {
  /** A config in the tracked file's shape: comments and trailing commas. */
  const config = (...bindings: string[]) => `// The sync Worker.
{
  "name": "w",
  // Named, with no id.
  "d1_databases": [
    ${bindings.join(',\n    ')},
  ],
}
`;
  const byName = (name: string, extra = '') =>
    `{ "binding": "DB", "database_name": "${name}"${extra} }`;

  it('adds the id to the binding with that name, keeping the comments', () => {
    const written = withDatabaseId(
      config(byName('another'), byName(NAME)),
      NAME,
      ID,
    );
    expect(written).toContain('// The sync Worker.');
    expect(written).toContain('// Named, with no id.');
    expect(parse(written, [], { allowTrailingComma: true })).toEqual({
      name: 'w',
      d1_databases: [
        { binding: 'DB', database_name: 'another' },
        { binding: 'DB', database_name: NAME, database_id: ID },
      ],
    });
  });

  it('refuses a config with no binding of that name', () => {
    expect(() => withDatabaseId(config(byName('another')), NAME, ID)).toThrow(
      `the config binds no D1 database named ${NAME}`,
    );
  });

  it('refuses a config with two bindings of that name', () => {
    expect(() =>
      withDatabaseId(config(byName(NAME), byName(NAME)), NAME, ID),
    ).toThrow(`the config binds ${NAME} 2 times`);
  });

  it('refuses a config that already carries an id, which the tracked file never does', () => {
    expect(() =>
      withDatabaseId(
        config(byName(NAME, `, "database_id": "${OTHER_ID}"`)),
        NAME,
        ID,
      ),
    ).toThrow(
      `the config already binds ${NAME} to "${OTHER_ID}": the tracked file binds by name only`,
    );
  });

  it('refuses a config that does not parse', () => {
    expect(() => withDatabaseId('{ "name": ', NAME, ID)).toThrow(
      'the config is not valid JSONC',
    );
  });
});

describe('bindDeployConfig, on the real sync Worker config', () => {
  /** Answers the list call only; any other call fails the test. */
  const listing =
    (output: string, calls: string[][]): Wrangler =>
    (args) => {
      calls.push([...args]);
      if (args.join(' ') !== 'd1 list --json')
        throw new Error(`unexpected call: wrangler ${args.join(' ')}`);
      return output;
    };

  it('writes a config wrangler reads with the resolved id, after one list call', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'd1-binding-')), 'w.jsonc');
    const calls: string[][] = [];
    expect(
      bindDeployConfig(
        NAME,
        SOURCE,
        out,
        listing(list({ name: NAME, uuid: ID }), calls),
      ),
    ).toBe(ID);
    expect(calls).toEqual([['d1', 'list', '--json']]);
    const read: unknown = unstable_readConfig({ config: out });
    expect(read).toMatchObject({
      name: 'yawelo-idle-sync-dev',
      d1_databases: [
        {
          binding: 'DB',
          database_name: NAME,
          database_id: ID,
          migrations_dir: 'migrations',
        },
      ],
    });
  });

  it('marks the written file as generated', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'd1-binding-')), 'w.jsonc');
    bindDeployConfig(
      NAME,
      SOURCE,
      out,
      listing(list({ name: NAME, uuid: ID }), []),
    );
    expect(readFileSync(out, 'utf8').split('\n')[0]).toBe(
      '// GENERATED by scripts/d1-binding.ts at deploy (#391), from wrangler.jsonc. Not tracked; edit wrangler.jsonc.',
    );
  });

  it('refuses to write over the config it reads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'd1-binding-'));
    const source = join(dir, 'wrangler.jsonc');
    writeFileSync(source, readFileSync(SOURCE, 'utf8'));
    expect(() =>
      bindDeployConfig(
        NAME,
        source,
        source,
        listing(list({ name: NAME, uuid: ID }), []),
      ),
    ).toThrow(`will not write over ${source}, the config it reads`);
    expect(readFileSync(source, 'utf8')).toBe(readFileSync(SOURCE, 'utf8'));
  });

  it('writes nothing when the database is missing', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'd1-binding-')), 'w.jsonc');
    expect(() =>
      bindDeployConfig(NAME, SOURCE, out, listing(list(), [])),
    ).toThrow(`no D1 database named ${NAME}`);
    expect(() => readFileSync(out)).toThrow('ENOENT');
  });
});
