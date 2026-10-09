import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { check, ciScripts, type Reads } from '../../scripts/ci-scripts';

/**
 * The pre-push check that every commit on a branch has each npm script the
 * head's ci.yml runs (#518). every-commit runs the head's ci.yml against each
 * commit's tree, so a later commit adding a step and its script made every
 * earlier commit red twice (#123, run 37553023215; #475, run 37814355403).
 *
 * The decision runs in-process with git's reads stood in: no process starts
 * in a unit test. The hook runs the script itself (tests/unit/pre-push.test.ts
 * names the gate).
 */

/** A workflow whose one job runs each command as a step. */
const workflow = (...runs: unknown[]): string =>
  stringify({
    jobs: {
      'build-and-test': {
        'runs-on': 'ubuntu-latest',
        steps: runs.map((run, i) => ({ name: `step ${String(i)}`, run })),
      },
    },
  });

const pkg = (...scripts: string[]): string =>
  JSON.stringify({
    scripts: Object.fromEntries(scripts.map((name) => [name, 'true'])),
  });

/** A commit's subject and its package.json (undefined: it has none). */
type Commit = readonly [subject: string, packageJson: string | undefined];

const shaOf = (index: number): string => String(index + 1).repeat(40);

/** git's reads for a branch: the head's ci.yml and its commits, oldest first. */
function branch(ciYaml: string, commits: readonly Commit[]): Reads {
  return {
    ciYaml: () => ciYaml,
    log: () =>
      commits
        .map(
          ([subject], i) =>
            `${shaOf(i)}\t${shaOf(i).slice(0, 7)}\t${subject}\n`,
        )
        .join(''),
    packageJson: (sha) => {
      const index = commits.findIndex((_, i) => shaOf(i) === sha);
      if (index === -1) throw new Error(`no commit ${sha} on the branch`);
      return commits[index]?.[1];
    },
  };
}

describe('the npm scripts the head’s ci.yml runs (#518 AC1)', () => {
  it('reads `npm run <script>` from a step', () => {
    expect(ciScripts(workflow('npm run lint'))).toEqual(['lint']);
  });

  it('reads `npm run --silent <script>`', () => {
    expect(ciScripts(workflow('npm run --silent typecheck'))).toEqual([
      'typecheck',
    ]);
  });

  it('reads `npm run` after a wrapper, as the build step writes it', () => {
    expect(
      ciScripts(workflow('scripts/fail-on-warnings.sh npm run build')),
    ).toEqual(['build']);
  });

  it('reads every `npm run` of a multi-line step, chained or not', () => {
    expect(
      ciScripts(
        workflow('npm run format:check && npm run lint\nnpm run test:unit'),
      ),
    ).toEqual(['format:check', 'lint', 'test:unit']);
  });

  it('reads every job, once each script, sorted', () => {
    const yaml = stringify({
      jobs: {
        one: { steps: [{ run: 'npm run test:web' }, { run: 'npm ci' }] },
        two: {
          steps: [{ uses: 'actions/checkout@v4' }, { run: 'npm run build' }],
        },
        three: { steps: [{ run: 'npm run test:web' }] },
      },
    });
    expect(ciScripts(yaml)).toEqual(['build', 'test:web']);
  });

  it('skips the arguments after the script', () => {
    expect(ciScripts(workflow('npm run test:unit -- --reporter=dot'))).toEqual([
      'test:unit',
    ]);
  });

  it('reads `npm run -s <script>`, the short quiet flag', () => {
    expect(ciScripts(workflow('npm run -s lint'))).toEqual(['lint']);
  });

  it('reads past every quiet flag before the script', () => {
    expect(ciScripts(workflow('npm run --silent -s lint'))).toEqual(['lint']);
  });

  it('reads no script from a word that only ends in npm', () => {
    expect(ciScripts(workflow('npm run lint', 'pnpm run other'))).toEqual([
      'lint',
    ]);
  });

  it('leaves the words after `--` to the script, a workspace flag included', () => {
    expect(ciScripts(workflow('npm run test:unit -- -w 2'))).toEqual([
      'test:unit',
    ]);
  });

  it('reads the real ci.yml: the ten scripts build-and-test runs', () => {
    expect(ciScripts(readFileSync('.github/workflows/ci.yml', 'utf8'))).toEqual(
      [
        'build',
        'format:check',
        'lint',
        'test:engines',
        'test:guards',
        'test:pacing',
        'test:unit',
        'test:web',
        'test:worker',
        'typecheck',
      ],
    );
  });

  it('refuses a ci.yml with no `npm run` step, by name, rather than passing over nothing', () => {
    expect(() => ciScripts(workflow('npm ci', 'echo hi'))).toThrow(
      /^the head's ci\.yml runs no `npm run` step: nothing to check$/,
    );
  });

  it('refuses a ci.yml with no jobs', () => {
    expect(() => ciScripts('name: CI\n')).toThrow(
      /^the head's ci\.yml has no jobs$/,
    );
  });

  it('refuses a ci.yml that does not parse', () => {
    expect(() => ciScripts('jobs: [unclosed\n')).toThrow(
      /^the head's ci\.yml does not parse: /,
    );
  });

  it('refuses a job whose steps are not a list', () => {
    expect(() =>
      ciScripts(stringify({ jobs: { lint: { steps: 'npm run lint' } } })),
    ).toThrow(/^job "lint": steps is not a list$/);
  });

  it('skips a job that calls a workflow and has no steps', () => {
    const yaml = stringify({
      jobs: {
        call: { uses: './.github/workflows/ci.yml' },
        lint: { steps: [{ run: 'npm run lint' }] },
      },
    });
    expect(ciScripts(yaml)).toEqual(['lint']);
  });

  it('refuses a run that YAML typed as something other than text', () => {
    expect(() => ciScripts(workflow(true))).toThrow(
      /^job "build-and-test", step "step 0": run is not text: true$/,
    );
  });

  it('names an unnamed step by its place', () => {
    const yaml = stringify({
      jobs: {
        lint: { steps: [{ uses: 'actions/checkout@v4' }, { run: 'npm run' }] },
      },
    });
    expect(() => ciScripts(yaml)).toThrow(
      /^job "lint", step "#2": cannot read `npm run`$/,
    );
  });

  it('names an unnamed step that runs an action by the action', () => {
    const yaml = stringify({
      jobs: { lint: { steps: [{ uses: 'actions/checkout@v4', run: 7 }] } },
    });
    expect(() => ciScripts(yaml)).toThrow(
      /^job "lint", step "actions\/checkout@v4": run is not text: 7$/,
    );
  });

  it('names a step by its action when YAML typed its name as other than text', () => {
    const yaml = stringify({
      jobs: {
        lint: {
          steps: [{ name: { a: 1 }, uses: 'actions/checkout@v4', run: 7 }],
        },
      },
    });
    expect(() => ciScripts(yaml)).toThrow(
      /^job "lint", step "actions\/checkout@v4": run is not text: 7$/,
    );
  });

  it('keeps the parser’s error as the cause of a ci.yml that does not parse', () => {
    let thrown: unknown;
    try {
      ciScripts('jobs: [unclosed\n');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toBeInstanceOf(Error);
    expect(((thrown as Error).cause as Error).name).toBe('YAMLParseError');
  });

  it('refuses a flag it cannot classify before the script', () => {
    expect(() => ciScripts(workflow('npm run --if-present lint'))).toThrow(
      /^job "build-and-test", step "step 0": cannot read `npm run --if-present lint`$/,
    );
  });

  it('refuses a workspace script, which the root package.json does not hold', () => {
    expect(() =>
      ciScripts(workflow('npm run test --workspace @yawelo-idle/web')),
    ).toThrow(
      /^job "build-and-test", step "step 0": cannot read `npm run test --workspace @yawelo-idle\/web`$/,
    );
  });

  it('refuses a script named by a variable', () => {
    expect(() => ciScripts(workflow('npm run "$SUITE"'))).toThrow(
      /^job "build-and-test", step "step 0": cannot read `npm run "\$SUITE"`$/,
    );
  });

  it('refuses `npm run` with no script', () => {
    expect(() => ciScripts(workflow('npm run'))).toThrow(
      /^job "build-and-test", step "step 0": cannot read `npm run`$/,
    );
  });
});

describe('each commit has every script the head runs (#518 AC1, AC2)', () => {
  const head = workflow('npm run lint', 'npm run test:guards');

  it('refuses a step added in a later commit, naming each earlier commit and the script', () => {
    const result = check(
      branch(head, [
        ['first', pkg('lint')],
        ['second', pkg('lint')],
        ['adds the guards', pkg('lint', 'test:guards')],
      ]),
    );
    expect(result.problems).toEqual([
      '1111111 first: package.json has no "test:guards", which the head\'s ci.yml runs',
      '2222222 second: package.json has no "test:guards", which the head\'s ci.yml runs',
    ]);
  });

  it('passes a branch whose first commit adds the step’s script', () => {
    const result = check(
      branch(head, [
        ['adds the guards', pkg('lint', 'test:guards')],
        ['second', pkg('lint', 'test:guards')],
      ]),
    );
    expect(result).toEqual({
      lines: [
        "the head's ci.yml runs 2 npm scripts: lint, test:guards",
        'checked 2 commits on origin/develop..HEAD: 1111111 adds the guards, 2222222 second',
      ],
      problems: [],
    });
  });

  it('refuses a script removed mid-branch, naming that commit alone', () => {
    const result = check(
      branch(head, [
        ['first', pkg('lint', 'test:guards')],
        ['drops lint', pkg('test:guards')],
        ['restores lint', pkg('lint', 'test:guards')],
      ]),
    );
    expect(result.problems).toEqual([
      '2222222 drops lint: package.json has no "lint", which the head\'s ci.yml runs',
    ]);
  });

  it('names every script a commit lacks, in one line', () => {
    const result = check(branch(head, [['bare', pkg()]]));
    expect(result.problems).toEqual([
      '1111111 bare: package.json has no "lint", "test:guards", which the head\'s ci.yml runs',
    ]);
  });

  it('reads only a package.json’s own scripts, not names every object inherits', () => {
    const result = check(
      branch(workflow('npm run toString'), [['bare', pkg()]]),
    );
    expect(result.problems).toEqual([
      '1111111 bare: package.json has no "toString", which the head\'s ci.yml runs',
    ]);
  });

  it('refuses a commit with no package.json', () => {
    const result = check(branch(head, [['empty', undefined]]));
    expect(result.problems).toEqual([
      '1111111 empty: has no package.json, and the head\'s ci.yml runs "lint", "test:guards"',
    ]);
  });

  it('refuses a commit whose package.json does not parse', () => {
    const result = check(branch(head, [['broken', '{ "scripts": ']]));
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(
      /^1111111 broken: package\.json does not parse: /,
    );
  });

  it('refuses a commit whose scripts are not an object of names', () => {
    const result = check(
      branch(head, [['listed', JSON.stringify({ scripts: ['lint'] })]]),
    );
    expect(result.problems).toEqual([
      '1111111 listed: package.json scripts is not an object: ["lint"]',
    ]);
  });

  it('reads a package.json with no scripts as having none', () => {
    const result = check(branch(head, [['no scripts', '{}']]));
    expect(result.problems).toEqual([
      '1111111 no scripts: package.json has no "lint", "test:guards", which the head\'s ci.yml runs',
    ]);
  });

  it('says what it judged: the scripts and the commits, counted', () => {
    const result = check(
      branch(head, [
        ['first', pkg('lint', 'test:guards')],
        ['second', pkg('lint', 'test:guards')],
      ]),
    );
    expect(result.lines).toEqual([
      "the head's ci.yml runs 2 npm scripts: lint, test:guards",
      'checked 2 commits on origin/develop..HEAD: 1111111 first, 2222222 second',
    ]);
  });

  it('counts one script and one commit in the singular', () => {
    const result = check(
      branch(workflow('npm run lint'), [['only', pkg('lint')]]),
    );
    expect(result.lines).toEqual([
      "the head's ci.yml runs 1 npm script: lint",
      'checked 1 commit on origin/develop..HEAD: 1111111 only',
    ]);
  });

  it('passes a branch with no commits of its own, saying it checked none', () => {
    const result = check(branch(head, []));
    expect(result).toEqual({
      lines: [
        "the head's ci.yml runs 2 npm scripts: lint, test:guards",
        'checked 0 commits on origin/develop..HEAD',
      ],
      problems: [],
    });
  });

  it('refuses a git log line it cannot read', () => {
    const reads: Reads = { ...branch(head, []), log: () => 'not a log line\n' };
    expect(() => check(reads)).toThrow(/^git log line 1 is not /);
  });
});
