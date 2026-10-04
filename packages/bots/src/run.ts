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
} from '@wordfarer/core';
import { Player } from './player';
import type { Persona } from './personas';
import { dayOpens, DAY_MS, WAKE_MS } from './schedule';
import { Streams } from './streams';

export interface Sail {
  /** The route number sailed to. */
  readonly destination: number;
  /** Days from the first open. */
  readonly day: number;
}

export interface PersonaRun {
  readonly persona: string;
  readonly sails: readonly Sail[];
  /** The day the finale was reached; `undefined` if it was not within the run. */
  readonly finaleDay: number | undefined;
  /** The day a word first reached Mastered (parent §10.1). */
  readonly firstMasteredDay: number | undefined;
  readonly opens: number;
  /** The days of the opens that offered no meaningful decision (DN1). */
  readonly undecided: readonly number[];
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
  let events = 0;
  const streams = new Streams(persona.seed);
  const initial = initialState(wallMs(epochMs), persona.seed);
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
        });
        if (state.finale) finaleDay = dayOf(event.wallMs);
      }
      if (
        event.type === 'answerReview' &&
        firstMasteredDay === undefined &&
        holdsMastered(state)
      ) {
        firstMasteredDay = dayOf(event.wallMs);
      }
    },
  });
  let opens = 0;
  const undecided: number[] = [];
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
      opens += 1;
      const decided = player.open(
        startMs,
        lengthMs,
        today[i + 1]?.startMs ?? tomorrow,
      );
      if (!decided) undecided.push(dayOf(startMs));
    }
  }
  const used = process.cpuUsage(cpu);
  return {
    persona: persona.name,
    sails,
    finaleDay,
    firstMasteredDay,
    opens,
    undecided,
    insane,
    events,
    cpuMs: (used.user + used.system) / 1_000,
  };
}
