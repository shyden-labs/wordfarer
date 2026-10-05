import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cycles,
  importGraph,
  type ImportGraph,
  rawRelativeImports,
  scanModule,
} from './core-import-graph';
import { committableFiles } from './tracked-files';

/**
 * packages/core/src keeps an acyclic graph of value imports (#92).
 *
 * #32's first build put four cycles into core through every gate step. These
 * fixtures pin how the reader classifies each way a module can name another;
 * the last block runs it over the real tree.
 */

const VALUE_FORMS: [string, string][] = [
  ['a named import', "import { x } from './b';"],
  ['a default import', "import x from './b';"],
  ['a default and a named import', "import x, { y } from './b';"],
  ['a namespace import', "import * as b from './b';"],
  ['a deferred namespace import', "import defer * as b from './b';"],
  ['a side-effect import', "import './b';"],
  ['a multi-line named import', "import {\n  x,\n  y,\n} from './b';"],
  [
    'a named import with one type specifier',
    "import { type T, x } from './b';",
  ],
  ['an empty import, which still loads the module', "import {} from './b';"],
  ['a double-quoted specifier', 'import { x } from "./b";'],
  ['a named re-export', "export { x } from './b';"],
  ['a multi-line re-export', "export {\n  x,\n  y,\n} from './b';"],
  ['a star re-export', "export * from './b';"],
  ['a namespace re-export', "export * as b from './b';"],
  ['a re-export with one type specifier', "export { type T, x } from './b';"],
  ['an empty re-export, which still loads the module', "export {} from './b';"],
];

const TYPE_FORMS: [string, string][] = [
  ['import type with names', "import type { T } from './b';"],
  ['import type with a default', "import type T from './b';"],
  ['import type with a namespace', "import type * as b from './b';"],
  ['an import whose one specifier is a type', "import { type T } from './b';"],
  [
    'an import whose every specifier is a type',
    "import { type T, type U } from './b';",
  ],
  ['export type with names', "export type { T } from './b';"],
  [
    'a re-export whose every specifier is a type',
    "export { type T } from './b';",
  ],
  ['export type star', "export type * from './b';"],
];

describe('scanModule reads a value import from every form', () => {
  it.each(VALUE_FORMS)('%s', (_label, source) => {
    expect(scanModule('a.ts', source)).toEqual({
      imports: [{ specifier: './b', value: true }],
      refused: [],
    });
  });

  it('reads a parent-relative specifier as written', () => {
    expect(scanModule('x/a.ts', "import { x } from '../b';")).toEqual({
      imports: [{ specifier: '../b', value: true }],
      refused: [],
    });
  });

  it.each([
    ['the current directory', '.'],
    ['the parent directory', '..'],
  ])('reads %s as a relative specifier', (_label, specifier) => {
    expect(scanModule('x/a.ts', `import { x } from '${specifier}';`)).toEqual({
      imports: [{ specifier, value: true }],
      refused: [],
    });
  });

  it('reads every declaration in a module, in source order', () => {
    const source = [
      "import { a } from './a';",
      "import type { T } from './t';",
      "export { c } from './c';",
      "import './d';",
    ].join('\n');
    expect(scanModule('m.ts', source)).toEqual({
      imports: [
        { specifier: './a', value: true },
        { specifier: './t', value: false },
        { specifier: './c', value: true },
        { specifier: './d', value: true },
      ],
      refused: [],
    });
  });
});

describe('scanModule reads a type-only declaration as no edge', () => {
  it.each(TYPE_FORMS)('%s', (_label, source) => {
    expect(scanModule('a.ts', source)).toEqual({
      imports: [{ specifier: './b', value: false }],
      refused: [],
    });
  });
});

describe('scanModule leaves a package import out of the graph', () => {
  it.each([
    ['a bare package', "import Decimal from 'break_infinity.js';"],
    ['a scoped package', "import pow from '@stdlib/math-base-special-pow';"],
    ['a package re-export', "export { z } from 'zod';"],
  ])('%s', (_label, source) => {
    expect(scanModule('a.ts', source)).toEqual({ imports: [], refused: [] });
  });
});

describe('scanModule refuses what it cannot place in the graph, by name', () => {
  it.each([
    [
      'a dynamic import()',
      "export const m = import('./b');",
      'a.ts:1: dynamic import() names a module only when it runs, so the graph cannot hold it; import it statically',
    ],
    [
      'a dynamic import() of a package, whose name could be computed',
      "export const m = import('zod');",
      'a.ts:1: dynamic import() names a module only when it runs, so the graph cannot hold it; import it statically',
    ],
    [
      'a require() call',
      "export const m = require('./b');",
      'a.ts:1: require() is CommonJS, which the graph does not read; import it statically',
    ],
    [
      'an import-equals require',
      "import b = require('./b');",
      'a.ts:1: import = require() is CommonJS, which the graph does not read; import it statically',
    ],
    [
      'core importing its own package by name',
      "import { x } from '@yawelo-idle/core';",
      "a.ts:1: '@yawelo-idle/core' names core's own package, which loads index.ts behind the graph's back; import the module relatively",
    ],
    [
      'core importing a subpath of its own package',
      "import { x } from '@yawelo-idle/core/sim';",
      "a.ts:1: '@yawelo-idle/core/sim' names core's own package, which loads index.ts behind the graph's back; import the module relatively",
    ],
  ])('%s', (_label, source, refusal) => {
    expect(scanModule('a.ts', source).refused).toEqual([refusal]);
  });

  it('names the line of a refusal deep inside a function', () => {
    const source = "export function f() {\n  return () => import('./b');\n}";
    expect(scanModule('a.ts', source).refused).toEqual([
      'a.ts:2: dynamic import() names a module only when it runs, so the graph cannot hold it; import it statically',
    ]);
  });

  it('refuses every unplaceable form in a module, not only the first', () => {
    const source =
      "export const a = import('./a');\nexport const b = require('./b');";
    expect(scanModule('a.ts', source).refused).toHaveLength(2);
  });

  it('is not misled by a comment or a string naming import()', () => {
    const source =
      "// import('./b') would be refused\nexport const s = \"require('./b')\";";
    expect(scanModule('a.ts', source)).toEqual({ imports: [], refused: [] });
  });
});

describe('rawRelativeImports counts relative specifiers in the raw text', () => {
  it.each([
    ['a single-line import', "import { x } from './b';", 1],
    ['a multi-line import', "import {\n  x,\n} from './b';", 1],
    ['a re-export', "export * from './b';", 1],
    ['a side-effect import', "import './b';", 1],
    ['a double-quoted specifier', 'import { x } from "./b";', 1],
    ['a parent-relative specifier', "import { x } from '../b';", 1],
    ['a bare current directory', "import { x } from '.';", 1],
    ['a bare parent directory', "import { x } from '..';", 1],
    ['a name that only starts with a dot', "import x from '.x';", 0],
    [
      'a type-only import, which is still a declaration',
      "import type { T } from './b';",
      1,
    ],
    ['a package import', "import Decimal from 'break_infinity.js';", 0],
    [
      'three declarations',
      "import { a } from './a';\nimport type { T } from './t';\nexport { c } from './c';",
      3,
    ],
  ])('%s', (_label, source, count) => {
    expect(rawRelativeImports(source)).toBe(count);
  });
});

const graphOf = (modules: Record<string, string>) =>
  importGraph(new Map(Object.entries(modules)));

const edgesOf = (edges: Record<string, string[]>) =>
  new Map(Object.entries(edges));

describe('importGraph resolves each value import to a module read', () => {
  it('resolves a sibling specifier to its .ts module', () => {
    const graph = graphOf({ 'a.ts': "import { x } from './b';", 'b.ts': '' });
    expect(graph.edges.get('a.ts')).toEqual(['b.ts']);
  });

  it('resolves an explicit .ts specifier', () => {
    const graph = graphOf({
      'a.ts': "import { x } from './b.ts';",
      'b.ts': '',
    });
    expect(graph.edges.get('a.ts')).toEqual(['b.ts']);
  });

  it('resolves a directory specifier to its index.ts', () => {
    const graph = graphOf({
      'a.ts': "import { x } from './x';",
      'x/index.ts': '',
    });
    expect(graph.edges.get('a.ts')).toEqual(['x/index.ts']);
  });

  it('resolves a specifier into and out of a subdirectory', () => {
    const graph = graphOf({
      'a.ts': "import { c } from './x/c';",
      'x/c.ts': "import { b } from '../b';",
      'b.ts': '',
    });
    expect(graph.edges.get('a.ts')).toEqual(['x/c.ts']);
    expect(graph.edges.get('x/c.ts')).toEqual(['b.ts']);
  });

  it('resolves the current directory to its index.ts', () => {
    const graph = graphOf({ 'a.ts': "import { x } from '.';", 'index.ts': '' });
    expect(graph.edges.get('a.ts')).toEqual(['index.ts']);
  });

  it('resolves the parent directory to its index.ts', () => {
    const graph = graphOf({
      'x/c.ts': "import { x } from '..';",
      'index.ts': '',
    });
    expect(graph.edges.get('x/c.ts')).toEqual(['index.ts']);
  });

  it('lists an edge once, however many declarations name the module', () => {
    const graph = graphOf({
      'a.ts': "import { x } from './b';\nexport { y } from './b';",
      'b.ts': '',
    });
    expect(graph.edges.get('a.ts')).toEqual(['b.ts']);
    expect(graph.declarations).toBe(2);
  });

  it('counts a type-only declaration but draws no edge for it', () => {
    const graph = graphOf({
      'a.ts': "import type { T } from './b';",
      'b.ts': '',
    });
    expect(graph.declarations).toBe(1);
    expect(graph.edges.get('a.ts')).toEqual([]);
  });

  it('lists every module read, sorted, with an entry in edges', () => {
    const graph = graphOf({ 'b.ts': '', 'a.ts': '' });
    expect(graph.modules).toEqual(['a.ts', 'b.ts']);
    expect([...graph.edges.keys()]).toEqual(['a.ts', 'b.ts']);
  });
});

describe('importGraph refuses what it cannot resolve, by name', () => {
  it('refuses a specifier naming no module read', () => {
    expect(graphOf({ 'a.ts': "import { x } from './nope';" }).refused).toEqual([
      "a.ts: './nope' names no module read here",
    ]);
  });

  it('refuses a specifier reaching outside the modules read', () => {
    expect(graphOf({ 'a.ts': "import { x } from '../b';" }).refused).toEqual([
      "a.ts: '../b' reaches outside the modules read",
    ]);
  });

  it('refuses the parent directory of the modules read', () => {
    expect(graphOf({ 'a.ts': "import { x } from '..';" }).refused).toEqual([
      "a.ts: '..' reaches outside the modules read",
    ]);
  });

  it('refuses a type-only specifier naming no module, too', () => {
    expect(
      graphOf({ 'a.ts': "import type { T } from './nope';" }).refused,
    ).toEqual(["a.ts: './nope' names no module read here"]);
  });

  it('carries the reader’s own refusals from every module', () => {
    const graph = graphOf({
      'a.ts': "export const m = import('./b');",
      'b.ts': "export const r = require('./a');",
    });
    expect(graph.refused).toHaveLength(2);
  });
});

describe('importGraph cross-checks each module against its raw text', () => {
  it('passes a module whose every relative specifier was judged', () => {
    const graph = graphOf({
      'a.ts': "import {\n  x,\n} from './b';\nexport * from './b';",
      'b.ts': '',
    });
    expect(graph.unread).toEqual([]);
  });

  it('names a module whose raw text holds a specifier the reader did not judge', () => {
    // A comment spelling out a clause is counted by the raw text alone, so it
    // stands in here for a declaration form the reader is blind to.
    const graph = graphOf({
      'a.ts': "// see: import { y } from './b';\nimport { x } from './b';",
      'b.ts': '',
    });
    expect(graph.unread).toEqual([
      'a.ts: the raw text names 2 relative modules, the reader judged 1',
    ]);
  });
});

describe('cycles names each value-import cycle once', () => {
  it('finds none in a chain', () => {
    expect(
      cycles(edgesOf({ 'a.ts': ['b.ts'], 'b.ts': ['c.ts'], 'c.ts': [] })),
    ).toEqual([]);
  });

  it('finds none in a diamond, where two paths meet without returning', () => {
    expect(
      cycles(
        edgesOf({
          'a.ts': ['b.ts', 'c.ts'],
          'b.ts': ['d.ts'],
          'c.ts': ['d.ts'],
          'd.ts': [],
        }),
      ),
    ).toEqual([]);
  });

  it('names a two-module cycle', () => {
    expect(cycles(edgesOf({ 'a.ts': ['b.ts'], 'b.ts': ['a.ts'] }))).toEqual([
      'a.ts -> b.ts -> a.ts',
    ]);
  });

  it('names a module that imports itself', () => {
    expect(cycles(edgesOf({ 'a.ts': ['a.ts'] }))).toEqual(['a.ts -> a.ts']);
  });

  it('names a longer cycle once, from its first module in sorted order', () => {
    expect(
      cycles(edgesOf({ 'c.ts': ['a.ts'], 'b.ts': ['c.ts'], 'a.ts': ['b.ts'] })),
    ).toEqual(['a.ts -> b.ts -> c.ts -> a.ts']);
  });

  it('names two cycles that share a module', () => {
    expect(
      cycles(
        edgesOf({
          'a.ts': ['b.ts'],
          'b.ts': ['a.ts', 'c.ts'],
          'c.ts': ['b.ts'],
        }),
      ),
    ).toEqual(['a.ts -> b.ts -> a.ts', 'b.ts -> c.ts -> b.ts']);
  });

  it('names both of #32’s cycles through grammar and sim', () => {
    expect(
      cycles(
        edgesOf({
          'grammar.ts': ['sim.ts'],
          'sim.ts': ['grammar.ts', 'production.ts'],
          'production.ts': ['grammar.ts'],
        }),
      ),
    ).toEqual([
      'grammar.ts -> sim.ts -> grammar.ts',
      'grammar.ts -> sim.ts -> production.ts -> grammar.ts',
    ]);
  });

  it('lists the cycles in sorted order, whatever order they are found in', () => {
    expect(
      cycles(
        edgesOf({
          'a.ts': ['c.ts', 'b.ts'],
          'b.ts': ['a.ts'],
          'c.ts': ['a.ts'],
        }),
      ),
    ).toEqual(['a.ts -> b.ts -> a.ts', 'a.ts -> c.ts -> a.ts']);
  });

  it('ignores an edge to a module outside the map', () => {
    expect(cycles(edgesOf({ 'a.ts': ['zod'] }))).toEqual([]);
  });

  it('finds no cycle through a type-only import', () => {
    const graph = graphOf({
      'a.ts': "import type { T } from './b';",
      'b.ts': "import { a } from './a';",
    });
    expect(cycles(graph.edges)).toEqual([]);
  });

  it('finds the cycle when the same import carries a value', () => {
    const graph = graphOf({
      'a.ts': "import { b } from './b';",
      'b.ts': "import { a } from './a';",
    });
    expect(cycles(graph.edges)).toEqual(['a.ts -> b.ts -> a.ts']);
  });
});

describe('packages/core/src holds no value-import cycle', () => {
  // Read inside each test, not in the describe body: a throw at collection
  // time fails the file as "no tests" instead of naming the broken assertion.
  const ROOT = 'packages/core/src/';
  const corePaths = () =>
    committableFiles().filter((path) => path.startsWith(ROOT));
  const coreGraph = () =>
    importGraph(
      new Map(
        corePaths()
          .filter((path) => path.endsWith('.ts'))
          .map((path) => [path.slice(ROOT.length), readFileSync(path, 'utf8')]),
      ),
    );
  const edgeCount = (graph: ImportGraph) =>
    [...graph.edges.values()].reduce((n, targets) => n + targets.length, 0);

  it('every file under packages/core/src is a .ts module the graph reads', () => {
    expect(corePaths().filter((path) => !path.endsWith('.ts'))).toEqual([]);
  });

  it('reads every module (liveness)', () => {
    // Measured 24 modules with hash.ts (#34; 21 at #33, 20 at #92). Lower it only in the commit that removes one.
    expect(coreGraph().modules.length).toBeGreaterThan(23);
  });

  it('judges every relative import and export declaration (liveness)', () => {
    // Measured 120 declarations with hash.ts (#34; 108 at #33, 97 at #92), type-only ones included.
    expect(coreGraph().declarations).toBeGreaterThan(119);
  });

  it('draws an edge for every module a value is imported from (liveness)', () => {
    // Measured 94 edges with hash.ts (#34; 87 at #33, 77 at #92): the population the cycle check judges.
    expect(edgeCount(coreGraph())).toBeGreaterThan(93);
  });

  it('reads each module’s relative imports as its raw text counts them', () => {
    expect(coreGraph().unread).toEqual([]);
  });

  it('refuses no import it cannot place in the graph', () => {
    expect(coreGraph().refused).toEqual([]);
  });

  it('holds no value-import cycle', () => {
    expect(cycles(coreGraph().edges)).toEqual([]);
  });
});
