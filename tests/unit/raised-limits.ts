import ts from 'typescript';
import { lineOf } from './line-of';

/**
 * Every way a unit test file or a unit config raises a limit (#477 AC3),
 * read from the parse tree. Every unit test runs in under 1 s and no limit is
 * ever raised (global rule, 2026-10-07): a slow test has its work cut.
 *
 * Refused: a third argument to a test or suite that is not its body or
 * readable options; `{ timeout }` in its options, or options it cannot read
 * (named, or spread); a second argument to a hook; `vi.setConfig`, called or
 * named; `testTimeout`, `hookTimeout` or `teardownTimeout` set to anything but
 * a number from 1 to the limit (0 turns the limit off); a namespace import of
 * vitest, whose calls it cannot place.
 *
 * Tests, suites, hooks and `vi` are Vitest's when the file imports them from
 * 'vitest' (the unit config sets no globals), under any local name. A call or
 * declaration that spells one of those names but is the file's own (a fixture
 * builder named `suite`, a method named `describe`) is counted in `others`, so
 * the guard's text count is met by `sites + others`.
 *
 * `sites` counts what was judged, refused or not: each test, suite and hook
 * call, each `vi.setConfig`, each limit key set.
 */

export const UNIT_LIMIT_MS = 1_000;

export interface LimitReading {
  findings: string[];
  sites: number;
  others: number;
}

const TESTS = new Set(['it', 'test', 'describe', 'suite']);
const HOOKS = new Set([
  'beforeAll',
  'afterAll',
  'beforeEach',
  'afterEach',
  'onTestFinished',
  'onTestFailed',
]);
const LIMIT_KEYS = new Set(['testTimeout', 'hookTimeout', 'teardownTimeout']);

const isFunction = (node: ts.Node): boolean =>
  ts.isArrowFunction(node) || ts.isFunctionExpression(node);

const keyOf = (element: ts.ObjectLiteralElementLike): string | null => {
  const name = element.name;
  if (name === undefined) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (
    ts.isComputedPropertyName(name) &&
    ts.isStringLiteralLike(name.expression)
  )
    return name.expression.text;
  return null;
};

const withinLimit = (node: ts.Expression): boolean => {
  if (!ts.isNumericLiteral(node)) return false;
  const value = Number(node.text.replaceAll('_', ''));
  return value >= 1 && value <= UNIT_LIMIT_MS;
};

/** The head of a table or condition form, read as part of the call it returns. */
const isHead = (call: ts.CallExpression): boolean =>
  ts.isCallExpression(call.parent) && call.parent.expression === call;

/** The identifier a member chain starts from, and the members after it. */
const chainOf = (
  callee: ts.Expression,
): { root: ts.Identifier; members: string[] } | null => {
  const members: string[] = [];
  let at = callee;
  while (ts.isPropertyAccessExpression(at)) {
    members.unshift(at.name.text);
    at = at.expression;
  }
  return ts.isIdentifier(at) ? { root: at, members } : null;
};

export function raisedLimitsIn(sf: ts.SourceFile): LimitReading {
  const findings: string[] = [];
  let sites = 0;
  let others = 0;
  const refuse = (node: ts.Node, problem: string): void => {
    findings.push(`${sf.fileName}:${String(lineOf(sf, node))}: ${problem}`);
  };

  // Local name -> Vitest's name, for everything imported from 'vitest'.
  const vitest = new Map<string, string>();
  for (const statement of sf.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'vitest'
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      refuse(
        bindings,
        `import * as ${bindings.name.text} from 'vitest' cannot be read for limits`,
      );
      continue;
    }
    for (const element of bindings.elements)
      vitest.set(
        element.name.text,
        (element.propertyName ?? element.name).text,
      );
  }

  const options = (name: string, node: ts.Expression): void => {
    if (!ts.isObjectLiteralExpression(node)) {
      refuse(
        node,
        `${name}: options ${node.getText(sf)} cannot be read for a timeout`,
      );
      return;
    }
    if (node.properties.some(ts.isSpreadAssignment)) {
      refuse(
        node,
        `${name}: options with a spread cannot be read for a timeout`,
      );
      return;
    }
    if (node.properties.some((p) => keyOf(p) === 'timeout'))
      refuse(node, `${name}: { timeout } in its options sets a limit`);
  };

  const testCall = (call: ts.CallExpression, name: string): void => {
    sites += 1;
    const [, second, third] = call.arguments;
    if (second !== undefined && !isFunction(second)) options(name, second);
    if (third !== undefined && !isFunction(third)) {
      if (ts.isObjectLiteralExpression(third)) options(name, third);
      else
        refuse(
          third,
          `${name}: a third argument, ${third.getText(sf)}, sets a limit`,
        );
    }
  };

  const hookCall = (call: ts.CallExpression, name: string): void => {
    sites += 1;
    const second = call.arguments[1];
    if (second !== undefined)
      refuse(
        second,
        `${name}: a second argument, ${second.getText(sf)}, sets a limit`,
      );
  };

  const call = (node: ts.CallExpression): void => {
    // A table or condition form, `it.each([1])('t', fn)`: the chain is the head's.
    const callee = ts.isCallExpression(node.expression)
      ? node.expression.expression
      : node.expression;
    const chain = chainOf(callee);
    if (chain === null) return;
    const local = chain.root.text;
    const own = vitest.get(local);
    if (own !== undefined && TESTS.has(own))
      testCall(node, [own, ...chain.members].join('.'));
    else if (own !== undefined && HOOKS.has(own) && chain.members.length === 0)
      hookCall(node, own);
    else if (
      TESTS.has(local) ||
      (HOOKS.has(local) && chain.members.length === 0)
    )
      others += 1;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && !isHead(node)) call(node);
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isMethodSignature(node)) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name) &&
      (TESTS.has(node.name.text) || HOOKS.has(node.name.text))
    )
      others += 1;
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'setConfig' &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'vi'
    ) {
      if (vitest.get('vi') === 'vi') {
        sites += 1;
        refuse(node, 'vi.setConfig changes a limit at run time');
      } else others += 1;
    }
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      LIMIT_KEYS.has(keyOf(node) ?? '')
    ) {
      sites += 1;
      const value = ts.isPropertyAssignment(node)
        ? node.initializer
        : node.name;
      if (!withinLimit(value))
        refuse(
          node,
          `${keyOf(node) ?? ''}: ${value.getText(sf)} is not a limit from 1 to ${String(UNIT_LIMIT_MS)} ms`,
        );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { findings, sites, others };
}
