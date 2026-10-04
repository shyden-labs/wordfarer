/**
 * Re-deriving the Set Sail goal table (#35 AC10): destination by
 * destination, bisect log10 of its goal so the Casual Learner's sail to it
 * lands by `firstMinutes + i x gapDays` from the first open. The targets
 * are cumulative, so a sail that snaps to an earlier open does not push
 * every later one: the next goal is fitted from where the run really is.
 * Each goal is rounded down to 3 significant figures before the next is fitted,
 * so the table printed is the table measured.
 */

const MINUTES_PER_DAY = 1_440;

/** The day sail `destination` (0-based) lands with `goals`, or `undefined` by `untilDay`. */
export type Measure = (
  goals: readonly number[],
  destination: number,
  untilDay: number,
) => number | undefined;

export interface CalibrateOptions {
  /** Minutes from the first open to the first sail. */
  readonly firstMinutes: number;
  /** Days between later sails. */
  readonly gapDays: number;
  /** How many goals the table holds. */
  readonly destinations: number;
  /** Bisection steps per goal; each halves the interval in log10. */
  readonly steps: number;
  /** How many decades above the previous goal the search reaches. */
  readonly spanDecades: number;
  /** log10 of the lowest first goal searched. */
  readonly floorLog10: number;
}

export const CALIBRATE_DEFAULTS: CalibrateOptions = {
  firstMinutes: 45,
  gapDays: 2.2,
  destinations: 12,
  steps: 12,
  spanDecades: 8,
  floorLog10: 2,
};

/** A goal no run reaches: what a destination not yet fitted holds. */
export const UNREACHABLE = 1e300;

export interface CalibratedGoal {
  readonly destination: number;
  readonly goal: number;
  /** The day the sail was aimed at. */
  readonly target: number;
  /** The day it landed with the table so far, or `undefined` if it did not. */
  readonly day: number | undefined;
}

/**
 * `x` rounded down to 3 significant figures. Down, never to nearest: a goal
 * rounded up can push its sail past the open the bisection found, a whole
 * open later (measured 2026-10-04: destination 4 aimed at day 8.831 landed
 * on day 9.013).
 */
export function threeFiguresDown(x: number): number {
  const nearest = Number(x.toPrecision(3));
  if (nearest <= x) return nearest;
  const step = 10 ** (Math.floor(Math.log10(x)) - 2);
  return Number((nearest - step).toPrecision(3));
}

/** The table so far, then `next`, then unreachable goals to `length`. */
function padded(
  goals: readonly number[],
  next: number,
  length: number,
): number[] {
  return [
    ...goals,
    next,
    ...Array<number>(length - goals.length - 1).fill(UNREACHABLE),
  ];
}

export function calibrateGoals(
  measure: Measure,
  options: CalibrateOptions = CALIBRATE_DEFAULTS,
  progress: (goal: CalibratedGoal) => void = () => undefined,
): readonly CalibratedGoal[] {
  const { destinations, steps, spanDecades, gapDays } = options;
  const goals: number[] = [];
  const fitted: CalibratedGoal[] = [];
  for (let i = 0; i < destinations; i += 1) {
    const target = options.firstMinutes / MINUTES_PER_DAY + i * gapDays;
    const untilDay = Math.ceil(target + 2 * gapDays + 1);
    const previous = goals.at(-1);
    let lo = previous === undefined ? options.floorLog10 : Math.log10(previous);
    let hi = lo + spanDecades;
    for (let k = 0; k < steps; k += 1) {
      const mid = (lo + hi) / 2;
      const day = measure(padded(goals, 10 ** mid, destinations), i, untilDay);
      if (day !== undefined && day < target) lo = mid;
      else hi = mid;
    }
    const goal = threeFiguresDown(10 ** lo);
    goals.push(goal);
    const day = measure(
      padded(goals.slice(0, -1), goal, destinations),
      i,
      untilDay,
    );
    const result = { destination: i, goal, target, day };
    fitted.push(result);
    progress(result);
  }
  return fitted;
}
