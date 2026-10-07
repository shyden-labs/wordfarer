import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ignoredPaths } from './tracked-files';

/**
 * The game's old name, and the places it may still be written (#356).
 *
 * The game was renamed "Yawelo Idle" on 2026-10-05 (#355). Every live
 * reference changed. Records of what happened keep the old name, because it
 * was true then (operator decision on #356): dated plans, the clearance
 * record, the specs' decision and review logs, and the operator's own words.
 * Infrastructure names (hosts, Workers, D1, the App, the repository, the
 * board, the local checkouts) moved with #357, so none is allowed.
 *
 * The name is assembled rather than written, so this file, which the guard
 * reads like any other, holds no occurrence of its own; a planted one turns
 * the guard red here as anywhere.
 */
export const OLD_NAME = ['Word', 'farer'].join('');
/** Its lower-case form, which every kebab and camel form starts with. */
export const OLD = OLD_NAME.toLowerCase();

/** Any case form of the old name: Title, lower, UPPER, camel, kebab. */
const occurrencesIn = (line: string): RegExpExecArray[] => [
  ...line.matchAll(new RegExp(OLD, 'gi')),
];

/** A whole file that is a record of what happened. */
export interface HistoryFile {
  readonly kind: 'history file';
  readonly path: string;
  readonly reason: string;
}

/**
 * A section of a Markdown file that is a record, named by its heading line as
 * written. It runs to the next heading of the same or a higher level; a
 * heading inside a fenced code block is code, not a heading.
 */
export interface HistorySection {
  readonly kind: 'history section';
  readonly path: string;
  readonly heading: string;
  readonly reason: string;
}

/** Someone's own words, quoted: an occurrence inside the quoted text only. */
export interface Quote {
  readonly kind: 'quote';
  readonly path: string;
  readonly quote: string;
  readonly reason: string;
}

export type Allowance = HistoryFile | HistorySection | Quote;

const PLAN = 'a dated plan: the record of how a story was built, and when';
const plan = (path: string): HistoryFile => ({
  kind: 'history file',
  path: `docs/superpowers/plans/${path}`,
  reason: PLAN,
});
const REVIEW_LOG = "the spec's review log: what each pass found, when";

/** Where the old name may stay, each with its reason. Only shrinks. */
export const ALLOWANCES: readonly Allowance[] = [
  {
    kind: 'history file',
    path: 'docs/compliance/trademark-search.md',
    reason:
      "#157's and #355's clearance record: the searches ran on the old name",
  },
  plan('2026-10-01-m0-foundations.md'),
  plan('2026-10-01-m1-26-core-foundations.md'),
  plan('2026-10-01-m1-27-encounters-time-model.md'),
  plan('2026-10-01-m2-39-dev-domains-gate.md'),
  plan('2026-10-02-m1-28-words-memory.md'),
  plan('2026-10-02-m1-29-upgrades.md'),
  plan('2026-10-03-m1-30-journeys.md'),
  plan('2026-10-03-m1-31-set-sail.md'),
  plan('2026-10-03-m1-32-grammar.md'),
  plan('2026-10-03-m1-34-event-log.md'),
  plan('2026-10-03-m1-92-import-cycles.md'),
  plan('2026-10-03-m1-97-collection-calls.md'),
  plan('2026-10-04-ci-348-every-commit.md'),
  plan('2026-10-04-m1-35-pacing-bots.md'),
  plan('2026-10-05-m1-361-floorless-searches.md'),
  plan('2026-10-05-m3-356-rename.md'),
  {
    kind: 'history section',
    path: 'docs/superpowers/specs/2026-10-01-yawelo-idle-design.md',
    heading: '## 2. Operator decisions (2026-10-01)',
    reason:
      'the decision log: D16 records the old name and why it was replaced',
  },
  {
    kind: 'history section',
    path: 'docs/superpowers/specs/2026-10-01-yawelo-idle-design.md',
    heading: '## 17. Review log',
    reason: REVIEW_LOG,
  },
  {
    kind: 'history section',
    path: 'docs/superpowers/specs/2026-10-02-content-reports-design.md',
    heading: '## F. Review log',
    reason: REVIEW_LOG,
  },
  {
    kind: 'quote',
    path: 'docs/superpowers/specs/2026-10-04-website-design.md',
    quote: `i want you to make the ${OLD} website`,
    reason: "the operator's request, 2026-10-04 11:50 UTC, quoted as written",
  },
];

/** How a verdict names an allowance. */
export const keyOf = (allowance: Allowance): string => {
  switch (allowance.kind) {
    case 'history file':
      return `history file ${allowance.path}`;
    case 'history section':
      return `history section ${allowance.path} › ${allowance.heading}`;
    case 'quote':
      return `quote ${allowance.path} › ${allowance.quote}`;
  }
};

/**
 * Every allowance's key, computed here so a test file can title a test per
 * allowance without calling into this module while it is collected.
 */
export const ALLOWANCE_KEYS: readonly string[] = ALLOWANCES.map(keyOf);

export interface Verdict {
  /** `path:line:column: line` for each occurrence no allowance covers. */
  readonly findings: readonly string[];
  /** How many occurrences each allowance covered, by `keyOf`. */
  readonly allowed: Readonly<Record<string, number>>;
}

const HEADING = /^(#{1,6})\s/;
const FENCE = /^\s*(```|~~~)/;

/**
 * For each line of a Markdown file, the listed history section it sits in,
 * if any. Any other file has no sections.
 */
const sectionsOf = (
  path: string,
  lines: readonly string[],
  sections: readonly HistorySection[],
): (HistorySection | undefined)[] => {
  if (!path.endsWith('.md')) return lines.map(() => undefined);
  const listed = sections.filter((section) => section.path === path);
  let fenced = false;
  let open: { section: HistorySection; level: number } | undefined;
  return lines.map((line) => {
    if (FENCE.test(line)) fenced = !fenced;
    const heading = fenced ? null : HEADING.exec(line);
    if (heading?.[1]) {
      const level = heading[1].length;
      if (open && level <= open.level) open = undefined;
      const section = listed.find((candidate) => candidate.heading === line);
      if (section) open = { section, level };
    }
    return open?.section;
  });
};

const insideText = (
  line: string,
  text: string,
  start: number,
  end: number,
): boolean => {
  for (let at = line.indexOf(text); at !== -1; at = line.indexOf(text, at + 1))
    if (at <= start && end <= at + text.length) return true;
  return false;
};

/**
 * Every occurrence of the old name in one file, each either covered by the
 * first allowance that covers it or reported as a finding.
 */
export function judge(
  path: string,
  text: string,
  allowances: readonly Allowance[] = ALLOWANCES,
): Verdict {
  const findings: string[] = [];
  const allowed: Record<string, number> = {};
  const allow = (allowance: Allowance): void => {
    const key = keyOf(allowance);
    allowed[key] = (allowed[key] ?? 0) + 1;
  };
  const lines = text.split('\n');
  const sections = sectionsOf(
    path,
    lines,
    allowances.filter(
      (allowance): allowance is HistorySection =>
        allowance.kind === 'history section',
    ),
  );
  lines.forEach((line, index) => {
    for (const match of occurrencesIn(line)) {
      const start = match.index;
      const end = start + match[0].length;
      const covering = allowances.find((allowance) => {
        switch (allowance.kind) {
          case 'history file':
            return allowance.path === path;
          case 'history section':
            return sections[index] === allowance;
          case 'quote':
            return (
              allowance.path === path &&
              insideText(line, allowance.quote, start, end)
            );
        }
      });
      if (covering) allow(covering);
      else
        findings.push(
          `${path}:${String(index + 1)}:${String(start + 1)}: ${line.trim()}`,
        );
    }
  });
  return { findings, allowed };
}

/** How many lines of `text` name the old name in any case. */
export const linesNaming = (text: string): number =>
  text.split('\n').filter((line) => occurrencesIn(line).length > 0).length;

export type Reading = { readonly text: string } | { readonly refused: string };

/**
 * A file's bytes as text, or a refusal naming it: a guard that skipped what
 * it could not read would pass over the one file it never judged.
 */
export function readText(path: string, bytes: Uint8Array): Reading {
  if (bytes.includes(0))
    return { refused: `${path}: holds a NUL byte, so it is not text` };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { refused: `${path}: is not valid UTF-8` };
  }
}

/**
 * Every file under `root` that git tracks or would add, found by walking the
 * file system and asking git only which names it ignores. It is the second
 * reading of `committableFiles()`, which asks git for the list itself.
 */
export function walkTree(root = '.'): string[] {
  const files: string[] = [];
  const ignored = ignoredPaths(root);
  const pending = [''];
  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    const entries = readdirSync(join(root, dir), { withFileTypes: true })
      // The repository's own store, or in a worktree the file naming it.
      .filter((entry) => entry.name !== '.git');
    const paths = entries.map((entry) =>
      dir === '' ? entry.name : `${dir}/${entry.name}`,
    );
    entries.forEach((entry, index) => {
      const path = paths[index];
      if (
        path === undefined ||
        ignored.has(entry.isDirectory() ? `${path}/` : path)
      )
        return;
      if (entry.isDirectory()) pending.push(path);
      else files.push(path);
    });
  }
  return files.sort();
}

/**
 * Lines naming the old name per file, as `git grep` counts them over tracked
 * and committable untracked files: a reading that shares no code with
 * `linesNaming`.
 */
export function gitGrepCounts(root = '.'): Map<string, number> {
  const run = spawnSync(
    'git',
    ['grep', '--untracked', '-i', '-F', '-c', '-z', '-e', OLD],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // 0: matches, 1: none; anything else is a failure, refused.
  if (run.status !== 0 && run.status !== 1)
    throw new Error(`git grep failed: ${run.stderr}`);
  const counts = new Map<string, number>();
  for (const line of run.stdout.split('\n')) {
    if (line === '') continue;
    const [path, count] = line.split('\0');
    if (path === undefined || count === undefined || !/^\d+$/.test(count))
      throw new Error(`cannot read git grep's line: ${JSON.stringify(line)}`);
    counts.set(path, Number(count));
  }
  return counts;
}
