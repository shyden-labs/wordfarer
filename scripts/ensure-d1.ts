/**
 * Makes sure a D1 database exists before its migrations run (#357).
 *
 *     node scripts/ensure-d1.ts <database-name> <location>
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

/** The primary locations D1 accepts as a hint (`wrangler d1 create --help`). */
const LOCATIONS = ['weur', 'eeur', 'apac', 'oc', 'wnam', 'enam'] as const;

/** The region `wrangler d1 create` reports Cloudflare put the database in. */
const createdRegion = (output: string): string | undefined =>
  /Successfully created DB '[^']*' in region ([A-Z]+)/.exec(output)?.[1];

/**
 * Creates the database `name` at `location` unless it exists, and proves it
 * exists. A location is only a hint, and a database never moves, so a create
 * succeeds only when Cloudflare reports the region asked for. A database that
 * already exists is taken as found: D1's documented API reports no region to
 * check it against (read 2026-10-05), so its region is read in the dashboard.
 */
export function ensureDatabase(
  name: string,
  location: string,
  wrangler: Wrangler,
): 'found' | 'created' {
  if (!(LOCATIONS as readonly string[]).includes(location))
    throw new Error(
      `${location} is not a D1 location (${LOCATIONS.join(', ')})`,
    );
  if (databaseNames(wrangler(LIST)).includes(name)) return 'found';
  const region = createdRegion(
    wrangler(['d1', 'create', name, '--location', location]),
  );
  const wanted = location.toUpperCase();
  if (region === undefined)
    throw new Error(
      `wrangler d1 create ${name} reported no region, so ${wanted} cannot be confirmed`,
    );
  if (region !== wanted)
    throw new Error(
      `wrangler d1 create ${name} placed it in region ${region}, not ${wanted}: delete it and deploy again`,
    );
  if (!databaseNames(wrangler(LIST)).includes(name))
    throw new Error(
      `wrangler d1 create ${name} returned, but the list still does not hold it`,
    );
  return 'created';
}

if (import.meta.main) {
  const [name, location] = process.argv.slice(2);
  if (name === undefined || location === undefined)
    throw new Error(
      'usage: node scripts/ensure-d1.ts <database-name> <location>',
    );
  // A non-zero exit throws, carrying wrangler's own stderr (inherited).
  const wrangler: Wrangler = (args) =>
    execFileSync('npx', ['wrangler', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  const outcome = ensureDatabase(name, location, wrangler);
  console.log(
    outcome === 'found'
      ? `✓ D1 database ${name} exists`
      : `✓ D1 database ${name} created in ${location.toUpperCase()} and read back`,
  );
}
