import * as childProcess from 'node:child_process';
import {
  exec,
  execFile,
  execFileSync,
  execSync,
  fork,
  spawn,
  spawnSync,
} from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import { describe, expect, it } from 'vitest';
import unit from '../../vitest.config';
import { floorBreach } from '../floors';
import {
  connectProblem,
  CPU_LIMIT_MS,
  cpuProblem,
  processProblem,
  REFUSED,
  REFUSED_PROCESS,
  targetOf,
} from './setup-rules';

/**
 * The unit setup (#477 AC2, AC7): every unit test runs in under 1 s of its
 * own CPU (global rule, 2026-10-07), starts no process and reaches no service
 * (global rule, 2026-10-08). The live tests below run under tests/unit/setup.ts
 * itself, so each refusal is seen from inside a unit test; the rules are
 * tested beside them.
 */

// A command no machine has: were a refusal to fail, the call would still
// start nothing that runs.
const NOWHERE = '/nonexistent/yawelo-idle-unit-probe';
// TEST-NET-1 (RFC 5737): reserved, never routed.
const OUTSIDE = '192.0.2.1';

const own = (): string => expect.getState().currentTestName ?? '';

describe('the setup is the unit suite’s (#477 AC7)', () => {
  it('is named by the unit config, and only it', () => {
    expect(unit.test?.setupFiles).toEqual(['tests/unit/setup.ts']);
  });

  it('refuses each process entry point and the socket connect, by name', () => {
    expect(REFUSED_PROCESS).toEqual([
      'spawn',
      'spawnSync',
      'exec',
      'execSync',
      'execFile',
      'execFileSync',
      'fork',
    ]);
    // The whole-tree readers after these: setup-whole-tree.test.ts (#530).
    expect(REFUSED.slice(0, 8)).toEqual([
      ...REFUSED_PROCESS.map((name) => `child_process.${name}`),
      'net.Socket.prototype.connect',
    ]);
    expect(
      floorBreach('setup/refused-entry-points', REFUSED.length),
    ).toBeUndefined();
  });
});

describe('a unit test starts no process (#477 AC7)', () => {
  const NAMED = {
    spawn: () => spawn(NOWHERE),
    spawnSync: () => spawnSync(NOWHERE),
    exec: () => exec(NOWHERE),
    execSync: () => execSync(NOWHERE),
    execFile: () => execFile(NOWHERE),
    execFileSync: () => execFileSync(NOWHERE),
    fork: () => fork(NOWHERE),
  } as const;
  const required = createRequire(import.meta.url)(
    'node:child_process',
  ) as Record<string, (command: string) => unknown>;
  const namespace = childProcess as unknown as Record<
    string,
    (command: string) => unknown
  >;

  it.each(REFUSED_PROCESS)(
    '%s, by a named import, throws naming the test',
    (name) => {
      expect(NAMED[name]).toThrow(
        `${own()}: child_process.${name} starts a process`,
      );
    },
  );

  it.each(REFUSED_PROCESS)(
    '%s, by a namespace import, throws naming the test',
    (name) => {
      expect(() => namespace[name]?.(NOWHERE)).toThrow(
        `${own()}: child_process.${name} starts a process`,
      );
    },
  );

  it.each(REFUSED_PROCESS)('%s, by require, throws naming the test', (name) => {
    expect(() => required[name]?.(NOWHERE)).toThrow(
      `${own()}: child_process.${name} starts a process`,
    );
  });
});

describe('a unit test reaches no service (#477 AC7)', () => {
  it('refuses a socket to another host, naming the test', () => {
    expect(() => net.connect({ host: OUTSIDE, port: 9 })).toThrow(
      `${own()}: a socket to ${OUTSIDE}:9 leaves the test process`,
    );
  });

  it('refuses a TLS socket to another host', () => {
    expect(() => tls.connect({ host: OUTSIDE, port: 443 })).toThrow(
      `${own()}: a socket to ${OUTSIDE}:443 leaves the test process`,
    );
  });

  it('refuses fetch to another host', async () => {
    // Port 80: fetch refuses port 9 itself ("bad port") before any socket.
    const failure = await fetch(`http://${OUTSIDE}:80/`).catch(
      (error: unknown) => error,
    );
    expect(String((failure as { cause?: unknown }).cause)).toContain(
      `a socket to ${OUTSIDE}:80 leaves the test process`,
    );
  });

  it('refuses a loopback port this process is not listening on', () => {
    expect(() => net.connect({ host: '127.0.0.1', port: 9 })).toThrow(
      `${own()}: a socket to 127.0.0.1:9 leaves the test process`,
    );
  });

  it('lets a test reach a server it is listening on itself, and refuses that port once it closes', async () => {
    const server = net.createServer((socket) => socket.end('ok'));
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as net.AddressInfo;
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      let text = '';
      socket.on('data', (chunk) => (text += String(chunk)));
      socket.on('end', () => {
        resolve(text);
      });
      socket.on('error', reject);
    });
    expect(reply).toBe('ok');
    await new Promise((resolve) => server.close(resolve));
    expect(() => net.connect({ host: '127.0.0.1', port })).toThrow(
      `a socket to 127.0.0.1:${String(port)} leaves the test process`,
    );
  });
});

describe('the rules (#477 AC2, AC7)', () => {
  it.each([
    ['at the limit', CPU_LIMIT_MS * 1_000, null],
    [
      'a microsecond over',
      CPU_LIMIT_MS * 1_000 + 1,
      `f > t: 1000.0 ms of its own CPU, over the ${String(CPU_LIMIT_MS)} ms unit limit; cut its work (global rule, 2026-10-07)`,
    ],
    [
      'well over',
      2_500_000,
      `f > t: 2500.0 ms of its own CPU, over the ${String(CPU_LIMIT_MS)} ms unit limit; cut its work (global rule, 2026-10-07)`,
    ],
  ])('cpuProblem: %s', (_case, micros, problem) => {
    expect(cpuProblem('f > t', micros)).toBe(problem);
  });

  it('processProblem names the test, the entry point and where such a test belongs', () => {
    expect(processProblem('f > t', 'fork')).toBe(
      'f > t: child_process.fork starts a process, and a unit test starts none (global rule, 2026-10-08); a test where a process is the thing tested belongs in tests/integration',
    );
  });

  it.each([
    [
      'net.connect’s normalised array',
      [[{ host: 'h', port: 9 }, null]],
      { host: 'h', port: 9 },
    ],
    ['an options object', [{ host: 'h', port: 9 }], { host: 'h', port: 9 }],
    ['an options object without a host', [{ port: 9 }], { port: 9 }],
    ['a port and a host', [9, 'h'], { host: 'h', port: 9 }],
    ['a port as text', ['9', 'h'], { host: 'h', port: 9 }],
    ['a pipe path', ['/tmp/s.sock'], { path: '/tmp/s.sock' }],
    ['an options path', [{ path: '/tmp/s.sock' }], { path: '/tmp/s.sock' }],
  ])('targetOf: %s', (_form, args, target) => {
    expect(targetOf(args)).toEqual(target);
  });

  it.each([
    ['127.0.0.1, listening', { host: '127.0.0.1', port: 5 }, null],
    ['localhost, listening', { host: 'localhost', port: 5 }, null],
    ['::1, listening', { host: '::1', port: 5 }, null],
    ['no host, listening', { port: 5 }, null],
    ['a pipe this process listens on', { path: '/tmp/l.sock' }, null],
    [
      '127.0.0.1, not listening',
      { host: '127.0.0.1', port: 6 },
      'f > t: a socket to 127.0.0.1:6 leaves the test process, and a unit test reaches no service (global rule, 2026-10-08)',
    ],
    [
      'another host on a listening port',
      { host: '10.0.0.1', port: 5 },
      'f > t: a socket to 10.0.0.1:5 leaves the test process, and a unit test reaches no service (global rule, 2026-10-08)',
    ],
    [
      'a pipe this process does not listen on',
      { path: '/tmp/x.sock' },
      'f > t: a socket to /tmp/x.sock leaves the test process, and a unit test reaches no service (global rule, 2026-10-08)',
    ],
  ])('connectProblem: %s', (_case, target, problem) => {
    expect(connectProblem('f > t', target, new Set(['5', '/tmp/l.sock']))).toBe(
      problem,
    );
  });
});
