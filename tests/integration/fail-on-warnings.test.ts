import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

/**
 * scripts/fail-on-warnings.sh, run for real: each case is a shell command
 * whose output the wrapper must judge.
 */
const run = (command: string) =>
  spawnSync('scripts/fail-on-warnings.sh', ['sh', '-c', command], {
    encoding: 'utf8',
  });

describe('fail-on-warnings.sh', () => {
  it.each([
    ['npm warn deprecated x@1'],
    ['(!) Your Vite config uses features that are unsupported'],
    ['WARNING: something'],
    ['found 2 warnings'],
    ['DeprecationWarning: x'],
    ['a deprecation notice'],
  ])('fails a clean exit that printed "%s"', (line) => {
    const result = run(`echo '${line}'`);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('zero-warnings policy');
  });

  it.each([['all good'], ['swarm of bees']])('passes "%s"', (line) => {
    const result = run(`echo '${line}'`);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(line);
  });

  it('passes the command’s own failure through, status intact', () => {
    expect(run('exit 3').status).toBe(3);
  });

  it('reads stderr as well as stdout', () => {
    expect(run('echo "npm warn x" >&2').status).toBe(1);
  });
});
