import { posix } from 'node:path';
import ts from 'typescript';
import { lineOf } from './line-of';

/**
 * The value-import graph of packages/core/src, which must stay acyclic (#92).
 *
 * An ES module cycle that carries values can read a binding before the module
 * defining it has run, and in core it also means a leaf module (`grammar.ts`)
 * has grown a dependency on the simulation that uses it. #32's first build
 * shipped four such cycles through every gate step.
 *
 * The source is PARSED, not grepped, so a comment or a string naming an
 * import is never read as one. A type-only declaration (`import type`,
 * `export type`, or one whose every specifier is `type X`) carries no value,
 * so it is no edge. An empty `import {} from './x'` is one: it binds nothing
 * but still loads the module, and `verbatimModuleSyntax` keeps it.
 */

/** One relative import or export declaration. */
export interface RelativeImport {
  /** The specifier as written: `'./sim'`. */
  readonly specifier: string;
  /** False for a type-only declaration, which carries no value and is no edge. */
  readonly value: boolean;
}

/** What one module names, read from its source. */
export interface ModuleScan {
  /** Every relative import and export declaration, in source order. */
  readonly imports: readonly RelativeImport[];
  /** Forms the reader cannot place in the graph, each named with its line. */
  readonly refused: readonly string[];
}

const CORE_PACKAGE = '@yawelo-idle/core';

/** `.` and `..` name a directory's index.ts, so they are relative too. */
const isRelative = (specifier: string): boolean =>
  specifier === '.' ||
  specifier === '..' ||
  specifier.startsWith('./') ||
  specifier.startsWith('../');

/** Does the declaration bind or load a value, or is it types only? */
function carriesValue(
  node: ts.ImportDeclaration | ts.ExportDeclaration,
): boolean {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (clause === undefined) return true;
    if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return false;
    if (clause.name !== undefined) return true;
    const bindings = clause.namedBindings;
    if (bindings === undefined || ts.isNamespaceImport(bindings)) return true;
    return (
      bindings.elements.length === 0 ||
      bindings.elements.some((element) => !element.isTypeOnly)
    );
  }
  if (node.isTypeOnly) return false;
  const clause = node.exportClause;
  if (clause === undefined || ts.isNamespaceExport(clause)) return true;
  return (
    clause.elements.length === 0 ||
    clause.elements.some((element) => !element.isTypeOnly)
  );
}

export function scanModule(file: string, source: string): ModuleScan {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports: RelativeImport[] = [];
  const refused: string[] = [];
  const refuse = (node: ts.Node, problem: string) => {
    refused.push(`${file}:${String(lineOf(sf, node))}: ${problem}`);
  };

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (isRelative(specifier)) {
        imports.push({ specifier, value: carriesValue(node) });
      } else if (
        specifier === CORE_PACKAGE ||
        specifier.startsWith(`${CORE_PACKAGE}/`)
      ) {
        refuse(
          node,
          `'${specifier}' names core's own package, which loads index.ts behind the graph's back; import the module relatively`,
        );
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      refuse(
        node,
        'import = require() is CommonJS, which the graph does not read; import it statically',
      );
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        refuse(
          node,
          'dynamic import() names a module only when it runs, so the graph cannot hold it; import it statically',
        );
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        refuse(
          node,
          'require() is CommonJS, which the graph does not read; import it statically',
        );
      }
    }
    // A block body: forEachChild stops at the first callback that returns
    // something truthy, so the visitor must return nothing.
    ts.forEachChild(node, (child) => {
      visit(child);
    });
  };
  visit(sf);
  return { imports, refused };
}

/**
 * Relative specifiers in a module's RAW text, counted without the parser: a
 * `from` clause or a side-effect `import` naming `.`, `..` or a path under
 * either. The guard checks this against `scanModule`'s imports, so a reader
 * blind to one form of declaration goes red on the file holding it. A comment spelling out
 * such a clause counts too, which reddens the check rather than hiding a miss.
 */
export const rawRelativeImports = (source: string): number =>
  (source.match(/\b(?:from|import)\s*['"]\.\.?(?:\/|['"])/g) ?? []).length;

/** The value imports between a set of modules, judged together. */
export interface ImportGraph {
  /** Every module read, as its path from the root (`grammar.ts`), sorted. */
  readonly modules: readonly string[];
  /** Relative declarations judged across every module, type-only included. */
  readonly declarations: number;
  /** Each module's value imports, resolved to modules read, each listed once. */
  readonly edges: ReadonlyMap<string, readonly string[]>;
  /** Modules whose raw text names more or fewer relative modules than were judged. */
  readonly unread: readonly string[];
  /** Forms and specifiers that could not be placed in the graph, each named. */
  readonly refused: readonly string[];
}

/**
 * The module a relative specifier names, or why it names none. A specifier
 * is resolved as TypeScript's bundler resolution would within the modules
 * read: as written when it ends in `.ts`, else with `.ts` added, else as a
 * directory's `index.ts`.
 */
function resolve(
  from: string,
  specifier: string,
  modules: ReadonlySet<string>,
): { module: string } | { problem: string } {
  const path = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (path === '..' || path.startsWith('../')) {
    return { problem: `'${specifier}' reaches outside the modules read` };
  }
  const candidates = path.endsWith('.ts')
    ? [path]
    : [`${path}.ts`, posix.join(path, 'index.ts')];
  const module = candidates.find((candidate) => modules.has(candidate));
  return module === undefined
    ? { problem: `'${specifier}' names no module read here` }
    : { module };
}

/** The graph of value imports between `sources`, keyed by path from the root. */
export function importGraph(sources: ReadonlyMap<string, string>): ImportGraph {
  const modules = [...sources.keys()].sort();
  const known = new Set(modules);
  const edges = new Map<string, readonly string[]>();
  const unread: string[] = [];
  const refused: string[] = [];
  let declarations = 0;

  for (const file of modules) {
    const source = sources.get(file) ?? '';
    const scan = scanModule(file, source);
    declarations += scan.imports.length;
    refused.push(...scan.refused);

    const raw = rawRelativeImports(source);
    if (raw !== scan.imports.length) {
      unread.push(
        `${file}: the raw text names ${String(raw)} relative modules, the reader judged ${String(scan.imports.length)}`,
      );
    }

    const targets = new Set<string>();
    for (const { specifier, value } of scan.imports) {
      const resolved = resolve(file, specifier, known);
      if ('problem' in resolved) {
        refused.push(`${file}: ${resolved.problem}`);
      } else if (value) {
        targets.add(resolved.module);
      }
    }
    edges.set(file, [...targets]);
  }
  return { modules, declarations, edges, unread, refused };
}

/**
 * Every elementary cycle in `edges`, each written once as `a -> b -> a` from
 * its first module in sorted order. For each start module the search follows
 * only modules sorted after it, so a cycle is found from its smallest module
 * and from no other. An edge to a module with no entry in `edges` leads
 * nowhere.
 */
export function cycles(
  edges: ReadonlyMap<string, readonly string[]>,
): string[] {
  const found: string[] = [];
  for (const start of edges.keys()) {
    const path = [start];
    const walk = (at: string): void => {
      for (const next of edges.get(at) ?? []) {
        if (next === start) {
          found.push([...path, start].join(' -> '));
        } else if (next > start && !path.includes(next)) {
          path.push(next);
          walk(next);
          path.pop();
        }
      }
    };
    walk(start);
  }
  return found.sort();
}
