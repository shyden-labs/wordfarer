import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { CopyLine, type Source } from '../../apps/site/src/copy-line';
import { committableFiles } from './tracked-files';

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
  const walk = (value: unknown, path: string): void => {
    if (value instanceof CopyLine) {
      leaves.push(path);
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
  return { lines, leaves, loose };
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
  /** Every path git tracks or would track. */
  readonly files: ReadonlySet<string>;
}

const PARENT = 'docs/superpowers/specs/2026-10-01-yawelo-idle-design.md';
const SITE = 'docs/superpowers/specs/2026-10-04-website-design.md';

export function readSpecDocs(): SpecDocs {
  return {
    parent: readFileSync(PARENT, 'utf8'),
    site: readFileSync(SITE, 'utf8'),
    files: new Set(committableFiles()),
  };
}

/**
 * Whether a source names something that exists: a section heading, a row of
 * a decision table, a do-not-list row (in the parent's §9 only), an issue a
 * spec cites, or a tracked file. A spelling it does not know is refused.
 */
export function resolves(source: Source, docs: SpecDocs): boolean {
  const section = /^(parent|site) §(\d+(?:\.\d+)*)$/u.exec(source);
  if (section)
    return hasHeading(
      section[1] === 'parent' ? docs.parent : docs.site,
      section[2] ?? '',
    );
  const decision = /^([DW])(\d+)$/u.exec(source);
  if (decision)
    return hasRow(
      decision[1] === 'D' ? docs.parent : docs.site,
      `${decision[1] ?? ''}${decision[2] ?? ''}`,
    );
  const doNot = /^DN(\d+)$/u.exec(source);
  if (doNot) return hasRow(sectionText(docs.parent, '9'), doNot[1] ?? '');
  const issue = /^#(\d+)$/u.exec(source);
  if (issue) {
    const cited = new RegExp(`#${issue[1] ?? ''}(?!\\d)`, 'u');
    return (
      cited.test(withoutCodeSpans(docs.parent)) ||
      cited.test(withoutCodeSpans(docs.site))
    );
  }
  if (source.startsWith('file:')) return docs.files.has(source.slice(5));
  return false;
}

const escape = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** `## 3. Core loop` for `3`, `### 3.4 Review` for `3.4`. */
const hasHeading = (doc: string, number: string): boolean =>
  new RegExp(`^#{2,4} ${escape(number)}\\.? `, 'mu').test(doc);

/**
 * The text with its inline code spans removed: an issue named in code, like
 * the website spec's review log planting `#9999` as a control, is quoted,
 * not cited.
 */
const withoutCodeSpans = (doc: string): string =>
  doc.replace(/`[^`\n]*`/gu, '');

/** A Markdown table row whose first cell is exactly `key`. */
const hasRow = (doc: string, key: string): boolean =>
  new RegExp(`^\\| ${escape(key)} +\\|`, 'mu').test(doc);

/** A top-level section's text, from its `## N.` heading to the next. */
function sectionText(doc: string, number: string): string {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${number}. `));
  if (start === -1) return '';
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
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
