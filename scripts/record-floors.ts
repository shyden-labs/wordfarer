/**
 * Record the guards' liveness floors (#361): `npm run floors:record`.
 *
 * Every `floorBreach` call (`tests/floors.ts`) judges a count against the
 * figure recorded in `tests/floors.json`. Run with `FLOORS_RECORD` set, it
 * writes the count it saw instead. This script runs each suite that holds a
 * call that way, judges every count together and raises `tests/floors.json`
 * to match. It checks EVERYTHING before writing anything, and refuses the
 * whole record when:
 *
 * - a figure would FALL. A falling count is what a blind reader looks like,
 *   and so is a corpus that really shrank; only a person can tell the two
 *   apart, so a fall is a hand edit with the reason in the commit;
 * - a recorded id was asserted by no test, so the file names a floor that no
 *   longer exists (or a suite that did not reach it);
 * - one id was asserted from two places, or read two values: two guards
 *   sharing a figure would let either go blind behind the other;
 * - a file calling `floorBreach` belongs to no suite the recorder can run
 *   (the sync Worker's suite runs inside workerd, which has no file system);
 * - any suite failed or did not start.
 *
 * Yawelo Idle runs five suites, and the root unit suite skips four of them
 * (pacing, the web gate, the sync Worker, the engines), so each suite is
 * asked for its own file list rather than the recorder copying their globs.
 *
 * CI never records: a run that can rewrite the figure it checks against
 * asserts nothing. Imports are Node's own.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, relative, sep } from 'node:path';

/** The recorded figures, relative to the repository root. */
export const FLOORS_FILE = 'tests/floors.json';

/** Set to a file for each `floorBreach` call to append what it saw to. */
export const RECORD_ENV = 'FLOORS_RECORD';

export interface Observation {
  readonly id: string;
  readonly actual: number;
  readonly site: string;
}

/** One way the repository runs tests, and how to ask it for its files. */
export interface Suite {
  readonly name: string;
  /** Repository-relative directory the suite runs from. */
  readonly cwd: string;
  /** The command that lists the suite's files. */
  readonly list: readonly string[];
  /** Reads `list`'s output as paths relative to `cwd`. */
  readonly files: (stdout: string) => string[];
  /** The command that runs the suite, or why it cannot record. */
  readonly run: readonly string[] | { readonly unrecordable: string };
}

/** `vitest list --filesOnly`: one path per line, relative to its root. */
export const vitestListed = (stdout: string): string[] =>
  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

interface PlaywrightList {
  readonly config: { readonly rootDir: string };
  readonly suites: readonly { readonly file: string }[];
}

/**
 * `playwright test --list --reporter=json`: files relative to its test
 * directory, which `rootDir` names absolutely. `cwd` is where it ran.
 */
export const playwrightListed =
  (cwd: string) =>
  (stdout: string): string[] => {
    const { config, suites } = JSON.parse(stdout) as PlaywrightList;
    return suites.map(({ file }) =>
      relative(cwd, join(config.rootDir, file)).split(sep).join(posix.sep),
    );
  };

const VITEST_LIST = ['npx', 'vitest', 'list', '--filesOnly'];

/** Every suite `package.json` runs, in the order a record runs them. */
export const SUITES: readonly Suite[] = [
  {
    name: 'unit suite',
    cwd: '.',
    list: VITEST_LIST,
    files: vitestListed,
    run: ['npx', 'vitest', 'run'],
  },
  {
    name: 'pacing suite',
    cwd: '.',
    list: [...VITEST_LIST, '-c', 'vitest.pacing.config.ts'],
    files: vitestListed,
    run: ['npm', 'run', 'test:pacing'],
  },
  {
    name: 'web gate',
    cwd: 'apps/web',
    list: [...VITEST_LIST, '-c', 'vitest.gate.config.ts'],
    files: vitestListed,
    // Its `test` script builds first: the gate serves the built ./dist.
    run: ['npm', 'run', 'test'],
  },
  {
    name: 'sync Worker suite',
    cwd: 'apps/sync-worker',
    list: VITEST_LIST,
    files: vitestListed,
    run: {
      unrecordable:
        'it runs inside workerd, which has no file system for floorBreach ' +
        'to record to',
    },
  },
  {
    name: 'engines suite',
    cwd: '.',
    list: [
      'npx',
      'playwright',
      'test',
      '-c',
      'playwright.engines.config.ts',
      '--list',
      '--reporter=json',
    ],
    files: (stdout) => playwrightListed(process.cwd())(stdout),
    run: ['npm', 'run', 'test:engines'],
  },
];

/** A suite's files, repository-relative. */
export const suiteFiles = (suite: Suite, stdout: string): string[] =>
  suite.files(stdout).map((file) => posix.join(suite.cwd, file));

/**
 * The suites to run for `callers` (files that call `floorBreach`), in
 * `suites` order, and every caller no runnable suite holds.
 */
export function planRecord(
  callers: readonly string[],
  suites: readonly Suite[],
  membership: ReadonlyMap<string, readonly string[]>,
): { run: Suite[]; refusals: string[] } {
  const needed = new Set<Suite>();
  const refusals: string[] = [];
  for (const caller of callers) {
    const holders = suites.filter((suite) =>
      (membership.get(suite.name) ?? []).includes(caller),
    );
    if (holders.length !== 1) {
      refusals.push(
        `${caller} calls floorBreach and is in ${String(holders.length)} ` +
          `suites, not one: ${holders.map(({ name }) => name).join(', ') || 'none'}`,
      );
      continue;
    }
    const [suite] = holders as [Suite];
    if ('unrecordable' in suite.run)
      refusals.push(
        `${caller} calls floorBreach in the ${suite.name}, which cannot ` +
          `record: ${suite.run.unrecordable}`,
      );
    else needed.add(suite);
  }
  return { run: suites.filter((suite) => needed.has(suite)), refusals };
}

/** Why a suite's run cannot be trusted, or nothing. */
export const runRefusal = (
  name: string,
  { status, error }: { status: number | null; error?: Error },
): string | undefined =>
  error !== undefined
    ? `the ${name} did not start: ${error.message}`
    : status === 0
      ? undefined
      : `the ${name} failed (exit ${String(status)}): nothing recorded`;

/** Why this environment must not record, or nothing. */
export const ciRefusal = (
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined =>
  environment['CI'] === undefined || environment['CI'] === ''
    ? undefined
    : 'CI never records floors: run npm run floors:record locally';

/**
 * The next figures, and every reason not to write them. The caller writes
 * `next` only when `refusals` is empty.
 */
export function decideRecord(
  recorded: Readonly<Record<string, number>>,
  seen: readonly Observation[],
): { next: Record<string, number>; refusals: string[] } {
  const byId = new Map<string, Observation[]>();
  for (const observation of seen)
    byId.set(observation.id, [
      ...(byId.get(observation.id) ?? []),
      observation,
    ]);

  const next: Record<string, number> = { ...recorded };
  const refusals: string[] = [];
  for (const [id, observations] of byId) {
    const sites = [...new Set(observations.map(({ site }) => site))];
    const values = [...new Set(observations.map(({ actual }) => actual))];
    if (sites.length > 1) {
      refusals.push(`${id} is asserted from two places: ${sites.join(', ')}`);
      continue;
    }
    if (values.length > 1) {
      refusals.push(`${id} read two different values: ${values.join(', ')}`);
      continue;
    }
    const [actual] = values as [number];
    const measured = recorded[id];
    if (measured !== undefined && actual < measured) {
      refusals.push(
        `${id} would fall from ${String(measured)} to ${String(actual)}: a ` +
          `blind reader looks like this. If the corpus really shrank, lower ` +
          `it in ${FLOORS_FILE} by hand and say why in the commit.`,
      );
      continue;
    }
    next[id] = actual;
  }
  for (const id of Object.keys(recorded))
    if (!byId.has(id))
      refusals.push(
        `${id} is recorded but no test asserted it: remove it from ` +
          `${FLOORS_FILE} with the floor that used it, or run every suite`,
      );
  return { next, refusals };
}

/**
 * One line per figure that moved, largest move first: `id: 100 -> 125 (+25)`
 * or `id: new, 3`. Printed because a raise is accepted on its direction
 * alone: a change that adds five units while its reader loses three records
 * +2, so each delta is read against the diff that caused it.
 */
export const describeMoves = (
  recorded: Readonly<Record<string, number>>,
  next: Readonly<Record<string, number>>,
): string[] =>
  Object.keys(next)
    .filter((id) => next[id] !== recorded[id])
    .map((id) => ({
      id,
      was: recorded[id],
      now: next[id] as number,
    }))
    .sort(
      (a, b) =>
        b.now - (b.was ?? 0) - (a.now - (a.was ?? 0)) || (a.id < b.id ? -1 : 1),
    )
    .map(({ id, was, now }) =>
      was === undefined
        ? `${id}: new, ${String(now)}`
        : `${id}: ${String(was)} -> ${String(now)} (+${String(now - was)})`,
    );

/** The file's text: ids sorted, two-space indented, a final newline (prettier's own form). */
export const floorsText = (floors: Readonly<Record<string, number>>): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(floors).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
    null,
    2,
  ) + '\n';

/** What a record run wrote, one observation per line; nothing if no file. */
const observationsIn = (file: string): Observation[] =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as Observation)
    : [];

/**
 * Whether `source` imports `floorBreach` from the floors module: the
 * construct that makes a file a caller. Its bare name is no evidence, since
 * this file spells it in prose and in the search below.
 */
export const importsFloorBreach = (source: string): boolean =>
  /import\s*\{[^}]*\bfloorBreach\b[^}]*\}\s*from\s*['"][^'"]*\/floors['"]/.test(
    source,
  );

/**
 * TypeScript files git tracks, or would at the next `git add -A`, whose text
 * calls `floorBreach`, but not its home. `git grep` exits 1 for no match.
 */
const floorCallers = (): string[] => {
  const found = spawnSync(
    'git',
    ['grep', '-l', '--untracked', '-F', 'floorBreach(', '--', '*.ts'],
    { encoding: 'utf8' },
  );
  if (found.status === 1 && found.error === undefined) return [];
  const refusal = runRefusal('search for floorBreach callers', found);
  if (refusal !== undefined) die(refusal);
  return found.stdout
    .split('\n')
    .filter(
      (file) => file !== '' && importsFloorBreach(readFileSync(file, 'utf8')),
    );
};

const die = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const main = (): void => {
  const ci = ciRefusal(process.env);
  if (ci !== undefined) die(ci);

  const recorded = existsSync(FLOORS_FILE)
    ? (JSON.parse(readFileSync(FLOORS_FILE, 'utf8')) as Record<string, number>)
    : {};

  const membership = new Map<string, string[]>();
  for (const suite of SUITES) {
    const [command, ...args] = suite.list as [string, ...string[]];
    const listed = spawnSync(command, args, {
      cwd: suite.cwd,
      encoding: 'utf8',
    });
    const refusal = runRefusal(`${suite.name}'s file list`, listed);
    if (refusal !== undefined) die(refusal);
    membership.set(suite.name, suiteFiles(suite, listed.stdout));
  }
  const plan = planRecord(floorCallers(), SUITES, membership);
  if (plan.refusals.length > 0)
    die(`nothing recorded:\n  ${plan.refusals.join('\n  ')}`);

  // Judged after the loop: `die` exits at once and would leak the directory.
  const dir = mkdtempSync(join(tmpdir(), 'floors-record-'));
  let refusal: string | undefined;
  let seen: Observation[] = [];
  try {
    for (const suite of plan.run) {
      if ('unrecordable' in suite.run) continue;
      const record = join(dir, `${suite.name.replace(/[^a-z]+/gi, '-')}.jsonl`);
      const [command, ...args] = suite.run as [string, ...string[]];
      console.log(`Recording the ${suite.name}: ${suite.run.join(' ')}`);
      refusal = runRefusal(
        suite.name,
        spawnSync(command, args, {
          cwd: suite.cwd,
          stdio: 'inherit',
          env: { ...process.env, [RECORD_ENV]: record },
        }),
      );
      if (refusal !== undefined) break;
      seen = [...seen, ...observationsIn(record)];
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (refusal !== undefined) die(refusal);

  const { next, refusals } = decideRecord(recorded, seen);
  if (refusals.length > 0) die(`nothing recorded:\n  ${refusals.join('\n  ')}`);

  const moves = describeMoves(recorded, next);
  writeFileSync(FLOORS_FILE, floorsText(next));
  console.log(
    moves.length === 0
      ? `${FLOORS_FILE}: every floor already matches (${String(seen.length)} read)`
      : [
          `${FLOORS_FILE}: ${String(moves.length)} floor(s) moved:`,
          ...moves.map((move) => `  ${move}`),
          'Read each one against your diff: a raise smaller than the units you',
          'added is a reader that lost some. Put these lines in the commit.',
        ].join('\n'),
  );
};

if (import.meta.main) main();
