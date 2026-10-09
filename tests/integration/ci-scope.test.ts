import { afterAll, describe, expect, it, onTestFinished } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { readDiff, scopeFor } from '../../scripts/ci-scope';

/**
 * The docs-only fast path's git half (#360), moved out of the unit suite by
 * #490: a unit test starts no process. Real repositories built in a
 * temporary directory, so renames, spaces, merge commits and a root commit
 * are read by git itself, and the script build-and-test runs is run under
 * Node. The pure half is in tests/unit/ci-scope.test.ts.
 */

/** Git's helpers in `dir`, its git isolated from the user's config. */
function gitIn(dir: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  Object.assign(env, {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' });
  const commit = (files: Record<string, string | null>, message = 'c') => {
    for (const [path, content] of Object.entries(files)) {
      const full = join(dir, path);
      if (content === null) rmSync(full);
      else {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
    }
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', message);
  };
  return { dir, git, commit };
}

/** A throwaway directory, removed when its test finishes. */
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ci-scope-'));
  onTestFinished(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/**
 * A throwaway repository holding one commit of `BASE`, copied from one built
 * once for this file (#432: building it in every test cost three git
 * processes, most of each test's time under load).
 */
let template: string | undefined;
afterAll(() => {
  if (template !== undefined)
    rmSync(template, { recursive: true, force: true });
});
function baseRepo() {
  if (template === undefined) {
    template = mkdtempSync(join(tmpdir(), 'ci-scope-template-'));
    const built = gitIn(template);
    built.git('init', '-q', '-b', 'main');
    built.commit(BASE);
  }
  const dir = scratch();
  cpSync(template, dir, { recursive: true });
  return gitIn(dir);
}

const BASE = {
  'HANDOVER.md': 'handover\n',
  'docs/a.md': 'a document, long enough to be seen as the same file\n',
  'scripts/x.ts': 'export const x = 1;\n',
};

const diffScope = (dir: string) =>
  scopeFor('pull_request', () => readDiff(dir));

describe('real commits read against their first parent (AC1, AC4)', () => {
  it('a commit changing the handover and a doc is docs-only', () => {
    const r = baseRepo();
    r.commit({ 'HANDOVER.md': 'new\n', 'docs/b.md': 'b\n' });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('docs-only');
    expect(result.judged).toEqual(['HANDOVER.md', 'docs/b.md']);
  });

  it('a commit changing code is full', () => {
    const r = baseRepo();
    r.commit({ 'scripts/x.ts': 'export const x = 2;\n' });
    expect(diffScope(r.dir).scope).toBe('full');
  });

  it('a commit changing nothing is full (an empty diff)', () => {
    const r = baseRepo();
    r.commit({});
    const result = diffScope(r.dir);
    expect(result.scope).toBe('full');
    expect(result.judged).toEqual([]);
  });

  it('a doc path with spaces and non-ASCII letters is read whole', () => {
    const r = baseRepo();
    r.commit({ 'docs/catatan rapat ü.md': 'notes\n' });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('docs-only');
    expect(result.judged).toEqual(['docs/catatan rapat ü.md']);
  });

  it('a code path with spaces is read whole and named', () => {
    const r = baseRepo();
    r.commit({ 'apps/my dir/a b.ts': 'export {};\n' });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('full');
    expect(result.reason).toContain('apps/my dir/a b.ts');
  });

  it('a rename inside docs/ is docs-only, both sides judged', () => {
    const r = baseRepo();
    r.commit({ 'docs/a.md': null, 'docs/renamed.md': BASE['docs/a.md'] });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('docs-only');
    expect(result.judged).toEqual(['docs/a.md', 'docs/renamed.md']);
  });

  it('a rename from code into docs/ is full', () => {
    const r = baseRepo();
    r.commit({ 'scripts/x.ts': null, 'docs/x.md': BASE['scripts/x.ts'] });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('full');
    expect(result.judged).toEqual(['docs/x.md', 'scripts/x.ts']);
  });

  it('a rename from docs/ into code is full', () => {
    const r = baseRepo();
    r.commit({ 'docs/a.md': null, 'scripts/a.md': BASE['docs/a.md'] });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('full');
    expect(result.judged).toEqual(['docs/a.md', 'scripts/a.md']);
  });

  it('deleting a doc is docs-only', () => {
    const r = baseRepo();
    r.commit({ 'docs/a.md': null });
    expect(diffScope(r.dir).scope).toBe('docs-only');
  });

  it('deleting code is full', () => {
    const r = baseRepo();
    r.commit({ 'scripts/x.ts': null });
    expect(diffScope(r.dir).scope).toBe('full');
  });

  it('a root commit has no parent to read, so it is full, naming git’s error', () => {
    const r = baseRepo();
    const result = diffScope(r.dir);
    expect(result.scope).toBe('full');
    expect(result.reason).toMatch(/could not be read.*HEAD\^1/s);
  });

  it('a directory that is not a repository is full', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-scope-bare-'));
    onTestFinished(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    expect(diffScope(dir).scope).toBe('full');
  });
});

describe('a pull request’s merge commit is read against its base (AC1)', () => {
  /** Base moves on with code; the branch brings `branch`; base merges it. */
  function merged(branch: Record<string, string | null>) {
    const r = baseRepo();
    r.git('checkout', '-q', '-b', 'topic');
    r.commit(branch, 'topic');
    r.git('checkout', '-q', 'main');
    r.commit({ 'scripts/x.ts': 'export const x = 3;\n' }, 'base moved');
    r.git('merge', '-q', '--no-ff', '-m', 'Merge topic into main', 'topic');
    return r;
  }

  it('is docs-only when the branch changed only docs, though the base changed code', () => {
    const result = diffScope(merged({ 'docs/a.md': 'edited\n' }).dir);
    expect(result.scope).toBe('docs-only');
    expect(result.judged).toEqual(['docs/a.md']);
  });

  it('is full when the branch changed code', () => {
    const result = diffScope(
      merged({ 'docs/a.md': 'edited\n', 'scripts/y.ts': 'export {};\n' }).dir,
    );
    expect(result.scope).toBe('full');
    expect(result.judged).toEqual(['docs/a.md', 'scripts/y.ts']);
  });
});

describe('the command build-and-test runs (AC1, AC2)', () => {
  const SCRIPT = resolve('scripts/ci-scope.ts');
  const run = (dir: string, env: Record<string, string>) => {
    const output = join(dir, '.github-output');
    writeFileSync(output, '');
    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: dir,
      env: { PATH: process.env['PATH'] ?? '', GITHUB_OUTPUT: output, ...env },
      encoding: 'utf8',
    });
    return { ...result, written: readFileSync(output, 'utf8') };
  };

  it('writes scope=docs-only and prints each judged path', () => {
    const r = baseRepo();
    r.commit({ 'HANDOVER.md': 'new\n' });
    const result = run(r.dir, { EVENT: 'pull_request' });
    expect(result.status).toBe(0);
    expect(result.written).toBe('scope=docs-only\n');
    expect(result.stdout).toContain('  docs   HANDOVER.md');
  });

  it('writes scope=full for a push, as deploy-dev’s call is', () => {
    const r = baseRepo();
    r.commit({ 'HANDOVER.md': 'new\n' });
    const result = run(r.dir, { EVENT: 'push' });
    expect(result.status).toBe(0);
    expect(result.written).toBe('scope=full\n');
  });

  it('writes scope=full when EVENT is missing', () => {
    const r = baseRepo();
    r.commit({ 'HANDOVER.md': 'new\n' });
    const result = run(r.dir, {});
    expect(result.status).toBe(0);
    expect(result.written).toBe('scope=full\n');
  });

  it('fails by name when GITHUB_OUTPUT is not set, so no step can be skipped', () => {
    const r = baseRepo();
    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: r.dir,
      env: { PATH: process.env['PATH'] ?? '', EVENT: 'pull_request' },
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('GITHUB_OUTPUT is not set');
  });
});
