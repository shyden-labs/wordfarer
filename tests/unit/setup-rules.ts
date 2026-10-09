import { sep } from 'node:path';

/**
 * The rules tests/unit/setup.ts enforces on every unit test (#477), kept
 * apart from it so each is tested on its own (tests/unit/setup.test.ts).
 *
 * - Every unit test runs in under 1 s of its own CPU, and no limit is ever
 *   raised (global rule, 2026-10-07). The thread's CPU, not the process's:
 *   garbage-collector threads tripled a process figure (shyden.co.uk #632).
 * - A unit test starts no process and reaches no service (global rule,
 *   2026-10-08). A socket may reach only a server the test process itself is
 *   listening on, as verify-dev.test.ts serves its own pages in-process.
 */

export const CPU_LIMIT_MS = 1_000;

export const REFUSED_PROCESS = [
  'spawn',
  'spawnSync',
  'exec',
  'execSync',
  'execFile',
  'execFileSync',
  'fork',
] as const;

export const REFUSED = [
  ...REFUSED_PROCESS.map((name) => `child_process.${name}`),
  'net.Socket.prototype.connect',
  'tracked-files.committableFiles',
  'tracked-files.ignoredPaths',
  'old-name.walkTree',
  'fs.readdirSync',
  'fs.readdir',
  'fs.promises.readdir',
  'fs.opendirSync',
  'fs.opendir',
  'fs.promises.opendir',
  'fs.globSync',
  'fs.glob',
  'fs.promises.glob',
];

/**
 * A unit test reads no whole tree (#530): a whole-tree check belongs in the
 * guards suite (global rule, 2026-10-08). The named readers are refused on
 * the checkout or any directory in it, and so is a walk, which #515 measured
 * as listing three or more of the checkout's directories. tests/floors is
 * not counted: floorBreach lists it once per worker.
 */
export const WALK_LIMIT = 3;

export const FLOORS_DIR = 'tests/floors';

export const insideCheckout = (path: string, checkout: string): boolean =>
  path === checkout || path.startsWith(`${checkout}${sep}`);

const BELONGS =
  'a test that reads the whole tree belongs in tests/guards (#530)';
const WALKS = 'a test that walks the tree belongs in tests/guards (#530)';

export const treeProblem = (test: string, reader: string): string =>
  `${test}: ${reader} reads the whole checkout; ${BELONGS}`;

export const walkProblem = (test: string, dirs: readonly string[]): string =>
  `${test}: lists ${String(dirs.length)} of the checkout’s directories (${dirs.join(', ')}); ${WALKS}`;

export const recursiveProblem = (test: string, dir: string): string =>
  `${test}: lists ${dir} recursively; ${WALKS}`;

export interface Target {
  host?: string;
  port?: number;
  path?: string;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const cpuProblem = (test: string, micros: number): string | null =>
  micros > CPU_LIMIT_MS * 1_000
    ? `${test}: ${(micros / 1_000).toFixed(1)} ms of its own CPU, over the ${String(CPU_LIMIT_MS)} ms unit limit; cut its work (global rule, 2026-10-07)`
    : null;

export const processProblem = (test: string, entry: string): string =>
  `${test}: child_process.${entry} starts a process, and a unit test starts none (global rule, 2026-10-08); a test where a process is the thing tested belongs in tests/integration`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Where `net.Socket.prototype.connect` was asked to go, from any of its
 * forms: `net.connect`'s normalised array, an options object, a port and a
 * host, or a pipe path.
 */
export const targetOf = (args: readonly unknown[]): Target => {
  const [first, second] = args;
  if (Array.isArray(first)) return targetOf(first);
  if (isRecord(first)) {
    const { host, port, path } = first;
    if (typeof path === 'string') return { path };
    return {
      ...(typeof host === 'string' ? { host } : {}),
      ...(port !== undefined ? { port: Number(port) } : {}),
    };
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return { path: first };
  return {
    ...(typeof second === 'string' ? { host: second } : {}),
    port: Number(first),
  };
};

export const connectProblem = (
  test: string,
  target: Target,
  listening: ReadonlySet<string>,
): string | null => {
  const allowed =
    target.path !== undefined
      ? listening.has(target.path)
      : LOOPBACK.has(target.host ?? 'localhost') &&
        listening.has(String(target.port));
  if (allowed) return null;
  const where =
    target.path ?? `${target.host ?? 'localhost'}:${String(target.port)}`;
  return `${test}: a socket to ${where} leaves the test process, and a unit test reaches no service (global rule, 2026-10-08)`;
};
