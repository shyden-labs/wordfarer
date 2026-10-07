/**
 * Record the guards' liveness floors (#361): `npm run floors:record`.
 *
 * Every `floorBreach` call (`tests/floors.ts`) judges a count against the
 * figure recorded in `tests/floors/<guard>.json`, one file per guard, the
 * guard being the id's text before its first `/` (#406: tickets that touch
 * different guards then stop conflicting on one shared file). Run with
 * `FLOORS_RECORD` set, it writes the count it saw instead. This script runs
 * each suite that holds a call that way, judges every count together and
 * raises the files whose floors moved, and only those. It checks EVERYTHING
 * before writing anything, and refuses the whole record when:
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
 * Yawelo Idle runs eight suites, and the root unit suite skips the others
 * (pacing, the game, site and dev-hosts harnesses, the sync Worker, the
 * engines, the web smoke suite), so each suite is
 * asked for its own file list rather than the recorder copying their globs.
 *
 * CI never records: a run that can rewrite the figure it checks against
 * asserts nothing. Imports are Node's own, TypeScript's parser, which finds
 * the callers (#448), and the repository's one file walk.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, relative, sep } from 'node:path';
import ts from 'typescript';
import { committableFiles } from '../tests/unit/tracked-files.ts';

/** The recorded figures, one file per guard, relative to the repository root. */
export const FLOORS_DIR = 'tests/floors';

/** A guard's name: lower-case words joined by hyphens, so it is a safe file name. */
const GUARD = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The guard an id belongs to, or undefined when it is not `guard/name`. */
const guardOf = (id: string): string | undefined => {
  const slash = id.indexOf('/');
  const guard = id.slice(0, slash);
  return slash > 0 && slash < id.length - 1 && GUARD.test(guard)
    ? guard
    : undefined;
};

/** The repository-relative file that records `id`; throws for an id that names no guard. */
export const floorsFileOf = (id: string): string => {
  const guard = guardOf(id);
  if (guard === undefined)
    throw new Error(
      `${id} is not a floor id: write guard/name, the guard in lower-case ` +
        'words joined by hyphens',
    );
  return posix.join(FLOORS_DIR, `${guard}.json`);
};

/**
 * Every figure recorded in `dir`, the union of its guard files. Throws,
 * naming each, for a file that is not `<guard>.json`, is not JSON, holds no
 * object, or holds an id of another guard or a figure that is not a count:
 * read silently, any of them would hide a floor.
 */
export const readFloorsDir = (dir: string): Record<string, number> => {
  const floors: Record<string, number> = {};
  const refusals: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) {
      refusals.push(`${name} is not a .json floors file`);
      continue;
    }
    const guard = name.slice(0, -'.json'.length);
    if (!GUARD.test(guard)) {
      refusals.push(`${name} is not named for a guard`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch {
      refusals.push(`${name} is not valid JSON`);
      continue;
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      refusals.push(`${name} does not hold an object of floors`);
      continue;
    }
    for (const [id, figure] of Object.entries(parsed)) {
      const owner = guardOf(id);
      if (owner !== guard)
        refusals.push(
          owner === undefined
            ? `${name}: ${id} is not a floor id`
            : `${name}: ${id} belongs in ${owner}.json`,
        );
      else if (!Number.isInteger(figure) || (figure as number) < 0)
        refusals.push(`${name}: ${id} is ${String(figure)}, not a count`);
      else floors[id] = figure as number;
    }
  }
  if (refusals.length > 0)
    throw new Error(`${dir} cannot be read:\n  ${refusals.join('\n  ')}`);
  return floors;
};

/**
 * Write each guard's file whose text would change, in `floorsText`'s form,
 * and nothing else; returns the files written, by name. A ticket that moves
 * one guard's floors then changes one file.
 */
export const writeFloors = (
  dir: string,
  next: Readonly<Record<string, number>>,
): string[] => {
  const byGuard = new Map<string, Record<string, number>>();
  for (const [id, figure] of Object.entries(next)) {
    const name = posix.basename(floorsFileOf(id));
    byGuard.set(name, { ...byGuard.get(name), [id]: figure });
  }
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const [name, floors] of [...byGuard].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const file = join(dir, name);
    const text = floorsText(floors);
    if (existsSync(file) && readFileSync(file, 'utf8') === text) continue;
    writeFileSync(file, text);
    written.push(name);
  }
  return written;
};

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
    name: 'game harness',
    cwd: 'apps/web',
    list: [...VITEST_LIST, '-c', 'vitest.harness.config.ts'],
    files: vitestListed,
    // Its `test` script builds first: the Worker serves the built ./dist.
    run: ['npm', 'run', 'test'],
  },
  {
    name: 'site harness',
    cwd: 'apps/site',
    list: [...VITEST_LIST, '-c', 'vitest.harness.config.ts'],
    files: vitestListed,
    // Its `test` script builds first: the Worker serves the built ./dist.
    run: ['npm', 'run', 'test'],
  },
  {
    name: 'dev hosts harness',
    cwd: 'apps/dev-hosts',
    list: [...VITEST_LIST, '-c', 'vitest.harness.config.ts'],
    files: vitestListed,
    // Its `test` script compiles the Function first, into ./.build.
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
  {
    name: 'web smoke suite',
    cwd: '.',
    list: [
      'npx',
      'playwright',
      'test',
      '-c',
      'playwright.web.config.ts',
      '--list',
      '--reporter=json',
    ],
    files: (stdout) => playwrightListed(process.cwd())(stdout),
    // Its script builds the game first: the local Worker serves ./dist.
    run: ['npm', 'run', 'test:web'],
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
          `it in ${floorsFileOf(id)} by hand and say why in the commit.`,
      );
      continue;
    }
    next[id] = actual;
  }
  for (const id of Object.keys(recorded))
    if (!byId.has(id))
      refusals.push(
        `${id} is recorded but no test asserted it: remove it from ` +
          `${floorsFileOf(id)} with the floor that used it, or run every suite`,
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

/** Every file kind TypeScript compiles, as git pathspecs. */
export const TYPESCRIPT_FILES = ['*.ts', '*.mts', '*.cts', '*.tsx'] as const;

/** The floors module, from the repository root, without its extension. */
export const FLOORS_MODULE = 'tests/floors';

/** What one file's parse tree says about `floorBreach` (#448). */
export interface FloorCallerReading {
  /** The file's code calls `floorBreach`, or hands it on by reference. */
  readonly calls: boolean;
  /** Each way the file reaches `floorBreach` that the recorder cannot follow. */
  readonly refusals: readonly string[];
}

const FLOOR = 'floorBreach';

/** Whether `specifier`, written in `path`, names the floors module. */
const isFloorsModule = (path: string, specifier: string): boolean =>
  specifier.startsWith('.') &&
  posix
    .normalize(posix.join(posix.dirname(path), specifier))
    .replace(/\.[jt]s$/, '') === FLOORS_MODULE;

/** A name declared here, so the identifier is no reference to `floorBreach`. */
const isKey = (node: ts.Identifier): boolean => {
  const parent = node.parent;
  return (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent)) &&
    parent.name === node
  );
};

/** A declaration that gives `node` its own binding. */
const declares = (node: ts.Identifier): boolean => {
  const parent = node.parent;
  return (
    (ts.isFunctionDeclaration(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isParameter(parent)) &&
    parent.name === node
  );
};

/**
 * Whether `path`'s code calls `floorBreach` (#448), read from its parse tree:
 * comments and strings hold no identifiers, so prose naming it is no call.
 * Every import form TypeScript accepts is followed (extensionless, `.ts`,
 * `.js`, aliased, a namespace read by name or literal key, the function
 * handed on by reference). Anything else that reaches the name is refused by
 * name, never skipped: a caller the recorder misses keeps a stale floor.
 */
export function readFloorCaller(
  path: string,
  source: string,
): FloorCallerReading {
  if (path === `${FLOORS_MODULE}.ts`) return { calls: false, refusals: [] };
  const sf = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const direct = new Set<string>();
  const namespaces = new Set<string>();
  const refusals = new Set<string>();
  const refuse = (why: string): void => {
    refusals.add(`${path}: ${why}`);
  };
  const REEXPORT = `re-exports ${FLOOR}; import it from ${FLOORS_MODULE} directly`;

  for (const statement of sf.statements) {
    if (!(
      ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
    ))
      continue;
    const from = statement.moduleSpecifier;
    if (
      from === undefined ||
      !ts.isStringLiteral(from) ||
      !isFloorsModule(path, from.text)
    )
      continue;
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const bindings =
        clause?.phaseModifier === ts.SyntaxKind.TypeKeyword
          ? undefined
          : clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings))
        namespaces.add(bindings.name.text);
      else
        for (const element of bindings?.elements ?? [])
          if (
            !element.isTypeOnly &&
            (element.propertyName ?? element.name).text === FLOOR
          )
            direct.add(element.name.text);
    } else if (!statement.exportClause) refuse(REEXPORT);
  }

  let calls = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [specifier] = node.arguments;
      if (
        specifier &&
        ts.isStringLiteralLike(specifier) &&
        isFloorsModule(path, specifier.text)
      )
        refuse(
          `imports ${FLOORS_MODULE} dynamically, which the recorder cannot follow`,
        );
    }
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      if (ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent)) {
        // A binding site, read above.
      } else if (ts.isExportSpecifier(parent)) {
        const exported = (parent.propertyName ?? parent.name).text;
        if (exported === FLOOR || direct.has(exported)) refuse(REEXPORT);
      } else if (
        ts.isPropertyAccessExpression(parent) &&
        parent.name === node
      ) {
        if (node.text === FLOOR) {
          if (
            ts.isIdentifier(parent.expression) &&
            namespaces.has(parent.expression.text)
          )
            calls = true;
          else
            refuse(
              `reaches ${FLOOR} through ${parent.expression.getText(sf)}, which the recorder cannot follow`,
            );
        }
      } else if (isKey(node)) {
        // An object's own key, not a reference.
      } else if (namespaces.has(node.text)) {
        if (
          ts.isPropertyAccessExpression(parent) &&
          parent.expression === node
        ) {
          // A member, judged at its name.
        } else if (
          ts.isElementAccessExpression(parent) &&
          parent.expression === node
        ) {
          const key = parent.argumentExpression;
          if (!ts.isStringLiteralLike(key))
            refuse(`reads ${FLOORS_MODULE} by a computed key`);
          else if (key.text === FLOOR) calls = true;
        } else refuse(`hands ${FLOORS_MODULE} on as a value`);
      } else if (direct.has(node.text)) calls = true;
      else if (node.text === FLOOR)
        refuse(
          declares(node)
            ? `declares its own ${FLOOR}`
            : `calls ${FLOOR} with no recognised import of it`,
        );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { calls, refusals: [...refusals] };
}

/** The callers among `files`, and every file refused by name. */
export function findFloorCallers(
  files: readonly { readonly path: string; readonly source: string }[],
): { callers: string[]; refusals: string[] } {
  const callers: string[] = [];
  const refusals: string[] = [];
  for (const { path, source } of files) {
    const reading = readFloorCaller(path, source);
    refusals.push(...reading.refusals);
    if (reading.calls && reading.refusals.length === 0) callers.push(path);
  }
  return { callers, refusals };
}

/**
 * TypeScript files git tracks, or would at the next `git add -A`, whose code
 * calls `floorBreach`, each read from its parse tree (#448). Every file is
 * read, not only those a text search names, so an aliased or namespace import
 * is found too; a file reaching it in a way this cannot follow stops the
 * record by name.
 */
const floorCallers = (): string[] => {
  const { callers, refusals } = findFloorCallers(
    committableFiles([...TYPESCRIPT_FILES])
      .filter((path) => existsSync(path))
      .map((path) => ({ path, source: readFileSync(path, 'utf8') })),
  );
  if (refusals.length > 0) die(`nothing recorded:\n  ${refusals.join('\n  ')}`);
  return callers;
};

const die = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

/** What one recording pass judged and wrote. */
interface Pass {
  readonly next: Record<string, number>;
  readonly seen: readonly Observation[];
  /** Guard files written, by name. */
  readonly written: readonly string[];
  /** Of those, the files that did not exist before the pass. */
  readonly created: readonly string[];
}

/** Run every suite once, judge every count together, and write what moved. */
const recordPass = (): Pass => {
  const recorded = existsSync(FLOORS_DIR) ? readFloorsDir(FLOORS_DIR) : {};
  const before = new Set(existsSync(FLOORS_DIR) ? readdirSync(FLOORS_DIR) : []);

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

  const written = writeFloors(FLOORS_DIR, next);
  return {
    next,
    seen,
    written,
    created: written.filter((name) => !before.has(name)),
  };
};

/**
 * Record, and record once more when the pass created a guard file: the walks
 * that count files (licences, old-name, supply-chain) measured the directory
 * before that file existed, so one pass is not yet exact (#406). A second
 * pass creates nothing new, since it writes only the guards the first did.
 */
const main = (): void => {
  const ci = ciRefusal(process.env);
  if (ci !== undefined) die(ci);

  const original = existsSync(FLOORS_DIR) ? readFloorsDir(FLOORS_DIR) : {};
  let pass = recordPass();
  const written = new Set(pass.written);
  if (pass.created.length > 0) {
    console.log(
      `Created ${pass.created.join(', ')}, which the file walks have not ` +
        'counted yet: recording once more.',
    );
    pass = recordPass();
    if (pass.created.length > 0)
      die(
        `the second pass created ${pass.created.join(', ')} too, so the ` +
          'record does not settle; the first pass is written, read git diff',
      );
    for (const name of pass.written) written.add(name);
  }
  const moves = describeMoves(original, pass.next);
  console.log(
    moves.length === 0
      ? `${FLOORS_DIR}: every floor already matches (${String(pass.seen.length)} read)`
      : [
          `${FLOORS_DIR}: ${String(moves.length)} floor(s) moved, in ${[...written].sort().join(', ')}:`,
          ...moves.map((move) => `  ${move}`),
          'Read each one against your diff: a raise smaller than the units you',
          'added is a reader that lost some. Put these lines in the commit.',
        ].join('\n'),
  );
};

if (import.meta.main) main();
