/**
 * Culture card bonuses (parent spec §4.2, M1 design §5, #30).
 *
 * A held card raises every Encounter sharing one of its tags: the `cards`
 * line is 1 + the sum of those cards' bonuses, each doubled while its
 * festival's wall-clock window is live. A complete set raises every
 * Encounter: the `sets` line is 1 + the sum of the complete sets' bonuses.
 * Both are derived from the held cards, so a set's bonus counts once however
 * its cards arrived. Sums run in course order, so they add alike on every
 * engine.
 */
import { BALANCE } from './balance';
import type { Course, CultureCard, Encounter } from './course';
import { memosOn } from './memo';
import type { GameState } from './state';
import { sharesTag } from './words';

const cardIndexes = new WeakMap<Course, ReadonlyMap<string, CultureCard>>();

/** The culture card `id` anywhere in the course. */
export function cultureCard(course: Course, id: string): CultureCard {
  let index = cardIndexes.get(course);
  if (index === undefined) {
    const built = new Map<string, CultureCard>();
    for (const region of course.regions) {
      for (const card of region.cultureCards) built.set(card.id, card);
    }
    cardIndexes.set(course, built);
    index = built;
  }
  const card = index.get(id);
  if (card === undefined) {
    throw new RangeError(`card ${id} is not in course ${course.id}`);
  }
  return card;
}

/**
 * The held cards of each list of held ids, kept by course, then by the list.
 * State is never mutated, so a list stands for its contents; every rate a
 * Pemandu catch-up works out reads the same list (#297).
 */
const heldMemo = new WeakMap<
  Course,
  WeakMap<readonly string[], readonly CultureCard[]>
>();

/** The held cards in course order. A held id the course lacks is refused. */
export function heldCards(
  course: Course,
  state: GameState,
): readonly CultureCard[] {
  if (!memosOn()) return holding(course, state.cards);
  let byList = heldMemo.get(course);
  if (byList === undefined) {
    byList = new WeakMap();
    heldMemo.set(course, byList);
  }
  let kept = byList.get(state.cards);
  if (kept === undefined) {
    kept = holding(course, state.cards);
    byList.set(state.cards, kept);
  }
  return kept;
}

/** The cards `ids` names, in course order; an id the course lacks is refused. */
function holding(
  course: Course,
  ids: readonly string[],
): readonly CultureCard[] {
  for (const id of ids) cultureCard(course, id);
  const held = new Set(ids);
  return course.regions.flatMap((region) =>
    region.cultureCards.filter((card) => held.has(card.id)),
  );
}

/** Whether one of `card`'s festival windows holds wall time `wall`. */
export function festivalLive(card: CultureCard, wall: number): boolean {
  return (
    card.festival?.windows.some(
      (w) => w.startWallMs <= wall && wall < w.endWallMs,
    ) ?? false
  );
}

/**
 * The `cards` line for `encounter` at wall time `wall`, or `undefined` when
 * no held card shares one of its tags.
 */
export function cardFactor(
  held: readonly CultureCard[],
  encounter: Encounter,
  wall: number,
): number | undefined {
  let factor: number | undefined;
  for (const card of held) {
    if (!sharesTag(card.tags, encounter.tags)) continue;
    const season = festivalLive(card, wall)
      ? BALANCE.seasons.inSeasonMultiplier
      : 1;
    factor = (factor ?? 1) + card.bonus * season;
  }
  return factor;
}

/** The `sets` line, or `undefined` when no set is complete. */
export function setFactor(
  course: Course,
  held: readonly CultureCard[],
): number | undefined {
  const ids = new Set(held.map((card) => card.id));
  let factor: number | undefined;
  for (const region of course.regions) {
    for (const set of region.cardSets) {
      const cards = region.cultureCards.filter((c) => c.setId === set.id);
      if (cards.length > 0 && cards.every((c) => ids.has(c.id))) {
        factor = (factor ?? 1) + set.bonus;
      }
    }
  }
  return factor;
}

/**
 * The first festival edge (a window's start or end) of a held card after
 * wall time `wall`, or `undefined` when none is ahead. Production splits
 * there, so the rate changes exactly at the edge (design §5).
 */
export function nextFestivalEdge(
  held: readonly CultureCard[],
  wall: number,
): number | undefined {
  let next: number | undefined;
  for (const card of held) {
    for (const w of card.festival?.windows ?? []) {
      for (const edge of [w.startWallMs, w.endWallMs]) {
        if (edge > wall && (next === undefined || edge < next)) next = edge;
      }
    }
  }
  return next;
}
