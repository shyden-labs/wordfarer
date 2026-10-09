import { readFileSync, statSync } from 'node:fs';
import ts from 'typescript';
import {
  CopyLine,
  type Figure,
  type Source,
} from '../../apps/site/src/copy-line';
import { isIgnored } from './tracked-files';

/**
 * Readers for `site-copy.test.ts` (#334): the walk over the site's copy and
 * the resolver that checks each source names something real.
 */

export interface Leaves {
  /** Every sourced line with text, by its path in the copy. */
  readonly lines: readonly { readonly path: string; readonly line: CopyLine }[];
  /** Every text in the copy, sourced or not, by path: the population. */
  readonly leaves: readonly string[];
  /** Texts that are not a sourced line with words in it: the findings. */
  readonly loose: readonly string[];
  /** Every figure read from the game, by its line's path. */
  readonly figures: readonly {
    readonly path: string;
    readonly figure: Figure;
  }[];
}

/**
 * Walks the copy tree. A `CopyLine` is a leaf; a bare string is a leaf with
 * no source, so it is loose; objects and arrays are walked. Anything else is
 * refused by path rather than skipped, so a shape the walk does not know
 * cannot hide a text from it.
 */
export function copyLeaves(tree: unknown): Leaves {
  const lines: { path: string; line: CopyLine }[] = [];
  const leaves: string[] = [];
  const loose: string[] = [];
  const figures: { path: string; figure: Figure }[] = [];
  const walk = (value: unknown, path: string): void => {
    if (value instanceof CopyLine) {
      leaves.push(path);
      for (const figure of value.figures) figures.push({ path, figure });
      if (value.text.trim() === '') loose.push(path);
      else lines.push({ path, line: value });
    } else if (typeof value === 'string') {
      leaves.push(path);
      loose.push(path);
    } else if (Array.isArray(value)) {
      for (const [index, item] of value.entries())
        walk(item, join(path, String(index)));
    } else if (isPlainObject(value)) {
      for (const [key, item] of Object.entries(value))
        walk(item, join(path, key));
    } else {
      const kind = value === null ? 'null' : typeof value;
      throw new Error(`${path}: a ${kind} is not copy`);
    }
  };
  walk(tree, '');
  return { lines, leaves, loose, figures };
}

const join = (path: string, key: string): string =>
  path === '' ? key : `${path}.${key}`;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype;

export interface SpecDocs {
  /** The parent design spec's text. */
  readonly parent: string;
  /** The website design spec's text. */
  readonly site: string;
  /** Whether git tracks or would track a path: one path at a time, so no test reads the whole tree's list (#515). */
  readonly files: { has(path: string): boolean };
}

const PARENT = 'docs/superpowers/specs/2026-10-01-yawelo-idle-design.md';
const SITE = 'docs/superpowers/specs/2026-10-04-website-design.md';

/** Whether `path` names a file on disk; a directory or nothing is not one. */
const isFile = (path: string): boolean =>
  statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;

export function readSpecDocs(): SpecDocs {
  return {
    parent: readFileSync(PARENT, 'utf8'),
    site: readFileSync(SITE, 'utf8'),
    files: { has: (path) => isFile(path) && !isIgnored(path) },
  };
}

/**
 * Whether a source names something that exists: a section heading, a row of
 * a decision table, a do-not-list row (in the parent's §9 only), an issue a
 * spec cites, or a tracked file. A spelling it does not know is refused.
 */
export const resolves = (source: Source, docs: SpecDocs): boolean =>
  sourceText(source, docs) !== undefined;

/**
 * What a source says, so a line's figures and names can be checked against
 * it (#443): a section from its heading to the next heading of its level or
 * above, a decision's row, a do-not row inside the parent's §9, a tracked
 * file's text. An issue a spec cites is real but its words are not in the
 * repo, so it says nothing (''), and a figure or name only an issue states
 * cannot pass. `undefined` is a source that names nothing.
 */
export function sourceText(source: Source, docs: SpecDocs): string | undefined {
  const section = /^(parent|site) §(\d+(?:\.\d+)*)$/u.exec(source);
  if (section)
    return sectionText(
      section[1] === 'parent' ? docs.parent : docs.site,
      section[2] ?? '',
    );
  const decision = /^([DW])(\d+)$/u.exec(source);
  if (decision)
    return rowText(
      decision[1] === 'D' ? docs.parent : docs.site,
      `${decision[1] ?? ''}${decision[2] ?? ''}`,
    );
  const doNot = /^DN(\d+)$/u.exec(source);
  if (doNot)
    return rowText(sectionText(docs.parent, '9') ?? '', doNot[1] ?? '');
  const issue = /^#(\d+)$/u.exec(source);
  if (issue) {
    const cited = new RegExp(`#${issue[1] ?? ''}(?!\\d)`, 'u');
    return cited.test(withoutCodeSpans(docs.parent)) ||
      cited.test(withoutCodeSpans(docs.site))
      ? ''
      : undefined;
  }
  if (source.startsWith('file:')) {
    const path = source.slice(5);
    return docs.files.has(path) ? readFileSync(path, 'utf8') : undefined;
  }
  return undefined;
}

const escape = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * The text with its inline code spans removed: an issue named in code, like
 * the website spec's review log planting `#9999` as a control, is quoted,
 * not cited.
 */
const withoutCodeSpans = (doc: string): string =>
  doc.replace(/`[^`\n]*`/gu, '');

/** The Markdown table row whose first cell is exactly `key`. */
const rowText = (doc: string, key: string): string | undefined =>
  new RegExp(`^\\| ${escape(key)} +\\|.*$`, 'mu').exec(doc)?.[0];

/**
 * A section's text: `## 3. Core loop` for `3`, `### 3.4 Review` for `3.4`,
 * from its heading to the next heading of the same level or above.
 */
function sectionText(doc: string, number: string): string | undefined {
  const lines = doc.split('\n');
  const heading = new RegExp(`^(#{2,4}) ${escape(number)}\\.? `, 'u');
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return undefined;
  const level = heading.exec(lines[start] ?? '')?.[1]?.length ?? 2;
  const end = lines.findIndex(
    (l, i) => i > start && new RegExp(`^#{2,${String(level)}} `, 'u').test(l),
  );
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

/**
 * How many `line(` calls a source file makes, read from its parse tree, so a
 * comment or a string naming the helper is not counted: the cross-check on
 * the walk, counting the same lines another way.
 */
export function lineCallCount(text: string): number {
  const file = ts.createSourceFile(
    'copy.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'line'
    )
      count += 1;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

/**
 * The words a figure may be written in, and the value each stands for (#443
 * AC4). A figure typed into the copy in one of these forms, or in digits,
 * must appear in a source the line cites, as digits or as words.
 */
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  half: 0.5,
  halves: 0.5,
  quarter: 0.25,
  quarters: 0.25,
  thirds: 3,
  fifths: 5,
  tenths: 10,
  once: 1,
  twice: 2,
  both: 2,
  dozen: 12,
  hundred: 100,
  thousand: 1000,
};

/** Phrases that state an amount of time, matched as they are written. */
export const TIME_PHRASES: readonly string[] = [
  'a day',
  'a week',
  'a month',
  'a year',
];

const DIGITS = String.raw`\d+(?:\.\d+)*`;
const FIGURE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(` +
    [...TIME_PHRASES, DIGITS, ...Object.keys(NUMBER_WORDS)].join('|') +
    String.raw`)(?![\p{L}\p{N}])`,
  'giu',
);

/** Every figure in a text: digits, figure words and time phrases. */
export const figureTokens = (text: string): string[] =>
  [...text.matchAll(FIGURE)].map(([, token = '']) =>
    /^\d/u.test(token) ? token : token.toLowerCase(),
  );

const SPLIT = /[^\p{L}\p{N}.]+/u;
const TIME_WORDS = new Set(TIME_PHRASES.map((p) => p.split(' ')[1]));

/**
 * The second reader: the same figures found word by word, not by one
 * pattern, as the cross-check on `figureTokens`.
 */
export function figureTokensByWord(text: string): string[] {
  const words = text
    .split(/\s+/u)
    .flatMap((raw) => raw.split(SPLIT))
    .map((w) => w.replace(/^\.+|\.+$/gu, ''))
    .filter((w) => w !== '');
  const tokens: string[] = [];
  for (const [i, word] of words.entries()) {
    const lower = word.toLowerCase();
    const next = words[i + 1]?.toLowerCase();
    if (lower === 'a' && next !== undefined && TIME_WORDS.has(next))
      tokens.push(`a ${next}`);
    else if (/^\d+(?:\.\d+)*$/u.test(word)) tokens.push(word);
    else if (Object.hasOwn(NUMBER_WORDS, lower)) tokens.push(lower);
  }
  return tokens;
}

const NAME = /(?<![\p{L}\p{N}])\p{Lu}[\p{L}\p{N}]*(?:[+\-.][\p{L}\p{N}]+)*/gu;
const SENTENCE_END = /(?:^|[.!?:])\s*$/u;

/**
 * Every name in a text: a word that starts with a capital where a sentence
 * does not start (the line's first word, and after `.`, `!`, `?` or `:`).
 */
export const nameTokens = (text: string): string[] =>
  [...text.matchAll(NAME)]
    .filter((m) => !SENTENCE_END.test(text.slice(0, m.index)))
    .map(([name]) => name);

/** The second reader: the same names found word by word. */
export function nameTokensByWord(text: string): string[] {
  const names: string[] = [];
  let opens = true;
  for (const raw of text.split(/\s+/u).filter((w) => w !== '')) {
    const word = raw.replace(/^[^\p{L}\p{N}]+/u, '');
    const name = /^\p{Lu}[\p{L}\p{N}]*(?:[+\-.][\p{L}\p{N}]+)*/u.exec(word);
    // A capital that opens a sentence is not a name; one behind a bracket
    // or a quote is, as the pattern reader sees it.
    if (name && !(opens && word === raw)) names.push(name[0]);
    opens = /[.!?:]$/u.test(raw);
  }
  return names;
}

const valueOf = (token: string): number | string =>
  /^\d/u.test(token) ? Number(token) : (NUMBER_WORDS[token] ?? token);

/** Whether a source states the figure, in digits or in words. */
export const attestedFigure = (
  token: string,
  texts: readonly string[],
): boolean =>
  texts.some((text) =>
    figureTokens(text).some((found) => valueOf(found) === valueOf(token)),
  );

/** Whether a source names the name, as a whole word, case and all. */
export const attestedName = (
  token: string,
  texts: readonly string[],
): boolean => {
  const whole = new RegExp(
    String.raw`(?<![\p{L}\p{N}])${escape(token)}(?![\p{L}\p{N}])`,
    'u',
  );
  return texts.some((text) => whole.test(text));
};

const FIGURE_CALLS = new Set([
  'digits',
  'duration',
  'words',
  'rankName',
  'rankList',
]);

/**
 * How many figure calls a source file makes, read from its parse tree: the
 * cross-check on the walk's figures.
 */
export function figureCallCount(text: string): number {
  const file = ts.createSourceFile(
    'copy.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      FIGURE_CALLS.has(node.expression.text)
    )
      count += 1;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}
