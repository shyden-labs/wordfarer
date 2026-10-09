import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { indexPaths } from './git-index.ts';

/**
 * The guards' one file walk (#385), worked out in-process (#491): git's index
 * for what is tracked, a walk of the working tree for the rest, and the
 * ignore rules git reads (every `.gitignore`, `info/exclude`, the global
 * excludes file), matched by the `ignore` library. No unit test starts git.
 * tests/integration/tracked-files.test.ts compares this with real git on
 * every CI run, path by path, on the checked-out tree and on planted
 * repositories.
 *
 * What it does not read stops with an error naming it, never a guess: an
 * index git writes in a form not read (tests/unit/git-index.ts), a config
 * include, `git -c` or an environment variable that moves what git reads.
 * Not read at all: the system-wide gitconfig, whose path only git knows; the
 * integration comparison is what would catch a machine whose system config
 * sets a core setting read here.
 */

/** One entry of a directory: a symbolic link is a file, as git stores one. */
export interface TreeEntry {
  readonly name: string;
  readonly kind: 'file' | 'directory' | 'other';
}

/** What the lister reads of a working tree, by paths relative to its root. */
export interface Tree {
  /** A directory's entries; `''` is the root. */
  entries(dir: string): readonly TreeEntry[];
  /** A file's text, or undefined when there is no such file. */
  text(path: string): string | undefined;
}

/** The settings git's lists depend on. */
export interface Settings {
  readonly ignorecase: boolean;
  readonly precompose: boolean;
  /**
   * The texts of the repository-wide exclude files, highest precedence first:
   * `info/exclude`, then the global excludes file. Every `.gitignore` in the
   * tree outranks both.
   */
  readonly excludes: readonly string[];
}

const below = (dir: string, name: string): string =>
  dir === '' ? name : `${dir}/${name}`;

/** git's tracked-path lookups, by case too when core.ignorecase is on. */
const trackedLookup = (tracked: readonly string[], ignorecase: boolean) => {
  const fold = (path: string) => (ignorecase ? path.toLowerCase() : path);
  const files = new Set(tracked.map(fold));
  const dirs = new Set<string>();
  for (const path of tracked) {
    const parts = fold(path).split('/');
    for (let i = 1; i < parts.length; i++)
      dirs.add(parts.slice(0, i).join('/'));
  }
  return {
    /** A tracked file, or a submodule's tracked path. */
    has: (path: string) => files.has(fold(path)),
    /** A directory holding at least one tracked path. */
    holds: (dir: string) => dirs.has(fold(dir)),
  };
};

/**
 * The ignore rules git reads for a path: the `.gitignore` of each directory
 * from the path's own up to the root, then each repository-wide file. The
 * first file with a rule matching the path decides it, by its last such rule.
 */
const rulesOf = (tree: Tree, settings: Settings) => {
  const make = (text: string): Ignore =>
    ignore({ ignorecase: settings.ignorecase }).add(text);
  const perDirectory = new Map<string, Ignore | undefined>();
  const of = (dir: string): Ignore | undefined => {
    if (!perDirectory.has(dir)) {
      const text = tree.text(below(dir, '.gitignore'));
      perDirectory.set(dir, text === undefined ? undefined : make(text));
    }
    return perDirectory.get(dir);
  };
  const wide = settings.excludes.map(make);
  /** `path` is a directory's when it ends in `/`. */
  return (path: string): boolean => {
    const parts = path.replace(/\/$/, '').split('/');
    for (let depth = parts.length - 1; depth >= 0; depth--) {
      const rules = of(parts.slice(0, depth).join('/'));
      if (rules === undefined) continue;
      const verdict = rules.test(path.split('/').slice(depth).join('/'));
      if (verdict.ignored) return true;
      if (verdict.unignored) return false;
    }
    for (const rules of wide) {
      const verdict = rules.test(path);
      if (verdict.ignored) return true;
      if (verdict.unignored) return false;
    }
    return false;
  };
};

/**
 * A directory git treats as another repository and does not enter: its
 * `.git` is a directory holding `HEAD`, `objects` and `refs`, or a file
 * pointing at one (a worktree or a submodule).
 */
const isRepository = (tree: Tree, dir: string): boolean => {
  const git = tree.entries(dir).find(({ name }) => name === '.git');
  if (git === undefined) return false;
  if (git.kind === 'file')
    return (tree.text(below(dir, '.git')) ?? '').startsWith('gitdir: ');
  if (git.kind !== 'directory') return false;
  const inside = new Set(
    tree.entries(below(dir, '.git')).map(({ name }) => name),
  );
  return ['HEAD', 'objects', 'refs'].every((name) => inside.has(name));
};

/**
 * Both of git's lists of a working tree, from one walk:
 * - `committable`: as `git ls-files --cached --others --exclude-standard`,
 *   each path once, sorted. A path the index tracks is in it whether or not
 *   it is on disk, and whatever rule matches it.
 * - `ignored`: as `git ls-files --others --ignored --exclude-standard
 *   --directory`, sorted. A wholly ignored directory once as `dir/`; an
 *   untracked, unignored directory holding nothing committable and something
 *   ignored as `dir/` beside its contents, as git 2.54 prints it.
 */
export function list(
  tracked: readonly string[],
  tree: Tree,
  settings: Settings,
): { committable: string[]; ignored: string[] } {
  const index = trackedLookup(tracked, settings.ignorecase);
  const ignored = rulesOf(tree, settings);
  const committable = new Set(tracked);
  const listedIgnored: string[] = [];
  const name = (raw: string) =>
    settings.precompose ? raw.normalize('NFC') : raw;

  /** Inside an ignored directory that holds tracked paths: every untracked path is ignored. */
  const underIgnored = (dir: string): void => {
    for (const entry of tree.entries(dir)) {
      if (entry.name === '.git' || entry.kind === 'other') continue;
      const path = below(dir, name(entry.name));
      if (index.has(path)) continue;
      if (entry.kind === 'file') listedIgnored.push(path);
      else if (index.holds(path)) underIgnored(path);
      else listedIgnored.push(`${path}/`);
    }
  };

  /** Walks an unignored directory; says whether it holds anything committable and anything ignored. */
  const visit = (dir: string): { keeps: boolean; drops: boolean } => {
    let keeps = false;
    let drops = false;
    for (const entry of tree.entries(dir)) {
      if (entry.name === '.git' || entry.kind === 'other') continue;
      const path = below(dir, name(entry.name));
      if (index.has(path)) {
        keeps = true;
        continue;
      }
      if (entry.kind === 'file') {
        if (ignored(path)) {
          listedIgnored.push(path);
          drops = true;
        } else {
          committable.add(path);
          keeps = true;
        }
        continue;
      }
      const tracksInside = index.holds(path);
      if (ignored(`${path}/`)) {
        if (tracksInside) underIgnored(path);
        else listedIgnored.push(`${path}/`);
        drops = true;
        if (tracksInside) keeps = true;
        continue;
      }
      if (!tracksInside && isRepository(tree, path)) {
        committable.add(`${path}/`);
        keeps = true;
        continue;
      }
      const inner = visit(path);
      if (!tracksInside && !inner.keeps && inner.drops)
        listedIgnored.push(`${path}/`);
      keeps ||= inner.keeps || tracksInside;
      drops ||= inner.drops;
    }
    return { keeps, drops };
  };

  visit('');
  return {
    committable: [...committable].sort(),
    ignored: listedIgnored.sort(),
  };
}

/**
 * Whether git ignores `path`, as `git check-ignore` answers: a tracked path
 * never is, and a path under an ignored directory always is, on disk or not.
 */
export function ignoredBy(
  tracked: readonly string[],
  tree: Tree,
  settings: Settings,
): (path: string) => boolean {
  const index = trackedLookup(tracked, settings.ignorecase);
  const ignored = rulesOf(tree, settings);
  return (path) => {
    if (index.has(path)) return false;
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++)
      if (ignored(`${parts.slice(0, i).join('/')}/`)) return true;
    return ignored(path);
  };
}

/**
 * Whether a git pathspec without magic matches `path`, as git ls-files reads
 * it: `*` and `?` match `/` too, so `'*.ts'` matches at any depth and
 * `'tests/*.ts'` anywhere under `tests/`; a spec without wildcards matches
 * the path itself or anything under it. Brackets, backslashes and `:` magic
 * are not read, and stop with an error.
 */
export function pathspecMatches(spec: string, path: string): boolean {
  if (spec === '') throw new Error('pathspec: an empty pathspec is not read');
  if (spec.startsWith(':'))
    throw new Error(`pathspec ${JSON.stringify(spec)}: magic is not read`);
  if (spec.includes('['))
    throw new Error(`pathspec ${JSON.stringify(spec)}: a bracket is not read`);
  if (spec.includes('\\'))
    throw new Error(
      `pathspec ${JSON.stringify(spec)}: a backslash is not read`,
    );
  if (!/[*?]/.test(spec)) {
    const dir = spec.endsWith('/') ? spec : `${spec}/`;
    return path === spec || path.startsWith(dir);
  }
  const pattern = spec
    .split('')
    .map((char) =>
      char === '*'
        ? '.*'
        : char === '?'
          ? '.'
          : char.replace(/[.+^${}()|]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^${pattern}$`, 's').test(path);
}

const BOOLEAN: Readonly<Record<string, boolean>> = {
  true: true,
  yes: true,
  on: true,
  '1': true,
  false: false,
  no: false,
  off: false,
  '0': false,
};

type Environment = Readonly<Record<string, string | undefined>>;

/** A git config file: where it is, which relative includes start from, and its text. */
export interface ConfigFile {
  readonly path: string;
  readonly text: string;
}

/** Where a repository's config is read: its git directory's spellings, and how to read an included file. */
export interface ConfigPlace {
  /** The git directory as found and as its real path; an includeIf gitdir matches either, as git's does. */
  readonly gitDirs: readonly string[];
  /** A file's text, or undefined when there is none: git passes over a missing include. */
  readonly read: (path: string) => string | undefined;
}

/** git's limit on nested includes (config.c, MAX_INCLUDE_DEPTH). */
const INCLUDE_DEPTH = 10;

/**
 * The core settings read here, from config files lowest precedence first
 * (global, then the repository's), then `GIT_CONFIG_COUNT`'s pairs. A later
 * value wins, as in git. Includes are followed where they stand, as git
 * follows them (git-config(1)): `[include]`, and `[includeIf]` on `gitdir:`
 * or `gitdir/i:`. CI's checkout writes one (run 37900594580). Any other
 * condition stops with an error naming it.
 */
export function configSettings(
  files: readonly ConfigFile[],
  env: Environment,
  place: ConfigPlace,
): {
  ignorecase: boolean;
  precompose: boolean;
  excludesFile: string | undefined;
} {
  const values = new Map<string, string | true>();
  const home = env.HOME ?? homedir();
  const apply = (file: ConfigFile, depth: number): void => {
    let section = '';
    let including = false;
    for (const raw of file.text.split('\n')) {
      const line = raw.trim();
      if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
      const header = /^\[\s*([^\]\s"]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/.exec(
        line,
      );
      if (header !== null) {
        section = (header[1] ?? '').toLowerCase();
        const sub = header[2];
        including =
          (section === 'include' && sub === undefined) ||
          (section === 'includeif' &&
            sub !== undefined &&
            conditionHolds(sub, file.path, home, place.gitDirs));
        // A subsection is never core's: `[core "x"]` sets nothing here.
        if (sub !== undefined) section = `${section} "sub"`;
        continue;
      }
      const pair = /^([A-Za-z][\w-]*)\s*(?:=\s*(.*))?$/.exec(line);
      if (pair === null) continue;
      const key = (pair[1] ?? '').toLowerCase();
      const value = pair[2];
      if (including && key === 'path' && value !== undefined) {
        if (depth >= INCLUDE_DEPTH)
          throw new Error(
            `git config: include depth past ${String(INCLUDE_DEPTH)} at ${file.path}`,
          );
        const target = unquote(value);
        const path = target.startsWith('~/')
          ? join(home, target.slice(2))
          : resolve(dirname(file.path), target);
        const text = place.read(path);
        if (text !== undefined) apply({ path, text }, depth + 1);
        continue;
      }
      if (section !== 'core') continue;
      values.set(key, value === undefined ? true : unquote(value));
    }
  };
  for (const file of files) apply(file, 0);
  const count = Number(env.GIT_CONFIG_COUNT ?? '0');
  for (let i = 0; i < count; i++) {
    const key = (env[`GIT_CONFIG_KEY_${String(i)}`] ?? '').toLowerCase();
    if (key.startsWith('core.'))
      values.set(key.slice(5), env[`GIT_CONFIG_VALUE_${String(i)}`] ?? '');
  }
  const parameters = (env.GIT_CONFIG_PARAMETERS ?? '').toLowerCase();
  for (const key of READ)
    if (parameters.includes(`core.${key}`))
      throw new Error(
        `GIT_CONFIG_PARAMETERS sets core.${key} (git -c), which is not read`,
      );
  const flag = (key: string): boolean => {
    const value = values.get(key);
    if (value === undefined) return false;
    if (value === true) return true;
    const known = BOOLEAN[value.toLowerCase()];
    if (known === undefined)
      throw new Error(
        `git config: core.${key} = ${JSON.stringify(value)} is not a boolean`,
      );
    return known;
  };
  const excludes = values.get('excludesfile');
  let excludesFile: string | undefined;
  if (typeof excludes === 'string') {
    excludesFile = excludes.startsWith('~/')
      ? join(env.HOME ?? homedir(), excludes.slice(2))
      : excludes;
    if (!isAbsolute(excludesFile))
      throw new Error(
        `git config: core.excludesFile ${JSON.stringify(excludes)} is relative, which is not read`,
      );
  }
  return {
    ignorecase: flag('ignorecase'),
    precompose: flag('precomposeunicode'),
    excludesFile,
  };
}

/** The core keys read here, lower-cased as git compares them. */
const READ = ['ignorecase', 'precomposeunicode', 'excludesfile'] as const;

/** A config value without its quotes and any comment after it. */
const unquote = (value: string): string => {
  let out = '';
  let quoted = false;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '#' || char === ';')) break;
    else out += char;
  }
  return quoted ? out : out.trimEnd();
};

/**
 * Whether an includeIf condition holds. `gitdir:` and `gitdir/i:` take a
 * glob as git-config(1) describes it: `~/` is HOME, `./` the including
 * file's directory, a pattern not starting with `/` gains a leading `**`
 * and slash, one ending in `/` a trailing `**`; `**` crosses `/`, `*` and
 * `?` do not. Any other condition, or a bracket, stops with an error.
 */
const conditionHolds = (
  condition: string,
  file: string,
  home: string,
  gitDirs: readonly string[],
): boolean => {
  const kind = /^(gitdir|gitdir\/i):(.*)$/s.exec(condition);
  if (kind === null)
    throw new Error(
      `git config: includeIf ${JSON.stringify(condition)} is not read (only gitdir: and gitdir/i:)`,
    );
  let pattern = kind[2] ?? '';
  if (pattern.includes('['))
    throw new Error(
      `git config: includeIf ${JSON.stringify(condition)}: a bracket is not read`,
    );
  if (pattern.startsWith('~/')) pattern = join(home, pattern.slice(2));
  else if (pattern.startsWith('./'))
    pattern = join(dirname(file), pattern.slice(2));
  else if (!pattern.startsWith('/')) pattern = `**/${pattern}`;
  if (pattern.endsWith('/')) pattern = `${pattern}**`;
  let source = '';
  for (let i = 0; i < pattern.length;) {
    const rest = pattern.slice(i);
    const [token, regex] =
      rest === '/**'
        ? ['/**', '(?:/.*)?']
        : rest.startsWith('**/')
          ? ['**/', '(?:.*/)?']
          : rest.startsWith('**')
            ? ['**', '.*']
            : rest.startsWith('*')
              ? ['*', '[^/]*']
              : rest.startsWith('?')
                ? ['?', '[^/]']
                : [
                    rest.charAt(0),
                    rest.charAt(0).replace(/[.+^${}()|\\]/g, '\\$&'),
                  ];
    source += regex;
    i += token.length;
  }
  const glob = new RegExp(`^${source}$`, kind[1] === 'gitdir/i' ? 'is' : 's');
  return gitDirs.some((dir) => glob.test(dir));
};

/** The global excludes file git reads: core.excludesFile, else the XDG default. */
export function excludesFileOf(
  set: string | undefined,
  env: Environment,
): string {
  if (set !== undefined) return set;
  const xdg = env.XDG_CONFIG_HOME;
  return xdg !== undefined && xdg !== ''
    ? join(xdg, 'git', 'ignore')
    : join(env.HOME ?? homedir(), '.config', 'git', 'ignore');
}

/** Environment variables that move what git reads, which this reader does not follow. */
export function refuseGitEnvironment(env: Environment): void {
  for (const name of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_COMMON_DIR',
  ])
    if (env[name] !== undefined)
      throw new Error(
        `${name} is set, which moves what git reads; the in-process reader does not follow it`,
      );
}

/** The working tree under `root`, read from disk. */
const diskTree = (root: string): Tree => ({
  entries: (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      kind:
        entry.isFile() || entry.isSymbolicLink()
          ? 'file'
          : entry.isDirectory()
            ? 'directory'
            : 'other',
    })),
  text: (path) => {
    try {
      return readFileSync(join(root, path), 'utf8');
    } catch {
      return undefined;
    }
  },
});

const textOf = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
};

const textOrNothing = (path: string): string => textOf(path) ?? '';

const realOrSame = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/**
 * The repository whose working tree is `root`: its tracked paths, its tree
 * and its settings. `.git` is the git directory, or a file naming it (a
 * worktree), whose `commondir` names the shared one.
 */
const repository = (root: string) => {
  const env = process.env;
  refuseGitEnvironment(env);
  const dotGit = join(root, '.git');
  const gitDir = statSync(dotGit).isDirectory()
    ? dotGit
    : resolve(
        root,
        /^gitdir: (.*)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1] ??
          (() => {
            throw new Error(`${dotGit}: names no gitdir`);
          })(),
      );
  const commonDir = (() => {
    try {
      return resolve(
        gitDir,
        readFileSync(join(gitDir, 'commondir'), 'utf8').trim(),
      );
    } catch {
      return gitDir;
    }
  })();
  const home = env.HOME ?? homedir();
  const xdg =
    env.XDG_CONFIG_HOME !== undefined && env.XDG_CONFIG_HOME !== ''
      ? env.XDG_CONFIG_HOME
      : join(home, '.config');
  const globals =
    env.GIT_CONFIG_GLOBAL !== undefined
      ? [env.GIT_CONFIG_GLOBAL]
      : [join(xdg, 'git', 'config'), join(home, '.gitconfig')];
  const config = configSettings(
    [...globals, join(commonDir, 'config')].flatMap((path) => {
      const text = textOf(path);
      return text === undefined ? [] : [{ path, text }];
    }),
    env,
    { gitDirs: [gitDir, realOrSame(gitDir)], read: textOf },
  );
  const settings: Settings = {
    ignorecase: config.ignorecase,
    precompose: config.precompose,
    excludes: [
      textOrNothing(join(commonDir, 'info', 'exclude')),
      textOrNothing(excludesFileOf(config.excludesFile, env)),
    ],
  };
  return { tracked: trackedIn(gitDir), tree: diskTree(root), settings };
};

/** The index's paths; a repository nothing was ever added to has no index file, which git reads as empty. */
const trackedIn = (gitDir: string): string[] => {
  let bytes: Buffer;
  try {
    bytes = readFileSync(join(gitDir, 'index'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return indexPaths(bytes);
};

/**
 * Every path git tracks or would track at the next `git add -A`, relative to
 * the repo root, as `git ls-files --cached --others --exclude-standard`
 * lists it, each path once and sorted. A test file written before its
 * `git add` is in it, so a count over it does not move when the file is
 * committed (#31, #356); a conflicted path at three index stages is in it
 * once (#405).
 * `pathspecs` narrow it as git's own do, `'*.ts'` matching at any depth;
 * `cwd` names another repository's root (the tests' own, #405).
 */
export const committableFiles = (
  pathspecs: readonly string[] = [],
  cwd = '.',
): string[] => {
  const { tracked, tree, settings } = repository(cwd);
  const all = list(tracked, tree, settings).committable;
  return pathspecs.length === 0
    ? all
    : all.filter((path) =>
        pathspecs.some((spec) => pathspecMatches(spec, path)),
      );
};

/**
 * Every untracked path git ignores under `root`, a wholly ignored directory
 * once as `dir/` (#432), as `git ls-files --others --ignored
 * --exclude-standard --directory` lists it. Tracked paths are never in it.
 */
export const ignoredPaths = (root: string): Set<string> => {
  const { tracked, tree, settings } = repository(root);
  return new Set(list(tracked, tree, settings).ignored);
};

/** Whether git ignores `path` under `root`, as `git check-ignore` answers. */
export const isIgnored = (path: string, root = '.'): boolean => {
  const { tracked, tree, settings } = repository(root);
  return ignoredBy(tracked, tree, settings)(path);
};
