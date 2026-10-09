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
];

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
