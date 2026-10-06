import ts from 'typescript';
import { listFindings } from './burn-down';
import { chainRoot } from './one-test-per-case';
import {
  expectationOf,
  isFunction,
  placeOf,
  testBodiesIn,
} from './test-scopes';

/**
 * Every absence search, where it sits, and whether a floor is checked on its
 * population in the same scope (#361).
 *
 * An absence search asserts that a population holds nothing it hunts. Refusing
 * an EMPTY population (`searched`) catches a reader blind to everything; a
 * reader blind to PART of its population still passes while one unit is read.
 * Only a floor recorded in `tests/floors/` and checked for equality sees
 * that, so a scope that searches a population also checks a floor on THAT
 * population: `floorBreach(id, <of>.length)` (or `.size`, or `<of>` itself
 * for a count), `<of>` spelled as the search's `of:` spells it. A floor on
 * anything else in the same test is a token, not a check of this search.
 *
 * Two kinds of site:
 *
 * - a `searched(findings, { of, what })` call. Floored when its scope checks
 *   a floor on its `of:`.
 * - an `againstControl(run, { input, control })` call, for an input the test
 *   leaves empty on purpose (operator decision, 2026-10-05: empty input
 *   only). Proved when `input:` is an empty literal written in place and
 *   `run` is a function name, or a function of one parameter that uses it;
 *   the call itself proves the control finds something when it runs.
 * - a bare absence matcher, which names no population, so no floor can be
 *   bound to it and it is never floored: `toEqual([])`, `toStrictEqual([])`,
 *   `toEqual({})`, `toStrictEqual({})`, `toHaveLength(0)`, `.length` or
 *   `.size` to be 0, `.some(…)` to be false, `.every(…)` to be true, and a
 *   negated `toContain`, `toContainEqual` or `toMatch`. One whose subject is
 *   a `searched` or `againstControl` call, or a property of one, is that
 *   call's site, not a second one.
 *
 * Measured over the repository on 2026-10-05; a scalar `toBe(0)` or a bare
 * `toBeUndefined()` is not read, since the parse tree cannot tell an exit
 * status from a count without guessing from names.
 *
 * A `searched` call that is the whole body of a function handed to
 * `expect(…).toThrow(…)` searches nothing: it proves `searched` refuses a
 * population. It is counted as a refusal check, decided by that shape and
 * never by a label.
 *
 * There is no exemption. A site's scope is the innermost test body around it
 * (every form `kindOf` reads as a test), else the innermost named function.
 * Anywhere else (a hook, module level, an anonymous callback outside a test)
 * is refused by line, as is `searched` or `expect` imported under another
 * name, or `searched` read as a value: each is a site this reader would
 * otherwise not see.
 */
export type Form =
  'searched' | 'control' | 'empty' | 'no-match' | 'not-contained';

export interface SearchSite {
  /** 1-based line of the wrapper call, or of a bare form's `expect(`. */
  readonly line: number;
  readonly form: Form;
  readonly scope: 'test' | 'function';
  /** The test's title as written, or the function's name. */
  readonly label: string;
  /**
   * Proved live: a `searched` call whose scope checks `floorBreach` on the
   * population its `of:` names, or an `againstControl` call of the bound
   * shape. A bare form never is.
   */
  readonly proved: boolean;
}

export interface SearchReading {
  readonly sites: readonly SearchSite[];
  /** Every test body read, by title as written. */
  readonly tests: readonly string[];
  /** `searched` calls that only prove it throws. */
  readonly refusalChecks: number;
  /** Sites that sit in no test and no named function: refused. */
  readonly unplaced: number;
  /** Everything the reader could not classify, by line and why. */
  readonly refused: readonly string[];
}

const SEARCHED = 'searched';
const CONTROLLED = 'againstControl';
const WRAPPERS = [SEARCHED, CONTROLLED];
const EXPECT = 'expect';
const FLOOR = 'floorBreach';

/** Matchers whose argument says "empty": `[]` or `{}`. */
const EQUALITY = new Set(['toEqual', 'toStrictEqual']);
/** Matchers that, negated, say "no such member". */
const MEMBERSHIP = new Set(['toContain', 'toContainEqual', 'toMatch']);

/** The population a search names in `of:`, as written, or undefined. */
function populationOf(call: ts.CallExpression): ts.Expression | undefined {
  const population = call.arguments[1];
  if (!population || !ts.isObjectLiteralExpression(population))
    return undefined;
  const of = population.properties.find(
    (member) =>
      member.name !== undefined &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'of',
  );
  if (of === undefined) return undefined;
  if (ts.isPropertyAssignment(of)) return of.initializer;
  if (ts.isShorthandPropertyAssignment(of)) return of.name;
  return undefined;
}

/** Source text with every space dropped: `a .b` and `a.b` are one name. */
const spelled = (sf: ts.SourceFile, node: ts.Node): string =>
  node.getText(sf).replace(/\s+/g, '');

/**
 * True where `scope` checks a floor on the very population `call` searches:
 * `floorBreach(id, <of>.length)`, `<of>.size`, or `<of>` itself for a count,
 * `<of>` spelled as the search spells it.
 */
function floorsPopulation(
  sf: ts.SourceFile,
  scope: ts.Node,
  call: ts.CallExpression,
): boolean {
  const population = populationOf(call);
  if (population === undefined) return false;
  const of = spelled(sf, population);
  const counts = new Set([of, `${of}.length`, `${of}.size`]);
  let found = false;
  const visit = (child: ts.Node): void => {
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === FLOOR &&
      child.arguments[1] !== undefined &&
      counts.has(spelled(sf, child.arguments[1]))
    )
      found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  visit(scope);
  return found;
}

/** `''`, `[]`, `{}`, `new Map()` or `new Set()`, written in place. */
const isEmptyInput = (node: ts.Expression): boolean =>
  ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    node.text === '') ||
  isEmptyLiteral(node) ||
  (ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ['Map', 'Set'].includes(node.expression.text) &&
    (node.arguments ?? []).length === 0);

/** The initializer of `name:` in an object literal, or undefined. */
function propertyOf(
  literal: ts.Expression | undefined,
  name: string,
): ts.Expression | undefined {
  if (!literal || !ts.isObjectLiteralExpression(literal)) return undefined;
  const member = literal.properties.find(
    (each) =>
      ts.isPropertyAssignment(each) &&
      ts.isIdentifier(each.name) &&
      each.name.text === name,
  );
  return member && ts.isPropertyAssignment(member)
    ? member.initializer
    : undefined;
}

/** Whether `fn`'s body reads the identifier `name`. */
function reads(fn: ts.Node, name: string): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (ts.isIdentifier(child) && child.text === name) found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  visit(fn);
  return found;
}

/**
 * An `againstControl` call of the shape the operator decided: an empty
 * literal for `input:`, a `control:`, and a `run` that is a function's name
 * or a function of one parameter its body reads.
 */
function isBoundControl(call: ts.CallExpression): boolean {
  const [run, options] = call.arguments;
  const input = propertyOf(options, 'input');
  if (!run || !input || !propertyOf(options, 'control')) return false;
  if (!isEmptyInput(input)) return false;
  if (ts.isIdentifier(run) || ts.isPropertyAccessExpression(run)) return true;
  if (!isFunction(run) || run.parameters.length !== 1) return false;
  const [parameter] = run.parameters as unknown as [ts.ParameterDeclaration];
  return (
    ts.isIdentifier(parameter.name) && reads(run.body, parameter.name.text)
  );
}

/**
 * Whether `subject`, through any property reads and calls on it, starts
 * from a `searched` or `againstControl` call: `againstControl(…).size`.
 */
function startsFromWrapper(subject: ts.Expression): boolean {
  let at: ts.Expression = subject;
  for (;;) {
    if (ts.isCallExpression(at)) {
      if (
        ts.isIdentifier(at.expression) &&
        WRAPPERS.includes(at.expression.text)
      )
        return true;
      at = at.expression;
    } else if (ts.isPropertyAccessExpression(at)) at = at.expression;
    else return false;
  }
}

/** `name(…)` called directly by that name. */
const isCallTo = (node: ts.Node, name: string): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === name;

/** `xs.method(…)` for one of `methods`. */
const isMethodCall = (node: ts.Node, methods: readonly string[]): boolean =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  methods.includes(node.expression.name.text);

const isEmptyLiteral = (node: ts.Node | undefined): boolean =>
  node !== undefined &&
  ((ts.isArrayLiteralExpression(node) && node.elements.length === 0) ||
    (ts.isObjectLiteralExpression(node) && node.properties.length === 0));

const isZero = (node: ts.Node | undefined): boolean =>
  node !== undefined && ts.isNumericLiteral(node) && node.text === '0';

/**
 * The absence form a matcher call asserts, or undefined: the bare forms only.
 * `subject` is what `expect` was handed.
 */
function bareForm(
  name: string,
  argument: ts.Expression | undefined,
  subject: ts.Expression,
  negated: boolean,
): Form | undefined {
  if (negated) return MEMBERSHIP.has(name) ? 'not-contained' : undefined;
  if (EQUALITY.has(name) && isEmptyLiteral(argument)) return 'empty';
  if (name === 'toHaveLength' && isZero(argument)) return 'empty';
  if (
    (name === 'toBe' || EQUALITY.has(name)) &&
    isZero(argument) &&
    ts.isPropertyAccessExpression(subject) &&
    (subject.name.text === 'length' || subject.name.text === 'size')
  )
    return 'empty';
  if (name !== 'toBe' || argument === undefined) return undefined;
  if (
    argument.kind === ts.SyntaxKind.FalseKeyword &&
    isMethodCall(subject, ['some'])
  )
    return 'no-match';
  if (
    argument.kind === ts.SyntaxKind.TrueKeyword &&
    isMethodCall(subject, ['every'])
  )
    return 'no-match';
  return undefined;
}

/**
 * True where `call` is the whole body of a function handed to
 * `expect(…).toThrow(…)` or `.toThrowError(…)`, not negated.
 */
function onlyProvesItThrows(call: ts.CallExpression): boolean {
  let body: ts.Node = call;
  if (ts.isExpressionStatement(call.parent)) {
    const statement = call.parent;
    const block = statement.parent;
    if (!ts.isBlock(block) || block.statements.length !== 1) return false;
    body = block;
  }
  const fn = body.parent;
  if (!isFunction(fn) || fn.body !== body) return false;
  const expectation = fn.parent;
  if (
    !isCallTo(expectation, EXPECT) ||
    expectation.arguments[0] !== fn ||
    !ts.isPropertyAccessExpression(expectation.parent)
  )
    return false;
  const matcher = expectation.parent;
  return (
    (matcher.name.text === 'toThrow' || matcher.name.text === 'toThrowError') &&
    ts.isCallExpression(matcher.parent) &&
    matcher.parent.expression === matcher
  );
}

export function searchSitesIn(sf: ts.SourceFile): SearchReading {
  const bodies = testBodiesIn(sf);
  const sites: SearchSite[] = [];
  const refused: string[] = [];
  let refusalChecks = 0;
  let unplaced = 0;
  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const refuse = (node: ts.Node, why: string): void => {
    refused.push(`${sf.fileName}:${String(lineOf(node))}: ${why}`);
  };

  const site = (at: ts.Node, form: Form, call?: ts.CallExpression): void => {
    const place = placeOf(at, bodies);
    if (place === undefined) {
      unplaced += 1;
      refuse(at, 'a search in no test and no named function');
      return;
    }
    sites.push({
      line: lineOf(at),
      form,
      scope: place.scope,
      label: place.label,
      proved:
        call !== undefined &&
        (form === 'control'
          ? isBoundControl(call)
          : floorsPopulation(sf, place.node, call)),
    });
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportSpecifier(node) &&
      (node.propertyName ?? node.name).text !== node.name.text &&
      [...WRAPPERS, EXPECT].includes((node.propertyName ?? node.name).text)
    )
      refuse(
        node,
        `${(node.propertyName ?? node.name).text} imported under another name, ${node.name.text}`,
      );
    if (ts.isIdentifier(node) && WRAPPERS.includes(node.text)) {
      const parent = node.parent;
      const form: Form = node.text === SEARCHED ? 'searched' : 'control';
      if (ts.isCallExpression(parent) && parent.expression === node) {
        if (onlyProvesItThrows(parent)) refusalChecks += 1;
        else site(parent, form, parent);
      } else if (
        !ts.isImportSpecifier(parent) &&
        !ts.isExportSpecifier(parent) &&
        !(ts.isFunctionDeclaration(parent) && parent.name === node)
      )
        refuse(node, `${node.text} read as a value, not called`);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      chainRoot(node) === EXPECT
    ) {
      const read = expectationOf(node.expression);
      const subject = read?.expectation.arguments[0];
      if (read && subject && !startsFromWrapper(subject)) {
        const form = bareForm(
          node.expression.name.text,
          node.arguments[0],
          subject,
          read.negated,
        );
        if (form !== undefined) site(read.expectation, form);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return {
    sites,
    tests: [...bodies.values()],
    refusalChecks,
    unplaced,
    refused,
  };
}

/** The zero assertions in one file (#367). */
export interface ZeroReading {
  /**
   * `toBe(0)`, `toEqual(0)` or `toStrictEqual(0)` on an expect chain, negated
   * or not, read as a site or not: what the text count checks.
   */
  readonly zeroAssertions: number;
  /**
   * The non-negated ones `searchSitesIn` does not read as a site, by line: a
   * count the parse tree cannot tell from an exit status or a game value
   * without guessing from names, so a recorded floor ratchets them instead.
   */
  readonly scalarZeros: readonly string[];
}

export function scalarZerosIn(sf: ts.SourceFile): ZeroReading {
  let zeroAssertions = 0;
  const scalarZeros: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      chainRoot(node) === EXPECT
    ) {
      const name = node.expression.name.text;
      const read = expectationOf(node.expression);
      const subject = read?.expectation.arguments[0];
      if (
        read &&
        subject &&
        (name === 'toBe' || EQUALITY.has(name)) &&
        isZero(node.arguments[0])
      ) {
        zeroAssertions += 1;
        const isSite =
          !startsFromWrapper(subject) &&
          bareForm(name, node.arguments[0], subject, read.negated) !==
            undefined;
        if (!read.negated && !isSite)
          scalarZeros.push(
            `line ${String(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1)}: ${node.getText(sf).replace(/\s+/g, ' ')}`,
          );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { zeroAssertions, scalarZeros };
}

/** A site with the file it was read in. */
export interface FiledSite {
  readonly file: string;
  readonly label: string;
  readonly proved: boolean;
}

/**
 * Every scope whose unproved sites differ from the burn-down list, both
 * ways: see `listFindings`.
 */
export const burnDownFindings = (
  sites: readonly FiledSite[],
  listed: Readonly<Record<string, number>>,
): string[] =>
  listFindings(
    sites.filter(({ proved }) => !proved),
    listed,
    {
      noun: 'unproved',
      fix:
        "Check a recorded floor on each search's population in the same " +
        'test (searched + floorBreach), or use againstControl for an input ' +
        'left empty on purpose.',
      list: 'tests/unit/floorless-searches.burn-down.ts',
    },
  );
