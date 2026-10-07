import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { walkDisagreements } from './burn-down';
import {
  ALLOWANCE_KEYS,
  ALLOWANCES,
  type Allowance,
  gitGrepCounts,
  judge,
  keyOf,
  linesNaming,
  OLD,
  OLD_NAME,
  readText,
  walkTree,
} from './old-name';
import { committableFiles } from './tracked-files';

const FILE: Allowance = {
  kind: 'history file',
  path: 'docs/old.md',
  reason: 'a record',
};
const SECTION: Allowance = {
  kind: 'history section',
  path: 'docs/spec.md',
  heading: '## 2. Log',
  reason: 'a log',
};
const QUOTE: Allowance = {
  kind: 'quote',
  path: 'docs/spec.md',
  quote: `make the ${OLD} site`,
  reason: 'their words',
};

describe('judge (#356)', () => {
  it('finds the old name in each case form, with its line and column', () => {
    const UPPER = OLD_NAME.toUpperCase();
    const text = [
      `# ${OLD_NAME}`,
      `const ${OLD}Golden = 1;`,
      `${UPPER}_COMMIT=x`,
      `import '@${OLD}/core';`,
      'a clean line',
    ].join('\n');
    expect(judge('src/a.ts', text, [])).toEqual({
      findings: [
        `src/a.ts:1:3: # ${OLD_NAME}`,
        `src/a.ts:2:7: const ${OLD}Golden = 1;`,
        `src/a.ts:3:1: ${UPPER}_COMMIT=x`,
        `src/a.ts:4:10: import '@${OLD}/core';`,
      ],
      allowed: {},
    });
  });

  it('finds each of two occurrences on one line', () => {
    expect(judge('a.md', `${OLD_NAME} and ${OLD}`, [])).toEqual({
      findings: [
        `a.md:1:1: ${OLD_NAME} and ${OLD}`,
        `a.md:1:15: ${OLD_NAME} and ${OLD}`,
      ],
      allowed: {},
    });
  });

  it('allows every occurrence in a history file, and counts them', () => {
    expect(judge('docs/old.md', `${OLD_NAME}\n${OLD}`, [FILE])).toEqual({
      findings: [],
      allowed: { [keyOf(FILE)]: 2 },
    });
  });

  it('allows nothing in another file for a history file', () => {
    expect(judge('docs/new.md', OLD_NAME, [FILE])).toEqual({
      findings: [`docs/new.md:1:1: ${OLD_NAME}`],
      allowed: {},
    });
  });

  it('allows a history section to the next heading of its level, past a fenced one', () => {
    const text = [
      '# Spec',
      '## 1. Intent',
      `${OLD_NAME} intent`,
      '## 2. Log',
      `${OLD_NAME} logged`,
      '### 2.1 Detail',
      `${OLD_NAME} deeper`,
      '```sh',
      '## 3. Fenced',
      '```',
      `${OLD_NAME} after the fence`,
      '## 3. Next',
      `${OLD_NAME} next`,
    ].join('\n');
    expect(judge('docs/spec.md', text, [SECTION])).toEqual({
      findings: [
        `docs/spec.md:3:1: ${OLD_NAME} intent`,
        `docs/spec.md:13:1: ${OLD_NAME} next`,
      ],
      allowed: { [keyOf(SECTION)]: 3 },
    });
  });

  it('ends a history section at a heading of a higher level', () => {
    const text = ['## 2. Log', `${OLD} logged`, '# Top', `${OLD} after`].join(
      '\n',
    );
    expect(judge('docs/spec.md', text, [SECTION])).toEqual({
      findings: [`docs/spec.md:4:1: ${OLD} after`],
      allowed: { [keyOf(SECTION)]: 1 },
    });
  });

  it('allows nothing under the same heading in another file', () => {
    expect(judge('docs/other.md', `## 2. Log\n${OLD}`, [SECTION])).toEqual({
      findings: [`docs/other.md:2:1: ${OLD}`],
      allowed: {},
    });
  });

  it('reads no heading in a file that is not Markdown', () => {
    const notMarkdown: Allowance = { ...SECTION, path: 'docs/spec.ts' };
    expect(judge('docs/spec.ts', `## 2. Log\n${OLD}`, [notMarkdown])).toEqual({
      findings: [`docs/spec.ts:2:1: ${OLD}`],
      allowed: {},
    });
  });

  it('allows a quote only inside the quoted words', () => {
    const line = `They said _"make the ${OLD} site"_ about ${OLD_NAME}.`;
    expect(judge('docs/spec.md', line, [QUOTE])).toEqual({
      findings: [
        `docs/spec.md:1:${String(line.lastIndexOf(OLD_NAME) + 1)}: ${line}`,
      ],
      allowed: { [keyOf(QUOTE)]: 1 },
    });
  });

  it('allows nothing for a quote in another file', () => {
    const line = `make the ${OLD} site`;
    expect(judge('docs/other.md', line, [QUOTE])).toEqual({
      findings: [`docs/other.md:1:10: ${line}`],
      allowed: {},
    });
  });

  it('counts an occurrence once, under the first allowance that covers it', () => {
    const line = `make the ${OLD} site`;
    const quoted: Allowance = {
      kind: 'quote',
      path: 'docs/old.md',
      quote: line,
      reason: 'their words',
    };
    expect(judge('docs/old.md', line, [FILE, quoted])).toEqual({
      findings: [],
      allowed: { [keyOf(FILE)]: 1 },
    });
  });
});

describe('linesNaming (#356)', () => {
  it('counts the lines naming the old name in any case, once each', () => {
    const UPPER = OLD_NAME.toUpperCase();
    expect(
      linesNaming(
        [`${OLD_NAME} ${OLD}`, 'clean', UPPER, `${OLD}Golden`].join('\n'),
      ),
    ).toBe(3);
  });
});

describe('readText (#356)', () => {
  it('returns the text of valid UTF-8', () => {
    expect(readText('a.md', new TextEncoder().encode('café'))).toEqual({
      text: 'café',
    });
  });

  it('refuses a file holding a NUL byte, by name', () => {
    expect(readText('a.bin', Uint8Array.of(0x61, 0, 0x62))).toEqual({
      refused: 'a.bin: holds a NUL byte, so it is not text',
    });
  });

  it('refuses a file that is not valid UTF-8, by name', () => {
    expect(readText('a.txt', Uint8Array.of(0x61, 0xff))).toEqual({
      refused: 'a.txt: is not valid UTF-8',
    });
  });
});

/**
 * Every file the walk finds, read and judged once, on first use inside a
 * test: nothing reaches the file system while the file is collected.
 */
let repo:
  | {
      files: string[];
      refused: string[];
      findings: string[];
      allowed: Record<string, number>;
      naming: Map<string, number>;
    }
  | undefined;
const repository = () => {
  if (repo !== undefined) return repo;
  const files = walkTree();
  const refused: string[] = [];
  const findings: string[] = [];
  const allowed: Record<string, number> = {};
  const naming = new Map<string, number>();
  for (const path of files) {
    const reading = readText(path, readFileSync(path));
    if ('refused' in reading) {
      refused.push(reading.refused);
      continue;
    }
    const verdict = judge(path, reading.text);
    findings.push(...verdict.findings);
    for (const [key, count] of Object.entries(verdict.allowed))
      allowed[key] = (allowed[key] ?? 0) + count;
    const lines = linesNaming(reading.text);
    if (lines > 0) naming.set(path, lines);
  }
  repo = { files, refused, findings, allowed, naming };
  return repo;
};

/** A git that counts its own runs, first on PATH for one call (#432). */
const countingGit = (): { dir: string; runs: () => number } => {
  const real = (process.env['PATH'] ?? '')
    .split(':')
    .map((dir) => join(dir, 'git'))
    .find((path) => existsSync(path));
  if (real === undefined) throw new Error('no git on PATH');
  const dir = mkdtempSync(join(tmpdir(), 'counting-git-'));
  const log = join(dir, 'runs.log');
  writeFileSync(log, '');
  writeFileSync(
    join(dir, 'git'),
    `#!/bin/sh\necho run >> '${log}'\nexec '${real}' "$@"\n`,
  );
  chmodSync(join(dir, 'git'), 0o755);
  return {
    dir,
    runs: () =>
      readFileSync(log, 'utf8')
        .split('\n')
        .filter((line) => line !== '').length,
  };
};

/** A repository of `depth` nested directories, each with a file, and two ignored paths. */
const nestedRepository = (depth: number): string => {
  const root = mkdtempSync(join(tmpdir(), 'walk-tree-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(join(root, '.gitignore'), 'ignored-dir/\n*.log\n');
  let dir = root;
  for (let level = 0; level < depth; level += 1) {
    dir = join(dir, `d${String(level)}`);
    mkdirSync(dir);
    writeFileSync(join(dir, 'kept.txt'), 'x');
  }
  mkdirSync(join(root, 'ignored-dir'));
  writeFileSync(join(root, 'ignored-dir', 'inside.txt'), 'x');
  writeFileSync(join(root, 'd0', 'noise.log'), 'x');
  return root;
};

describe('walkTree (#432)', () => {
  it('spawns git once, however many directories it walks', () => {
    const root = nestedRepository(12);
    const git = countingGit();
    const path = process.env['PATH'];
    process.env['PATH'] = `${git.dir}:${path ?? ''}`;
    try {
      walkTree(root);
    } finally {
      process.env['PATH'] = path;
      rmSync(root, { recursive: true, force: true });
    }
    const runs = git.runs();
    rmSync(git.dir, { recursive: true, force: true });
    expect(runs).toBe(1);
  });

  it('leaves out an ignored directory whole and an ignored file, and keeps the rest', () => {
    const root = nestedRepository(3);
    // Unreadable, so a walk that enters an ignored directory throws: it must
    // skip it whole, not read it and drop each file inside.
    const ignored = join(root, 'ignored-dir');
    chmodSync(ignored, 0o000);
    try {
      // The lock holds for this user (CI runs as 1001, not root): proved, not assumed.
      expect(() => readdirSync(ignored)).toThrow(/EACCES/);
      expect(walkTree(root)).toEqual([
        '.gitignore',
        'd0/d1/d2/kept.txt',
        'd0/d1/kept.txt',
        'd0/kept.txt',
      ]);
    } finally {
      chmodSync(ignored, 0o755);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the repository names the game Yawelo Idle (#356)', () => {
  it('walks every file git has, reads each, and finds the old name only where an allowance covers it', () => {
    const { files, refused, findings } = repository();
    // Control c: the walk against git's own list of the same files.
    const walk = walkDisagreements(files, committableFiles());
    expect(
      searched(walk, { of: files, what: 'walked files' }),
      walk.join('\n'),
    ).toEqual([]);
    expect(
      searched(refused, { of: files, what: 'walked files' }),
      refused.join('\n'),
    ).toEqual([]);
    expect(
      searched(findings, { of: files, what: 'walked files' }),
      findings.join('\n'),
    ).toEqual([]);
    expect(floorBreach('old-name/files', files.length)).toBeUndefined();
  });

  it('reads as many lines naming it in each file as git grep counts', () => {
    const { naming } = repository();
    // Control c, per file: git's own count of the same lines, sharing no
    // code with the reader.
    const grep = gitGrepCounts();
    const named = [...new Set([...naming.keys(), ...grep.keys()])].sort();
    const misread = named
      .filter((path) => (naming.get(path) ?? 0) !== (grep.get(path) ?? 0))
      .map(
        (path) =>
          `${path}: git grep counts ${String(grep.get(path) ?? 0)}, the reader ${String(naming.get(path) ?? 0)}`,
      );
    expect(
      searched(misread, { of: named, what: 'files naming the old name' }),
      misread.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('old-name/files-naming-it', named.length),
    ).toBeUndefined();
  });
});

describe('every allowance still covers an occurrence (#356)', () => {
  it('names each allowance once', () => {
    const keys = ALLOWANCES.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
    // An empty list holds no duplicate either: the floor proves it is read.
    expect(floorBreach('old-name/allowances', keys.length)).toBeUndefined();
  });

  for (const key of ALLOWANCE_KEYS)
    it(`${key} covers an occurrence`, () => {
      expect(repository().allowed[key] ?? 0).toBeGreaterThan(0);
    });
});
