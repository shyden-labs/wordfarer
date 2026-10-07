import ts from 'typescript';
import { lineOf } from './line-of';

/**
 * Finds every git file walk in a TypeScript source and judges whether it sees
 * a file before it is committed (#385).
 *
 * A guard that walks `git ls-files` alone, or `git grep` without
 * `--untracked`, passes over a new file until its `git add`: one-test-per-case
 * missed a looped test that way (#31), and collection-calls missed three
 * collection-time calls (#356). The one walk is `committableFiles()` in
 * `tests/unit/tracked-files.ts`; a `git grep` reads untracked files too.
 *
 * A call is a git call when a child-process function is called with the
 * string `'git'` first. Its second argument must be an array whose first
 * element, the subcommand, is a string; anything else is refused by name
 * rather than skipped.
 */

/** The file that owns the repository's one `git ls-files` walk. */
export const WALK_HOME = 'tests/unit/tracked-files.ts';

const CHILD_PROCESS = new Set([
  'execFileSync',
  'spawnSync',
  'execFile',
  'spawn',
]);

export interface GitWalks {
  /**
   * Child-process calls whose program is a string literal, git or not: what a
   * text count over the code can check the traversal against.
   */
  readonly programCalls: number;
  /** Every git call read, as `line N: git <subcommand>`. */
  readonly calls: string[];
  /** Walks that cannot see an uncommitted file. */
  readonly findings: string[];
  /** Git calls the reader cannot classify, refused by name. */
  readonly unclassified: string[];
}

const calleeName = (call: ts.CallExpression): string | undefined => {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
};

/** The name a function is called by: its declaration, or the const holding it. */
const functionName = (fn: ts.Node): string | undefined => {
  if (ts.isFunctionDeclaration(fn)) return fn.name?.text;
  if (
    (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
    ts.isVariableDeclaration(fn.parent) &&
    ts.isIdentifier(fn.parent.name)
  )
    return fn.parent.name.text;
  return undefined;
};

/**
 * The name of the function whose rest parameter `argv` is, when git is called
 * as `(...args) => execFileSync('git', args)`: its call sites carry the
 * subcommands.
 */
const wrapperOf = (argv: ts.Identifier): string | undefined => {
  for (
    let node: ts.Node = argv.parent;
    !ts.isSourceFile(node);
    node = node.parent
  )
    if (ts.isFunctionLike(node))
      return node.parameters.some(
        (parameter) =>
          parameter.dotDotDotToken !== undefined &&
          ts.isIdentifier(parameter.name) &&
          parameter.name.text === argv.text,
      )
        ? functionName(node)
        : undefined;
  return undefined;
};

/** The git calls in `text`, read from the parse tree, judged for `file`. */
export function gitWalks(file: string, text: string): GitWalks {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const calls: string[] = [];
  const findings: string[] = [];
  const unclassified: string[] = [];
  const wrappers = new Set<string>();
  let programCalls = 0;
  /** Judges one git call from its argument expressions. */
  const judge = (node: ts.Node, argv: readonly ts.Expression[]): void => {
    const line = lineOf(source, node);
    const where = `${file}:${String(line)}`;
    const [first] = argv;
    if (first === undefined || !ts.isStringLiteralLike(first)) {
      unclassified.push(
        `${where}: git's arguments are not an array starting with a string`,
      );
      return;
    }
    const args = argv.flatMap((element) =>
      ts.isStringLiteralLike(element) ? [element.text] : [],
    );
    calls.push(`line ${String(line)}: git ${first.text}`);
    if (first.text === 'ls-files' && file !== WALK_HOME)
      findings.push(
        `${where}: git ls-files outside ${WALK_HOME}; walk with committableFiles()`,
      );
    if (first.text === 'ls-files' && !args.includes('--others'))
      findings.push(
        `${where}: git ls-files without --others cannot see an uncommitted file`,
      );
    if (first.text === 'grep' && !args.includes('--untracked'))
      findings.push(
        `${where}: git grep without --untracked cannot see an uncommitted file`,
      );
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      const [program, argv] = node.arguments;
      const literal =
        name !== undefined &&
        CHILD_PROCESS.has(name) &&
        program !== undefined &&
        ts.isStringLiteralLike(program)
          ? program.text
          : undefined;
      if (literal !== undefined) programCalls += 1;
      if (literal === 'git') {
        const wrapper =
          argv !== undefined && ts.isIdentifier(argv)
            ? wrapperOf(argv)
            : undefined;
        if (wrapper !== undefined) wrappers.add(wrapper);
        else
          judge(
            node,
            argv !== undefined && ts.isArrayLiteralExpression(argv)
              ? argv.elements
              : [],
          );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const visitWrapped = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      wrappers.has(node.expression.text)
    )
      judge(node, node.arguments);
    ts.forEachChild(node, visitWrapped);
  };
  if (wrappers.size > 0) visitWrapped(source);
  return { programCalls, calls, findings, unclassified };
}
