import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import {
  committableFiles,
  ignoredPaths,
  isIgnored,
} from '../unit/tracked-files';

/**
 * The guards' one file walk (#385) against real git (#491). The walk reads
 * git's index and the working tree in-process, so no unit test starts git;
 * here, on every CI run, it is compared path by path in both directions with
 * what git itself lists: on the checked-out tree, and on a repository planted
 * with every shape the reader handles. Mid-merge, git keeps a conflicted path
 * at three index stages, and the walk must still count it once (#405).
 */
const repos: string[] = [];

afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true });
});

/**
 * Every git call carries its own identity: CI's container has none, and a
 * merge without one exits 128 before it reaches the conflict.
 */
const IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];

const gitIn =
  (repo: string) =>
  (...args: string[]): string =>
    execFileSync('git', ['-C', repo, ...IDENTITY, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });

const writeIn =
  (repo: string) =>
  (path: string, text: string): void => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };

/** A NUL-separated listing as paths, each once. */
const paths = (listing: string): string[] => [
  ...new Set(listing.split('\0').filter((path) => path !== '')),
];

/** git's own lists of the working tree at `repo`. */
const gitLists = (repo: string, pathspecs: readonly string[] = []) => {
  const git = gitIn(repo);
  return {
    committable: paths(
      git(
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        ...pathspecs,
      ),
    ),
    ignored: paths(
      git(
        'ls-files',
        '-z',
        '--others',
        '--ignored',
        '--exclude-standard',
        '--directory',
      ),
    ),
  };
};

/** Each path one list holds and the other does not, and each duplicate. */
const differences = (
  reader: readonly string[],
  git: readonly string[],
): string[] => {
  const read = new Set(reader);
  const listed = new Set(git);
  return [
    ...reader
      .filter((path) => !listed.has(path))
      .map((p) => `only the reader lists ${JSON.stringify(p)}`),
    ...git
      .filter((path) => !read.has(path))
      .map((p) => `only git lists ${JSON.stringify(p)}`),
    ...(read.size === reader.length
      ? []
      : [`the reader lists ${String(reader.length - read.size)} paths twice`]),
  ];
};

/** A repository whose `f.txt` is in conflict, beside a tracked and an untracked file. */
const conflicted = (): string => {
  const repo = mkdtempSync(join(tmpdir(), 'walk-conflict-'));
  repos.push(repo);
  const git = gitIn(repo);
  const write = writeIn(repo);
  git('init', '-q', '-b', 'main');
  write('f.txt', 'base\n');
  write('keep.txt', 'keep\n');
  git('add', 'f.txt', 'keep.txt');
  git('commit', '-q', '-m', 'base');
  git('switch', '-q', '-c', 'other');
  write('f.txt', 'other\n');
  git('commit', '-q', '-am', 'other');
  git('switch', '-q', 'main');
  write('f.txt', 'main\n');
  git('commit', '-q', '-am', 'main');
  const merge = spawnSync(
    'git',
    ['-C', repo, ...IDENTITY, 'merge', '-q', 'other'],
    { encoding: 'utf8' },
  );
  expect(merge.status, `the merge stops on the conflict: ${merge.stderr}`).toBe(
    1,
  );
  write('new.txt', 'untracked\n');
  return repo;
};

/** A non-ASCII path git tracks, and one it would add. */
const TRACKED_NON_ASCII = 'kata/sāmpel é.txt';
const UNTRACKED_NON_ASCII = 'ünïcode-neu.txt';

/**
 * The conflicted repository planted with every other shape the reader
 * handles, and a worktree of it outside it. Returns both roots.
 */
const planted = (): { repo: string; worktree: string } => {
  const repo = conflicted();
  const git = gitIn(repo);
  const write = writeIn(repo);
  write('.gitignore', '*.log\nbuild/\n');
  write('sub/.gitignore', '!keep.log\nlocal-only\n');
  write('sub/tracked.ts', 'export {};\n');
  write(TRACKED_NON_ASCII, 'kata\n');
  write('gone.txt', 'staged, then deleted\n');
  git(
    'add',
    '.gitignore',
    'sub/.gitignore',
    'sub/tracked.ts',
    TRACKED_NON_ASCII,
    'gone.txt',
  );
  rmSync(join(repo, 'gone.txt'));
  write(UNTRACKED_NON_ASCII, 'neu\n');
  write('x.log', 'ignored by the root\n');
  write('sub/keep.log', 're-included by the nested .gitignore\n');
  write('sub/local-only', 'ignored by the nested .gitignore\n');
  write('build/out.js', 'in an ignored directory\n');
  write('only-ignored/a.log', 'a directory holding only ignored files\n');
  write('.git/info/exclude', 'excluded.txt\n');
  write('excluded.txt', 'ignored by info/exclude\n');
  // Config includes, as actions/checkout writes one (run 37900594580): each
  // sets core.excludesFile, and the last one git follows wins.
  const configs = mkdtempSync(join(tmpdir(), 'walk-configs-'));
  repos.push(configs);
  const excludes = (name: string, pattern: string): string => {
    writeFileSync(join(configs, `${name}.ignore`), `${pattern}\n`);
    writeFileSync(
      join(configs, `${name}.cfg`),
      `[core]\n\texcludesFile = ${join(configs, `${name}.ignore`)}\n`,
    );
    return join(configs, `${name}.cfg`);
  };
  git('config', 'include.path', excludes('include', 'from-include.txt'));
  git(
    'config',
    `includeIf.gitdir:${realpathSync(join(repo, '.git'))}.path`,
    excludes('includeif', 'from-includeif.txt'),
  );
  git(
    'config',
    'includeIf.gitdir:/nowhere/.path',
    excludes('never', 'never.txt'),
  );
  write(
    'from-include.txt',
    'listed: a later include outranks its excludes file\n',
  );
  write('from-includeif.txt', 'ignored through the matching includeIf\n');
  write('never.txt', 'listed: its includeIf names another repository\n');
  const nested = join(repo, 'nested', 'inner');
  mkdirSync(nested, { recursive: true });
  gitIn(nested)('init', '-q', '-b', 'main');
  write('nested/inner/n.txt', 'in another repository\n');
  const worktree = mkdtempSync(join(tmpdir(), 'walk-worktree-'));
  repos.push(worktree);
  rmSync(worktree, { recursive: true });
  git('worktree', 'add', '-q', '-b', 'wt', worktree, 'HEAD');
  writeIn(worktree)('wt-new.txt', 'untracked in the worktree\n');
  // Ignored through the info/exclude the worktree shares with the repository.
  writeIn(worktree)('excluded.txt', 'ignored in the worktree\n');
  return { repo, worktree };
};

describe('committableFiles on a conflicted repository (#405)', () => {
  it('holds a conflicted path at three index stages (the known positive)', () => {
    const repo = conflicted();
    const stages = execFileSync(
      'git',
      ['-C', repo, 'rev-parse', ':1:f.txt', ':2:f.txt', ':3:f.txt'],
      { encoding: 'utf8' },
    );
    expect(stages.trim().split('\n')).toHaveLength(3);
  });

  it('lists a conflicted path once, beside every tracked and untracked file', () => {
    const repo = conflicted();
    expect(committableFiles([], repo)).toEqual([
      'f.txt',
      'keep.txt',
      'new.txt',
    ]);
  });
});

describe('the reader against git on a planted repository (#491 AC3)', () => {
  it('lists a repository nothing was added to, which has no index file, as git does', () => {
    const repo = mkdtempSync(join(tmpdir(), 'walk-fresh-'));
    repos.push(repo);
    gitIn(repo)('init', '-q', '-b', 'main');
    writeIn(repo)('first.txt', 'not yet added\n');
    expect(existsSync(join(repo, '.git', 'index'))).toBe(false);
    expect(gitLists(repo).committable).toEqual(['first.txt']);
    expect(committableFiles([], repo)).toEqual(['first.txt']);
  });

  it('plants every shape, as git itself lists them (the known positives)', () => {
    const { repo, worktree } = planted();
    const lists = gitLists(repo);
    expect(lists.committable).toEqual(
      expect.arrayContaining([
        'f.txt',
        'gone.txt',
        'new.txt',
        'sub/keep.log',
        'nested/inner/',
        TRACKED_NON_ASCII,
        UNTRACKED_NON_ASCII,
        'from-include.txt',
        'never.txt',
      ]),
    );
    expect(existsSync(join(repo, 'gone.txt'))).toBe(false);
    expect(lists.ignored).toEqual(
      expect.arrayContaining([
        'x.log',
        'sub/local-only',
        'build/',
        'excluded.txt',
        'only-ignored/',
        'only-ignored/a.log',
        'from-includeif.txt',
      ]),
    );
    expect(gitLists(worktree).committable).toEqual(
      expect.arrayContaining(['wt-new.txt', 'f.txt']),
    );
    expect(gitLists(worktree).ignored).toEqual(['excluded.txt']);
  });

  it('lists every path git would commit, and no other', () => {
    const { repo } = planted();
    const git = gitLists(repo).committable;
    const diff = differences(committableFiles([], repo), git);
    expect(
      searched(diff, { of: git, what: 'paths git lists' }),
      diff.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('tracked-files/planted-committable', git.length),
    ).toBeUndefined();
  });

  it('lists every path git ignores, and no other', () => {
    const { repo } = planted();
    const git = gitLists(repo).ignored;
    const diff = differences([...ignoredPaths(repo)], git);
    expect(
      searched(diff, { of: git, what: 'paths git ignores' }),
      diff.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('tracked-files/planted-ignored', git.length),
    ).toBeUndefined();
  });

  it("lists a worktree's paths through its .git file, as git does", () => {
    const { worktree } = planted();
    const git = gitLists(worktree).committable;
    const diff = differences(committableFiles([], worktree), git);
    expect(
      searched(diff, { of: git, what: 'paths git lists in the worktree' }),
      diff.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('tracked-files/planted-worktree', git.length),
    ).toBeUndefined();
  });

  it('ignores in a worktree what the shared info/exclude names, as git does', () => {
    const { worktree } = planted();
    const git = gitLists(worktree).ignored;
    const diff = differences([...ignoredPaths(worktree)], git);
    expect(
      searched(diff, { of: git, what: 'paths git ignores in the worktree' }),
      diff.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('tracked-files/planted-worktree-ignored', git.length),
    ).toBeUndefined();
  });

  it('answers whether each path is ignored as git check-ignore does', () => {
    const { repo } = planted();
    const lists = gitLists(repo);
    // Every listed path, and paths on no disk under an ignored directory and not.
    const asked = [
      ...lists.committable.filter((path) => !path.endsWith('/')),
      ...lists.ignored.filter((path) => !path.endsWith('/')),
      'build/not-on-disk.js',
      'sub/not-on-disk.txt',
    ];
    const check = spawnSync(
      'git',
      ['-C', repo, 'check-ignore', '--stdin', '-z'],
      { input: asked.join('\0'), encoding: 'utf8' },
    );
    // 0: some are ignored, 1: none; anything else is a failure.
    expect(check.status, check.stderr).toBe(0);
    const ignored = new Set(paths(check.stdout));
    const diff = asked
      .filter((path) => isIgnored(path, repo) !== ignored.has(path))
      .map(
        (path) => `${path}: git says ${ignored.has(path) ? '' : 'not '}ignored`,
      );
    expect(
      searched(diff, { of: asked, what: 'paths asked about' }),
      diff.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('tracked-files/planted-check-ignore', asked.length),
    ).toBeUndefined();
  });
});

describe('the reader against git on the checked-out tree (#491 AC3)', () => {
  it('lists every path git would commit, and no other', () => {
    const git = gitLists('.').committable;
    const diff = differences(committableFiles(), git);
    expect(
      searched(diff, { of: git, what: 'paths git lists' }),
      diff.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('tracked-files/checkout-committable', git.length),
    ).toBeUndefined();
  });

  it('lists every path git ignores, as git does', () => {
    // What is ignored holds whatever this machine or CI's earlier steps
    // wrote, so its length carries no recorded floor (a machine-dependent
    // population, shyden.co.uk #631). The equality is proved live by
    // node_modules/, which every install writes.
    const git = gitLists('.').ignored;
    expect(git).toContain('node_modules/');
    expect([...ignoredPaths('.')].sort()).toEqual([...git].sort());
  });

  it('answers whether each path is ignored as git check-ignore does', () => {
    const lists = gitLists('.');
    // Every listed path, and the generated deploy config dev-config.test.ts
    // asks about, which a fresh checkout does not hold. The ignored half is
    // machine-dependent, so the table carries no floor; it is proved live by
    // a path each answer covers.
    const asked = [
      ...lists.committable.filter((path) => !path.endsWith('/')),
      ...lists.ignored.filter((path) => !path.endsWith('/')),
      'apps/sync-worker/wrangler.deploy.jsonc',
    ];
    const check = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
      input: asked.join('\0'),
      encoding: 'utf8',
    });
    expect(check.status, check.stderr).toBe(0);
    const ignored = new Set(paths(check.stdout));
    const git = Object.fromEntries(
      asked.map((path) => [path, ignored.has(path)]),
    );
    expect(git['apps/sync-worker/wrangler.deploy.jsonc']).toBe(true);
    expect(git['package.json']).toBe(false);
    expect(
      Object.fromEntries(asked.map((path) => [path, isIgnored(path)])),
    ).toEqual(git);
  });

  // Each set of pathspecs a caller passes.
  it.each([
    ['typescript', ['*.ts', '*.mts', '*.cts', '*.tsx']],
    ['svelte', ['*.svelte']],
    ['tests-and-scripts', ['tests/*.ts', 'scripts/*.ts']],
  ] as const)('narrows by the %s pathspecs as git does', (name, specs) => {
    const git = gitLists('.', specs).committable;
    const diff = differences(committableFiles(specs), git);
    expect(
      searched(diff, {
        of: git,
        what: `paths git lists for ${specs.join(' ')}`,
      }),
      diff.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach(`tracked-files/checkout-${name}`, git.length),
    ).toBeUndefined();
  });
});
