import { describe, expect, it } from 'vitest';
import {
  configSettings,
  excludesFileOf,
  ignoredBy,
  list,
  pathspecMatches,
  refuseGitEnvironment,
  type ConfigFile,
  type Settings,
  type Tree,
  type TreeEntry,
} from './tracked-files';

/**
 * The guards' file list, worked out in-process (#491): git's index for the
 * tracked paths, a walk of the working tree for the rest, and the ignore
 * rules git reads. Here the tree is held in memory, so no unit test starts
 * git or touches the disk; tests/integration/tracked-files.test.ts compares
 * the whole reader with real git on real repositories.
 *
 * The expected lists marked "as git prints it" were printed by git 2.54.0
 * (`git ls-files -z -o -i --exclude-standard --directory`, and `-co`) on the
 * same tree built on disk; #491's comments quote each probe.
 */

/**
 * A tree from a map of file paths to their text. A key ending in `/` is an
 * empty directory; a key ending in `|` is something that is neither a file
 * nor a directory (a socket, a FIFO), named without the bar.
 */
type Kind = TreeEntry['kind'];

const tree = (files: Readonly<Record<string, string>>): Tree => {
  const kinds = new Map<string, Map<string, Kind>>();
  const entriesOf = (dir: string): Map<string, Kind> => {
    const entries = kinds.get(dir) ?? new Map<string, Kind>();
    kinds.set(dir, entries);
    return entries;
  };
  for (const key of Object.keys(files)) {
    const kind: Kind = key.endsWith('/')
      ? 'directory'
      : key.endsWith('|')
        ? 'other'
        : 'file';
    const parts = key.replace(/[/|]$/, '').split('/');
    parts.forEach((name, i) => {
      const entries = entriesOf(parts.slice(0, i).join('/'));
      if (entries.get(name) !== 'directory')
        entries.set(name, i < parts.length - 1 ? 'directory' : kind);
    });
    if (kind === 'directory') entriesOf(parts.join('/'));
  }
  return {
    entries: (dir) =>
      [...(kinds.get(dir) ?? new Map<string, Kind>())].map(([name, kind]) => ({
        name,
        kind,
      })),
    text: (path) => files[path],
  };
};

const PLAIN: Settings = { ignorecase: false, precompose: false, excludes: [] };

describe('list: what git ls-files --cached --others --exclude-standard lists', () => {
  it.each([
    [
      'tracked and untracked paths, each once, sorted',
      ['b.ts', 'a/x.ts'],
      { 'a/x.ts': '', 'b.ts': '', 'c.ts': '', 'a/new.ts': '' },
      PLAIN,
      ['a/new.ts', 'a/x.ts', 'b.ts', 'c.ts'],
    ],
    [
      'a tracked path deleted from disk, as --cached lists it',
      ['gone.ts', 'here.ts'],
      { 'here.ts': '' },
      PLAIN,
      ['gone.ts', 'here.ts'],
    ],
    [
      'no untracked path the root .gitignore ignores',
      ['.gitignore'],
      {
        '.gitignore': '*.log\nbuild/\n',
        'x.log': '',
        'build/out.js': '',
        'y.ts': '',
      },
      PLAIN,
      ['.gitignore', 'y.ts'],
    ],
    [
      "a nested .gitignore's rules, relative to its own directory",
      [],
      { 'a/.gitignore': '/only-here\n', 'a/only-here': '', 'only-here': '' },
      PLAIN,
      ['a/.gitignore', 'only-here'],
    ],
    [
      'a deeper negation over a higher rule',
      [],
      {
        '.gitignore': '*.log\n',
        'd/.gitignore': '!keep.log\n',
        'd/keep.log': '',
        'd/drop.log': '',
      },
      PLAIN,
      ['.gitignore', 'd/.gitignore', 'd/keep.log'],
    ],
    [
      'nothing from inside an ignored directory, whatever negates it',
      [],
      { '.gitignore': 'd/\n!d/x\n', 'd/x': '', 'd/.gitignore': '!x\n' },
      PLAIN,
      ['.gitignore'],
    ],
    [
      'no path info/exclude ignores',
      [],
      { 'secret.txt': '', 'open.txt': '' },
      { ...PLAIN, excludes: ['secret.txt\n'] },
      ['open.txt'],
    ],
    [
      'a .gitignore negation over info/exclude',
      [],
      { '.gitignore': '!secret.txt\n', 'secret.txt': '' },
      { ...PLAIN, excludes: ['secret.txt\n'] },
      ['.gitignore', 'secret.txt'],
    ],
    [
      'info/exclude over the global excludes file',
      [],
      { 'local.json': '' },
      { ...PLAIN, excludes: ['!local.json\n', '**/local.json\n'] },
      ['local.json'],
    ],
    [
      'no path the global excludes file ignores',
      [],
      { '.claude/settings.local.json': '', '.claude/settings.json': '' },
      { ...PLAIN, excludes: ['', '**/.claude/settings.local.json\n'] },
      ['.claude/settings.json'],
    ],
    [
      'a tracked path an ignore rule matches',
      ['dist/kept.js'],
      { '.gitignore': 'dist/\n', 'dist/kept.js': '', 'dist/new.js': '' },
      PLAIN,
      ['.gitignore', 'dist/kept.js'],
    ],
    [
      "nothing from the root's .git (a worktree holds a .git file)",
      [],
      { '.git': 'gitdir: /elsewhere\n', 'a/x': '' },
      PLAIN,
      ['a/x'],
    ],
    [
      'an untracked nested repository once, as dir/',
      [],
      {
        'nested/inner/.git/HEAD': '',
        'nested/inner/.git/objects/': '',
        'nested/inner/.git/refs/': '',
        'nested/inner/n': '',
        top: '',
      },
      PLAIN,
      ['nested/inner/', 'top'],
    ],
    [
      'an untracked worktree inside the tree once, as dir/',
      [],
      { 'wt/.git': 'gitdir: /repo/.git/worktrees/wt\n', 'wt/n': '' },
      PLAIN,
      ['wt/'],
    ],
    [
      'the files of a directory whose .git is no repository, but not the .git',
      [],
      { 'a/.git': 'not a pointer\n', 'a/x': '' },
      PLAIN,
      ['a/x'],
    ],
    [
      'a tracked submodule once, by its path',
      ['vendor/lib'],
      {
        'vendor/lib/.git': 'gitdir: ../../.git/modules/lib\n',
        'vendor/lib/x': '',
      },
      PLAIN,
      ['vendor/lib'],
    ],
    ['no empty directory', [], { 'empty/': '', x: '' }, PLAIN, ['x']],
    [
      'nothing that is neither a file nor a directory',
      [],
      { 'sock|': '', x: '' },
      PLAIN,
      ['x'],
    ],
    [
      'a rule in another case, when core.ignorecase is on',
      [],
      { '.gitignore': '*.LOG\n', 'x.log': '' },
      { ...PLAIN, ignorecase: true },
      ['.gitignore'],
    ],
    [
      'a rule in another case as no match, when core.ignorecase is off',
      [],
      { '.gitignore': '*.LOG\n', 'x.log': '' },
      PLAIN,
      ['.gitignore', 'x.log'],
    ],
    [
      'a file whose name differs from its index entry only in case once, when core.ignorecase is on',
      ['foo.ts'],
      { 'Foo.ts': '' },
      { ...PLAIN, ignorecase: true },
      ['foo.ts'],
    ],
    [
      'a decomposed name precomposed, when core.precomposeunicode is on',
      [],
      { 'café.txt': '' },
      { ...PLAIN, precompose: true },
      ['café.txt'],
    ],
    [
      'a decomposed name as it is, when core.precomposeunicode is off',
      [],
      { 'café.txt': '' },
      PLAIN,
      ['café.txt'],
    ],
  ] as const)('lists %s', (_what, tracked, files, settings, expected) => {
    expect(list(tracked, tree(files), settings).committable).toEqual(expected);
  });
});

/** The tree of the first probe (probe 1 on #491). */
const PROBE_1 = {
  '.gitignore': 'ign/\ntrackedign/\n*.log\n!keep.log\n',
  'ign/a': '',
  'ign/sub/b': '',
  'trackedign/t': '',
  'trackedign/u': '',
  'trackedign/s/s': '',
  'untr/deep/x.log': '',
  'untr/y.txt': '',
  'allign/z.log': '',
  'keep.log': '',
  'l.log': '',
  'nested/inner/.git/HEAD': '',
  'nested/inner/.git/objects/': '',
  'nested/inner/.git/refs/': '',
  'nested/inner/n': '',
};
const PROBE_1_TRACKED = ['.gitignore', 'trackedign/t'];

/** The tree of the second probe (probe 3 on #491). */
const PROBE_3 = {
  '.gitignore': 'ig/\n*.log\nnr2/\n',
  'a/ig/x': '',
  'b/c/ig/x': '',
  'b/c/x.log': '',
  'd/empty/': '',
  'e/x.log': '',
  'e/y.log': '',
  'nr2/.git/HEAD': '',
  'nr2/.git/objects/': '',
  'nr2/.git/refs/': '',
  'nr2/x/': '',
  'f/g/x.log': '',
  'f/k.txt': '',
};

describe('list: what git ls-files --others --ignored --exclude-standard --directory lists', () => {
  it('lists probe 1 as git prints it', () => {
    expect(list(PROBE_1_TRACKED, tree(PROBE_1), PLAIN).ignored).toEqual([
      'allign/',
      'allign/z.log',
      'ign/',
      'l.log',
      'trackedign/s/',
      'trackedign/u',
      'untr/deep/',
      'untr/deep/x.log',
    ]);
  });

  it("lists probe 1's committable paths as git prints them", () => {
    expect(list(PROBE_1_TRACKED, tree(PROBE_1), PLAIN).committable).toEqual([
      '.gitignore',
      'keep.log',
      'nested/inner/',
      'trackedign/t',
      'untr/y.txt',
    ]);
  });

  it('lists probe 3 as git prints it', () => {
    expect(list(['.gitignore'], tree(PROBE_3), PLAIN).ignored).toEqual([
      'a/',
      'a/ig/',
      'b/',
      'b/c/',
      'b/c/ig/',
      'b/c/x.log',
      'e/',
      'e/x.log',
      'e/y.log',
      'f/g/',
      'f/g/x.log',
      'nr2/',
    ]);
  });

  it("lists probe 3's committable paths as git prints them", () => {
    expect(list(['.gitignore'], tree(PROBE_3), PLAIN).committable).toEqual([
      '.gitignore',
      'f/k.txt',
    ]);
  });
});

describe('ignoredBy: what git check-ignore answers', () => {
  it.each([
    ['a file in an ignored directory', 'ign/a', true],
    ['a path not on disk, under an ignored directory', 'ign/zz/q', true],
    ['a tracked file, though a rule matches it', 'trackedign/t', false],
    ['an untracked file in an ignored directory', 'trackedign/u', true],
    ['a file a pattern ignores', 'allign/z.log', true],
    ['a file a negation re-includes', 'keep.log', false],
    ['a file no rule matches', 'untr/y.txt', false],
  ] as const)(
    'answers %s (%s) as ignored: %s, as git did on probe 1',
    (_what, path, ignored) => {
      expect(ignoredBy(PROBE_1_TRACKED, tree(PROBE_1), PLAIN)(path)).toBe(
        ignored,
      );
    },
  );
});

describe('ignoredBy under an excluded directory', () => {
  it('answers a path a deeper negation names as ignored, as git did on probe 4', () => {
    // git cannot re-include a path whose parent directory is excluded, from
    // any depth: check-ignore answered a/y ignored.
    const probe4 = tree({
      '.gitignore': 'a/\n',
      'a/.gitignore': '!y\n',
      'a/y': '',
    });
    expect(ignoredBy(['.gitignore'], probe4, PLAIN)('a/y')).toBe(true);
  });
});

describe('pathspecMatches: git pathspecs without magic', () => {
  it.each([
    ['*.ts', 'a.ts', true],
    ['*.ts', 'd/e/a.ts', true],
    ['*.ts', 'a.tsx', false],
    ['*.TS', 'a.ts', false],
    ['tests/*.ts', 'tests/unit/x.ts', true],
    ['tests/*.ts', 'scripts/x.ts', false],
    ['?.ts', 'a.ts', true],
    ['?.ts', 'ab.ts', false],
    ['tests', 'tests', true],
    ['tests', 'tests/x.ts', true],
    ['tests', 'testsx/y.ts', false],
    ['tests/', 'tests/x.ts', true],
    ['a+b.ts', 'a+b.ts', true],
    ['a+b.ts', 'aab.ts', false],
  ] as const)('matches %s against %s: %s', (spec, path, expected) => {
    expect(pathspecMatches(spec, path)).toBe(expected);
  });

  it.each([
    [':(glob)*.ts', 'magic'],
    ['[ab].ts', 'bracket'],
    ['a\\*.ts', 'backslash'],
    ['', 'empty'],
  ] as const)('refuses %s, naming the %s it does not read', (spec, named) => {
    expect(() => pathspecMatches(spec, 'a.ts')).toThrow(named);
  });
});

describe('configSettings: the core settings git reads', () => {
  /** Each text as a config file of its own, under /cfg. */
  const files = (...texts: readonly string[]): ConfigFile[] =>
    texts.map((text, i) => ({ path: `/cfg/${String(i)}`, text }));
  /** A repository at /r whose other readable files are `more`. */
  const at = (more: Readonly<Record<string, string>> = {}) => ({
    gitDirs: ['/r/.git'],
    read: (path: string) => more[path],
  });

  it('reads none as git defaults them', () => {
    expect(configSettings([], {}, at())).toEqual({
      ignorecase: false,
      precompose: false,
      excludesFile: undefined,
    });
  });

  it.each([
    ['ignorecase on', ['[core]\n\tignorecase = true\n'], { ignorecase: true }],
    [
      'precomposeunicode on',
      ['[core]\n\tprecomposeunicode = true\n'],
      { precompose: true },
    ],
    [
      'a later file over an earlier one',
      ['[core]\nignorecase = true\n', '[core]\nignorecase = false\n'],
      { ignorecase: false },
    ],
    [
      'section and key in any case, and yes for true',
      ['[Core]\n\tIgnoreCase = yes\n'],
      { ignorecase: true },
    ],
    [
      'a key with no value as true',
      ['[core]\n\tignorecase\n'],
      { ignorecase: true },
    ],
    [
      'another section as not core',
      ['[remote "origin"]\n\tignorecase = true\n'],
      { ignorecase: false },
    ],
    [
      'a quoted value and a trailing comment',
      ['[core]\n\texcludesfile = "/a b" # note\n'],
      { excludesFile: '/a b' },
    ],
    [
      'a home-relative path under HOME',
      ['[core]\nexcludesFile = ~/ign\n'],
      { excludesFile: '/home/t/ign' },
    ],
    [
      'a commented-out line as nothing',
      ['[core]\n# ignorecase = true\n; precomposeunicode = true\n'],
      { ignorecase: false, precompose: false },
    ],
  ] as const)('reads %s', (_what, texts, expected) => {
    expect(
      configSettings(files(...texts), { HOME: '/home/t' }, at()),
    ).toMatchObject(expected);
  });

  it('reads settings given by GIT_CONFIG_COUNT over every file', () => {
    expect(
      configSettings(
        files('[core]\nignorecase = true\n'),
        {
          GIT_CONFIG_COUNT: '2',
          GIT_CONFIG_KEY_0: 'url.https://x.insteadOf',
          GIT_CONFIG_VALUE_0: 'git@x:',
          GIT_CONFIG_KEY_1: 'core.ignoreCase',
          GIT_CONFIG_VALUE_1: 'false',
        },
        at(),
      ),
    ).toMatchObject({ ignorecase: false });
  });

  // git config's includes (git-config(1), "Includes" and "Conditional includes").
  it.each([
    [
      "an included file's settings, at the include",
      '[include]\n\tpath = more.cfg\n',
      { '/cfg/more.cfg': '[core]\nignorecase = true\n' },
      { ignorecase: true },
    ],
    [
      'a later setting over an included one',
      '[include]\n\tpath = more.cfg\n[core]\nignorecase = false\n',
      { '/cfg/more.cfg': '[core]\nignorecase = true\n' },
      { ignorecase: false },
    ],
    [
      'an include of an include, relative to the file holding it',
      '[include]\n\tpath = /a/one.cfg\n',
      {
        '/a/one.cfg': '[include]\n\tpath = two.cfg\n',
        '/a/two.cfg': '[core]\nignorecase = true\n',
      },
      { ignorecase: true },
    ],
    [
      'an include under HOME',
      '[include]\n\tpath = ~/more.cfg\n',
      { '/home/t/more.cfg': '[core]\nignorecase = true\n' },
      { ignorecase: true },
    ],
    [
      'a missing included file as nothing, as git does',
      '[include]\n\tpath = gone.cfg\n[core]\nprecomposeunicode = true\n',
      {},
      { precompose: true },
    ],
    [
      'an includeIf whose gitdir is the repository',
      '[includeIf "gitdir:/r/.git"]\n\tpath = /m.cfg\n',
      { '/m.cfg': '[core]\nignorecase = true\n' },
      { ignorecase: true },
    ],
    [
      'no includeIf whose gitdir is another repository',
      '[includeIf "gitdir:/other/.git"]\n\tpath = /m.cfg\n',
      { '/m.cfg': '[core]\nignorecase = true\n' },
      { ignorecase: false },
    ],
    [
      'an includeIf whose gitdir ends in /, matching everything under it',
      '[includeIf "gitdir:/r/"]\n\tpath = /m.cfg\n',
      { '/m.cfg': '[core]\nignorecase = true\n' },
      { ignorecase: true },
    ],
    [
      'an includeIf whose gitdir has no leading /, matching at any depth',
      '[includeIf "gitdir:r/.git"]\n\tpath = /m.cfg\n',
      { '/m.cfg': '[core]\nignorecase = true\n' },
      { ignorecase: true },
    ],
    [
      'an includeIf whose * stops at a /',
      '[includeIf "gitdir:/*/.git"]\n\tpath = /m.cfg\n[includeIf "gitdir:/*"]\n\tpath = /n.cfg\n',
      {
        '/m.cfg': '[core]\nignorecase = true\n',
        '/n.cfg': '[core]\nprecomposeunicode = true\n',
      },
      { ignorecase: true, precompose: false },
    ],
    [
      'an includeIf gitdir/i in another case',
      '[includeIf "gitdir/i:/R/.GIT"]\n\tpath = /m.cfg\n',
      { '/m.cfg': '[core]\nignorecase = true\n' },
      { ignorecase: true },
    ],
    [
      'no includeIf gitdir in another case',
      '[includeIf "gitdir:/R/.GIT"]\n\tpath = /m.cfg\n',
      { '/m.cfg': '[core]\nignorecase = true\n' },
      { ignorecase: false },
    ],
    [
      // The shape actions/checkout writes (run 37900594580).
      'the includeIf actions/checkout writes, holding no core setting',
      '[includeIf "gitdir:/r/.git"]\n\tpath = /tmp/git-credentials.config\n',
      {
        '/tmp/git-credentials.config':
          '[http "https://github.com/"]\n\textraheader = AUTHORIZATION: basic x\n',
      },
      { ignorecase: false, precompose: false, excludesFile: undefined },
    ],
  ] as const)('follows %s', (_what, text, more, expected) => {
    expect(
      configSettings(
        [{ path: '/cfg/config', text }],
        { HOME: '/home/t' },
        at(more),
      ),
    ).toMatchObject(expected);
  });

  it.each([
    [
      'an includeIf on a branch',
      ['[includeIf "onbranch:main"]\n\tpath = /m.cfg\n'],
      {},
      'onbranch',
    ],
    [
      'an includeIf on a remote URL',
      ['[includeIf "hasconfig:remote.*.url:https://x/**"]\n\tpath = /m.cfg\n'],
      {},
      'hasconfig',
    ],
    [
      'a gitdir pattern with brackets',
      ['[includeIf "gitdir:/[ab]/.git"]\n\tpath = /m.cfg\n'],
      {},
      'bracket',
    ],
    [
      'includes nested past git limit of 10',
      ['[include]\n\tpath = /loop.cfg\n'],
      {},
      'include depth',
    ],
    [
      'a value that is not a boolean',
      ['[core]\nignorecase = maybe\n'],
      {},
      'maybe',
    ],
    [
      'a relative excludes file',
      ['[core]\nexcludesfile = ign\n'],
      {},
      'relative',
    ],
    [
      'git -c naming a core setting',
      [],
      { GIT_CONFIG_PARAMETERS: "'core.excludesfile'='/x'" },
      'GIT_CONFIG_PARAMETERS',
    ],
  ] as const)('refuses %s, naming it', (_what, texts, env, named) => {
    const loop = at({ '/loop.cfg': '[include]\n\tpath = /loop.cfg\n' });
    expect(() => configSettings(files(...texts), env, loop)).toThrow(named);
  });
});

describe('excludesFileOf: where git looks for the global excludes file', () => {
  it.each([
    [
      'core.excludesFile when set',
      '/set/ign',
      { HOME: '/h', XDG_CONFIG_HOME: '/x' },
      '/set/ign',
    ],
    [
      'XDG_CONFIG_HOME/git/ignore when unset',
      undefined,
      { HOME: '/h', XDG_CONFIG_HOME: '/x' },
      '/x/git/ignore',
    ],
    [
      'HOME/.config/git/ignore when XDG_CONFIG_HOME is empty',
      undefined,
      { HOME: '/h', XDG_CONFIG_HOME: '' },
      '/h/.config/git/ignore',
    ],
    [
      'HOME/.config/git/ignore when XDG_CONFIG_HOME is unset',
      undefined,
      { HOME: '/h' },
      '/h/.config/git/ignore',
    ],
  ] as const)('reads %s', (_what, set, env, expected) => {
    expect(excludesFileOf(set, env)).toBe(expected);
  });
});

describe('refuseGitEnvironment', () => {
  it.each(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'])(
    'refuses %s, which moves what git reads',
    (name) => {
      expect(() => {
        refuseGitEnvironment({ [name]: '/x' });
      }).toThrow(name);
    },
  );

  it('passes the environment a pre-push hook runs in', () => {
    // As printed by a pre-push hook on git 2.54.0 (probe 2).
    expect(() => {
      refuseGitEnvironment({
        GIT_EXEC_PATH: '/git-core',
        GIT_PREFIX: '',
        GIT_CONFIG_COUNT: '0',
      });
    }).not.toThrow();
  });
});
