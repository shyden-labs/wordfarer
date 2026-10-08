/**
 * The pacing checks (M1 design §6, #35 AC4 and AC9), one function per
 * assertion, each returning what broke it: empty means it held. The CI suite
 * judges runs against `CI_BOUNDS`, the spec's; the tuning aims inside
 * `TUNING_TARGETS` (operator, 2026-10-04), which `npm run pacing:sweep`
 * reports, so a re-tune can see its headroom before CI does.
 */

import type { PersonaRun, Sail } from './run';

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
export function gaps(
  run: PersonaRun,
  b: Bounds,
  slackOpens: 0 | 1 = 0,
): string[] {
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
    if (
      outside(gap, b.gapDays) &&
      !withinOneOpen(run, sail.day, before.day, b, slackOpens)
    ) {
      found.push(
        `destination ${String(sail.destination)} came ${days(gap)} days after the one before`,
      );
    }
  });
  return found;
}

/**
 * Whether a sail one open sooner (for a long gap) or one open later (for a
 * short one) would have kept the gap in bounds: the robustness sweep's
 * slack, since a variant can tip a sail across an open by a sliver
 * (operator, 2026-10-04). A sail in no recorded open gets none.
 */
function withinOneOpen(
  run: PersonaRun,
  day: number,
  beforeDay: number,
  b: Bounds,
  slackOpens: 0 | 1,
): boolean {
  if (slackOpens === 0) return false;
  const open = run.openDays.findLastIndex((d) => d <= day);
  if (open === -1) return false;
  const [lo, hi] = b.gapDays;
  const sooner = run.openDays[open - 1];
  const later = run.openDays[open + 1];
  return day - beforeDay > hi
    ? sooner !== undefined && sooner - beforeDay <= hi
    : later !== undefined && later - beforeDay >= lo;
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
  const opens = run.openDays.length;
  const expected = opens - (run.finaleDay === undefined ? 0 : 1);
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
          `${run.persona} judged ${String(run.returnsJudged)} 15-minute returns after ${String(opens)} opens, not ${String(expected)}`,
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

/**
 * (g) The Clicker takes at least `clickerShare` of the Casual Learner's time
 * to reach each sail's goal (DN10). Timed by when the goal was reached, not
 * by the sail: both play the same opens, and a sliver of tapping could let
 * the Clicker sail on one open while the Casual Learner waits for the next
 * (operator, 2026-10-04: "Compare production").
 */
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
    const theirs = casual.sails[i]?.reachedDay ?? Infinity;
    return sail.reachedDay < b.clickerShare * theirs
      ? [
          `the Clicker reached destination ${String(sail.destination)}'s goal at ${((100 * sail.reachedDay) / theirs).toFixed(1)}% of the Casual Learner's time`,
        ]
      : [];
  });
}

/** How far `v` moved from `b`, as a share of `b`. */
function shift(v: number, b: number): number {
  if (b === 0) return v === 0 ? 0 : Infinity;
  return Math.abs(v - b) / Math.abs(b);
}

/**
 * The largest shift of any sail's day or goal moment or any finale between a
 * sweep variant's runs and the baseline's, each as a share of its own
 * baseline figure, so a minute at the 43-minute first sail weighs what an
 * hour does on day 43; infinite when a run reaches a different number of
 * destinations or a finale only one has. A lever that shifts nothing by
 * much is inert at this balance, and its green row proves nothing about
 * robustness (measured 2026-10-04: the Insight glut left the Phrasebook cost
 * so). Runs of different personas are refused rather than compared.
 */
export function largestShift(
  variant: ReadonlyMap<string, PersonaRun>,
  baseline: ReadonlyMap<string, PersonaRun>,
): number {
  const names = (m: ReadonlyMap<string, PersonaRun>) =>
    [...m.keys()].sort().join(', ');
  if (names(variant) !== names(baseline)) {
    throw new Error(
      `the variant played ${names(variant)}, the baseline ${names(baseline)}`,
    );
  }
  const shifts = [...baseline].flatMap(([name, b]) => {
    const v = variant.get(name);
    if (v === undefined || v.sails.length !== b.sails.length) return [Infinity];
    const finale =
      v.finaleDay === undefined || b.finaleDay === undefined
        ? v.finaleDay === b.finaleDay
          ? 0
          : Infinity
        : shift(v.finaleDay, b.finaleDay);
    return [
      finale,
      ...v.sails.flatMap((s, i) => {
        const t = b.sails[i];
        return t === undefined
          ? [Infinity]
          : [shift(s.day, t.day), shift(s.reachedDay, t.reachedDay)];
      }),
    ];
  });
  return Math.max(0, ...shifts);
}

/** (h) No value on the path was NaN, negative or infinite. */
export function sanity(run: PersonaRun): string[] {
  return run.insane.map((name) => `${run.persona}: ${name}`);
}

/**
 * (h) Each sail whose goal is timed out of order: a sail starts a new run, so
 * its goal is met after the sail before (after the start, for the first),
 * and no later than its own sail.
 */
export function sailTiming(run: PersonaRun): string[] {
  return run.sails.flatMap((sail, i) => {
    const before = run.sails[i - 1]?.day ?? 0;
    const met = sail.reachedDay;
    return met > before && met <= sail.day
      ? []
      : [
          `${run.persona}: destination ${String(sail.destination)}’s goal met on day ${met.toFixed(3)}, outside (${before.toFixed(3)}, ${sail.day.toFixed(3)}]`,
        ];
  });
}

/** How long before its sail a goal must have been met to show a wait for an open. */
const WAIT_HOURS = 1;

/**
 * (h) The sails whose goal was met over an hour before them: a persona
 * opening twice a day waits for an open with its goal met, which shows the
 * goals are timed from when they were met, not from the sail.
 */
export function longWaits(run: PersonaRun): readonly Sail[] {
  return run.sails.filter((s) => (s.day - s.reachedDay) * 24 > WAIT_HOURS);
}
