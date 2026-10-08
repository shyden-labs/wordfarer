/**
 * The route (M1 design §5, #31): the course's destinations in the order a
 * player sails them, region by region in course order. A destination's
 * number is its place on the route, from 0, and state holds that number,
 * never content.
 *
 * A new game is at destination 0 in the first region. A course may give that
 * region no destinations (a test course often does); the player is still in
 * it. Any other number the course does not have means the state was played
 * on a different course, which is refused by name rather than guessed.
 */
import type { Course, Destination, Region } from './course';
import { memosOn } from './memo';
import type { GameState } from './state';

/** A destination and the region it lies in. */
export interface Stop {
  /** The region's place in the course, from 0. */
  readonly region: number;
  readonly destination: Destination;
}

/** Each course's route, worked out once: a course is never mutated (#297). */
const routeMemo = new WeakMap<Course, readonly Stop[]>();

/** Every destination of the course, numbered region by region in course order. */
export function route(course: Course): readonly Stop[] {
  if (!memosOn()) return stopsOf(course);
  let stops = routeMemo.get(course);
  if (stops === undefined) {
    stops = stopsOf(course);
    routeMemo.set(course, stops);
  }
  return stops;
}

function stopsOf(course: Course): readonly Stop[] {
  return course.regions.flatMap((region, r) =>
    region.destinations.map((destination) => ({ region: r, destination })),
  );
}

/**
 * Stop `n` of the route, or `undefined` for a new game on a course whose
 * first region has no destinations. Any other missing stop is refused.
 */
function stopAt(course: Course, n: number): Stop | undefined {
  const stop = route(course)[n];
  if (stop === undefined && n !== 0) {
    throw new RangeError(`the course has no destination ${String(n)}`);
  }
  return stop;
}

function regionIndex(course: Course, n: number): number {
  return stopAt(course, n)?.region ?? 0;
}

/** The destination the player is at: words are picked up from its lexicon. */
export function currentDestination(
  course: Course,
  state: GameState,
): Destination | undefined {
  return stopAt(course, state.destination)?.destination;
}

/** The region the player is in: Journeys draw its culture cards. */
export function currentRegion(course: Course, state: GameState): Region {
  const index = regionIndex(course, state.destination);
  const region = course.regions[index];
  if (region === undefined) {
    throw new RangeError(`the course has no region ${String(index)}`);
  }
  return region;
}

/**
 * How many regions, counted from the first, the player has reached: the
 * Encounters of each can be bought (operator, 2026-10-03).
 */
export function regionsReached(course: Course, state: GameState): number {
  return regionIndex(course, state.reached) + 1;
}
