import ts from 'typescript';

/**
 * Calls a test file evaluates while Vitest COLLECTS it (Refs #97).
 *
 * Module scope and every `describe` callback run at collection, before any
 * test exists, so a throw there fails the file and its tests vanish from the
 * total. A throw in a `beforeAll` hook fails no test either: Vitest marks the
 * suite's tests skipped (measured for #97: `2 skipped`, where a throwing
 * `beforeEach` gave `2 failed`). The detector walks that code: module scope,
 * describe callbacks, `beforeAll` hooks, and the arguments of a test or hook
 * registration (titles, `.each` tables, `.skipIf` conditions). It does not
 * enter a test, another hook, or a function that is only declared. It does
 * enter a function passed to a builtin that runs it now (`xs.map(f)`,
 * `Array.from(n, f)`), except a fast-check arbitrary's, which runs inside the
 * property, that is, inside a test. A function passed to anything else (a
 * server's request handler) runs later, if at all.
 *
 * Each call there is judged by its root name, resolved through the file's
 * scopes. Workspace code enters a test file only through an import, so:
 * - an import of a relative path or an `@yawelo-idle/` package is REFUSED,
 *   apart from the clock brands `simMs` and `wallMs` imported from a clock
 *   module, each one integer check that calls nothing else;
 * - a function declared in the file is followed into its body, under the same
 *   rules, and refused when anything it runs is;
 * - a name with no binding in the file is a runtime global (`String`,
 *   `Object`, `btoa`), and a third-party package is pinned by the lockfile
 *   and never mutated: both are allowed;
 * - a method on local data (`IDS.slice(1)`, `[1, 2].map`) is allowed, its
 *   function arguments judged as code that runs now, and a workspace or local
 *   function passed to it by name is judged as called.
 * What the reader cannot follow is refused by name, never skipped: a callee
 * with no root name, a direct call of a value (a parameter, a call's result),
 * and a describe form it does not know.
 */

/** A call evaluated at collection, or in a `beforeAll`, that can reach workspace code. */
export interface RefusedCall {
  /** The describe titles around the call, outermost first, joined by ` > `; `(module)` outside any. */
  readonly scope: string;
  /** 1-based line of the call, for a human to open. */
  readonly line: number;
  /** The callee as written, whitespace collapsed: `stateAt`, `core.integrate`. */
  readonly call: string;
  /** The path to workspace code: `stateAt -> integrate (../src/sim)`. */
  readonly reaches: string;
}

/**
 * What the detector read in one file. The verdict carries its own population,
 * so an empty `refused` can be told from a reader that saw nothing (Refs #82).
 */
export interface CollectionScan {
  /** Describe callbacks read, nested ones included. */
  readonly describes: number;
  /** Calls evaluated at collection or in a `beforeAll`, judged, refused or allowed. Test, hook and describe registrations are not judged. */
  readonly judged: number;
  /** Every judged call that can reach workspace code. */
  readonly refused: readonly RefusedCall[];
  /** Forms the reader cannot judge, by line: refused, never skipped. */
  readonly unclassified: readonly string[];
}

const MODULE_SCOPE = '(module)';

/** The calls that register a suite, a test or a hook rather than run code now. */
const REGISTRATIONS = new Set([
  'describe',
  'it',
  'test',
  'beforeAll',
  'beforeEach',
  'afterAll',
  'afterEach',
]);

/** What Playwright registers through `test.<name>`: a suite or a hook. */
const SUITES_AND_HOOKS = new Set([
  'describe',
  'beforeAll',
  'beforeEach',
  'afterAll',
  'afterEach',
]);

/** Members of Vitest's `describe` and Playwright's `test.describe`. Any other is refused by name. */
const DESCRIBE_MEMBERS = new Set([
  'only',
  'skip',
  'todo',
  'concurrent',
  'sequential',
  'shuffle',
  'each',
  'for',
  'skipIf',
  'runIf',
  'fixme',
  'serial',
  'parallel',
  'configure',
]);

/** Describe members that declare no suite: a placeholder, or Playwright's mode setting. */
const NO_CALLBACK = new Set(['todo', 'configure']);

/**
 * Builtins that run a function passed to them (`xs.map(f)`, `Array.from(n, f)`),
 * so a function written inline is walked as code that runs now, and a
 * workspace or local function passed by name is judged as called. Any other
 * callee receives a value it does not run now (`String(LIMIT)`), or runs it
 * later (`createServer(handler)`).
 */
const CALLBACK_RUNNERS = new Set([
  'map',
  'flatMap',
  'filter',
  'forEach',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'reduce',
  'reduceRight',
  'sort',
  'toSorted',
  'from',
  'replace',
  'replaceAll',
  'then',
  'catch',
  'finally',
]);

/** Brands from the clock module: each is one integer check and calls nothing else. */
const CLOCK_BRANDS = new Set(['simMs', 'wallMs']);

/** Packages whose function arguments run later, inside the property, never at collection. */
const LAZY_PACKAGES = new Set(['fast-check']);

const CORE_PACKAGE = '@yawelo-idle/core';

type Binding =
  | {
      readonly kind: 'import';
      readonly local: string;
      readonly imported: string;
      readonly specifier: string;
    }
  | { readonly kind: 'function'; readonly name: string; readonly body: ts.Node }
  | { readonly kind: 'alias'; readonly of: ts.Identifier }
  | { readonly kind: 'result'; readonly of: ts.Identifier }
  | { readonly kind: 'data' };

/** What a judged call does: reaches workspace code, cannot be read, or neither (null). */
type Verdict = {
  readonly kind: 'reaches' | 'unread';
  readonly text: string;
} | null;

type CallLike =
  ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression;

const isCallLike = (node: ts.Node): node is CallLike =>
  ts.isCallExpression(node) ||
  ts.isNewExpression(node) ||
  ts.isTaggedTemplateExpression(node);

const calleeOf = (call: CallLike): ts.Expression =>
  ts.isTaggedTemplateExpression(call) ? call.tag : call.expression;

const argumentsOf = (call: CallLike): readonly ts.Expression[] =>
  ts.isTaggedTemplateExpression(call) ? [] : (call.arguments ?? []);

const isFunctionValue = (
  node: ts.Node,
): node is ts.ArrowFunction | ts.FunctionExpression =>
  ts.isArrowFunction(node) || ts.isFunctionExpression(node);

const isWorkspace = (specifier: string): boolean =>
  specifier.startsWith('.') || specifier.startsWith('@yawelo-idle/');

const isClockBrand = (binding: Binding | undefined): boolean =>
  binding?.kind === 'import' &&
  CLOCK_BRANDS.has(binding.imported) &&
  (binding.specifier.endsWith('/clock') || binding.specifier === CORE_PACKAGE);

/** The import a binding is, when it carries workspace code; else undefined. */
const workspaceImport = (
  binding: Binding | undefined,
): Extract<Binding, { kind: 'import' }> | undefined =>
  binding?.kind === 'import' &&
  isWorkspace(binding.specifier) &&
  !isClockBrand(binding)
    ? binding
    : undefined;

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Whether a call is a method whose name says it runs a function passed to it now. */
const runsCallbacks = (call: CallLike): boolean => {
  const callee = unwrap(calleeOf(call));
  return (
    ts.isPropertyAccessExpression(callee) &&
    CALLBACK_RUNNERS.has(callee.name.text)
  );
};

/** Skip the wrappers that change no value: parentheses, `!`, `as`, `satisfies`. */
const unwrap = (node: ts.Expression): ts.Expression => {
  let at = node;
  while (
    ts.isParenthesizedExpression(at) ||
    ts.isNonNullExpression(at) ||
    ts.isAsExpression(at) ||
    ts.isSatisfiesExpression(at)
  )
    at = at.expression;
  return at;
};

/** The expression a chain of property and element reads starts from: `core` for `core.a[0].b`. */
const readRoot = (node: ts.Expression): ts.Expression => {
  let at = unwrap(node);
  while (ts.isPropertyAccessExpression(at) || ts.isElementAccessExpression(at))
    at = unwrap(at.expression);
  return at;
};

/** The name a chain starts from, read through calls too: `fc` for `fc.integer().map`. */
const originName = (node: ts.Expression): ts.Identifier | null => {
  let at = readRoot(node);
  while (isCallLike(at)) at = readRoot(calleeOf(at));
  return ts.isIdentifier(at) ? at : null;
};

/** A value written in place: a string, number, regex or template, an array or an object. */
const isLiteral = (node: ts.Node): boolean =>
  ts.isLiteralExpression(node) ||
  ts.isTemplateExpression(node) ||
  ts.isArrayLiteralExpression(node) ||
  ts.isObjectLiteralExpression(node);

const bindingNames = (name: ts.BindingName): string[] =>
  ts.isIdentifier(name)
    ? [name.text]
    : name.elements.flatMap((element) =>
        ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
      );

function importBindings(node: ts.ImportDeclaration): [string, Binding][] {
  const clause = node.importClause;
  if (
    clause === undefined ||
    clause.phaseModifier === ts.SyntaxKind.TypeKeyword ||
    !ts.isStringLiteral(node.moduleSpecifier)
  )
    return [];
  const specifier = node.moduleSpecifier.text;
  const bind = (local: string, imported: string): [string, Binding] => [
    local,
    { kind: 'import', local, imported, specifier },
  ];
  const out: [string, Binding][] = [];
  if (clause.name) out.push(bind(clause.name.text, 'default'));
  const named = clause.namedBindings;
  if (named && ts.isNamespaceImport(named))
    out.push(bind(named.name.text, '*'));
  if (named && ts.isNamedImports(named))
    for (const element of named.elements)
      if (!element.isTypeOnly)
        out.push(
          bind(element.name.text, (element.propertyName ?? element.name).text),
        );
  return out;
}

/**
 * A variable is a function when its initializer is one, an alias when it
 * reads a name (`const go = integrate`, `const { a } = core`), the result of
 * a call when it holds one (`const D = Decimal.clone(…)`), and data otherwise.
 */
function variableBindings(node: ts.VariableDeclaration): [string, Binding][] {
  const init = node.initializer;
  if (init && ts.isIdentifier(node.name) && isFunctionValue(init))
    return [
      [
        node.name.text,
        { kind: 'function', name: node.name.text, body: init.body },
      ],
    ];
  const root = init ? readRoot(init) : undefined;
  const origin = root && isCallLike(root) ? originName(root) : null;
  const binding: Binding =
    root && ts.isIdentifier(root)
      ? { kind: 'alias', of: root }
      : origin
        ? { kind: 'result', of: origin }
        : { kind: 'data' };
  return bindingNames(node.name).map((name) => [name, binding]);
}

const DATA: Binding = { kind: 'data' };

function statementBindings(
  statements: readonly ts.Statement[],
): [string, Binding][] {
  return statements.flatMap((statement): [string, Binding][] => {
    if (ts.isImportDeclaration(statement)) return importBindings(statement);
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body)
      return [
        [
          statement.name.text,
          {
            kind: 'function',
            name: statement.name.text,
            body: statement.body,
          },
        ],
      ];
    // A class is not followed into its members: constructing one is a
    // direct call of a value, refused by name.
    if (ts.isClassDeclaration(statement) && statement.name)
      return [[statement.name.text, DATA]];
    if (ts.isVariableStatement(statement))
      return statement.declarationList.declarations.flatMap(variableBindings);
    return [];
  });
}

/** The names a node declares for the code inside it, or null when it opens no scope. */
function scopeBindings(node: ts.Node): ReadonlyMap<string, Binding> | null {
  if (ts.isSourceFile(node) || ts.isBlock(node))
    return new Map(statementBindings(node.statements));
  if (ts.isFunctionLike(node))
    return new Map(
      node.parameters.flatMap((parameter) =>
        bindingNames(parameter.name).map((name): [string, Binding] => [
          name,
          DATA,
        ]),
      ),
    );
  if (
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node)
  ) {
    const init = node.initializer;
    return new Map(
      init && ts.isVariableDeclarationList(init)
        ? init.declarations.flatMap((declaration) =>
            bindingNames(declaration.name).map((name): [string, Binding] => [
              name,
              DATA,
            ]),
          )
        : [],
    );
  }
  if (ts.isCatchClause(node) && node.variableDeclaration)
    return new Map(
      bindingNames(node.variableDeclaration.name).map(
        (name): [string, Binding] => [name, DATA],
      ),
    );
  return null;
}

/**
 * A test, hook or describe registration: what it registers, its members after
 * that name, the inner calls of a table form, and its form as written.
 * Playwright's `test.describe` registers a describe, and its `test.beforeAll`
 * and siblings a hook.
 */
interface Registration {
  readonly name: string;
  readonly members: readonly string[];
  readonly inner: readonly ts.CallExpression[];
  readonly form: string;
}

function registrationOf(call: CallLike): Registration | null {
  if (!ts.isCallExpression(call)) return null;
  const members: string[] = [];
  const inner: ts.CallExpression[] = [];
  let at: ts.Expression = call.expression;
  for (;;) {
    if (ts.isPropertyAccessExpression(at)) {
      members.unshift(at.name.text);
      at = at.expression;
    } else if (ts.isCallExpression(at)) {
      inner.push(at);
      at = at.expression;
    } else break;
  }
  if (!ts.isIdentifier(at) || !REGISTRATIONS.has(at.text)) return null;
  const form = [at.text, ...members].join('.');
  const [first = ''] = members;
  const onTest = at.text === 'test' || at.text === 'it';
  return onTest && SUITES_AND_HOOKS.has(first)
    ? { name: first, members: members.slice(1), inner, form }
    : { name: at.text, members, inner, form };
}

/** A title as written: a template keeps its `${…}`, so an entry naming it is stable. */
const titleOf = (sf: ts.SourceFile, call: ts.CallExpression): string => {
  const first = call.arguments[0];
  if (!first) return '';
  if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))
    return first.text;
  return first.getText(sf).replace(/^`|`$/g, '');
};

/** Where the walk reports what it meets. */
interface Sink {
  judge(call: CallLike, scope: string): void;
  unread(node: ts.Node, text: string): void;
  describe(): void;
  stopped(): boolean;
}

export function scanCollection(
  source: string,
  fileName: string,
): CollectionScan {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  /** A node's source, whitespace collapsed, so a call written over lines reads as one. */
  const textOf = (node: ts.Node): string => collapse(node.getText(sf));

  const scopes = new Map<ts.Node, ReadonlyMap<string, Binding> | null>();
  const bindingsAt = (node: ts.Node): ReadonlyMap<string, Binding> | null => {
    if (!scopes.has(node)) scopes.set(node, scopeBindings(node));
    return scopes.get(node) ?? null;
  };

  /**
   * The binding `name` has where `from` sits, undefined for a global. An alias
   * is followed. A call's result is third-party code when the call's origin is
   * a third-party import, and data otherwise.
   */
  const resolve = (
    name: string,
    from: ts.Node,
    seen: Set<ts.Node> = new Set(),
  ): Binding | undefined => {
    for (let at: ts.Node = from; ; at = at.parent) {
      const binding = bindingsAt(at)?.get(name);
      if (binding !== undefined) {
        if (binding.kind !== 'alias' && binding.kind !== 'result')
          return binding;
        if (seen.has(binding.of)) return DATA;
        seen.add(binding.of);
        const target = resolve(binding.of.text, binding.of, seen);
        if (binding.kind === 'alias') return target;
        return target?.kind === 'import' && !isWorkspace(target.specifier)
          ? target
          : DATA;
      }
      if (ts.isSourceFile(at)) return undefined;
    }
  };

  const prefixed = (name: string, verdict: Verdict): Verdict =>
    verdict && { kind: verdict.kind, text: `${name} -> ${verdict.text}` };

  const walk = (node: ts.Node, scope: string, sink: Sink): void => {
    if (sink.stopped() || ts.isFunctionLike(node)) return;
    if (isCallLike(node)) {
      walkCall(node, scope, sink);
      return;
    }
    ts.forEachChild(node, (child) => {
      walk(child, scope, sink);
    });
  };

  const walkRegistration = (
    call: ts.CallExpression,
    registration: Registration,
    scope: string,
    sink: Sink,
  ): void => {
    for (const inner of registration.inner)
      for (const argument of inner.arguments) walk(argument, scope, sink);
    for (const argument of call.arguments)
      if (!isFunctionValue(argument)) walk(argument, scope, sink);
    const inner = (title: string): string =>
      scope === MODULE_SCOPE ? title : `${scope} > ${title}`;
    if (registration.name === 'beforeAll') {
      const hook = call.arguments.find(isFunctionValue);
      if (hook) walk(hook.body, inner('beforeAll'), sink);
      else
        sink.unread(
          call,
          `${registration.form} has no inline callback to read`,
        );
      return;
    }
    if (registration.name !== 'describe') return;
    const { form } = registration;
    if (!registration.members.every((member) => DESCRIBE_MEMBERS.has(member))) {
      sink.unread(call, `${form} is not a known describe form`);
      return;
    }
    if (registration.members.some((member) => NO_CALLBACK.has(member))) return;
    const title = titleOf(sf, call);
    const callback = call.arguments.find(isFunctionValue);
    if (!callback) {
      sink.unread(call, `${form}('${title}') has no inline callback to read`);
      return;
    }
    sink.describe();
    walk(callback.body, inner(title), sink);
  };

  const walkCall = (call: CallLike, scope: string, sink: Sink): void => {
    const registration = registrationOf(call);
    if (registration && ts.isCallExpression(call)) {
      walkRegistration(call, registration, scope, sink);
      return;
    }
    sink.judge(call, scope);
    walk(calleeOf(call), scope, sink);
    if (ts.isTaggedTemplateExpression(call)) walk(call.template, scope, sink);
    const origin = originName(calleeOf(call));
    const binding = origin ? resolve(origin.text, origin) : undefined;
    const runsNow =
      runsCallbacks(call) &&
      !(binding?.kind === 'import' && LAZY_PACKAGES.has(binding.specifier));
    for (const argument of argumentsOf(call)) {
      if (!isFunctionValue(argument)) walk(argument, scope, sink);
      else if (runsNow) walk(argument.body, scope, sink);
    }
  };

  /** The first verdict of the code a local function runs when called; `visited` breaks recursion. */
  const reach = (
    fn: Extract<Binding, { kind: 'function' }>,
    visited: Set<ts.Node>,
  ): Verdict => {
    if (visited.has(fn.body)) return null;
    visited.add(fn.body);
    let found: Verdict = null;
    walk(fn.body, MODULE_SCOPE, {
      judge: (call) => {
        found ??= judge(call, visited);
      },
      unread: (_node, text) => {
        found ??= { kind: 'unread', text };
      },
      describe: () => undefined,
      stopped: () => found !== null,
    });
    return found;
  };

  /** What a function passed by name to a builtin that runs it reaches. */
  const judgeArguments = (call: CallLike, visited: Set<ts.Node>): Verdict => {
    if (!runsCallbacks(call)) return null;
    for (const argument of argumentsOf(call)) {
      if (!ts.isIdentifier(argument)) continue;
      const binding = resolve(argument.text, argument);
      const imported = workspaceImport(binding);
      if (imported)
        return {
          kind: 'reaches',
          text: `${imported.local} (${imported.specifier})`,
        };
      if (binding?.kind === 'function') {
        const verdict = prefixed(binding.name, reach(binding, visited));
        if (verdict) return verdict;
      }
    }
    return null;
  };

  const judge = (call: CallLike, visited: Set<ts.Node>): Verdict => {
    const callee = calleeOf(call);
    const root = readRoot(callee);
    if (isCallLike(root) || isLiteral(root))
      return judgeArguments(call, visited);
    if (!ts.isIdentifier(root))
      return {
        kind: 'unread',
        text: `${textOf(call)} has no root name to resolve`,
      };
    const binding = resolve(root.text, root);
    const imported = workspaceImport(binding);
    if (imported)
      return {
        kind: 'reaches',
        text: `${imported.local} (${imported.specifier})`,
      };
    if (binding?.kind === 'function') {
      const verdict = prefixed(binding.name, reach(binding, visited));
      if (verdict) return verdict;
    }
    if (binding?.kind === 'data' && unwrap(callee) === root)
      return {
        kind: 'unread',
        text: `${textOf(call)} calls a value, not a function the reader can follow`,
      };
    return judgeArguments(call, visited);
  };

  let describes = 0;
  let judged = 0;
  const refused: RefusedCall[] = [];
  const unclassified: string[] = [];
  walk(sf, MODULE_SCOPE, {
    judge: (call, scope) => {
      judged += 1;
      const verdict = judge(call, new Set());
      if (verdict?.kind === 'reaches')
        refused.push({
          scope,
          line: lineOf(call),
          call: textOf(calleeOf(call)),
          reaches: verdict.text,
        });
      if (verdict?.kind === 'unread')
        unclassified.push(`line ${String(lineOf(call))}: ${verdict.text}`);
    },
    unread: (node, text) => {
      unclassified.push(`line ${String(lineOf(node))}: ${text}`);
    },
    describe: () => {
      describes += 1;
    },
    stopped: () => false,
  });
  return { describes, judged, refused, unclassified };
}
