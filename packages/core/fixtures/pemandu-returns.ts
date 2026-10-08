import { DAY_MS, simMs, wallMs, type WallMs } from '../src/clock';
import type { Course } from '../src/course';
import { newWordMemory, review, type WordMemory } from '../src/memory';
import { Num } from '../src/num';
import { route } from '../src/route';
import { setAutomation } from '../src/sim';
import { initialState, type GameState } from '../src/state';
import { BOT_EPOCH_WALL_MS } from './synthetic-course';

/**
 * Two players about to return to Pemandu at 1 s on the synthetic course, for
 * #33's 72 h return and #297's per-purchase benchmark: one at region 2's
 * first destination, one with every region reached and every word held.
 */

const START = wallMs(BOT_EPOCH_WALL_MS + 60 * DAY_MS);
const PARKED = simMs(40 * DAY_MS);

/**
 * Each word reviewed twice at its own time over the 20 days before `START`,
 * the first reviews `stepMs` apart: an hour for region 1's 187 words, half
 * an hour for all 450, so every second review still falls before `START`.
 */
function held(
  ids: readonly string[],
  stepMs: number,
): Record<string, WordMemory> {
  return Object.fromEntries(
    ids.map((id, k) => {
      const first = wallMs(START - 20 * DAY_MS + k * stepMs);
      const second = wallMs(first + ((k % 7) + 1) * DAY_MS);
      const word = review(
        review(newWordMemory(first), first, true),
        second,
        k % 5 !== 0,
      );
      return [id, word];
    }),
  );
}

/** `parked` with Pemandu on at 1 s, or a throw naming the refusal. */
function withPemandu(course: Course, parked: GameState): GameState {
  const on = setAutomation(course, parked, true, 1_000);
  if (!on.ok) throw new Error(`refused: ${JSON.stringify(on.rejection)}`);
  return on.state;
}

/**
 * The player has finished region 1 and stands at region 2's first
 * destination: every word of region 1 and of that destination held, every
 * Encounter of region 1 owned and a few of region 2's (#33 AC5).
 */
export function regionOneReturn(course: Course): GameState {
  const ids = [
    ...(course.regions[0]?.destinations ?? []),
    course.regions[1]?.destinations[0],
  ].flatMap((d) => d?.lexicon.map((item) => item.id) ?? []);
  return withPemandu(course, {
    ...initialState(START, 1),
    sim: PARKED,
    anchor: { sim: PARKED, understanding: Num.toTuple(Num.from(2e7)) },
    words: held(ids, 3_600_000),
    memorySince: PARKED,
    owned: {
      'r0-e0': 60,
      'r0-e1': 45,
      'r0-e2': 30,
      'r0-e3': 20,
      'r0-e4': 10,
      'r0-e5': 5,
      'r1-e0': 3,
    },
    upgrades: {
      offlineCap: 2,
      pemanduFaster1: 1,
      pemanduFaster2: 1,
      pemanduFaster3: 1,
    },
    destination: 4,
    reached: 4,
  });
}

/**
 * The late game (#297 AC1): every destination reached, every word of the
 * course held, every Encounter owned, every culture card held, as the golden
 * player stands near its fifth week but with all the words.
 */
export function lateGameReturn(course: Course): GameState {
  const ids = course.regions.flatMap((region) =>
    region.destinations.flatMap((d) => d.lexicon.map((item) => item.id)),
  );
  const last = route(course).length - 1;
  const owned = Object.fromEntries(
    course.regions.flatMap((region, r) =>
      region.encounters.map((e, k) => [e.id, (3 - r) * 40 + (6 - k) * 15]),
    ),
  );
  return withPemandu(course, {
    ...initialState(START, 1),
    sim: PARKED,
    anchor: { sim: PARKED, understanding: Num.toTuple(Num.from(1e12)) },
    words: held(ids, 1_800_000),
    memorySince: PARKED,
    owned,
    cards: course.regions.flatMap((region) =>
      region.cultureCards.map((card) => card.id),
    ),
    upgrades: {
      offlineCap: 2,
      pemanduFaster1: 1,
      pemanduFaster2: 1,
      pemanduFaster3: 1,
    },
    destination: last,
    reached: last,
  });
}

/** When a return of `hours` from `state` ends, on its wall clock. */
export const returnsAt = (state: GameState, hours: number): WallMs =>
  wallMs(state.wall + hours * 3_600_000);
