import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ESLint, type Linter } from 'eslint';
import { parse } from 'jsonc-parser';
import { floorBreach } from '../floors';
import { committableFiles } from './tracked-files';

/**
 * The Svelte gates (#123 AC2): a deliberate unused variable in a `.svelte`
 * file goes red.
 *
 * ESLint: the variable is planted as the text of each tracked component and
 * linted at that component's own path, with the repo's real config and type
 * information on, as `npm run lint` runs it. A real path is the only kind the
 * project service accepts (a path not on disk is a parsing error, measured
 * while planning #123), and one test per component proves each workspace's
 * config reaches its own components.
 *
 * svelte-check: every workspace holding a component typechecks with
 * `svelte-check --fail-on-warnings` and a tsconfig that reports unused
 * locals, which `@tsconfig/svelte` leaves off (measured, #123).
 */

/**
 * Written out, so each component gets its own test without running workspace
 * code at collection (tests/unit/collection-calls.test.ts). The first test
 * derives both lists from git and fails on any difference, either way.
 */
const COMPONENTS = ['packages/ui/src/Shell.svelte'] as const;
const WORKSPACES = ['packages/ui'] as const;

/** The workspace (`apps/x`, `packages/x`) holding a path. */
const workspaceOf = (path: string): string =>
  path.split('/').slice(0, 2).join('/');

const PLANTED =
  '<script lang="ts">\n  const unused = 1;\n</script>\n\n<p>x</p>\n';

// Typed linting loads the project service on the first lint: 6.2 s measured
// while planning #123, past vitest's 5 s default, so each case has its own
// budget rather than a warm-up whose failure would only skip the cases.
const LINT_TIMEOUT_MS = 60_000;

const eslint = new ESLint();

async function lint(
  code: string,
  filePath: string,
): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(code, { filePath });
  if (result === undefined) throw new Error(`no lint result for ${filePath}`);
  return result.messages;
}

describe('the Svelte gates (#123 AC2)', () => {
  it('lists every component and its workspace, as git has them, at the recorded floor', () => {
    // Every path git tracks or would at the next `git add -A`, so a new
    // component is judged before its first commit.
    const derived = committableFiles(['*.svelte']);
    // Independently: the files git grep reads holding a tag, which every
    // component does.
    const grep = spawnSync(
      'git',
      ['grep', '--untracked', '-l', '--fixed-strings', '<', '--', '*.svelte'],
      { encoding: 'utf8' },
    );
    expect(grep.status).toBe(0);
    const grepped = grep.stdout.split('\n').filter((line) => line !== '');
    expect(derived).toEqual(grepped);
    expect(COMPONENTS).toEqual(derived);
    expect(WORKSPACES).toEqual([...new Set(derived.map(workspaceOf))]);
    expect(
      floorBreach('svelte-gates/components', derived.length),
    ).toBeUndefined();
  });

  it.each(COMPONENTS)(
    'ESLint reports an unused variable planted in %s',
    async (path) => {
      const messages = await lint(PLANTED, path);
      expect(
        messages.map(({ ruleId, severity, fatal }) => ({
          ruleId,
          severity,
          fatal,
        })),
      ).toContainEqual({
        ruleId: '@typescript-eslint/no-unused-vars',
        severity: 2,
        fatal: undefined,
      });
    },
    LINT_TIMEOUT_MS,
  );

  it.each(WORKSPACES)(
    '%s typechecks its components with svelte-check, failing on warnings',
    (workspace) => {
      const pkg = JSON.parse(
        readFileSync(`${workspace}/package.json`, 'utf8'),
      ) as {
        scripts?: Record<string, string>;
      };
      expect(pkg.scripts?.typecheck ?? '').toMatch(
        /^svelte-check --tsconfig \.\/tsconfig\.json --fail-on-warnings\b/,
      );
    },
  );

  it.each(WORKSPACES)(
    '%s reports unused locals and parameters',
    (workspace) => {
      const tsconfig = parse(
        readFileSync(`${workspace}/tsconfig.json`, 'utf8'),
      ) as { compilerOptions?: Record<string, unknown> };
      expect(tsconfig.compilerOptions).toMatchObject({
        noUnusedLocals: true,
        noUnusedParameters: true,
      });
    },
  );
});
