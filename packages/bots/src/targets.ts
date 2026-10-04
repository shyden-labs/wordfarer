/**
 * The pacing checks (M1 design §6, #35 AC4 and AC9), one function per
 * assertion, each returning what broke it: empty means it held. The CI suite
 * judges runs against `CI_BOUNDS`, the spec's; the tuning aims inside
 * `TUNING_TARGETS` (operator, 2026-10-04), which `npm run pacing:sweep`
 * reports, so a re-tune can see its headroom before CI does.
 */

import type { PersonaRun } from './run';

const MINUTES_PER_DAY = 1_440;

export interface Bounds {
  /** Minutes from the first open to the first Set Sail, every persona. */
  readonly firstMinutes: readonly [number, number];
  /** Days between the Casual Learner's sails. */
  readonly gapDays: readonly [number, number];
  /** The Casual Learner's finale day. */
  readonly finaleDays: readonly [number, number];
  /** The latest day the Idler may reach the finale. */
  readonly idlerFinaleBy: number;
  /** How much sooner, as a fraction, the Casual Learner finishes than the Non-learner. */
  readonly learningPays: number;
  /** The least share of the Casual Learner's time the Clicker takes to each sail. */
  readonly clickerShare: number;
}

/** The spec's bounds (design §6). */
export const CI_BOUNDS: Bounds = {
  firstMinutes: [30, 60],
  gapDays: [1, 3],
  finaleDays: [21, 35],
  idlerFinaleBy: 70,
  learningPays: 0.2,
  clickerShare: 0.95,
};

/** The tuning's own targets (#35 AC9; gaps and finale loosened by the operator, 2026-10-04). */
export const TUNING_TARGETS: Bounds = {
  firstMinutes: [38, 52],
  gapDays: [1.4, 2.8],
  finaleDays: [23, 32],
  idlerFinaleBy: 63,
  learningPays: 0.35,
  clickerShare: 0.97,
};

/** The destinations a run must sail to: the route of the synthetic course. */
export const DESTINATIONS = 12;

const days = (x: number) => x.toFixed(3);
const outside = (x: number, [lo, hi]: readonly [number, number]) =>
  x < lo || x > hi;

/** (a) The first Set Sail lands inside `firstMinutes`. */
export function firstSail(run: PersonaRun, b: Bounds): string[] {
  const first = run.sails[0];
  if (first === undefined) return [`${run.persona} never set sail`];
  const minutes = first.day * MINUTES_PER_DAY;
  return outside(minutes, b.firstMinutes)
    ? [`${run.persona} first set sail after ${minutes.toFixed(1)} min`]
    : [];
}

/** (b) Every later sail lands `gapDays` after the one before, all the way to the finale. */
export function gaps(run: PersonaRun, b: Bounds): string[] {
  const found: string[] = [];
  if (run.sails.length < DESTINATIONS) {
    found.push(
      `${run.persona} reached ${String(run.sails.length)} of ${String(DESTINATIONS)} destinations`,
    );
  }
  run.sails.forEach((sail, i) => {
    const before = run.sails[i - 1];
    if (before === undefined) return;
    const gap = sail.day - before.day;
    if (outside(gap, b.gapDays)) {
      found.push(
        `destination ${String(sail.destination)} came ${days(gap)} days after the one before`,
      );
    }
  });
  return found;
}

function finaleOf(run: PersonaRun): number | undefined {
  return run.finaleDay;
}

/** (c) The finale lands inside `finaleDays`. */
export function finale(run: PersonaRun, b: Bounds): string[] {
  const day = finaleOf(run);
  if (day === undefined) return [`${run.persona} did not reach the finale`];
  return outside(day, b.finaleDays)
    ? [`${run.persona} reached the finale on day ${days(day)}`]
    : [];
}

/** (d) The Idler reaches the finale by `idlerFinaleBy`. */
export function idlerFinishes(idler: PersonaRun, b: Bounds): string[] {
  const day = finaleOf(idler);
  if (day === undefined) return [`${idler.persona} did not reach the finale`];
  return day > b.idlerFinaleBy
    ? [`${idler.persona} reached the finale on day ${days(day)}`]
    : [];
}

/** (e) Every open offered a meaningful decision (DN1). */
export function decisions(run: PersonaRun): string[] {
  const expected = run.opens - (run.finaleDay === undefined ? 0 : 1);
  return [
    ...run.undecided.map(
      (d) => `${run.persona}'s open on day ${days(d)} offered no decision`,
    ),
    ...run.returnsUndecided.map(
      (d) =>
        `${run.persona}'s return on day ${days(d)}, 15 minutes after an open, offered no decision`,
    ),
    ...(run.returnsJudged === expected
      ? []
      : [
          `${run.persona} judged ${String(run.returnsJudged)} 15-minute returns after ${String(run.opens)} opens, not ${String(expected)}`,
        ]),
  ];
}

/** (f) The Casual Learner finishes at least `learningPays` sooner than the Non-learner. */
export function learningPays(
  casual: PersonaRun,
  nonlearner: PersonaRun,
  b: Bounds,
): string[] {
  const c = finaleOf(casual);
  const n = finaleOf(nonlearner);
  if (c === undefined || n === undefined) return ['a finale was not reached'];
  return c > (1 - b.learningPays) * n
    ? [
        `the Casual Learner finished on day ${days(c)}, only ${(100 * (1 - c / n)).toFixed(1)}% sooner than the Non-learner's ${days(n)}`,
      ]
    : [];
}

/** (f) Diligent ≤ Casual ≤ Idler in time to the finale. */
export function learnersOrder(
  diligent: PersonaRun,
  casual: PersonaRun,
  idler: PersonaRun,
): string[] {
  const [d, c, i] = [finaleOf(diligent), finaleOf(casual), finaleOf(idler)];
  if (d === undefined || c === undefined || i === undefined)
    return ['a finale was not reached'];
  return d <= c && c <= i
    ? []
    : [`finales: Diligent ${days(d)}, Casual ${days(c)}, Idler ${days(i)}`];
}

/** (g) The Clicker takes at least `clickerShare` of the Casual Learner's time to each sail (DN10). */
export function clickingNeverWins(
  clicker: PersonaRun,
  casual: PersonaRun,
  b: Bounds,
): string[] {
  if (
    clicker.sails.length < DESTINATIONS ||
    casual.sails.length < DESTINATIONS
  ) {
    return ['a run did not reach every destination'];
  }
  return clicker.sails.flatMap((sail, i) => {
    const theirs = casual.sails[i]?.day ?? Infinity;
    return sail.day < b.clickerShare * theirs
      ? [
          `the Clicker reached destination ${String(sail.destination)} at ${((100 * sail.day) / theirs).toFixed(1)}% of the Casual Learner's time`,
        ]
      : [];
  });
}

/** (h) No value on the path was NaN, negative or infinite. */
export function sanity(run: PersonaRun): string[] {
  return run.insane.map((name) => `${run.persona}: ${name}`);
}
