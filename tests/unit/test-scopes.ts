import ts from 'typescript';
import { callbackOf, kindOf, titleOf } from './one-test-per-case';

/**
 * Where an assertion sits, for the meta-guards that list what they find by
 * `file › test title as written` (#361, #378): the innermost test body around
 * it (every form `kindOf` reads as a test), else the innermost named
 * function. Anywhere else (a hook, module level, an anonymous callback
 * outside a test) is no place, which each guard refuses by line.
 */
export interface Place {
  readonly scope: 'test' | 'function';
  /** The test's title as written, or the function's name. */
  readonly label: string;
  /** The test body or the function itself. */
  readonly node: ts.Node;
}

export const isFunction = (
  node: ts.Node,
): node is ts.ArrowFunction | ts.FunctionExpression =>
  ts.isArrowFunction(node) || ts.isFunctionExpression(node);

/** Every test body in `sf` to its title, in source order. */
export function testBodiesIn(sf: ts.SourceFile): Map<ts.Node, string> {
  const bodies = new Map<ts.Node, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && kindOf(node) === 'test') {
      const callback = callbackOf(node);
      if (callback) bodies.set(callback, titleOf(sf, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return bodies;
}

/** A function's own name, when it has one to be listed by. */
export function nameOf(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
    return node.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
  if (!isFunction(node)) return undefined;
  const holder = node.parent;
  if (
    (ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder)) &&
    holder.initializer === node &&
    ts.isIdentifier(holder.name)
  )
    return holder.name.text;
  return undefined;
}

/**
 * The place of `at`: the innermost test body or named function around it,
 * with `bodies` from `testBodiesIn`; undefined when it sits in neither.
 */
export function placeOf(
  at: ts.Node,
  bodies: ReadonlyMap<ts.Node, string>,
): Place | undefined {
  for (let scope = at.parent; !ts.isSourceFile(scope); scope = scope.parent) {
    const title = bodies.get(scope);
    if (title !== undefined)
      return { scope: 'test', label: title, node: scope };
    const name = nameOf(scope);
    if (name !== undefined)
      return { scope: 'function', label: name, node: scope };
  }
  return undefined;
}

const EXPECT = 'expect';

/**
 * The `expect(…)` call an assertion starts from, and whether `.not` sits
 * between it and the matcher: `expect(x).not.toContain(y)`, or
 * `expect.soft(x)`. Undefined for any other callee.
 */
export function expectationOf(
  matcher: ts.PropertyAccessExpression,
): { expectation: ts.CallExpression; negated: boolean } | undefined {
  let target = matcher.expression;
  let negated = false;
  if (ts.isPropertyAccessExpression(target) && target.name.text === 'not') {
    negated = true;
    target = target.expression;
  }
  if (!ts.isCallExpression(target)) return undefined;
  const callee = target.expression;
  const isExpect =
    (ts.isIdentifier(callee) && callee.text === EXPECT) ||
    (ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === EXPECT &&
      callee.name.text === 'soft');
  return isExpect ? { expectation: target, negated } : undefined;
}
