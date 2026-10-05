/**
 * A persona's whole run, measured (M1 design §6, #35 AC6): every Set Sail,
 * the finale, the first Mastered word, the opens that offered no decision
 * (DN1), any value on the path that is NaN, negative or infinite, and the
 * CPU time taken. The watcher reads the stored state to measure; the player
 * never does to decide.
 */

import {
  initialState,
  Num,
  wallMs,
  type Course,
  type GameEvent,
  type GameState,
  type View,
  view,
} from '@yawelo-idle/core';
import { Player } from './player';
import type { Persona } from './personas';
import { dayOpens, DAY_MS, QUICK_RETURN_MS, WAKE_MS } from './schedule';
import { Streams } from './streams';

export interface Sail {
  /** The route number sailed to. */
  readonly destination: number;
  /** Days from the first open. */
  readonly day: number;
  /**
   * Days from the first open to the moment the Understanding earned that run
   * first reached the goal, to the second. Production runs between opens, so
   * this does not wait for one as the sail does: the Clicker check reads it
   * (operator, 2026-10-04).
   */
  readonly reachedDay: number;
}

export interface PersonaRun {
  readonly persona: string;
  readonly sails: readonly Sail[];
  /** The day the finale was reached; `undefined` if it was not within the run. */
  readonly finaleDay: number | undefined;
  /** The day a word first reached Mastered (parent §10.1). */
  readonly firstMasteredDay: number | undefined;
  /** The day each open started, in order. */
  readonly openDays: readonly number[];
  /** The days of the opens that offered no meaningful decision (DN1). */
  readonly undecided: readonly number[];
  readonly returnsJudged: number;
  readonly returnsUndecided: readonly number[];
  /** The days of the 15-minute returns where only Practice was on offer. */
  readonly returnsPracticeOnly: readonly number[];
  /** The first values on the path that were NaN, negative or infinite. */
  readonly insane: readonly string[];
  readonly events: number;
  /** Process CPU time the run took, in milliseconds. */
  readonly cpuMs: number;
}

/** How many insane values a run keeps, to report them without flooding. */
const INSANE_KEPT = 5;

/** A `Num` that is a real, non-negative value. */
function sane(n: Num): boolean {
  const [mantissa, exponent] = Num.toTuple(n);
  return (
    Number.isFinite(mantissa) && Number.isFinite(exponent) && mantissa >= 0
  );
}

/** Every value of a view a UI would show as a number: the names of those that are not sane. */
export function insaneValues(v: View): readonly string[] {
  const values: [string, Num][] = [
    ['understanding', v.understanding],
    ['rate', v.rate],
    ['insight', v.insight],
    ['sail.goal', v.sail.goal.understanding],
    ['sail.progress', v.sail.progress.understanding],
    ...v.breakdown.map((r): [string, Num] => [`breakdown.${r.id}`, r.rate]),
    ...v.shop.encounters.flatMap((o): [string, Num][] => [
      [`price.${o.id}`, o.price],
      [`gain.${o.id}`, o.gain],
    ]),
    ...(v.shop.pickUp === undefined
      ? []
      : ([
          ['pickUp.cost', v.shop.pickUp.cost],
          ['pickUp.gain', v.shop.pickUp.gain],
        ] satisfies [string, Num][])),
  ];
  const counts: [string, number][] = [
    ['sail.goal.words', v.sail.goal.words],
    ['stamps', v.sail.gains.stamps],
    ...v.queue.map((q): [string, number] => [
      `R.${q.itemId}`,
      q.retrievability,
    ]),
  ];
  return [
    ...values.filter(([, n]) => !sane(n)).map(([name]) => name),
    ...counts
      .filter(([, x]) => !Number.isFinite(x) || x < 0)
      .map(([name]) => name),
  ];
}

function holdsMastered(state: GameState): boolean {
  return Object.values(state.words).some((w) => w.rank === 'mastered');
}

export interface RunOptions {
  /** End the run after the open in which this many sails have landed (the calibration tool's early exit). */
  readonly stopAfterSails?: number;
}

/** Whether the Understanding earned this run meets the sail's goal at `atMs`, nothing done meanwhile. */
function goalReached(course: Course, state: GameState, atMs: number): boolean {
  const { progress, goal } = view(course, state, wallMs(atMs)).sail;
  return Num.cmp(progress.understanding, goal.understanding) >= 0;
}

/** Whether `state`, left alone, meets its sail's goal at `atMs`. */
type Meets<S> = (state: S, atMs: number) => boolean;

/**
 * The first second in (`fromMs`, `toMs`] at which `state`, left alone, meets
 * its goal, or `undefined` if it does not by `toMs`. Production only grows
 * while nothing is done, so a bisection finds it.
 */
function goalReachedBetween<S>(
  state: S,
  fromMs: number,
  toMs: number,
  meets: Meets<S>,
): number | undefined {
  if (!meets(state, toMs)) return undefined;
  let lo = fromMs;
  let hi = toMs;
  while (hi - lo > 1_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (meets(state, mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** A state the run passed through and the wall time it was reached at. */
interface Seen<S> {
  readonly state: S;
  readonly wallMs: number;
}

/**
 * When the Understanding earned this run first met the goal, to the second,
 * from every state since the last sail (`leg`, oldest first) and this sail's
 * moment. `U_run` counts Understanding spent as well as held, so within a
 * run it never falls: the first state meeting the goal is found by bisection
 * over the leg, then the second within the gap before it.
 */
export function reachedAt<S>(
  leg: readonly Seen<S>[],
  sailMs: number,
  meets: Meets<S>,
): number {
  const seen = (i: number): Seen<S> => {
    const s = leg[i];
    if (s === undefined) {
      throw new RangeError(`the run holds no state ${String(i)}`);
    }
    return s;
  };
  let lo = 0;
  let hi = leg.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (meets(seen(mid).state, seen(mid).wallMs)) hi = mid;
    else lo = mid + 1;
  }
  if (lo === 0) return seen(0).wallMs;
  const previous = seen(lo - 1);
  const endMs = lo === leg.length ? sailMs : seen(lo).wallMs;
  return (
    goalReachedBetween(previous.state, previous.wallMs, endMs, meets) ?? endMs
  );
}

/**
 * Play `persona` on `course` from the wall time `epochMs` for at most
 * `maxDays`, stopping at the finale.
 */
export function runPersona(
  course: Course,
  persona: Persona,
  epochMs: number,
  maxDays: number,
  options: RunOptions = {},
): PersonaRun {
  const cpu = process.cpuUsage();
  const firstOpenMs = epochMs + WAKE_MS;
  const dayOf = (t: number) => (t - firstOpenMs) / DAY_MS;
  const sails: Sail[] = [];
  const insane: string[] = [];
  let firstMasteredDay: number | undefined;
  let finaleDay: number | undefined;
  let leg: Seen<GameState>[] = [];
  let events = 0;
  const streams = new Streams(persona.seed);
  const initial = initialState(wallMs(epochMs), persona.seed);
  leg = [{ state: initial, wallMs: epochMs }];
  const player = new Player(course, persona, initial, streams, {
    saw: (v) => {
      if (insane.length < INSANE_KEPT) {
        insane.push(...insaneValues(v).slice(0, INSANE_KEPT - insane.length));
      }
    },
    applied: (event: GameEvent, state: GameState) => {
      events += 1;
      if (event.type === 'setSail') {
        sails.push({
          destination: state.destination,
          day: dayOf(event.wallMs),
          reachedDay: dayOf(
            reachedAt(leg, event.wallMs, (s, t) => goalReached(course, s, t)),
          ),
        });
        if (state.finale) finaleDay = dayOf(event.wallMs);
        leg = [];
      }
      leg.push({ state, wallMs: event.wallMs });
      if (
        event.type === 'answerReview' &&
        firstMasteredDay === undefined &&
        holdsMastered(state)
      ) {
        firstMasteredDay = dayOf(event.wallMs);
      }
    },
  });
  const openDays: number[] = [];
  const undecided: number[] = [];
  let returnsJudged = 0;
  const returnsUndecided: number[] = [];
  const returnsPracticeOnly: number[] = [];
  // A call, not a property read: the finale changes inside `player.open`.
  const finished = (): boolean =>
    player.state.finale ||
    (options.stopAfterSails !== undefined &&
      sails.length >= options.stopAfterSails);
  for (let day = 0; day < maxDays && !finished(); day += 1) {
    const today = dayOpens(persona, epochMs, day, streams);
    const tomorrow = epochMs + (day + 1) * DAY_MS + WAKE_MS;
    for (const [i, { startMs, lengthMs }] of today.entries()) {
      if (finished()) break;
      openDays.push(dayOf(startMs));
      const decided = player.open(
        startMs,
        lengthMs,
        today[i + 1]?.startMs ?? tomorrow,
      );
      if (!decided) undecided.push(dayOf(startMs));
      // After the finale comes Mastery mode, which the pacing does not judge.
      if (!player.state.finale) {
        returnsJudged += 1;
        const offered = player.returnAfter(QUICK_RETURN_MS);
        const day = dayOf(player.now + QUICK_RETURN_MS);
        if (offered === 'nothing') returnsUndecided.push(day);
        if (offered === 'practice') returnsPracticeOnly.push(day);
      }
    }
  }
  const used = process.cpuUsage(cpu);
  return {
    persona: persona.name,
    sails,
    finaleDay,
    firstMasteredDay,
    openDays,
    undecided,
    returnsJudged,
    returnsUndecided,
    returnsPracticeOnly,
    insane,
    events,
    cpuMs: (used.user + used.system) / 1_000,
  };
}
