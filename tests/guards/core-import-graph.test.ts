import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cycles,
  importGraph,
  type ImportGraph,
} from '../unit/core-import-graph';
import { committableFiles } from '../unit/tracked-files';
import { floorBreach } from '../floors';
import { searched } from '../searched';

/**
 * The import-graph guard over every module git has under packages/core/src (#33).
 * It reads the whole repository, a cost that grows with the tree, so it runs
 * in the guards suite (#515). The reader's tests on planted fixtures are unit
 * tests (tests/unit/core-import-graph.test.ts).
 */

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
    const paths = corePaths();
    const notModules = paths.filter((path) => !path.endsWith('.ts'));
    expect(searched(notModules, { of: paths, what: 'core paths' })).toEqual([]);
    expect(
      floorBreach('core-import-graph/core-paths', paths.length),
    ).toBeUndefined();
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
    const graph = coreGraph();
    expect(
      searched(graph.unread, { of: graph.modules, what: 'core modules' }),
    ).toEqual([]);
    expect(
      floorBreach(
        'core-import-graph/cross-checked-modules',
        graph.modules.length,
      ),
    ).toBeUndefined();
  });

  it('refuses no import it cannot place in the graph', () => {
    const graph = coreGraph();
    expect(
      searched(graph.refused, {
        of: graph.declarations,
        what: 'core declarations',
      }),
    ).toEqual([]);
    expect(
      floorBreach('core-import-graph/placed-declarations', graph.declarations),
    ).toBeUndefined();
  });

  it('holds no value-import cycle', () => {
    const graph = coreGraph();
    expect(
      searched(cycles(graph.edges), {
        of: graph.modules,
        what: 'core modules',
      }),
    ).toEqual([]);
    expect(
      floorBreach('core-import-graph/cycle-modules', graph.modules.length),
    ).toBeUndefined();
  });
});
