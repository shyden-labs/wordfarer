import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The pre-push hook (#123 AC2; Shyden chose the static gates on #123,
 * 2026-10-06): format, lint and typecheck run before every push, and
 * `npm install` installs the hook. Unit, Worker and browser suites stay in CI.
 *
 * The hook is RUN, with a fake `npm` first on PATH that records each call and
 * fails the gate it is told to, so the order and the stop at the first failure
 * are behaviour, not text.
 */

const HOOK = '.githooks/pre-push';
const GATES = ['format:check', 'lint', 'typecheck'] as const;

const FAKE_NPM = `#!/bin/sh
printf '%s\\n' "$*" >> "$NPM_LOG"
[ "$3" = "$FAIL_GATE" ] && exit 7
exit 0
`;

interface Run {
  readonly status: number | null;
  readonly calls: readonly string[];
}

function runHook(failGate = ''): Run {
  const dir = mkdtempSync(join(tmpdir(), 'pre-push-'));
  try {
    const npm = join(dir, 'npm');
    writeFileSync(npm, FAKE_NPM);
    chmodSync(npm, 0o755);
    const log = join(dir, 'calls');
    writeFileSync(log, '');
    const run = spawnSync(HOOK, [], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ''}`,
        NPM_LOG: log,
        FAIL_GATE: failGate,
      },
    });
    return {
      status: run.status,
      calls: readFileSync(log, 'utf8')
        .split('\n')
        .filter((line) => line !== ''),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const call = (gate: string): string => `run --silent ${gate}`;

describe('the pre-push hook (#123 AC2)', () => {
  it('is executable', () => {
    expect(statSync(HOOK).mode & 0o111).toBe(0o111);
  });

  it('runs format:check, lint and typecheck, in that order, and passes', () => {
    expect(runHook()).toEqual({ status: 0, calls: GATES.map(call) });
  });

  it.each(GATES.map((gate, index) => [gate, index] as const))(
    'stops the push when %s fails, running nothing after it',
    (gate, index) => {
      expect(runHook(gate)).toEqual({
        status: 7,
        calls: GATES.slice(0, index + 1).map(call),
      });
    },
  );

  it.each(GATES)('names a root script that exists: %s', (gate) => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts[gate]).toBeDefined();
  });

  it('is installed by npm install, through the root prepare script', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.prepare).toBe('git config core.hooksPath .githooks');
  });

  it('is installed in this checkout: git reads hooks from .githooks', () => {
    const read = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
      encoding: 'utf8',
    });
    expect(read.stdout.trim()).toBe('.githooks');
  });
});
