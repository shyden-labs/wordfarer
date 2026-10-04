/**
 * Words (parent spec §3.3): pick-up, tags and the rank bonus.
 *
 * Spending Understanding picks up the next item of the pick-up pool in
 * curriculum order: CEFR first, then the pool's own order. The pool is the
 * current destination's lexicon, then the phrase packs of the held culture
 * cards in course order (design §5, #30), then the derived words of the owned
 * grammar nodes in course order (#32).
 * Each word boosts every Encounter sharing one of its tags by
 * b_w = rankBonus[rank] x (floorShare + (1 - floorShare) x R), so it never
 * falls below floorShare x rankBonus however long it goes unreviewed (DN16).
 */
import { BALANCE, type Rank } from './balance';
import type {
  Cefr,
  Course,
  CultureCard,
  Destination,
  GrammarNode,
  LexiconItem,
} from './course';
import { Num } from './num';

const CEFR_ORDER: Readonly<Record<Cefr, number>> = { A1: 0, A2: 1, B1: 2 };
const PICK_UP_C0 = Num.from(BALANCE.words.pickUpC0);
const PICK_UP_GROWTH = Num.from(BALANCE.words.pickUpGrowth);

/**
 * The pick-up pool in curriculum order: `destination`'s lexicon (the current
 * one, from `route.ts`), then the phrase packs of `held` (the held cards, in
 * course order), then the derived words of `nodes` (the owned grammar nodes,
 * in course order), sorted by CEFR.
 */
export function pickUpPool(
  destination: Destination | undefined,
  held: readonly CultureCard[],
  nodes: readonly GrammarNode[],
): readonly LexiconItem[] {
  const lexicon = destination?.lexicon ?? [];
  // Array.prototype.sort is stable, so equal CEFR keeps the pool's order.
  return [
    ...lexicon,
    ...held.flatMap((card) => card.phrasePack),
    ...nodes.flatMap((node) => node.derived),
  ].sort((a, b) => CEFR_ORDER[a.cefr] - CEFR_ORDER[b.cefr]);
}

/** The cost of the next pick-up when `picked` items of the destination are held. */
export function pickUpCost(picked: number): Num {
  if (!Number.isSafeInteger(picked) || picked < 0) {
    throw new RangeError(
      `picked must be a safe non-negative integer, got ${String(picked)}`,
    );
  }
  return Num.mul(PICK_UP_C0, Num.pow(PICK_UP_GROWTH, picked));
}

/** A word's bonus at `rank` with mean retrievability `meanR` (parent §3.3). */
export function wordBonus(rank: Rank, meanR: number): number {
  const { rankBonus, floorShare } = BALANCE.words;
  return rankBonus[rank] * (floorShare + (1 - floorShare) * meanR);
}

/** Whether two tag lists share at least one tag. */
export function sharesTag(a: readonly string[], b: readonly string[]): boolean {
  return a.some((tag) => b.includes(tag));
}

const itemIndexes = new WeakMap<Course, ReadonlyMap<string, LexiconItem>>();

/**
 * The lexicon item `id` anywhere in the course: a destination's, a card's
 * phrase pack's, or a grammar node's derived word.
 */
export function lexiconItem(course: Course, id: string): LexiconItem {
  let index = itemIndexes.get(course);
  if (index === undefined) {
    const built = new Map<string, LexiconItem>();
    for (const region of course.regions) {
      for (const destination of region.destinations) {
        for (const item of destination.lexicon) built.set(item.id, item);
      }
      for (const card of region.cultureCards) {
        for (const item of card.phrasePack) built.set(item.id, item);
      }
      for (const node of region.grammarNodes) {
        for (const item of node.derived) built.set(item.id, item);
      }
    }
    itemIndexes.set(course, built);
    index = built;
  }
  const item = index.get(id);
  if (item === undefined) {
    throw new RangeError(`word ${id} is not in course ${course.id}`);
  }
  return item;
}
