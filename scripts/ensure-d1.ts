/**
 * Makes sure a D1 database exists before its migrations run (#357).
 *
 *     node scripts/ensure-d1.ts <database-name>
 *
 * The sync Worker's config names its database and carries no id, so wrangler
 * finds it by name (`d1 migrations apply`, and the binding at deploy). The
 * deploy applies migrations BEFORE it deploys the Worker, so new code never
 * meets an old schema; on the first deploy under a new name there is nothing
 * to migrate yet, and this step creates it. The pipeline creates the
 * database, never a person (#357 AC1).
 *
 * The list is read first and must parse, so a failure to read it (a token, the
 * network) stops the deploy rather than being taken for "missing". After a
 * create, the list is read again and must hold the name.
 *
 * Run from the repository root: it has no wrangler config, so `d1 create`
 * offers no write-back to one.
 */
import { execFileSync } from 'node:child_process';

/** Runs `wrangler <args>` and returns what it printed on stdout. */
export type Wrangler = (args: readonly string[]) => string;

const LIST = ['d1', 'list', '--json'] as const;

/** The names in `wrangler d1 list --json`'s output; anything else refused. */
export function databaseNames(listJson: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(listJson);
  } catch {
    throw new Error(
      `wrangler d1 list --json printed something that is not JSON: ${listJson}`,
    );
  }
  if (!Array.isArray(parsed))
    throw new Error('wrangler d1 list --json did not print a list');
  return parsed.map((entry: unknown) => {
    const name: unknown =
      typeof entry === 'object' && entry !== null
        ? (entry as { name?: unknown }).name
        : undefined;
    if (typeof name !== 'string' || name === '')
      throw new Error(
        `wrangler d1 list --json printed a database with no name: ${JSON.stringify(entry)}`,
      );
    return name;
  });
}

/** Creates the database `name` unless it exists, and proves it exists. */
export function ensureDatabase(
  name: string,
  wrangler: Wrangler,
): 'found' | 'created' {
  if (databaseNames(wrangler(LIST)).includes(name)) return 'found';
  wrangler(['d1', 'create', name]);
  if (!databaseNames(wrangler(LIST)).includes(name))
    throw new Error(
      `wrangler d1 create ${name} returned, but the list still does not hold it`,
    );
  return 'created';
}

if (import.meta.main) {
  const name = process.argv[2];
  if (name === undefined || name === '')
    throw new Error('usage: node scripts/ensure-d1.ts <database-name>');
  // A non-zero exit throws, carrying wrangler's own stderr (inherited).
  const wrangler: Wrangler = (args) =>
    execFileSync('npx', ['wrangler', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  const outcome = ensureDatabase(name, wrangler);
  console.log(
    outcome === 'found'
      ? `✓ D1 database ${name} exists`
      : `✓ D1 database ${name} created and read back`,
  );
}
