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
 * Every call named `it`, `test`, `describe`, `suite` or a hook is judged,
 * wherever the name comes from: Vitest, a helper module, a re-export, or a
 * local `test.extend(...)`. Nothing is left unjudged (operator, 2026-10-09:
 * "everything needs to be checked"), so the forms that would hide a call are
 * refused instead: a file's own binding of one of those names that is not
 * built with `.extend` (rename it), an import that renames a test name, and
 * a namespace import of vitest. A declaration named like one (a method
 * signature `describe(...)`) has no call to judge and is counted in
 * `declarations`, so the guard's text count is met by
 * `sites + declarations`.
 *
 * `sites` counts what was judged, refused or not: each test, suite and hook
 * call, each `vi.setConfig`, each limit key set.
 */

export const UNIT_LIMIT_MS = 1_000;

export interface LimitReading {
  findings: string[];
  sites: number;
  declarations: number;
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
const NAMES = new Set([...TESTS, ...HOOKS, 'vi']);
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
  let declarations = 0;
  const refuse = (node: ts.Node, problem: string): void => {
    findings.push(`${sf.fileName}:${String(lineOf(sf, node))}: ${problem}`);
  };

  // Imports that would hide a test call: a renamed test name, or vitest as
  // a namespace.
  for (const statement of sf.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      if (statement.moduleSpecifier.text === 'vitest')
        refuse(
          bindings,
          `import * as ${bindings.name.text} from 'vitest' cannot be read for limits`,
        );
      continue;
    }
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text;
      const local = element.name.text;
      if (
        imported !== undefined &&
        imported !== local &&
        (NAMES.has(imported) || NAMES.has(local))
      )
        refuse(
          element,
          `import { ${imported} as ${local} } renames a test name, so its calls cannot be told apart; import it under its own name`,
        );
    }
  }

  // The file's own bindings of a test or hook name: built with
  // `<test>.extend(...)` is a test; anything else shadows Vitest's.
  const shadowed = new Set<string>();
  const isExtend = (node: ts.Expression | undefined): boolean => {
    if (node === undefined || !ts.isCallExpression(node)) return false;
    const chain = chainOf(node.expression);
    return (
      chain !== null &&
      TESTS.has(chain.root.text) &&
      chain.members.at(-1) === 'extend'
    );
  };
  const bind = (node: ts.Node): void => {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isClassDeclaration(node)) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name) &&
      NAMES.has(node.name.text) &&
      !(ts.isVariableDeclaration(node) && isExtend(node.initializer))
    )
      shadowed.add(node.name.text);
    ts.forEachChild(node, bind);
  };
  bind(sf);

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
    const name = chain.root.text;
    const isTest = TESTS.has(name);
    const isHook = HOOKS.has(name) && chain.members.length === 0;
    if (!isTest && !isHook) return;
    sites += 1;
    if (shadowed.has(name)) {
      refuse(
        node,
        `${name}: the file’s own ${name} shadows Vitest’s; rename it so every test call can be judged`,
      );
      return;
    }
    if (isTest) testCall(node, [name, ...chain.members].join('.'));
    else hookCall(node, name);
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
      declarations += 1;
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'setConfig' &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'vi'
    ) {
      sites += 1;
      refuse(node, 'vi.setConfig changes a limit at run time');
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
  return { findings, sites, declarations };
}
