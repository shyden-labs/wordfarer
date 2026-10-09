import type fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import type net from 'node:net';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, vi } from 'vitest';
import { asking, inIgnoreLookup } from './setup-refuse';
import {
  connectProblem,
  cpuProblem,
  FLOORS_DIR,
  gitDirsOf,
  gitProblem,
  insideCheckout,
  processProblem,
  READ_LIMIT,
  readProblem,
  recursiveProblem,
  REFUSED_PROCESS,
  targetOf,
  WALK_LIMIT,
  walkProblem,
} from './setup-rules';

/**
 * The unit suite's setup (#477): it runs before every unit test file, and
 * holds each test to the rules in setup-rules.ts. A process start or an
 * outside socket throws inside the test that asked for it, naming it, before
 * anything starts or connects; so does a read of the whole checkout (#530);
 * a test over 1 s of its own CPU fails after it.
 *
 * The modules are patched through `require`, which hands back the objects
 * every import shares. Node makes a built-in's named and namespace exports
 * when it is first imported as a module, as a copy of what it held then.
 * child_process is first imported after this setup, so its forms see the
 * patch without help (measured 2026-10-09, #477). Vitest has imported node:fs
 * before it, so `syncBuiltinESMExports` copies the fs patches into those
 * exports: without it, six named- and namespace-import refusals in
 * setup-whole-tree.test.ts fail (#530). The setup tests call each entry point
 * through each form, so a change in that order fails there.
 */

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process') as Record<string, unknown>;
const netModule = require('node:net') as typeof net;

for (const name of REFUSED_PROCESS) {
  childProcess[name] = function refused(): never {
    throw new Error(processProblem(asking(), name));
  };
}

// What this process listens on: a port as text, or a pipe path.
const listening = new Set<string>();
const listen = Reflect.get(netModule.Server.prototype, 'listen') as (
  this: net.Server,
  ...args: unknown[]
) => net.Server;
netModule.Server.prototype.listen = function tracked(
  this: net.Server,
  ...args: unknown[]
): net.Server {
  this.once('listening', () => {
    const address = this.address();
    const key =
      typeof address === 'string' ? address : String(address?.port ?? '');
    listening.add(key);
    this.once('close', () => {
      listening.delete(key);
    });
  });
  return listen.apply(this, args);
} as net.Server['listen'];

const connect = Reflect.get(netModule.Socket.prototype, 'connect') as (
  this: net.Socket,
  ...args: unknown[]
) => net.Socket;
netModule.Socket.prototype.connect = function checked(
  this: net.Socket,
  ...args: unknown[]
): net.Socket {
  const problem = connectProblem(asking(), targetOf(args), listening);
  if (problem !== null) throw new Error(problem);
  return connect.apply(this, args);
};

// The named whole-tree readers (#530), wrapped wherever a test reaches them:
// by a named or namespace import, or through a helper module. A fixture
// outside the checkout passes through.
vi.mock('./tracked-files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tracked-files')>();
  const { asIgnoreLookup, refuseWholeTree } = await import('./setup-refuse');
  return {
    ...actual,
    committableFiles: (pathspecs: readonly string[] = [], cwd = '.') => {
      refuseWholeTree('committableFiles', cwd);
      return actual.committableFiles(pathspecs, cwd);
    },
    ignoredPaths: (root: string) => {
      refuseWholeTree('ignoredPaths', root);
      return actual.ignoredPaths(root);
    },
    isIgnored: (path: string, root = '.') =>
      asIgnoreLookup(() => actual.isIgnored(path, root)),
  };
});
vi.mock('./old-name', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./old-name')>();
  const { refuseWholeTree } = await import('./setup-refuse');
  return {
    ...actual,
    walkTree: (root = '.') => {
      refuseWholeTree('walkTree', root);
      return actual.walkTree(root);
    },
  };
});

// A walk of the checkout by any other route (#530): the directories each
// test lists, refused at the third; a recursive listing or a glob at once.
const fsModule = require('node:fs') as typeof fs;
const CHECKOUT = resolve('.');
const FLOORS = resolve(FLOORS_DIR);
const listed = new Set<string>();
/** The absolute path a path argument names, or null for a descriptor. */
const fullPath = (given: unknown): string | null => {
  const path =
    given instanceof URL
      ? fileURLToPath(given)
      : typeof given === 'string' || Buffer.isBuffer(given)
        ? String(given)
        : null;
  return path === null ? null : resolve(path);
};
/** `dir` relative to the checkout when a walk there counts, or null. */
const inside = (dir: unknown): string | null => {
  const full = fullPath(dir);
  if (full === null) return null;
  if (!insideCheckout(full, CHECKOUT) || insideCheckout(full, FLOORS))
    return null;
  return relative(CHECKOUT, full) || '.';
};
/** What a listing of `dir` would break, or null. */
const lists = (dir: unknown, options: unknown): string | null => {
  const where = inside(dir);
  if (where === null) return null;
  if (
    typeof options === 'object' &&
    options !== null &&
    (options as { recursive?: unknown }).recursive === true
  )
    return recursiveProblem(asking(), where);
  listed.add(where);
  return listed.size >= WALK_LIMIT ? walkProblem(asking(), [...listed]) : null;
};
/** What a glob from `options.cwd` would break, or null. */
const globs = (options: unknown): string | null => {
  const cwd =
    typeof options === 'object' && options !== null
      ? (options as { cwd?: unknown }).cwd
      : undefined;
  const where = inside(cwd ?? process.cwd());
  return where === null ? null : recursiveProblem(asking(), where);
};
type Listing = (...args: unknown[]) => unknown;
type Check = (args: unknown[]) => string | null;
const byPath: Check = (args) => lists(args[0], args[1]);
const byGlob: Check = (args) => globs(args[1]);
/** Throws the problem, or for a promise-returning entry point rejects with it. */
const wrap = (
  target: object,
  name: string,
  check: Check,
  rejects = false,
): void => {
  const original = Reflect.get(target, name) as Listing;
  Reflect.set(
    target,
    name,
    function checked(this: unknown, ...args: unknown[]): unknown {
      const problem = check(args);
      if (problem !== null) {
        if (rejects) return Promise.reject(new Error(problem));
        throw new Error(problem);
      }
      return original.apply(this, args);
    },
  );
};
for (const name of ['readdirSync', 'readdir', 'opendirSync', 'opendir'])
  wrap(fsModule, name, byPath);
for (const name of ['globSync', 'glob']) wrap(fsModule, name, byGlob);
// A promise's errors arrive as a rejection, so a refusal does too.
for (const name of ['readdir', 'opendir'])
  wrap(fsModule.promises, name, byPath, true);
wrap(fsModule.promises, 'glob', byGlob);

// Reads (#530): any file of git's own record of the tree outside an ignore
// lookup, and a twentieth distinct file of the checkout, by any route. The
// git directories are found before anything is patched: in a worktree `.git`
// is a file naming one outside the checkout, and that one's `commondir`.
const GIT_DIRS = gitDirsOf(resolve('.git'), fsModule);
const readFiles = new Set<string>();
const byRead: Check = (args) => {
  if (inIgnoreLookup()) return null;
  const full = fullPath(args[0]);
  if (full === null) return null;
  if (GIT_DIRS.some((dir) => insideCheckout(full, dir)))
    return gitProblem(asking(), relative(CHECKOUT, full));
  if (!insideCheckout(full, CHECKOUT) || insideCheckout(full, FLOORS))
    return null;
  // Node's own module loader reads every file a require loads through this
  // fs (wrangler pulls in undici's 20 and more at collection): a dependency
  // being loaded, not files a test reads. Only under node_modules: the tree's
  // own modules reach a unit test through Vitest, so a require of the tree's
  // files counts like any other read.
  if (
    /(^|\/)node_modules\//.test(relative(CHECKOUT, full)) &&
    (new Error().stack ?? '').includes('node:internal/modules/')
  )
    return null;
  readFiles.add(full);
  return readFiles.size >= READ_LIMIT
    ? readProblem(asking(), readFiles.size)
    : null;
};
for (const name of [
  'readFileSync',
  'readFile',
  'openSync',
  'open',
  'createReadStream',
])
  wrap(fsModule, name, byRead);
for (const name of ['readFile', 'open'])
  wrap(fsModule.promises, name, byRead, true);
syncBuiltinESMExports();
beforeEach(() => {
  listed.clear();
  readFiles.clear();
});

let started = process.threadCpuUsage();
beforeEach(() => {
  started = process.threadCpuUsage();
});
afterEach((context) => {
  const used = process.threadCpuUsage(started);
  const problem = cpuProblem(
    `${context.task.file.name} > ${context.task.name}`,
    used.user + used.system,
  );
  if (problem !== null) throw new Error(problem);
});
