import { describe, expect, it, onTestFinished } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  classify,
  onAllowlist,
  parseNameStatus,
  readDiff,
  report,
  scopeFor,
  type Change,
} from '../../scripts/ci-scope';

/**
 * The docs-only fast path (#360). build-and-test classifies the change it
 * tests (the pull request's merge commit, or one commit under every-commit)
 * against its first parent. Docs-only means every changed path is
 * HANDOVER.md or Markdown under docs/, and then only Format and the unit
 * suite run. Anything else, and anything the classifier cannot read, is
 * full: every step runs as before.
 *
 * The pure half is tested on name-status text; the git half on real
 * repositories built in a temporary directory, so renames, spaces, merge
 * commits and a root commit are read by git itself.
 */

const NUL = '\0';
const z = (...fields: string[]) => fields.map((f) => f + NUL).join('');
const change = (status: string, path: string): Change => ({
  status,
  paths: [path],
});

describe('the allowlist (AC1)', () => {
  it.each([
    'HANDOVER.md',
    'docs/plan.md',
    'docs/superpowers/plans/2026-10-05-ci-360.md',
    'docs/compliance/trademark search.md',
  ])('admits %s', (path) => {
    expect(onAllowlist(path)).toBe(true);
  });

  it.each([
    ['other Markdown at the root', 'README.md'],
    ['a document a test reads', 'TRADEMARKS.md'],
    ['a file under docs/ that is not Markdown', 'docs/diagram.svg'],
    ['code under docs/', 'docs/tool.ts'],
    ['Markdown in a directory named like docs', 'docsx/plan.md'],
    ['a docs directory below the root', 'apps/web/docs/plan.md'],
    ['a file named docs.md', 'docs.md'],
    ['the handover spelled in another case', 'handover.md'],
    ['Markdown in upper case', 'docs/plan.MD'],
    ['a handover in a subdirectory', 'apps/HANDOVER.md'],
  ])('refuses %s (%s)', (_why, path) => {
    expect(onAllowlist(path)).toBe(false);
  });
});

describe('reading git diff --name-status -z (AC4)', () => {
  it('reads one change per status and path', () => {
    expect(
      parseNameStatus(z('M', 'HANDOVER.md', 'A', 'docs/a b.md', 'D', 'x.ts')),
    ).toEqual([
      change('M', 'HANDOVER.md'),
      change('A', 'docs/a b.md'),
      change('D', 'x.ts'),
    ]);
  });

  it('reads a rename or copy as one change with both paths', () => {
    expect(
      parseNameStatus(z('R100', 'docs/a.md', 'docs/b.md', 'C075', 'a', 'b')),
    ).toEqual([
      { status: 'R100', paths: ['docs/a.md', 'docs/b.md'] },
      { status: 'C075', paths: ['a', 'b'] },
    ]);
  });

  it('reads an empty diff as no changes', () => {
    expect(parseNameStatus('')).toEqual([]);
  });

  it.each([
    ['text that does not end in NUL', 'M\0HANDOVER.md'],
    ['a status with no path', z('M')],
    ['a rename with one path', z('R100', 'docs/a.md')],
    ['a field that is not a status', z('modified', 'HANDOVER.md')],
    ['an empty path', z('M', '')],
  ])('refuses %s by name', (_why, text) => {
    expect(() => parseNameStatus(text)).toThrow(/name-status/);
  });
});

describe('the classification (AC1, AC4)', () => {
  it('is docs-only when every path is on the allowlist, judging each', () => {
    const result = classify([
      change('M', 'HANDOVER.md'),
      change('A', 'docs/new.md'),
    ]);
    expect(result.scope).toBe('docs-only');
    expect(result.judged).toEqual(['HANDOVER.md', 'docs/new.md']);
  });

  it('is docs-only for a deletion on the allowlist', () => {
    expect(classify([change('D', 'docs/old.md')]).scope).toBe('docs-only');
  });

  it('is full for one code path, and names it', () => {
    const result = classify([change('M', 'scripts/every-commit.ts')]);
    expect(result.scope).toBe('full');
    expect(result.reason).toContain('scripts/every-commit.ts');
    expect(result.judged).toEqual(['scripts/every-commit.ts']);
  });

  it('is full for a deletion off the allowlist', () => {
    expect(classify([change('D', 'scripts/old.ts')]).scope).toBe('full');
  });

  it('is full for a mix with the code path first, judging both', () => {
    const result = classify([
      change('M', 'package.json'),
      change('M', 'HANDOVER.md'),
    ]);
    expect(result.scope).toBe('full');
    expect(result.reason).toContain('package.json');
    expect(result.reason).not.toContain('HANDOVER.md');
    expect(result.judged).toEqual(['package.json', 'HANDOVER.md']);
  });

  it('is full for a mix with the code path last, judging both', () => {
    const result = classify([
      change('M', 'HANDOVER.md'),
      change('A', 'docs/a.md'),
      change('M', 'TRADEMARKS.md'),
    ]);
    expect(result.scope).toBe('full');
    expect(result.reason).toContain('TRADEMARKS.md');
    expect(result.judged).toEqual([
      'HANDOVER.md',
      'docs/a.md',
      'TRADEMARKS.md',
    ]);
  });

  it('is full for an empty diff, saying there was nothing to judge', () => {
    const result = classify([]);
    expect(result.scope).toBe('full');
    expect(result.reason).toMatch(/empty/);
    expect(result.judged).toEqual([]);
  });

  it('is full for a rename record, which --no-renames never asks git for', () => {
    expect(
      classify([{ status: 'R100', paths: ['docs/a.md', 'docs/b.md'] }]).scope,
    ).toBe('full');
  });

  it.each([
    ['a type change', 'T'],
    ['an unmerged path', 'U'],
    ['an unknown change', 'X'],
    ['a broken pair', 'B'],
  ])('is full for %s on an allowlisted path, naming the status', (_why, s) => {
    const result = classify([change(s, 'docs/a.md')]);
    expect(result.scope).toBe('full');
    expect(result.reason).toContain(`${s} docs/a.md`);
  });
});

describe('the event decides whether the fast path applies at all (AC3)', () => {
  it.each(['push', 'workflow_dispatch', 'merge_group', ''])(
    'a %j event is full without reading the diff',
    (event) => {
      let reads = 0;
      const result = scopeFor(event, () => {
        reads += 1;
        return z('M', 'HANDOVER.md');
      });
      expect(result.scope).toBe('full');
      expect(result.reason).toContain(JSON.stringify(event));
      expect(reads).toBe(0);
    },
  );

  it('a pull_request event reads the diff once and classifies it', () => {
    let reads = 0;
    const result = scopeFor('pull_request', () => {
      reads += 1;
      return z('M', 'HANDOVER.md');
    });
    expect(result.scope).toBe('docs-only');
    expect(reads).toBe(1);
  });

  it('a diff that cannot be read is full, naming the reason', () => {
    const result = scopeFor('pull_request', () => {
      throw new Error('fatal: bad revision HEAD^1');
    });
    expect(result.scope).toBe('full');
    expect(result.reason).toContain('fatal: bad revision HEAD^1');
  });

  it('a diff that cannot be parsed is full, naming the reason', () => {
    const result = scopeFor('pull_request', () => 'M\0HANDOVER.md');
    expect(result.scope).toBe('full');
    expect(result.reason).toMatch(/name-status/);
  });
});

describe('the printed report (AC1)', () => {
  it('states the scope and reason, then every judged path and its side', () => {
    expect(
      report(classify([change('M', 'HANDOVER.md'), change('M', 'x.ts')])),
    ).toEqual([
      'scope: full (outside the docs-only allowlist: x.ts)',
      'judged 2 paths:',
      '  docs   HANDOVER.md',
      '  other  x.ts',
    ]);
  });

  it('counts one judged path in the singular', () => {
    expect(report(classify([change('M', 'HANDOVER.md')]))[1]).toBe(
      'judged 1 path:',
    );
  });

  it('counts no judged paths in the plural', () => {
    expect(report(classify([]))[1]).toBe('judged 0 paths:');
  });
});

/** A throwaway repository, its git isolated from the user's config. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'ci-scope-'));
  onTestFinished(() => {
    rmSync(dir, { recursive: true, force: true });
  });
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
  git('init', '-q', '-b', 'main');
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

const BASE = {
  'HANDOVER.md': 'handover\n',
  'docs/a.md': 'a document, long enough to be seen as the same file\n',
  'scripts/x.ts': 'export const x = 1;\n',
};

const diffScope = (dir: string) =>
  scopeFor('pull_request', () => readDiff(dir));

describe('real commits read against their first parent (AC1, AC4)', () => {
  it('a commit changing the handover and a doc is docs-only', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({ 'HANDOVER.md': 'new\n', 'docs/b.md': 'b\n' });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('docs-only');
    expect(result.judged).toEqual(['HANDOVER.md', 'docs/b.md']);
  });

  it('a commit changing code is full', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({ 'scripts/x.ts': 'export const x = 2;\n' });
    expect(diffScope(r.dir).scope).toBe('full');
  });

  it('a commit changing nothing is full (an empty diff)', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({});
    const result = diffScope(r.dir);
    expect(result.scope).toBe('full');
    expect(result.judged).toEqual([]);
  });

  it('a doc path with spaces and non-ASCII letters is read whole', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({ 'docs/catatan rapat ü.md': 'notes\n' });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('docs-only');
    expect(result.judged).toEqual(['docs/catatan rapat ü.md']);
  });

  it('a code path with spaces is read whole and named', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({ 'apps/my dir/a b.ts': 'export {};\n' });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('full');
    expect(result.reason).toContain('apps/my dir/a b.ts');
  });

  it('a rename inside docs/ is docs-only, both sides judged', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({ 'docs/a.md': null, 'docs/renamed.md': BASE['docs/a.md'] });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('docs-only');
    expect(result.judged).toEqual(['docs/a.md', 'docs/renamed.md']);
  });

  it('a rename from code into docs/ is full', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({ 'scripts/x.ts': null, 'docs/x.md': BASE['scripts/x.ts'] });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('full');
    expect(result.judged).toEqual(['docs/x.md', 'scripts/x.ts']);
  });

  it('a rename from docs/ into code is full', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({ 'docs/a.md': null, 'scripts/a.md': BASE['docs/a.md'] });
    const result = diffScope(r.dir);
    expect(result.scope).toBe('full');
    expect(result.judged).toEqual(['docs/a.md', 'scripts/a.md']);
  });

  it('deleting a doc is docs-only', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({ 'docs/a.md': null });
    expect(diffScope(r.dir).scope).toBe('docs-only');
  });

  it('deleting code is full', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({ 'scripts/x.ts': null });
    expect(diffScope(r.dir).scope).toBe('full');
  });

  it('a root commit has no parent to read, so it is full, naming git’s error', () => {
    const r = repo();
    r.commit(BASE);
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
    const r = repo();
    r.commit(BASE);
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
    const r = repo();
    r.commit(BASE);
    r.commit({ 'HANDOVER.md': 'new\n' });
    const result = run(r.dir, { EVENT: 'pull_request' });
    expect(result.status).toBe(0);
    expect(result.written).toBe('scope=docs-only\n');
    expect(result.stdout).toContain('  docs   HANDOVER.md');
  });

  it('writes scope=full for a push, as deploy-dev’s call is', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({ 'HANDOVER.md': 'new\n' });
    const result = run(r.dir, { EVENT: 'push' });
    expect(result.status).toBe(0);
    expect(result.written).toBe('scope=full\n');
  });

  it('writes scope=full when EVENT is missing', () => {
    const r = repo();
    r.commit(BASE);
    r.commit({ 'HANDOVER.md': 'new\n' });
    const result = run(r.dir, {});
    expect(result.status).toBe(0);
    expect(result.written).toBe('scope=full\n');
  });

  it('fails by name when GITHUB_OUTPUT is not set, so no step can be skipped', () => {
    const r = repo();
    r.commit(BASE);
    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: r.dir,
      env: { PATH: process.env['PATH'] ?? '', EVENT: 'pull_request' },
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('GITHUB_OUTPUT is not set');
  });
});
