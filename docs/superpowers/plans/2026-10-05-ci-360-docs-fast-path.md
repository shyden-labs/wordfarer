# CI #360: The Docs-Only Fast Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pull request, or a commit under every-commit, that changes only `HANDOVER.md` and Markdown under `docs/` runs checkout, install, Format and the unit suite, and nothing else. The required check `build-and-test` still runs and reports, and every other change runs every step as before.

**Architecture:** `ci.yml`'s checkout fetches two levels, and a new step after Node, `classify`, runs `node scripts/ci-scope.ts` with `EVENT` set to the event's name. The script diffs `HEAD^1..HEAD` (`git diff --no-renames --name-status -z`). On a `pull_request` event the job checked out GitHub's merge commit, whose first parent is the base, so the diff is what the pull request brings. Under every-commit it is one commit against its parent. The script writes `scope=docs-only` or `scope=full` to `GITHUB_OUTPUT`, and lint, typecheck, pacing, the pacing upload, worker, engines and build each carry `if: steps.classify.outputs.scope != 'docs-only'`.

**Tech Stack:** GitHub Actions, Node 24 running `scripts/ci-scope.ts` by type stripping with Node's own modules only, Vitest, `yaml`, real git repositories in a temporary directory.

**Spec:** Story #360.

## Global Constraints

- Every commit green: each stage passes every CI step alone on a clean `npm ci`.
- Fail closed: anything the classifier cannot place is full, and the skip is written `!= 'docs-only'`, so a missing or empty scope runs every step.
- No retries. One test per case (`it.each` for tables); tests first, seen red; every guard mutation-verified with predictions written before the run.
- `Refs #360` in commits and the PR; commits authored as Shyden.

## Review Focus

1. **One diff rule serves both callers (AC1).** `HEAD^1..HEAD` is the pull request's whole change on its merge commit (run 37245234966 checked out `3dedfaa Merge 3660adf… into 3bdd7d0…`, base first) and one commit's change under every-commit. Measured in tests on real repositories, a merge commit whose base moved on with code is still docs-only when the branch changed only docs.
2. **Renames are two paths, not a special case (AC4).** `--no-renames` turns a rename into a deletion and an addition, both judged, so "full unless both sides are on the allowlist" is the plain rule. A rename record (`R`/`C`), which the command never asks for, is full.
3. **The skip cannot fire on a full verdict (AC5).** Every condition is pinned whole; the scope is read nowhere but in those seven conditions; and a step added with no condition is in neither list, so the guard fails until someone decides.
4. **deploy-dev is always full (AC3).** It runs on `push` only and calls `ci.yml` with no input, and the classifier is full for every event but `pull_request` without reading the diff.

## Decisions this plan makes

- **The allowlist is narrower than the story's `docs/**`:** `HANDOVER.md` and `docs/**/*.md`. Every tracked file under `docs/` on `develop` at `c699155`, before this plan, is Markdown (21 of 21), and lint, typecheck and build read `.ts`, `.js` and `.svelte` files, so a script or image put under `docs/` later runs in full rather than skipping the step that would read it.
- **The classifier step runs before install**, with Node alone, so the decision costs no install: it runs after the container starts, the checkout and Node, and before anything else.
- **The report** prints the scope, the reason and each judged path marked `docs` or `other`.
- **Two findings became tasks.** The live runs printed "judged 1 paths:" (Task 3). Mutation W7 showed that three older guards assumed `run:` is a string, so a YAML boolean crashed one and would have been read as the text "true" by two (Task 4).

## Acceptance criteria → tasks (#360)

| AC  | What                                                                                                                        | Task | Proved by                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | an early step classifies the change against a narrow allowlist, prints it and the judged paths                              | 1, 2 | "a commit changing the handover and a doc is docs-only", "is docs-only when the branch changed only docs, though the base changed code", "states the scope and reason, then every judged path and its side", "run in today’s order, with the classifier after Node and before install"; mutations A1, A2, I1 |
| 2   | docs-only runs checkout, install, Format and the unit suite; the job still concludes success; full runs every step in order | 2    | "on docs-only, run exactly checkout, Node, the classifier, install, Format and the unit suite", "run in today’s order, with the classifier after Node and before install"; W1, W4; the live runs                                                                                                             |
| 3   | only pull-request checks take the fast path; deploy-dev always full                                                         | 1, 2 | "a pull_request event reads the diff once and classifies it", "runs only on a push, an event the classifier never makes docs-only", "calls build-and-test with no input", "is given the event, so only a pull_request can be docs-only (AC3)"; E1, W5, D1, D2                                                |
| 4   | the classifier's cases, one test each, mutation-verified, the judged population counted                                     | 1, 3 | `tests/unit/ci-scope.test.ts` (62 tests); A1, A2 (widen), I1, I2 (invert), J1, J2 (drop a judged path), and the rest of the table                                                                                                                                                                            |
| 5   | a parsed-YAML guard: every other step carries the skip; no skip fires on full; an undecided step fails                      | 2    | "every other step carries the skip, each condition whole (AC5)", "reads the scope nowhere but in a skip, so nothing can fire on a full verdict (AC5)"; W1, W2, W3, W4                                                                                                                                        |
| 6   | live proof on throwaway pull requests                                                                                       | live | the Live proofs section below                                                                                                                                                                                                                                                                                |

## How this plan was reviewed

Every code block below is generated from this branch's stage commits by `gen.py`, and `check.py` re-reads each one against its source after Prettier (trailing whitespace aside: Prettier strips the space git writes on a blank diff context line), with the test titles the AC table and the red notes cite, every mutation id and path, and no placeholder. Planted errors of each kind (a title in the AC table and in a red note, a mutation id, a path, a placeholder, an edited block) were each caught. Each stage was gated alone on a clean `npm ci` (every CI step), each task's tests were run red first, and the mutation table is generated from each mutation's saved log.

| Pass | Findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 2026-10-05 01:34. Mechanical, three findings in the checker itself: diff blocks compared byte for byte failed on Prettier's blank-context change; the mutation ids of the second table were not read; and the throwaway paths and allowlist globs, absent by design, were reported. Fixed, then planted errors were run: the title planted in a red note was missed, because only the AC table's titles were read, so the titles a red note cites (a quoted title followed by the word failed or passed) are now checked too, and both planted titles are caught. Read in full, five findings: (1) "spends nothing before deciding" was false, since the container, checkout and Node run first; (2) Task 2's run command left out `pacing-ci.test.ts`; (3) "8 of 10 failed" did not say which file; (4) W3's Change cell, cut at 70 characters, showed identical sides, so the table now shows only the lines that differ; (5) "21 of 21" now names `develop` at `c699155`. Every live-proof duration was re-derived from the runs' timestamps and matches. |
| 2    | 2026-10-05 01:35. Mechanical checks re-run on the regenerated plan: 14 blocks match their stage commits, 14 cited titles, 34 mutation ids, every path, no placeholder; six planted errors (a title in the AC table and in a red note, a mutation id, a path, a placeholder, an edited block) each caught. Read: every prose line changed since pass 1 (the two decisions, the review log, Task 2's run command and red note) and all 34 Change cells of the mutation table. No findings: the plan is approved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

### Task 1: The classifier

**Files:**

- Create: `scripts/ci-scope.ts`, `tests/unit/ci-scope.test.ts`

**Interfaces:**

- Produces: `Scope`, `Change`, `Classification`, `onAllowlist`, `parseNameStatus`, `classify`, `scopeFor`, `readDiff`, `report`; the command `node scripts/ci-scope.ts` (reads `EVENT`, writes `scope=` to `GITHUB_OUTPUT`).

- [ ] **Step 1: Write the failing tests**

`tests/unit/ci-scope.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/unit/ci-scope.test.ts`

Seen red against a stub whose every export throws "not implemented": 60 of 60 failed, none passing. The temporary-directory clean-up (`onTestFinished`) was added after that run and changes no assertion.

- [ ] **Step 3: Write the implementation**

`scripts/ci-scope.ts`:

```ts
/**
 * The docs-only fast path for build-and-test (#360).
 *
 * A pull request that changes only HANDOVER.md and Markdown under docs/
 * needs Format and the unit suite, and nothing else: no lint, typecheck,
 * pacing, worker, engine or build step reads those files. build-and-test
 * runs `node scripts/ci-scope.ts` early, and every other step is skipped
 * unless the scope it writes is something other than `docs-only`, so the
 * required check still runs and reports (a `paths-ignore` would leave it
 * pending and block the merge).
 *
 * The change judged is `HEAD^1..HEAD` of what the job checked out. On a
 * pull_request event that is GitHub's merge commit, whose first parent is
 * the base, so the diff is exactly what the pull request brings. Under
 * every-commit it is one commit against its parent. deploy-dev's call is a
 * push event and always runs in full, as does any event but pull_request.
 *
 * Every doubt is full: an empty diff, a change kind it does not judge, a
 * diff it cannot read or parse, a missing EVENT. A missing GITHUB_OUTPUT
 * fails the step, and the job with it. Nothing is retried. Imports are
 * Node's own, so the step runs before `npm ci`.
 */
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export type Scope = 'full' | 'docs-only';

/** One line of `git diff --name-status -z`: two paths for a rename or copy. */
export interface Change {
  status: string;
  paths: string[];
}

export interface Classification {
  scope: Scope;
  reason: string;
  /** Every path the classification looked at, in diff order. */
  judged: string[];
}

/** HANDOVER.md, or Markdown under docs/: nothing but Format and the unit suite reads them. */
export function onAllowlist(path: string): boolean {
  return (
    path === 'HANDOVER.md' || (path.startsWith('docs/') && path.endsWith('.md'))
  );
}

/** The change kinds judged path by path: added, modified, deleted. */
const JUDGED_KINDS = new Set(['A', 'M', 'D']);

const STATUS = /^[A-Z][0-9]*$/;

/** Reads `git diff --name-status -z`; anything malformed throws by name. */
export function parseNameStatus(text: string): Change[] {
  if (text === '') return [];
  if (!text.endsWith('\0'))
    throw new Error('name-status output does not end in NUL');
  const fields = text.slice(0, -1).split('\0');
  const changes: Change[] = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i] ?? '';
    if (!STATUS.test(status))
      throw new Error(`name-status field is not a status: ${status}`);
    const count = /^[RC]/.test(status) ? 2 : 1;
    const paths = fields.slice(i + 1, i + 1 + count);
    if (paths.length < count || paths.includes(''))
      throw new Error(
        `name-status ${status} needs ${String(count)} path(s), got: ${JSON.stringify(paths)}`,
      );
    changes.push({ status, paths });
    i += 1 + count;
  }
  return changes;
}

export function classify(changes: readonly Change[]): Classification {
  const judged = changes.flatMap(({ paths }) => paths);
  if (changes.length === 0)
    return {
      scope: 'full',
      reason: 'the diff is empty, so there is nothing to judge',
      judged,
    };
  const unjudged = changes.filter(({ status }) => !JUDGED_KINDS.has(status));
  if (unjudged.length > 0)
    return {
      scope: 'full',
      reason: `a change of a kind the fast path does not judge: ${unjudged
        .map(({ status, paths }) => `${status} ${paths.join(' -> ')}`)
        .join(', ')}`,
      judged,
    };
  const outside = judged.filter((path) => !onAllowlist(path));
  if (outside.length > 0)
    return {
      scope: 'full',
      reason: `outside the docs-only allowlist: ${outside.join(', ')}`,
      judged,
    };
  return {
    scope: 'docs-only',
    reason: 'every changed path is HANDOVER.md or Markdown under docs/',
    judged,
  };
}

/** The fast path applies to pull-request checks only; any doubt is full. */
export function scopeFor(
  event: string,
  readDiff: () => string,
): Classification {
  if (event !== 'pull_request')
    return {
      scope: 'full',
      reason: `the ${JSON.stringify(event)} event always tests in full`,
      judged: [],
    };
  try {
    return classify(parseNameStatus(readDiff()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      scope: 'full',
      reason: `the diff could not be read, so everything runs: ${message.trim()}`,
      judged: [],
    };
  }
}

/** What the checked-out commit changed against its first parent. */
export function readDiff(cwd: string): string {
  return execFileSync(
    'git',
    ['diff', '--no-renames', '--name-status', '-z', 'HEAD^1', 'HEAD'],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

/** The lines the step prints: the verdict, then each judged path and its side. */
export function report(result: Classification): string[] {
  return [
    `scope: ${result.scope} (${result.reason})`,
    `judged ${String(result.judged.length)} paths:`,
    ...result.judged.map(
      (path) => `  ${onAllowlist(path) ? 'docs ' : 'other'}  ${path}`,
    ),
  ];
}

if (import.meta.main) {
  const output = process.env['GITHUB_OUTPUT'];
  if (output === undefined || output === '') {
    console.error('✗ GITHUB_OUTPUT is not set');
    process.exit(1);
  }
  const result = scopeFor(process.env['EVENT'] ?? '', () => readDiff('.'));
  for (const line of report(result)) console.log(line);
  appendFileSync(output, `scope=${result.scope}\n`);
}
```

- [ ] **Step 4: Run it green, gate the stage alone, commit**

Run: `npx vitest run tests/unit/ci-scope.test.ts`, then every CI step, in `ci.yml`'s order (format, lint, typecheck, unit, pacing, worker, engines, build), on this stage alone after a clean `npm ci`. Commit: `feat(ci): classify a change as docs-only or full (Refs #360)`.

### Task 2: The workflow and its guard

**Files:**

- Create: `tests/unit/ci-fast-path.test.ts`
- Modify: `.github/workflows/ci.yml`, `tests/unit/every-commit-ci.test.ts`, `tests/unit/pacing-ci.test.ts`

**Interfaces:**

- Consumes: the command from Task 1. Produces: the `classify` step and its `scope` output, read by seven skips.

- [ ] **Step 1: Write the failing guard**

`tests/unit/ci-fast-path.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/**
 * build-and-test's docs-only fast path (#360 AC2, AC3, AC5), read as parsed
 * YAML so a comment cannot stand in for a condition.
 *
 * An early step, `classify`, writes `scope`. On docs-only, only checkout,
 * Node, the classifier, install, Format and the unit suite run; every other
 * step carries the skip. The skip reads `!= 'docs-only'`, so a scope that
 * is full, empty or missing runs the step: no skip can fire on anything but
 * a docs-only verdict. A step added without its own decision is not in the
 * docs-only list, so the list below goes red until someone decides.
 */

interface Step {
  id?: string;
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

interface Job {
  uses?: string;
  with?: Record<string, unknown>;
  steps?: Step[];
}

interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
}

const read = (file: string) =>
  parse(readFileSync(`.github/workflows/${file}`, 'utf8')) as Workflow;
const steps = (): Step[] => read('ci.yml').jobs['build-and-test']?.steps ?? [];
/** A step's name, or its action without the pinned SHA. */
const idOf = (step: Step) => step.name ?? step.uses?.split('@')[0] ?? '?';

const SKIP = "steps.classify.outputs.scope != 'docs-only'";

/** Every step, in order: today's order with the classifier after Node. */
const ORDER = [
  'actions/checkout',
  'actions/setup-node',
  'Classify the change as docs-only or full (#360)',
  'Install (a warning fails it)',
  'Format',
  'Lint (zero warnings)',
  'Typecheck (tsc, svelte-check)',
  'Unit tests',
  'Pacing bots (under 5 minutes)',
  'Upload the pacing report',
  'Worker tests (sync in workerd + local D1, web gate through the asset router)',
  'Cross-engine determinism (Node, Chromium, Firefox, WebKit)',
  'Build (a warning fails it)',
];

/** The steps a docs-only change runs (AC2). */
const DOCS_ONLY = [
  'actions/checkout',
  'actions/setup-node',
  'Classify the change as docs-only or full (#360)',
  'Install (a warning fails it)',
  'Format',
  'Unit tests',
];

/** Every other step, and its whole condition. */
const SKIPPED: Record<string, string> = {
  'Lint (zero warnings)': `\${{ ${SKIP} }}`,
  'Typecheck (tsc, svelte-check)': `\${{ ${SKIP} }}`,
  'Pacing bots (under 5 minutes)': `\${{ ${SKIP} }}`,
  // The report uploads even after a failed pacing run, but never on docs-only,
  // where nothing wrote it.
  'Upload the pacing report': `\${{ !cancelled() && ${SKIP} }}`,
  'Worker tests (sync in workerd + local D1, web gate through the asset router)': `\${{ ${SKIP} }}`,
  'Cross-engine determinism (Node, Chromium, Firefox, WebKit)': `\${{ ${SKIP} }}`,
  'Build (a warning fails it)': `\${{ ${SKIP} }}`,
};

describe('build-and-test’s steps (#360 AC2)', () => {
  it('run in today’s order, with the classifier after Node and before install', () => {
    expect(steps().map(idOf)).toEqual(ORDER);
  });

  it('on docs-only, run exactly checkout, Node, the classifier, install, Format and the unit suite', () => {
    expect(
      steps()
        .filter((s) => s.if === undefined)
        .map(idOf),
    ).toEqual(DOCS_ONLY);
  });

  it('every other step carries the skip, each condition whole (AC5)', () => {
    const conditioned = steps().filter((s) => s.if !== undefined);
    expect(Object.fromEntries(conditioned.map((s) => [idOf(s), s.if]))).toEqual(
      SKIPPED,
    );
    // Both lists together are every step, so none escapes both.
    expect(conditioned.length + DOCS_ONLY.length).toBe(ORDER.length);
  });

  it('reads the scope nowhere but in a skip, so nothing can fire on a full verdict (AC5)', () => {
    const all = steps();
    const readers = all.filter((s) =>
      JSON.stringify(s).includes('steps.classify'),
    );
    expect(readers.map(idOf)).toEqual(Object.keys(SKIPPED));
    expect(all.map(idOf)).toEqual(ORDER);
  });
});

describe('the classifier step (#360 AC1)', () => {
  const classifier = () => steps().find((s) => idOf(s) === DOCS_ONLY[2]) ?? {};

  it('is the step the skips read, by its id', () => {
    expect(classifier().id).toBe('classify');
  });

  it('runs the classifier with Node alone, before npm ci', () => {
    expect(classifier().run).toBe('node scripts/ci-scope.ts');
  });

  it('is given the event, so only a pull_request can be docs-only (AC3)', () => {
    expect(classifier().env).toEqual({ EVENT: '${{ github.event_name }}' });
  });

  it('has the commit’s first parent to diff against: checkout fetches two levels', () => {
    const checkout = steps().find((s) => idOf(s) === 'actions/checkout');
    expect(checkout?.with).toEqual({
      ref: '${{ inputs.ref }}',
      'fetch-depth': 2,
    });
  });
});

describe('deploy-dev always tests in full (#360 AC3)', () => {
  it('runs only on a push, an event the classifier never makes docs-only', () => {
    expect(Object.keys(read('deploy-dev.yml').on)).toEqual(['push']);
  });

  it('calls build-and-test with no input', () => {
    const test = read('deploy-dev.yml').jobs['test'];
    expect(test?.uses).toBe('./.github/workflows/ci.yml');
    expect(test?.with).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/unit/ci-fast-path.test.ts tests/unit/every-commit-ci.test.ts tests/unit/pacing-ci.test.ts`

Seen red on Task 1's tree: 8 of the fast-path guard's 10 tests failed. The two that passed pin deploy-dev as it already is (push only, no input); D1 and D2 prove each can go red. The first green attempt failed too, and rightly: the step name `... or full, #360)` was cut at ` #`, which starts a YAML comment, so the step is named `Classify the change as docs-only or full (#360)`. The first gate of this stage then failed on `pacing-ci.test.ts`, which pinned the upload's condition as exactly `${{ !cancelled() }}`; the fix was folded into this stage, so no commit is red.

- [ ] **Step 3: Pin the checkout depth in #348's guard**

`tests/unit/every-commit-ci.test.ts`, as T2 changes it:

```diff
diff --git a/tests/unit/every-commit-ci.test.ts b/tests/unit/every-commit-ci.test.ts
index d4aaf24..40b8ba8 100644
--- a/tests/unit/every-commit-ci.test.ts
+++ b/tests/unit/every-commit-ci.test.ts
@@ -160,7 +160,11 @@ describe('ci.yml checks out the commit it is called with (AC1)', () => {
       'actions/checkout',
     );
     expect(more).toEqual([]);
-    expect(checkout?.with).toEqual({ ref: '${{ inputs.ref }}' });
+    // fetch-depth 2 gives the docs-only classifier the commit's parents (#360).
+    expect(checkout?.with).toEqual({
+      ref: '${{ inputs.ref }}',
+      'fetch-depth': 2,
+    });
   });

   it('still runs on every pull request and for deploy-dev', () => {
```

- [ ] **Step 4: Let #35's guard keep its own property: the upload condition opens with `!cancelled() &&`**

`tests/unit/pacing-ci.test.ts`, as T2 changes it:

```diff
diff --git a/tests/unit/pacing-ci.test.ts b/tests/unit/pacing-ci.test.ts
index df5d1a7..2a3135e 100644
--- a/tests/unit/pacing-ci.test.ts
+++ b/tests/unit/pacing-ci.test.ts
@@ -52,7 +52,9 @@ describe('the pacing suite in CI (#35)', () => {
     const [at] = uploads;
     expect(at).toBeGreaterThan(suite ?? Infinity);
     const step = steps[at ?? -1];
-    expect(step?.if).toBe('${{ !cancelled() }}');
+    // !cancelled() first, so it uploads after a failed suite. The rest of the
+    // condition is #360's docs-only skip, pinned whole in ci-fast-path.test.ts.
+    expect(step?.if).toMatch(/^\$\{\{ !cancelled\(\) && /);
     // Called once per commit inside one every-commit run (#348), where an
     // artifact name may appear once, so a called run names its commit.
     expect(step?.with).toEqual({
```

- [ ] **Step 5: Add the classifier and the skips**

`.github/workflows/ci.yml`, as T2 changes it:

```diff
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index b8c3aa8..09d891f 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -7,6 +7,12 @@
 # Runs on every PR (the required `build-and-test` check) and is called by
 # deploy-dev.yml before each dev deploy, so develop never deploys a tree that
 # has not passed here.
+#
+# A docs-only change (HANDOVER.md and Markdown under docs/, #360) runs
+# checkout, install, Format and the unit suite; `classify` decides, and every
+# other step skips only on its `docs-only` verdict, so the required check
+# still reports and anything else runs in full. deploy-dev's call is a push,
+# which is always full (tests/unit/ci-fast-path.test.ts).
 name: build-and-test
 on:
   pull_request:
@@ -40,17 +46,26 @@ jobs:
       - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
         with:
           ref: ${{ inputs.ref }}
+          # The commit and its parents: classify diffs HEAD^1..HEAD.
+          fetch-depth: 2
       - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
         with:
           node-version-file: '.nvmrc'
           cache: 'npm'
+      - name: Classify the change as docs-only or full (#360)
+        id: classify
+        env:
+          EVENT: ${{ github.event_name }}
+        run: node scripts/ci-scope.ts
       - name: Install (a warning fails it)
         run: scripts/fail-on-warnings.sh npm ci
       - name: Format
         run: npm run format:check
       - name: Lint (zero warnings)
+        if: ${{ steps.classify.outputs.scope != 'docs-only' }}
         run: npm run lint
       - name: Typecheck (tsc, svelte-check)
+        if: ${{ steps.classify.outputs.scope != 'docs-only' }}
         run: npm run typecheck
       - name: Unit tests
         run: npm run test:unit
@@ -58,9 +73,10 @@ jobs:
       # checked (#35); AC7 holds the suite under 5 minutes on the runner.
       - name: Pacing bots (under 5 minutes)
         timeout-minutes: 5
+        if: ${{ steps.classify.outputs.scope != 'docs-only' }}
         run: npm run test:pacing
       - name: Upload the pacing report
-        if: ${{ !cancelled() }}
+        if: ${{ !cancelled() && steps.classify.outputs.scope != 'docs-only' }}
         uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
         with:
           # every-commit.yml calls this once per commit in one run, where an
@@ -69,8 +85,11 @@ jobs:
           path: pacing-report.json
           if-no-files-found: error
       - name: Worker tests (sync in workerd + local D1, web gate through the asset router)
+        if: ${{ steps.classify.outputs.scope != 'docs-only' }}
         run: npm run test:worker
       - name: Cross-engine determinism (Node, Chromium, Firefox, WebKit)
+        if: ${{ steps.classify.outputs.scope != 'docs-only' }}
         run: npm run test:engines
       - name: Build (a warning fails it)
+        if: ${{ steps.classify.outputs.scope != 'docs-only' }}
         run: scripts/fail-on-warnings.sh npm run build
```

- [ ] **Step 6: Run it green, gate the stage alone, commit**

Run: `npx vitest run tests/unit/ci-fast-path.test.ts tests/unit/every-commit-ci.test.ts tests/unit/pacing-ci.test.ts`, then every CI step, in `ci.yml`'s order (format, lint, typecheck, unit, pacing, worker, engines, build), on this stage alone after a clean `npm ci`. Commit: `ci: run only Format and the unit suite on a docs-only change (Refs #360)`.

### Task 3: One judged path in the singular

**Files:**

- Modify: `scripts/ci-scope.ts`, `tests/unit/ci-scope.test.ts`

**Interfaces:**

- Changes: `report`'s count line. Found in the live runs, which printed "judged 1 paths:".

- [ ] **Step 1: Write the failing tests**

`tests/unit/ci-scope.test.ts`, as T3 changes it:

```diff
diff --git a/tests/unit/ci-scope.test.ts b/tests/unit/ci-scope.test.ts
index 77f2a7b..841e943 100644
--- a/tests/unit/ci-scope.test.ts
+++ b/tests/unit/ci-scope.test.ts
@@ -227,6 +227,16 @@ describe('the printed report (AC1)', () => {
       '  other  x.ts',
     ]);
   });
+
+  it('counts one judged path in the singular', () => {
+    expect(report(classify([change('M', 'HANDOVER.md')]))[1]).toBe(
+      'judged 1 path:',
+    );
+  });
+
+  it('counts no judged paths in the plural', () => {
+    expect(report(classify([]))[1]).toBe('judged 0 paths:');
+  });
 });

 /** A throwaway repository, its git isolated from the user's config. */
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/unit/ci-scope.test.ts`

Seen red: "counts one judged path in the singular" failed. "counts no judged paths in the plural" passed, pinning the plural already correct at zero; mutation T3b proves it can go red.

- [ ] **Step 3: Count in the singular for one**

`scripts/ci-scope.ts`, as T3 changes it:

```diff
diff --git a/scripts/ci-scope.ts b/scripts/ci-scope.ts
index 59fd9c9..e260601 100644
--- a/scripts/ci-scope.ts
+++ b/scripts/ci-scope.ts
@@ -140,7 +140,7 @@ export function readDiff(cwd: string): string {
 export function report(result: Classification): string[] {
   return [
     `scope: ${result.scope} (${result.reason})`,
-    `judged ${String(result.judged.length)} paths:`,
+    `judged ${String(result.judged.length)} ${result.judged.length === 1 ? 'path' : 'paths'}:`,
     ...result.judged.map(
       (path) => `  ${onAllowlist(path) ? 'docs ' : 'other'}  ${path}`,
     ),
```

- [ ] **Step 4: Run it green, gate the stage alone, commit**

Run: `npx vitest run tests/unit/ci-scope.test.ts`, then every CI step, in `ci.yml`'s order (format, lint, typecheck, unit, pacing, worker, engines, build), on this stage alone after a clean `npm ci`. Commit: `fix(ci): the classifier counts one judged path in the singular (Refs #360)`.

### Task 4: Every workflow guard reads `run:` through `runOf`

**Files:**

- Create: `tests/unit/workflow-steps.ts`, `tests/unit/workflow-steps.test.ts`
- Modify: `tests/unit/ci-fast-path.test.ts`, `tests/unit/cross-engine-harness.test.ts`, `tests/unit/every-commit-ci.test.ts`, `tests/unit/pacing-ci.test.ts`

**Interfaces:**

- Produces: `runOf(step)`, the step's command trimmed, `''` for none, refusing anything else by the step's name. Found by mutation W7 (see the mutation table).

- [ ] **Step 1: Write the failing tests**

`tests/unit/workflow-steps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runOf } from './workflow-steps';

/**
 * The guards that read a workflow step's `run:` (#360). YAML gives a value
 * its own type, so `run: true # npm ci` is the boolean true, not a command.
 * A reader that calls `.trim()` on it crashed without a name, and one that
 * hands it to a regex read it as the text "true". runOf refuses it by name.
 */

describe('runOf', () => {
  it('reads a step with no run as no command', () => {
    expect(runOf({ uses: 'actions/checkout@x' })).toBe('');
  });

  it('reads a command as written, trimmed', () => {
    expect(runOf({ name: 'Format', run: 'npm run format:check\n' })).toBe(
      'npm run format:check',
    );
  });

  it.each([
    ['a boolean', true],
    ['a number', 1],
    ['a list', ['npm ci']],
    ['null', null],
  ])('refuses %s by the step’s name', (_what, run) => {
    expect(() => runOf({ name: 'Install', run })).toThrow(
      /step "Install": run is not a string/,
    );
  });

  it('names an unnamed step by its action', () => {
    expect(() => runOf({ uses: 'actions/setup-node@x', run: true })).toThrow(
      /step "actions\/setup-node@x"/,
    );
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/unit/workflow-steps.test.ts`

Seen red against a stub that throws "not implemented": 7 of 7 failed.

- [ ] **Step 3: Write the reader**

`tests/unit/workflow-steps.ts`:

```ts
/**
 * Reading a workflow step's `run:` for the guards (#360). YAML types a plain
 * value, so `run: true # npm ci` parses as the boolean true. A guard that
 * assumed a string either crashed unnamed (`.trim()`) or matched the text
 * "true" (`regex.test`). Anything but a string or nothing is refused, naming
 * the step.
 */
export function runOf(step: {
  name?: string;
  uses?: string;
  run?: unknown;
}): string {
  if (step.run === undefined) return '';
  if (typeof step.run !== 'string')
    throw new Error(
      `step "${step.name ?? step.uses ?? '?'}": run is not a string: ${JSON.stringify(step.run)}`,
    );
  return step.run.trim();
}
```

- [ ] **Step 4: Read pacing-ci's steps through it**

`tests/unit/pacing-ci.test.ts`, as T4 changes it:

```diff
diff --git a/tests/unit/pacing-ci.test.ts b/tests/unit/pacing-ci.test.ts
index 2a3135e..5c0cf44 100644
--- a/tests/unit/pacing-ci.test.ts
+++ b/tests/unit/pacing-ci.test.ts
@@ -2,6 +2,7 @@ import { describe, expect, it } from 'vitest';
 import { readFileSync } from 'node:fs';
 import { parse } from 'yaml';
 import pacing from '../../vitest.pacing.config';
+import { runOf } from './workflow-steps';

 /**
  * The pacing suite stays wired (#35 AC4, AC6, AC7). A CI step removed, its
@@ -12,7 +13,8 @@ import pacing from '../../vitest.pacing.config';

 interface Step {
   name?: string;
-  run?: string;
+  // YAML may type it otherwise: read it through runOf.
+  run?: unknown;
   uses?: string;
   if?: string;
   'timeout-minutes'?: number;
@@ -24,7 +26,7 @@ const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
 };
 const steps = ci.jobs['build-and-test']?.steps ?? [];
 const runs = (command: string): number[] =>
-  steps.flatMap((s, i) => ((s.run ?? '').trim() === command ? [i] : []));
+  steps.flatMap((s, i) => (runOf(s) === command ? [i] : []));

 describe('the pacing suite in CI (#35)', () => {
   it('runs as its own step, once, after the unit tests (AC4)', () => {
```

- [ ] **Step 5: Read every-commit-ci's steps through it**

`tests/unit/every-commit-ci.test.ts`, as T4 changes it:

```diff
diff --git a/tests/unit/every-commit-ci.test.ts b/tests/unit/every-commit-ci.test.ts
index 40b8ba8..2f3e33f 100644
--- a/tests/unit/every-commit-ci.test.ts
+++ b/tests/unit/every-commit-ci.test.ts
@@ -2,6 +2,7 @@ import { describe, expect, it } from 'vitest';
 import { readFileSync } from 'node:fs';
 import { parse } from 'yaml';
 import { CALLED_JOB } from '../../scripts/every-commit';
+import { runOf } from './workflow-steps';

 /**
  * Every commit a pull request brings passes CI on its own (#348 AC1-AC3,
@@ -18,7 +19,8 @@ import { CALLED_JOB } from '../../scripts/every-commit';
 interface Step {
   id?: string;
   name?: string;
-  run?: string;
+  // YAML may type it otherwise: read it through runOf.
+  run?: unknown;
   uses?: string;
   with?: Record<string, unknown>;
   env?: Record<string, unknown>;
@@ -49,7 +51,7 @@ const every = () => read('every-commit.yml');
 const ci = () => read('ci.yml');
 const job = (id: string): Job => every().jobs[id] ?? {};
 const stepRunning = (steps: Step[] | undefined, command: string) =>
-  (steps ?? []).filter((s) => (s.run ?? '').trim() === command);
+  (steps ?? []).filter((s) => runOf(s) === command);
 const usesOf = (steps: Step[] | undefined, action: string) =>
   (steps ?? []).filter((s) => (s.uses ?? '').startsWith(`${action}@`));

@@ -104,7 +106,7 @@ describe('the list job (AC1, AC5)', () => {
     const [node] = usesOf(job('list').steps, 'actions/setup-node');
     expect(node?.with).toEqual({ 'node-version-file': '.nvmrc' });
     expect(
-      (job('list').steps ?? []).filter((s) => /\bnpm\b/.test(s.run ?? '')),
+      (job('list').steps ?? []).filter((s) => /\bnpm\b/.test(runOf(s))),
     ).toEqual([]);
   });
 });
```

- [ ] **Step 6: Read cross-engine-harness's steps through it**

`tests/unit/cross-engine-harness.test.ts`, as T4 changes it:

```diff
diff --git a/tests/unit/cross-engine-harness.test.ts b/tests/unit/cross-engine-harness.test.ts
index 97a1e75..631229e 100644
--- a/tests/unit/cross-engine-harness.test.ts
+++ b/tests/unit/cross-engine-harness.test.ts
@@ -2,6 +2,7 @@ import { describe, expect, it } from 'vitest';
 import { readFileSync } from 'node:fs';
 import { parse } from 'yaml';
 import config from '../../playwright.engines.config';
+import { runOf } from './workflow-steps';

 /**
  * The cross-engine check stays wired (#26 AC10). A Playwright project dropped
@@ -12,7 +13,8 @@ import config from '../../playwright.engines.config';

 interface Step {
   name?: string;
-  run?: string;
+  // YAML may type it otherwise: read it through runOf.
+  run?: unknown;
 }

 const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
@@ -34,11 +36,11 @@ describe('the cross-engine harness', () => {
     );
     const steps = job?.steps ?? [];
     expect(
-      steps.filter((s) => (s.run ?? '').trim() === 'npm run test:engines'),
+      steps.filter((s) => runOf(s) === 'npm run test:engines'),
       'test:engines step',
     ).toHaveLength(1);
     expect(
-      steps.filter((s) => /playwright install/.test(s.run ?? '')),
+      steps.filter((s) => /playwright install/.test(runOf(s))),
       'no step installs browsers: the image has them, and --with-deps reached an apt mirror',
     ).toEqual([]);
   });
```

- [ ] **Step 7: Type the fast-path guard's `run` as unknown**

`tests/unit/ci-fast-path.test.ts`, as T4 changes it:

```diff
diff --git a/tests/unit/ci-fast-path.test.ts b/tests/unit/ci-fast-path.test.ts
index e806b93..406dfaa 100644
--- a/tests/unit/ci-fast-path.test.ts
+++ b/tests/unit/ci-fast-path.test.ts
@@ -18,7 +18,8 @@ interface Step {
   id?: string;
   name?: string;
   if?: string;
-  run?: string;
+  // YAML may type it otherwise: read it through runOf.
+  run?: unknown;
   uses?: string;
   with?: Record<string, unknown>;
   env?: Record<string, unknown>;
```

- [ ] **Step 8: Run it green, gate the stage alone, commit**

Run: `npx vitest run tests/unit/workflow-steps.test.ts`, then every CI step, in `ci.yml`'s order (format, lint, typecheck, unit, pacing, worker, engines, build), on this stage alone after a clean `npm ci`. Commit: `test(ci): workflow guards refuse a run that is not a string, by name (Refs #360)`.

## Mutations (34, the whole unit suite each time)

Predictions were written before each run, and each run kept the whole suite's denominator (4,606 on T2, 4,615 on T4). On T2, 26 of 28 matched their predictions exactly. Two did not, and both found more, not less: A1 also failed "refuses Markdown in upper case (docs/plan.MD)", because widening the rule to `startsWith('docs/')` admits `.MD` too, a case its prediction left out. W7's comment, `run: true # …`, is the YAML boolean `true`. The fast-path guard failed it by name, but four `pacing-ci.test.ts` tests crashed on `.trim is not a function`. That finding is T4: every guard reads `run:` through `runOf`, which refuses a non-string by the step's name. W7 was re-run on T4 with its four extra tests predicted, and W7b adds the string form.

| Mutation                | Run on | File                               | Change                                                                                                                         | Tests it turned red                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1-widen-docs           | T2     | `scripts/ci-scope.ts`              | `(path.startsWith('docs/') && path.endsWith('.md'))` → `path.startsWith('docs/')`                                              | refuses Markdown in upper case (docs/plan.MD); refuses a file under docs/ that is not Markdown (docs/diagram.svg); refuses code under docs/ (docs/tool.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A2-widen-md             | T2     | `scripts/ci-scope.ts`              | `path === 'HANDOVER.md' \|\|` → `path.endsWith('.md') \|\|`                                                                    | a rename from docs/ into code is full; is full for a mix with the code path last, judging both; refuses Markdown in a directory named like docs (docsx/plan.md); refuses a docs directory below the root (apps/web/docs/plan.md); refuses a document a test reads (TRADEMARKS.md); refuses a file named docs.md (docs.md); refuses a handover in a subdirectory (apps/HANDOVER.md); refuses other Markdown at the root (README.md); refuses the handover spelled in another case (handover.md)                                                                                                                                                                                                                                                                                                                                                                                                    |
| I1-invert               | T2     | `scripts/ci-scope.ts`              | `scope: 'docs-only',` → `scope: 'full',`                                                                                       | a commit changing the handover and a doc is docs-only; a doc path with spaces and non-ASCII letters is read whole; a pull_request event reads the diff once and classifies it; a rename inside docs/ is docs-only, both sides judged; deleting a doc is docs-only; is docs-only for a deletion on the allowlist; is docs-only when every path is on the allowlist, judging each; is docs-only when the branch changed only docs, though the base changed code; writes scope=docs-only and prints each judged path                                                                                                                                                                                                                                                                                                                                                                                 |
| I2-invert-filter        | T2     | `scripts/ci-scope.ts`              | `(path) => !onAllowlist(path)` → `(path) => onAllowlist(path)`                                                                 | a code path with spaces is read whole and named; a commit changing code is full; a commit changing the handover and a doc is docs-only; a doc path with spaces and non-ASCII letters is read whole; a pull_request event reads the diff once and classifies it; a rename inside docs/ is docs-only, both sides judged; deleting a doc is docs-only; deleting code is full; is docs-only for a deletion on the allowlist; is docs-only when every path is on the allowlist, judging each; is docs-only when the branch changed only docs, though the base changed code; is full for a deletion off the allowlist; is full for a mix with the code path first, judging both; is full for a mix with the code path last, judging both; is full for one code path, and names it; states the scope and reason, then every judged path and its side; writes scope=docs-only and prints each judged path |
| J1-drop-first           | T2     | `scripts/ci-scope.ts`              | `const judged = changes.flatMap(` → `const judged = changes.slice(1).flatMap(`                                                 | a code path with spaces is read whole and named; a commit changing code is full; a commit changing the handover and a doc is docs-only; a doc path with spaces and non-ASCII letters is read whole; a rename from code into docs/ is full; a rename from docs/ into code is full; a rename inside docs/ is docs-only, both sides judged; deleting code is full; is docs-only when every path is on the allowlist, judging each; is docs-only when the branch changed only docs, though the base changed code; is full for a deletion off the allowlist; is full for a mix with the code path first, judging both; is full for a mix with the code path last, judging both; is full for one code path, and names it; is full when the branch changed code; states the scope and reason, then every judged path and its side; writes scope=docs-only and prints each judged path                    |
| J2-drop-last            | T2     | `scripts/ci-scope.ts`              | `const judged = changes.flatMap(({ paths }) => paths);` → `const judged = changes.flatMap(({ paths }) => paths).slice(0, -1);` | a code path with spaces is read whole and named; a commit changing code is full; a commit changing the handover and a doc is docs-only; a doc path with spaces and non-ASCII letters is read whole; a rename from code into docs/ is full; a rename from docs/ into code is full; a rename inside docs/ is docs-only, both sides judged; deleting code is full; is docs-only when every path is on the allowlist, judging each; is docs-only when the branch changed only docs, though the base changed code; is full for a deletion off the allowlist; is full for a mix with the code path first, judging both; is full for a mix with the code path last, judging both; is full for one code path, and names it; is full when the branch changed code; states the scope and reason, then every judged path and its side; writes scope=docs-only and prints each judged path                    |
| E1-event                | T2     | `scripts/ci-scope.ts`              | `if (event !== 'pull_request')` → `if (event === 'push')`                                                                      | a "" event is full without reading the diff; a "merge_group" event is full without reading the diff; a "workflow_dispatch" event is full without reading the diff; writes scope=full when EVENT is missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| E2-empty                | T2     | `scripts/ci-scope.ts`              | `if (changes.length === 0)` → `if (false)`                                                                                     | a commit changing nothing is full (an empty diff); is full for an empty diff, saying there was nothing to judge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| K1-type-change          | T2     | `scripts/ci-scope.ts`              | `new Set(['A', 'M', 'D'])` → `new Set(['A', 'M', 'D', 'T'])`                                                                   | is full for a type change on an allowlisted path, naming the status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| K2-one-path-renames     | T2     | `scripts/ci-scope.ts`              | `/^[RC]/.test(status) ? 2 : 1` → `1`                                                                                           | reads a rename or copy as one change with both paths; refuses a rename with one path by name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R1-renames-on           | T2     | `scripts/ci-scope.ts`              | `['diff', '--no-renames',` → `['diff',`                                                                                        | a rename from code into docs/ is full; a rename inside docs/ is docs-only, both sides judged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R2-no-z                 | T2     | `scripts/ci-scope.ts`              | `'--name-status', '-z',` → `'--name-status',`                                                                                  | a code path with spaces is read whole and named; a commit changing the handover and a doc is docs-only; a doc path with spaces and non-ASCII letters is read whole; a rename from code into docs/ is full; a rename from docs/ into code is full; a rename inside docs/ is docs-only, both sides judged; deleting a doc is docs-only; is docs-only when the branch changed only docs, though the base changed code; is full when the branch changed code; writes scope=docs-only and prints each judged path                                                                                                                                                                                                                                                                                                                                                                                      |
| R3-second-parent        | T2     | `scripts/ci-scope.ts`              | `'HEAD^1', 'HEAD'` → `'HEAD^2', 'HEAD'`                                                                                        | a code path with spaces is read whole and named; a commit changing the handover and a doc is docs-only; a doc path with spaces and non-ASCII letters is read whole; a rename from code into docs/ is full; a rename from docs/ into code is full; a rename inside docs/ is docs-only, both sides judged; a root commit has no parent to read, so it is full, naming git’s error; deleting a doc is docs-only; is docs-only when the branch changed only docs, though the base changed code; is full when the branch changed code; writes scope=docs-only and prints each judged path                                                                                                                                                                                                                                                                                                              |
| P1-no-nul-end           | T2     | `scripts/ci-scope.ts`              | `if (!text.endsWith('\0'))` → `if (false)`                                                                                     | a diff that cannot be parsed is full, naming the reason; refuses text that does not end in NUL by name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P2-empty-path           | T2     | `scripts/ci-scope.ts`              | `\|\| paths.includes('')` removed                                                                                              | refuses an empty path by name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P3-status-shape         | T2     | `scripts/ci-scope.ts`              | `const STATUS = /^[A-Z][0-9]*$/;` → `const STATUS = /^[A-Za-z]+[0-9]*$/;`                                                      | refuses a field that is not a status by name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| O1-no-newline           | T2     | `scripts/ci-scope.ts`              | `scope=${result.scope}\n` → `scope=${result.scope}`                                                                            | writes scope=docs-only and prints each judged path; writes scope=full for a push, as deploy-dev’s call is; writes scope=full when EVENT is missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| O2-output-unchecked     | T2     | `scripts/ci-scope.ts`              | `if (output === undefined \|\| output === '')` → `if (false)`                                                                  | fails by name when GITHUB_OUTPUT is not set, so no step can be skipped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| O3-report-side          | T2     | `scripts/ci-scope.ts`              | `onAllowlist(path) ? 'docs ' : 'other'` → `'docs '`                                                                            | states the scope and reason, then every judged path and its side                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| W1-lint-unskipped       | T2     | `.github/workflows/ci.yml`         | `if: ${{ steps.classify.outputs.scope != 'docs-only' }}` removed                                                               | every other step carries the skip, each condition whole (AC5); on docs-only, run exactly checkout, Node, the classifier, install, Format and the unit suite; reads the scope nowhere but in a skip, so nothing can fire on a full verdict (AC5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| W2-upload-cancelled     | T2     | `.github/workflows/ci.yml`         | `if: ${{ !cancelled() && steps.classify` → `if: ${{ steps.classify`                                                            | every other step carries the skip, each condition whole (AC5); uploads pacing-report.json after it, even when the suite fails, and fails when the file is missing (AC6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| W3-equals-full          | T2     | `.github/workflows/ci.yml`         | `if: ${{ steps.classify.outputs.scope != 'docs-only' }}` → `if: ${{ steps.classify.outputs.scope == 'full' }}`                 | every other step carries the skip, each condition whole (AC5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| W4-undecided-step       | T2     | `.github/workflows/ci.yml`         | adds `- name: Extra ⏎ run: echo extra`                                                                                         | on docs-only, run exactly checkout, Node, the classifier, install, Format and the unit suite; reads the scope nowhere but in a skip, so nothing can fire on a full verdict (AC5); run in today’s order, with the classifier after Node and before install                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| W5-event-literal        | T2     | `.github/workflows/ci.yml`         | `EVENT: ${{ github.event_name }}` → `EVENT: 'pull_request'`                                                                    | is given the event, so only a pull_request can be docs-only (AC3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| W6-shallow              | T2     | `.github/workflows/ci.yml`         | `# The commit and its parents: classify diffs HEAD^1..HEAD. ⏎ fetch-depth: 2` removed                                          | checks out that ref, the event’s own commit when it is empty; has the commit’s first parent to diff against: checkout fetches two levels                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| W7-classifier-commented | T4     | `.github/workflows/ci.yml`         | `run: node scripts/ci-scope.ts` → `run: true # node scripts/ci-scope.ts`                                                       | holds the step to 5 minutes on the runner (AC7); runs as its own step, once, after the unit tests (AC4); runs in CI, in the Playwright image that carries all three browsers (#44); runs the classifier with Node alone, before npm ci; uploads pacing-report.json after it, even when the suite fails, and fails when the file is missing (AC6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D1-deploy-on-pr         | T2     | `.github/workflows/deploy-dev.yml` | adds `pull_request:`                                                                                                           | runs only on a push, an event the classifier never makes docs-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D2-deploy-input         | T2     | `.github/workflows/deploy-dev.yml` | adds `with: ⏎ ref: ''`                                                                                                         | calls build-and-test with no input                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| W7b-classifier-echoed   | T4     | `.github/workflows/ci.yml`         | `run: node scripts/ci-scope.ts` → `run: echo node scripts/ci-scope.ts`                                                         | runs the classifier with Node alone, before npm ci                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| T3-plural-always        | T4     | `scripts/ci-scope.ts`              | `result.judged.length === 1 ? 'path' : 'paths'` → `'paths'`                                                                    | counts one judged path in the singular                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| T3b-singular-zero       | T4     | `scripts/ci-scope.ts`              | `result.judged.length === 1 ?` → `result.judged.length <= 1 ?`                                                                 | counts no judged paths in the plural                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| RO1-any-type            | T4     | `tests/unit/workflow-steps.ts`     | `if (typeof step.run !== 'string')` → `if (false)`                                                                             | names an unnamed step by its action; refuses a boolean by the step’s name; refuses a list by the step’s name; refuses a number by the step’s name; refuses null by the step’s name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| RO2-no-trim             | T4     | `tests/unit/workflow-steps.ts`     | `return step.run.trim();` → `return step.run;`                                                                                 | reads a command as written, trimmed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| RO3-unnamed             | T4     | `tests/unit/workflow-steps.ts`     | `step.name ?? step.uses ?? '?'` → `step.name ?? '?'`                                                                           | names an unnamed step by its action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Live proofs (AC6)

Predictions were written at 00:27 UTC, before any push. Each throwaway branch was cut from this branch's head `47193b6`, each pull request's base was this branch (so every-commit listed only the throwaway commits), and each was closed unmerged and its branch deleted. All six runs concluded `success`; each job was read step by step, and each classifier's verdict from its own log.

| PR   | Change                                              | build-and-test (merge commit)                                                                                                         | every-commit entries                                                                                                 |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| #362 | `docs/throwaway-360.md` added                       | run 37248312534: `scope: docs-only`, judged 1 path; Lint, Typecheck, Pacing, Upload, Worker, Engines and Build skipped (7); **2m04s** | run 37248312736: one entry, docs-only, 7 skipped, 1m38s; every-commit success                                        |
| #363 | the same, plus a comment line in `TRADEMARKS.md`    | run 37248315278: `scope: full (outside the docs-only allowlist: TRADEMARKS.md)`, judged 2 paths; every step ran; 3m46s                | run 37248315506: one entry, full, 0 skipped, 3m05s                                                                   |
| #364 | C1 adds the doc, C2 adds `scripts/throwaway-360.ts` | run 37248319068: `scope: full (… scripts/throwaway-360.ts)`, judged 2 paths; 4m35s                                                    | run 37248319192: C1 `a8c3cbf` docs-only, 7 skipped, 2m05s; C2 `303f580` full, 0 skipped, 4m25s; every-commit success |

**Measured against the estimate:** a docs-only job took 1m38s–2m05s, not the "about 1.5 minutes" estimated from #359's run. Container start was 26 s, install 13 s, Format 5 s, and the unit suite 67 s (42 s on #359's run, while six jobs ran at once here). The fast path does not change how many runs a pull request starts (one, plus one per commit through every-commit). It makes each docs-only run shorter: about 2 minutes against about 3.5–4.5 for a full run in the same batch.

## Finishing

- Open the pull request into `develop` with `Refs #360`; read `build-and-test` and `every-commit` step by step at its `headRefOid`; merge (no permission needed) and verify the dev deploy, which runs in full (deploy-dev's event is `push`).
- Close #360 with each AC's evidence, and move it to Done.
- The fast path makes runs shorter, never fewer: a pull request starts one run for itself and one per commit through every-commit, so a docs pull request is one commit wherever it can be (global rule, control (3), 2026-10-05).
