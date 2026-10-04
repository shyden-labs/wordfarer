/**
 * Set Sail (parent §4.4, §4.7, M1 design §5, #31): the run's goal, the
 * stamps a sail pays, the order destinations unlock in, the finale and
 * Mastery mode, and the preview the player sees before confirming (DN3).
 *
 * Destination `i` (its number on the route) needs `U_goal(i)`, the `i`-th
 * entry of `BALANCE.sail.goals` (#35), times `1.5^replays` in Mastery mode, earned this run, and `words(i)` of
 * its own lexicon held. `U_run` is what is held plus what this run spent, so
 * buying never moves the goal away. A sail pays
 * `floor(k · sqrt(U_run / goal))` stamps; `Math.sqrt` is correctly rounded on
 * every engine, so the gain is the same everywhere. It resets Encounters and
 * Understanding and nothing else.
 *
 * Before the finale a sail goes to the next destination, if its region is
 * playable. The sail from the course's last destination sets the finale
 * flag; from then on every sail names a visited destination to replay.
 */
import { BALANCE } from './balance';
import type { Course } from './course';
import { Num } from './num';
import { understandingNow } from './production';
import { currentDestination, route } from './route';
import type { Rejection, Result } from './sim';
import { pickedWord, type GameState } from './state';
import { startingUnderstanding } from './upgrades';

const ZERO = Num.toTuple(Num.from(0));

/** What the run must reach before Set Sail is available (AC1). */
export interface SailGoal {
  /** Understanding to earn this run (`U_run`). */
  readonly understanding: Num;
  /** Words of the destination's own lexicon to hold. */
  readonly words: number;
}

/** What the player sees before confirming a sail (DN3, DN6). */
export interface SailPreview {
  /** The destination the player is at; `undefined` on a course with none. */
  readonly destination: string | undefined;
  /**
   * Where a sail goes without a choice: the next destination. `undefined`
   * when the player names a visited destination to replay (the finale sail
   * and Mastery mode) or the course has no next one.
   */
  readonly next: string | undefined;
  readonly goal: SailGoal;
  readonly progress: SailGoal;
  /** Whether a sail would be accepted now (to `next`, or to a replay). */
  readonly available: boolean;
  readonly resets: {
    /** Encounters owned now, all of which a sail removes. */
    readonly encounters: Readonly<Record<string, number>>;
    /** Understanding held now, which a sail replaces with the starting grant. */
    readonly understanding: Num;
    readonly startingUnderstanding: number;
  };
  readonly gains: { readonly stamps: number };
  readonly keeps: {
    readonly words: number;
    readonly cards: number;
    /** Upgrade levels owned, added over every upgrade. */
    readonly upgradeLevels: number;
    /** Grammar nodes owned (#32). */
    readonly grammarNodes: number;
    /** Stamps held after the sail pays. */
    readonly stamps: number;
  };
}

/** How many times destination `id` has been replayed. Reads own keys only. */
function replayCount(state: GameState, id: string): number {
  return Object.hasOwn(state.replays, id) ? (state.replays[id] ?? 0) : 0;
}

/** The goal of the run at the current destination (AC1, AC5). */
export function sailGoal(course: Course, state: GameState): SailGoal {
  const i = state.destination;
  const here = currentDestination(course, state)?.id;
  const replays = here === undefined ? 0 : replayCount(state, here);
  const { goals, wordsBase, wordsStep } = BALANCE.sail;
  const base = goals[i];
  if (base === undefined) {
    throw new RangeError(
      `destination ${String(i)} (${here ?? 'none'}) has no goal in BALANCE.sail.goals`,
    );
  }
  const understanding = Num.mul(
    Num.from(base),
    Num.pow(Num.from(BALANCE.mastery.goalGrowthPerReplay), replays),
  );
  return { understanding, words: wordsBase + wordsStep * i };
}

/** `U_run`: the Understanding earned this run, held now plus spent. */
export function runUnderstanding(course: Course, state: GameState): Num {
  return Num.add(
    understandingNow(course, state),
    Num.fromTuple(state.runSpent),
  );
}

/** How many words of the current destination's own lexicon are held. */
export function wordsHeld(course: Course, state: GameState): number {
  const lexicon = currentDestination(course, state)?.lexicon ?? [];
  return lexicon.filter((item) => pickedWord(state, item.id) !== undefined)
    .length;
}

/** Whether the run's goal is met: both its Understanding and its words (AC1). */
export function goalMet(course: Course, state: GameState): boolean {
  const goal = sailGoal(course, state);
  return (
    Num.cmp(runUnderstanding(course, state), goal.understanding) >= 0 &&
    wordsHeld(course, state) >= goal.words
  );
}

/** The stamps a sail pays: `floor(k · sqrt(U_run / goal))` (parent §4.4). */
export function stampGain(uRun: Num, goal: Num): number {
  const ratio = Num.toNumber(Num.div(uRun, goal));
  return Math.floor(BALANCE.sail.stampK * Math.sqrt(ratio));
}

/** Whether the player names the destination: the finale sail and Mastery mode. */
function choosing(course: Course, state: GameState): boolean {
  return state.finale || state.destination === route(course).length - 1;
}

/**
 * The number and id of the destination a sail to `to` goes to, or why not:
 * the next destination before the finale (when its region is playable),
 * otherwise the visited destination `to` names.
 */
function target(
  course: Course,
  state: GameState,
  to: string | undefined,
):
  | { readonly ok: true; readonly index: number; readonly id: string }
  | { readonly ok: false; readonly rejection: Rejection } {
  const stops = route(course);
  if (stops[state.destination] === undefined) {
    return { ok: false, rejection: { kind: 'noDestination' } };
  }
  if (choosing(course, state)) {
    if (to === undefined) {
      return { ok: false, rejection: { kind: 'sailTargetRequired' } };
    }
    // The finale needs the last destination, so every one has been visited.
    const index = stops.findIndex((stop) => stop.destination.id === to);
    if (index < 0) {
      return { ok: false, rejection: { kind: 'sailTargetInvalid', to } };
    }
    return { ok: true, index, id: to };
  }
  const index = state.destination + 1;
  const next = stops[index];
  if (next === undefined) {
    return { ok: false, rejection: { kind: 'noDestination' } };
  }
  if (to !== undefined && to !== next.destination.id) {
    return { ok: false, rejection: { kind: 'sailTargetInvalid', to } };
  }
  if (next.region >= state.playableRegions) {
    return {
      ok: false,
      rejection: {
        kind: 'regionNotPlayable',
        destination: next.destination.id,
        region: next.region,
        playable: state.playableRegions,
      },
    };
  }
  return { ok: true, index, id: next.destination.id };
}

/**
 * Set Sail at the state's simulated time (AC1 to AC5). Refused, in this
 * order, when the course has no destination here, the target is missing,
 * unknown, not the next one or in a region outside the playable ones,
 * or the goal is not met. A sail pays its stamps, owns no Encounters, holds
 * only the starting grant with nothing spent, moves to the target, and
 * changes nothing else.
 */
export function setSail(course: Course, state: GameState, to?: string): Result {
  const resolved = target(course, state, to);
  if (!resolved.ok) return resolved;
  const goal = sailGoal(course, state);
  const uRun = runUnderstanding(course, state);
  const words = wordsHeld(course, state);
  if (Num.cmp(uRun, goal.understanding) < 0 || words < goal.words) {
    return {
      ok: false,
      rejection: {
        kind: 'sailGoalUnmet',
        understanding: Num.toTuple(uRun),
        goal: Num.toTuple(goal.understanding),
        words,
        wordsGoal: goal.words,
      },
    };
  }
  const { index, id } = resolved;
  const gain = stampGain(uRun, goal.understanding);
  // Sailing back to a visited destination is a Mastery replay of it.
  const replays =
    index <= state.reached
      ? { ...state.replays, [id]: replayCount(state, id) + 1 }
      : state.replays;
  return {
    ok: true,
    state: {
      ...state,
      anchor: {
        sim: state.sim,
        understanding: Num.toTuple(Num.from(startingUnderstanding(state))),
      },
      owned: {},
      runSpent: ZERO,
      stamps: state.stamps + gain,
      stampsEarned: state.stampsEarned + gain,
      destination: index,
      reached: Math.max(state.reached, index),
      finale: state.finale || choosing(course, state),
      replays,
    },
  };
}

/** The preview of a sail now: the goal, progress, and what resets, is kept and is gained. */
export function sailPreview(course: Course, state: GameState): SailPreview {
  const goal = sailGoal(course, state);
  const uRun = runUnderstanding(course, state);
  const gain = stampGain(uRun, goal.understanding);
  const here = currentDestination(course, state)?.id;
  const chooses = choosing(course, state);
  const resolved = target(course, state, chooses ? here : undefined);
  const next = !chooses && resolved.ok ? resolved.id : undefined;
  return {
    destination: here,
    next,
    goal,
    progress: { understanding: uRun, words: wordsHeld(course, state) },
    available: resolved.ok && goalMet(course, state),
    resets: {
      encounters: state.owned,
      understanding: understandingNow(course, state),
      startingUnderstanding: startingUnderstanding(state),
    },
    gains: { stamps: gain },
    keeps: {
      words: Object.keys(state.words).length,
      cards: state.cards.length,
      upgradeLevels: Object.values(state.upgrades).reduce((a, b) => a + b, 0),
      grammarNodes: state.grammar.length,
      stamps: state.stamps + gain,
    },
  };
}
