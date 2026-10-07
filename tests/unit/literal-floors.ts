import ts from 'typescript';
import { lineOf } from './line-of';
import { listFindings } from './burn-down';
import {
  expectationOf,
  isFunction,
  placeOf,
  testBodiesIn,
} from './test-scopes';

/**
 * Every hard-coded minimum in the tests, read from the parse tree (#378).
 *
 * A minimum typed into a test (`expect(files.length).toBeGreaterThan(391)`)
 * is tight only on the day it is measured: growth never fails it, so a reader
 * that later reads a few units less still passes. The global rule wants each
 * such figure recorded in `tests/floors/` and checked for equality instead,
 * and a guard refusing a literal minimum in any form. Shyden decided on #378
 * (option C) that this covers every minimum of two or more, outcome bounds
 * included, with fast-check's seed fixed so a property's counts are exact.
 *
 * A comparison is a call of `toBeGreaterThan`, `toBeGreaterThanOrEqual`,
 * `toBeLessThan` or `toBeLessThanOrEqual` on an `expect(…)` or
 * `expect.soft(…)` chain, with or without `.not` and a message argument. It
 * sets a minimum when the side it bounds from below is a figure written in
 * the file:
 *
 * - `expect(n).toBeGreaterThan(B)`, `…OrEqual(B)`, `.not.toBeLessThan(B)`,
 *   `.not.toBeLessThanOrEqual(B)`: a minimum of `B` on `n`;
 * - `expect(S).toBeLessThan(n)`, `…OrEqual(n)`, `.not.toBeGreaterThan(n)`,
 *   `.not.toBeGreaterThanOrEqual(n)`: a minimum of `S` on `n`.
 *
 * A figure written in the file is one the parse tree folds to numbers with
 * nothing run: a numeric literal (separators, a sign, a bigint), arithmetic
 * of figures, a `const` of the file holding one, a look-up into a `const`
 * object or array literal of figures (`T[k]`, `F[k].accepted`), or a
 * parameter of an `.each`/`.for` test table so written. The length of a
 * written array is no typed figure: it is counted from the array, so it
 * moves when the fixture does. Measured on
 * 2026-10-06, the repository writes each of these. Anything else (a call, an
 * import, a `let`, a parameter, a runtime table) is derived: it moves with
 * the code it reads, so it is no typed-in figure. What a minimum demands is
 * the least whole number its bound admits over every value it can take.
 *
 * Refused by line, never skipped: a comparison with no single bound, one on a
 * chain the reader does not read (`expect.poll`, a stored expectation), a
 * comparison written as a boolean (`expect(n > 5).toBe(true)`), a minimum in
 * no test and no named function, and `expect` imported under another name.
 */
export type MinimumForm =
  'literal' | 'arithmetic' | 'named' | 'table' | 'each-table';

export interface Minimum {
  /** 1-based line of the comparison's `expect(`. */
  readonly line: number;
  /** The widest step folding its bound took: a table look-up through a `const` reads `table`. */
  readonly form: MinimumForm;
  /** The least whole number the bound admits, over every value it can take. */
  readonly demands: number;
  readonly scope: 'test' | 'function';
  /** The test's title as written, or the function's name. */
  readonly label: string;
}

export interface MinimumReading {
  /** Every comparison call read, minimum or not. */
  readonly comparisons: number;
  /** Comparisons whose single argument is a number written in place: what the text counts. */
  readonly literalArguments: number;
  readonly minimums: readonly Minimum[];
  /** Everything the reader could not classify, by line and why. */
  readonly refused: readonly string[];
}

/** A minimum with the file it was read in. */
export interface FiledMinimum {
  readonly file: string;
  readonly label: string;
  readonly demands: number;
}

/** A minimum demanding this much or more is a figure to record (#378, option C). */
export const RECORDED_FROM = 2;

const EXPECT = 'expect';
const LOWER = new Set(['toBeGreaterThan', 'toBeGreaterThanOrEqual']);
const UPPER = new Set(['toBeLessThan', 'toBeLessThanOrEqual']);
const COMPARISONS = new Set([...LOWER, ...UPPER]);

/** `toBe…OrEqual` admits its bound; the others only what lies past it. */
const isStrict = (matcher: string, negated: boolean): boolean =>
  matcher.endsWith('OrEqual') === negated;

const FORMS: readonly MinimumForm[] = [
  'literal',
  'arithmetic',
  'named',
  'table',
  'each-table',
];
const widest = (...forms: MinimumForm[]): MinimumForm =>
  FORMS[Math.max(...forms.map((form) => FORMS.indexOf(form)))] as MinimumForm;

/** A table folded from an object or array literal: its members by key. */
interface Table {
  readonly members: ReadonlyMap<string, Folded | undefined>;
  readonly array: boolean;
}
type Value = number | string | Table;
/** Every value an expression can take, and how it was folded. */
interface Folded {
  readonly values: readonly Value[];
  readonly form: MinimumForm;
}

const isTable = (value: Value): value is Table => typeof value === 'object';

const ARITHMETIC = new Map<ts.SyntaxKind, (a: number, b: number) => number>([
  [ts.SyntaxKind.PlusToken, (a, b) => a + b],
  [ts.SyntaxKind.MinusToken, (a, b) => a - b],
  [ts.SyntaxKind.AsteriskToken, (a, b) => a * b],
  [ts.SyntaxKind.SlashToken, (a, b) => a / b],
  [ts.SyntaxKind.PercentToken, (a, b) => a % b],
  [ts.SyntaxKind.AsteriskAsteriskToken, (a, b) => a ** b],
]);

const numbersOf = (folded: Folded): number[] | undefined =>
  folded.values.every((value) => typeof value === 'number')
    ? (folded.values as number[])
    : undefined;

/** A number written in place: a literal, maybe signed or parenthesised. */
function isWrittenNumber(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node))
    return isWrittenNumber(node.expression);
  if (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken ||
      node.operator === ts.SyntaxKind.PlusToken)
  )
    return isWrittenNumber(node.operand);
  return ts.isNumericLiteral(node) || ts.isBigIntLiteral(node);
}

/** Whether a binding name, or any name a pattern destructures, is `text`. */
function binds(name: ts.BindingName, text: string): boolean {
  if (ts.isIdentifier(name)) return name.text === text;
  return name.elements.some(
    (element) => !ts.isOmittedExpression(element) && binds(element.name, text),
  );
}

/** The declaration `scope` itself makes of `text`, or undefined. */
function declaredIn(scope: ts.Node, text: string): ts.Node | undefined {
  if (ts.isFunctionLike(scope))
    for (const parameter of scope.parameters)
      if (binds(parameter.name, text)) return parameter;
  const statements =
    ts.isSourceFile(scope) ||
    ts.isBlock(scope) ||
    ts.isModuleBlock(scope) ||
    ts.isCaseClause(scope) ||
    ts.isDefaultClause(scope)
      ? scope.statements
      : [];
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      const found = statement.declarationList.declarations.find((declaration) =>
        binds(declaration.name, text),
      );
      if (found) return found;
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name?.text === text
    )
      return statement;
    else if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      if (
        clause?.name?.text === text ||
        (bindings &&
          (ts.isNamespaceImport(bindings)
            ? bindings.name.text === text
            : bindings.elements.some((element) => element.name.text === text)))
      )
        return statement;
    }
  }
  if (
    (ts.isForStatement(scope) ||
      ts.isForOfStatement(scope) ||
      ts.isForInStatement(scope)) &&
    scope.initializer &&
    ts.isVariableDeclarationList(scope.initializer)
  )
    return scope.initializer.declarations.find((declaration) =>
      binds(declaration.name, text),
    );
  if (
    ts.isCatchClause(scope) &&
    scope.variableDeclaration &&
    binds(scope.variableDeclaration.name, text)
  )
    return scope.variableDeclaration;
  return undefined;
}

/** The nearest declaration of `name` around it, or undefined for a global. */
function declarationOf(name: ts.Identifier): ts.Node | undefined {
  for (let scope: ts.Node = name.parent; ; scope = scope.parent) {
    const found = declaredIn(scope, name.text);
    if (found !== undefined || ts.isSourceFile(scope)) return found;
  }
}

/** A property name as written, when it is one: `a`, `'a'`, `0`. */
function keyOf(name: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  )
    return name.text;
  return undefined;
}

/** Every value under `key` in each table, or under every key; undefined when any is not folded. */
function lookUp(tables: Folded, key: string | undefined): Folded | undefined {
  const values: Value[] = [];
  const forms: MinimumForm[] = [tables.form, 'table'];
  for (const table of tables.values) {
    if (!isTable(table)) return undefined;
    const members =
      key === undefined
        ? [...table.members.values()]
        : table.members.has(key)
          ? [table.members.get(key)]
          : [];
    for (const member of members) {
      if (member === undefined) return undefined;
      values.push(...member.values);
      forms.push(member.form);
    }
  }
  return values.length === 0 ? undefined : { values, form: widest(...forms) };
}

/** A table of rows, one per member of each table: `Object.entries` and kin. */
function rowsOf(method: string, tables: Folded): Folded | undefined {
  const rows = new Map<string, Folded | undefined>();
  for (const table of tables.values) {
    if (!isTable(table)) return undefined;
    for (const [key, member] of table.members) {
      const at = String(rows.size);
      const keyed: Folded = { values: [key], form: 'literal' };
      if (method === 'keys') rows.set(at, keyed);
      else if (method === 'values') rows.set(at, member);
      else
        rows.set(at, {
          values: [
            {
              members: new Map([
                ['0', keyed],
                ['1', member],
              ]),
              array: true,
            },
          ],
          form: 'table',
        });
    }
  }
  return {
    values: [{ members: rows, array: true }],
    form: widest(tables.form, 'table'),
  };
}

/**
 * Every value `node` can take with nothing run, or undefined when it reads
 * anything at runtime. `seen` holds the declarations already being folded,
 * so a name defined through itself is derived, not a loop.
 */
function fold(
  node: ts.Expression,
  seen: ReadonlySet<ts.Node> = new Set(),
): Folded | undefined {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
  )
    return fold(node.expression, seen);
  if (ts.isNumericLiteral(node))
    return { values: [Number(node.text.replace(/_/g, ''))], form: 'literal' };
  if (ts.isBigIntLiteral(node))
    return {
      values: [Number(node.text.slice(0, -1).replace(/_/g, ''))],
      form: 'literal',
    };
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return { values: [node.text], form: 'literal' };
  if (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken ||
      node.operator === ts.SyntaxKind.PlusToken)
  ) {
    const operand = fold(node.operand, seen);
    const numbers = operand && numbersOf(operand);
    if (!operand || !numbers) return undefined;
    const sign = node.operator === ts.SyntaxKind.MinusToken ? -1 : 1;
    return { values: numbers.map((n) => sign * n), form: operand.form };
  }
  if (ts.isBinaryExpression(node)) return foldBinary(node, seen);
  if (ts.isObjectLiteralExpression(node)) return foldObject(node, seen);
  if (ts.isArrayLiteralExpression(node)) {
    const members = new Map<string, Folded | undefined>();
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) return undefined;
      members.set(
        String(members.size),
        ts.isOmittedExpression(element) ? undefined : fold(element, seen),
      );
    }
    return { values: [{ members, array: true }], form: 'table' };
  }
  if (ts.isIdentifier(node)) return foldName(node, seen);
  if (ts.isElementAccessExpression(node)) {
    const tables = fold(node.expression, seen);
    const key = fold(node.argumentExpression, seen);
    const [only, ...more] = key?.values ?? [];
    const written =
      more.length === 0 &&
      (typeof only === 'number' || typeof only === 'string')
        ? String(only)
        : undefined;
    return tables && lookUp(tables, written);
  }
  if (ts.isPropertyAccessExpression(node)) {
    const tables = fold(node.expression, seen);
    return tables && lookUp(tables, node.name.text);
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'Object' &&
    ['entries', 'values', 'keys'].includes(node.expression.name.text) &&
    node.arguments.length === 1
  ) {
    const tables = fold(node.arguments[0] as ts.Expression, seen);
    return tables && rowsOf(node.expression.name.text, tables);
  }
  return undefined;
}

function foldBinary(
  node: ts.BinaryExpression,
  seen: ReadonlySet<ts.Node>,
): Folded | undefined {
  const left = fold(node.left, seen);
  const right = fold(node.right, seen);
  if (!left || !right) return undefined;
  if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    return {
      values: [...left.values, ...right.values],
      form: widest(left.form, right.form),
    };
  const apply = ARITHMETIC.get(node.operatorToken.kind);
  const a = numbersOf(left);
  const b = numbersOf(right);
  if (!apply || !a || !b) return undefined;
  return {
    values: a.flatMap((x) => b.map((y) => apply(x, y))),
    form: widest('arithmetic', left.form, right.form),
  };
}

function foldObject(
  node: ts.ObjectLiteralExpression,
  seen: ReadonlySet<ts.Node>,
): Folded | undefined {
  const members = new Map<string, Folded | undefined>();
  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property)) {
      const key = keyOf(property.name);
      if (key === undefined) return undefined;
      members.set(key, fold(property.initializer, seen));
    } else if (ts.isShorthandPropertyAssignment(property))
      members.set(property.name.text, fold(property.name, seen));
    else return undefined;
  }
  return { values: [{ members, array: false }], form: 'table' };
}

function foldName(
  name: ts.Identifier,
  seen: ReadonlySet<ts.Node>,
): Folded | undefined {
  const declaration = declarationOf(name);
  if (declaration === undefined)
    return name.text === 'Infinity'
      ? { values: [Infinity], form: 'literal' }
      : undefined;
  if (seen.has(declaration)) return undefined;
  const deeper = new Set(seen).add(declaration);
  if (ts.isVariableDeclaration(declaration)) {
    const list = declaration.parent;
    if (
      !ts.isIdentifier(declaration.name) ||
      declaration.initializer === undefined ||
      !ts.isVariableDeclarationList(list) ||
      (list.flags & ts.NodeFlags.Const) === 0
    )
      return undefined;
    const folded = fold(declaration.initializer, deeper);
    return (
      folded && { values: folded.values, form: widest(folded.form, 'named') }
    );
  }
  if (ts.isParameter(declaration))
    return foldTableParameter(declaration, name.text, deeper);
  return undefined;
}

/**
 * The values a parameter of an `.each(table)` or `.for(table)` test callback
 * takes, when the table is written in the file: `.each` spreads an array row
 * into the parameters and hands any other row whole, `.for` hands every row
 * whole; a destructured parameter takes that member of what it is handed.
 */
function foldTableParameter(
  parameter: ts.ParameterDeclaration,
  text: string,
  seen: ReadonlySet<ts.Node>,
): Folded | undefined {
  const fn = parameter.parent;
  const call = fn.parent;
  if (
    !isFunction(fn) ||
    !ts.isCallExpression(call) ||
    !call.arguments.some((argument) => argument === fn)
  )
    return undefined;
  const tableCall = call.expression;
  if (
    !ts.isCallExpression(tableCall) ||
    !ts.isPropertyAccessExpression(tableCall.expression)
  )
    return undefined;
  const mode = tableCall.expression.name.text;
  const [written] = tableCall.arguments;
  if ((mode !== 'each' && mode !== 'for') || written === undefined)
    return undefined;
  const table = fold(written, seen);
  const rows = table && lookUp(table, undefined);
  if (!rows) return undefined;
  const index = fn.parameters.indexOf(parameter);
  const handed: Value[] = [];
  const forms: MinimumForm[] = ['each-table', rows.form];
  for (const row of rows.values) {
    if (mode === 'each' && isTable(row) && row.array) {
      const member = row.members.get(String(index));
      if (member === undefined) return undefined;
      handed.push(...member.values);
      forms.push(member.form);
    } else if (index === 0) handed.push(row);
    else return undefined;
  }
  const argument: Folded = { values: handed, form: widest(...forms) };
  if (ts.isIdentifier(parameter.name)) return argument;
  const elements: readonly ts.ArrayBindingElement[] = parameter.name.elements;
  const element = elements.find(
    (each): each is ts.BindingElement =>
      ts.isBindingElement(each) &&
      ts.isIdentifier(each.name) &&
      each.name.text === text,
  );
  if (element === undefined) return undefined;
  const key = ts.isObjectBindingPattern(parameter.name)
    ? element.propertyName === undefined
      ? text
      : keyOf(element.propertyName)
    : String(elements.indexOf(element));
  const member = key === undefined ? undefined : lookUp(argument, key);
  return (
    member && { values: member.values, form: widest(member.form, 'each-table') }
  );
}

/** The least whole number a bound of these values admits, or undefined when none is a finite number. */
function demandOf(folded: Folded, strict: boolean): number | undefined {
  const numbers = numbersOf(folded)?.filter(Number.isFinite);
  if (numbers === undefined || numbers.length === 0) return undefined;
  const most = Math.max(...numbers);
  return strict ? Math.floor(most) + 1 : Math.ceil(most);
}

const COMPARING = new Set([
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
]);

export function literalMinimumsIn(sf: ts.SourceFile): MinimumReading {
  const bodies = testBodiesIn(sf);
  const minimums: Minimum[] = [];
  const refused: string[] = [];
  let comparisons = 0;
  let literalArguments = 0;
  const refuse = (node: ts.Node, why: string): void => {
    refused.push(`${sf.fileName}:${String(lineOf(sf, node))}: ${why}`);
  };

  const compare = (
    call: ts.CallExpression,
    matcher: ts.PropertyAccessExpression,
  ): void => {
    comparisons += 1;
    const [bound, ...rest] = call.arguments;
    if (bound === undefined || ts.isSpreadElement(bound) || rest.length > 0) {
      refuse(call, 'a comparison with no single bound');
      return;
    }
    if (isWrittenNumber(bound)) literalArguments += 1;
    const read = expectationOf(matcher);
    const subject = read?.expectation.arguments[0];
    if (!read || !subject || ts.isSpreadElement(subject)) {
      refuse(call, 'a comparison on a chain this reader does not read');
      return;
    }
    const name = matcher.name.text;
    const onBound = LOWER.has(name) !== read.negated;
    const folded = fold(onBound ? bound : subject);
    const demands = folded && demandOf(folded, isStrict(name, read.negated));
    if (!folded || demands === undefined) return;
    const place = placeOf(read.expectation, bodies);
    if (place === undefined) {
      refuse(read.expectation, 'a minimum in no test and no named function');
      return;
    }
    minimums.push({
      line: lineOf(sf, read.expectation),
      form: folded.form,
      demands,
      scope: place.scope,
      label: place.label,
    });
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportSpecifier(node) &&
      (node.propertyName ?? node.name).text === EXPECT &&
      node.name.text !== EXPECT
    )
      refuse(node, `expect imported under another name, ${node.name.text}`);
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      COMPARISONS.has(node.expression.name.text)
    )
      compare(node, node.expression);
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === EXPECT) ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === EXPECT))
    ) {
      const [subject] = node.arguments;
      if (
        subject !== undefined &&
        ts.isBinaryExpression(subject) &&
        COMPARING.has(subject.operatorToken.kind) &&
        (fold(subject.left) !== undefined || fold(subject.right) !== undefined)
      )
        refuse(node, 'a comparison written as a boolean: use a matcher');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { comparisons, literalArguments, minimums, refused };
}

/**
 * Every scope whose minimums of `RECORDED_FROM` or more differ from the
 * burn-down list, both ways: see `listFindings`.
 */
export const literalFloorFindings = (
  minimums: readonly FiledMinimum[],
  listed: Readonly<Record<string, number>>,
): string[] =>
  listFindings(
    minimums.filter(({ demands }) => demands >= RECORDED_FROM),
    listed,
    {
      noun: 'unrecorded',
      fix:
        'Record the figure instead: floorBreach(<id>, <count>), checked ' +
        'for equality and raised by npm run floors:record.',
      list: 'tests/unit/literal-floors.burn-down.ts',
    },
  );
