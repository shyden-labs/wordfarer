import { createRequire } from 'node:module';
import type net from 'node:net';
import { afterEach, beforeEach, expect } from 'vitest';
import {
  connectProblem,
  cpuProblem,
  processProblem,
  REFUSED_PROCESS,
  targetOf,
} from './setup-rules';

/**
 * The unit suite's setup (#477): it runs before every unit test file, and
 * holds each test to the rules in setup-rules.ts. A process start or an
 * outside socket throws inside the test that asked for it, naming it, before
 * anything starts or connects; a test over 1 s of its own CPU fails after it.
 *
 * The modules are patched through `require`, which hands back the objects
 * every import shares. Node makes a built-in's named and namespace exports
 * when it is first imported as a module, and in a Vitest worker that comes
 * after this setup, so every form sees the patch: measured 2026-10-09 for a
 * test file and for a dependency Node loads itself, with and without
 * `syncBuiltinESMExports` (#477). setup.test.ts calls each entry point through
 * each form, so a change in that order fails there.
 */

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process') as Record<string, unknown>;
const netModule = require('node:net') as typeof net;

const asking = (): string => {
  const { currentTestName, testPath } = expect.getState();
  return currentTestName ?? `${testPath ?? '?'} (outside a test)`;
};

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
