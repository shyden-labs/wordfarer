/**
 * Grammar nodes (parent §4.3, design §5, #32).
 *
 * A node is content: the roots it attaches to and the words it derives. It is
 * bought with Insight once grammar has opened (region 2) and the node's own
 * region is reached, as Encounters are. The next node costs
 * costC0 x costGrowth^n, `n` being the nodes already owned, so the player
 * chooses the order and the price follows the count. Each owned node
 * multiplies the bonus of every word on its roots by (1 + g).
 * Buying one is an action, so `buyGrammarNode` is in `sim.ts` with the
 * others.
 */
import { BALANCE } from './balance';
import type { Course, GrammarNode } from './course';
import { Num } from './num';
import type { GameState } from './state';

const COST_C0 = Num.from(BALANCE.grammar.costC0);
const COST_GROWTH = Num.from(BALANCE.grammar.costGrowth);

/** The Insight cost of the next node when `owned` nodes are owned. */
export function grammarNodeCost(owned: number): Num {
  if (!Number.isSafeInteger(owned) || owned < 0) {
    throw new RangeError(
      `owned must be a safe non-negative integer, got ${String(owned)}`,
    );
  }
  return Num.mul(COST_C0, Num.pow(COST_GROWTH, owned));
}

/** Node `id` and the index of the region that holds it, if the course has it. */
export function findGrammarNode(
  course: Course,
  id: string,
): { readonly node: GrammarNode; readonly region: number } | undefined {
  for (const [region, { grammarNodes }] of course.regions.entries()) {
    const node = grammarNodes.find((n) => n.id === id);
    if (node !== undefined) return { node, region };
  }
  return undefined;
}

/**
 * The owned nodes in course order, not the order they were bought, so the
 * pick-up pool never depends on purchase order (design §5, #32).
 */
export function ownedGrammarNodes(
  course: Course,
  state: GameState,
): readonly GrammarNode[] {
  return course.regions.flatMap((region) =>
    region.grammarNodes.filter((node) => state.grammar.includes(node.id)),
  );
}

/**
 * Each root an owned node attaches to, with its factor: (1 + g) once per
 * owned node on it, so nodes on one root compound (design §5, #32). A root
 * absent from the map has factor 1. The product is the same in any order,
 * since every factor is the same number.
 */
export function rootFactors(
  course: Course,
  state: GameState,
): ReadonlyMap<string, number> {
  const gain = 1 + BALANCE.grammar.rootGain;
  const factors = new Map<string, number>();
  for (const id of state.grammar) {
    const found = findGrammarNode(course, id);
    if (found === undefined) {
      throw new RangeError(`grammar node ${id} is not in course ${course.id}`);
    }
    for (const root of found.node.roots) {
      factors.set(root, (factors.get(root) ?? 1) * gain);
    }
  }
  return factors;
}
