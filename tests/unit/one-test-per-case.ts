import ts from 'typescript';
import { lineOf } from './line-of';

/** A loop inside one test that asserts, or changes page state, on each pass. */
export interface LoopedCase {
  /** The test's title, as written in the source. */
  readonly test: string;
  /** The loop's header, whitespace collapsed: `for (const x of XS)`. */
  readonly loop: string;
  /** 1-based line of the loop, for a human to open. */
  readonly line: number;
}

/**
 * Playwright calls that change what the page is on each pass: a navigation,
 * new content, a new page or context, or a change of viewport or media.
 * Matched as a call's own name, bare or as a method.
 */
const PAGE_STATE = new Set([
  'goto',
  'reload',
  'setContent',
  'setViewportSize',
  'emulateMedia',
  'newPage',
  'newContext',
]);

/** The two loops allowed inside a test, each declared with its reason. */
const MARKERS = ['runtime population:', 'one scenario:'];

/** Array methods that run their function argument once per element. */
const ITERATING = new Set(['forEach', 'map', 'every', 'some']);

/** Run modifiers of `it`/`test`. Members that declare no test are in NOT_TESTS. */
const TEST_MODIFIERS = new Set([
  'only',
  'skip',
  'fails',
  'concurrent',
  'fixme',
  'fail',
  'slow',
]);

/** Table forms, called with a table and then with the title: `it.each(XS)('t', fn)`. */
const TABLE_FORMS = new Set(['each', 'for']);

/** Members of `it`/`test` that declare no test: suites, hooks, steps and fixtures. */
const NOT_TESTS = new Set([
  'describe',
  'beforeAll',
  'beforeEach',
  'afterAll',
  'afterEach',
  'step',
  'use',
  'extend',
  'info',
  'setTimeout',
  'todo',
]);

const isTestName = (node: ts.Expression): boolean =>
  ts.isIdentifier(node) && (node.text === 'it' || node.text === 'test');

/** The members of a chain rooted at `it` or `test` (`['skip', 'each']` for `it.skip.each`), or null. */
const membersOf = (callee: ts.Expression): string[] | null => {
  const members: string[] = [];
  let at = callee;
  while (ts.isPropertyAccessExpression(at)) {
    members.unshift(at.name.text);
    at = at.expression;
  }
  return isTestName(at) ? members : null;
};

const isFunction = (
  node: ts.Node | undefined,
): node is ts.ArrowFunction | ts.FunctionExpression =>
  node !== undefined &&
  (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

/**
 * A Playwright annotation, `test.skip(condition, reason)` or `test.slow()`:
 * a modifier called with no body and no title, or with a predicate first.
 */
const isAnnotation = (call: ts.CallExpression): boolean => {
  const [first] = call.arguments;
  if (isFunction(first)) return true;
  return (
    !call.arguments.some(isFunction) &&
    (first === undefined ||
      !(
        ts.isStringLiteral(first) ||
        ts.isTemplateExpression(first) ||
        ts.isNoSubstitutionTemplateLiteral(first)
      ))
  );
};

/**
 * What a call on `it` or `test` is: a test; the inner call of a table form,
 * awaiting its title; another member (a suite, a hook, an annotation); one
 * the reader does not know, which is refused rather than skipped; or no call
 * on `it` or `test` at all.
 */
export type Kind = 'test' | 'table' | 'other' | 'unknown' | 'none';

export const kindOf = (call: ts.CallExpression): Kind => {
  const callee = call.expression;
  if (ts.isCallExpression(callee))
    return kindOf(callee) === 'table' ? 'test' : 'none';
  const members = membersOf(callee);
  if (members === null) return 'none';
  const [first = '', ...rest] = members;
  if (members.length === 0) return 'test';
  if (NOT_TESTS.has(first)) return 'other';
  const last = rest.at(-1) ?? first;
  const table = TABLE_FORMS.has(last);
  const modifiers = table ? members.slice(0, -1) : members;
  if (!modifiers.every((member) => TEST_MODIFIERS.has(member)))
    return 'unknown';
  if (table) return 'table';
  return isAnnotation(call) ? 'other' : 'test';
};

/**
 * A test's body: its first function argument. Not its last, since Vitest
 * takes a timeout or options after the body as well as before it.
 */
export const callbackOf = (
  call: ts.CallExpression,
): ts.ArrowFunction | ts.FunctionExpression | null =>
  call.arguments.find(isFunction) ?? null;

/** A title as written: a template keeps its `${…}`, so an entry naming it is stable. */
export const titleOf = (sf: ts.SourceFile, call: ts.CallExpression): string => {
  const first = call.arguments[0];
  if (!first) return '';
  if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))
    return first.text;
  return first.getText(sf).replace(/^`|`$/g, '');
};

/** The identifier a call chain starts from: `expect` for `expect.soft(x).not.toBe(y)`. */
export const chainRoot = (call: ts.CallExpression): string => {
  let at: ts.Expression = call.expression;
  while (ts.isPropertyAccessExpression(at) || ts.isCallExpression(at))
    at = at.expression;
  return ts.isIdentifier(at) ? at.text : '';
};

const ownName = (call: ts.CallExpression): string => {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
};

/** Whether `node` asserts, or changes page state, anywhere inside it. */
const actsPerPass = (node: ts.Node): boolean => {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(child) &&
      (chainRoot(child) === 'expect' || PAGE_STATE.has(ownName(child)))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
};

/** A line comment's own text: its two marker characters and outer space dropped. */
const lineCommentText = (sf: ts.SourceFile, range: ts.CommentRange): string =>
  range.kind === ts.SyntaxKind.SingleLineCommentTrivia
    ? sf.text.slice(range.pos + 2, range.end).trim()
    : '';

/**
 * The statement holding `node` (itself when it is one), never past the
 * function it sits in: in a one-line test, the statement above the loop is
 * the test call, and a marker there must not cover the loop inside it.
 */
const statementOf = (node: ts.Node): ts.Node => {
  for (let at: ts.Node = node; !ts.isSourceFile(at); at = at.parent) {
    if (ts.isStatement(at)) return at;
    if (ts.isFunctionLike(at)) break;
  }
  return node;
};

/** Whether a marker with a reason sits in a line comment directly above `node` or its statement. */
const declared = (sf: ts.SourceFile, node: ts.Node): boolean =>
  [node, statementOf(node)].some((at) =>
    (ts.getLeadingCommentRanges(sf.text, at.getFullStart()) ?? []).some(
      (range) => {
        const text = lineCommentText(sf, range);
        return MARKERS.some(
          (marker) =>
            text.startsWith(marker) && text.slice(marker.length).trim() !== '',
        );
      },
    ),
  );

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** A loop's header and the body run on each pass, or null for anything else. */
const loopParts = (
  sf: ts.SourceFile,
  node: ts.Node,
): { header: string; body: ts.Node } | null => {
  if (
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForStatement(node) ||
    ts.isWhileStatement(node)
  )
    return {
      header: collapse(
        sf.text.slice(node.getStart(sf), node.statement.getStart(sf)),
      ),
      body: node.statement,
    };
  if (ts.isDoStatement(node))
    return {
      header: collapse(`do … while (${node.expression.getText(sf)})`),
      body: node.statement,
    };
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    !ITERATING.has(node.expression.name.text)
  )
    return null;
  const callback = node.arguments[0];
  return callback &&
    (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
    ? {
        header: collapse(`${node.expression.getText(sf)}(…)`),
        body: callback,
      }
    : null;
};

/**
 * What the detector read in one file. The verdict carries its own population,
 * so an empty `looped` can be told from a reader that saw nothing (Refs #82).
 */
export interface TestScan {
  /** Test calls read: `it` and `test`, their run modifiers and table forms. */
  readonly tests: number;
  /** The same test calls, as `line N: callee('title')` (#367). */
  readonly testCalls: readonly string[];
  /** Calls on `it` or `test` the reader classified, of any kind: what it searched. */
  readonly examined: number;
  /**
   * Every loop inside a test body that asserts, or changes page state, on
   * each pass, unless a marker declares it a runtime population or one
   * scenario. A loop OUTSIDE a test that generates one test per case is the
   * shape this asks for, so it is never reported.
   */
  readonly looped: LoopedCase[];
  /** Calls on `it` or `test` the reader could not read, by line: refused, never skipped. */
  readonly unclassified: string[];
}

export function scanTests(source: string, fileName: string): TestScan {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const cases: LoopedCase[] = [];
  const unclassified: string[] = [];
  const testCalls: string[] = [];
  let examined = 0;
  const inTest = (title: string, node: ts.Node): void => {
    const loop = loopParts(sf, node);
    if (loop && actsPerPass(loop.body) && !declared(sf, node))
      cases.push({
        test: title,
        loop: loop.header,
        line: lineOf(sf, node),
      });
    ts.forEachChild(node, (child) => {
      inTest(title, child);
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const kind = kindOf(node);
      const callee = node.expression.getText(sf);
      if (kind !== 'none') examined += 1;
      if (kind === 'unknown')
        unclassified.push(
          `line ${String(lineOf(sf, node))}: ${callee} is neither a test form nor a known non-test`,
        );
      if (kind === 'test') {
        const callback = callbackOf(node);
        if (callback) {
          testCalls.push(
            `line ${String(lineOf(sf, node))}: ${callee}('${titleOf(sf, node)}')`,
          );
          inTest(titleOf(sf, node), callback.body);
          return;
        }
        unclassified.push(
          `line ${String(lineOf(sf, node))}: ${callee}('${titleOf(sf, node)}') has no inline body to read`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return {
    tests: testCalls.length,
    testCalls,
    examined,
    looped: cases,
    unclassified,
  };
}
