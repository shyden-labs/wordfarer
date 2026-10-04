import { describe, expect, it } from 'vitest';
import {
  calibrateGoals,
  threeFiguresDown,
  UNREACHABLE,
  type CalibrateOptions,
  type Measure,
} from '../src/calibrate';

/**
 * The goal-table bisection (#35 AC10), against a model game whose sails are
 * known exactly: sail i lands `log10(goal_i) - log10(goal_{i-1})` days after
 * sail i-1, and sail 0 at `log10(goal_0) / 10` days. Every answer is written
 * out from that model.
 */

const options: CalibrateOptions = {
  firstMinutes: 144,
  gapDays: 2,
  destinations: 4,
  steps: 30,
  spanDecades: 8,
  floorLog10: 0,
};

/** The model: cumulative sail days for a table, until the first unreachable goal. */
function sailDays(goals: readonly number[]): number[] {
  const days: number[] = [];
  let previous = 0;
  for (const [i, goal] of goals.entries()) {
    if (goal >= UNREACHABLE) break;
    const log = Math.log10(goal);
    days.push(i === 0 ? log / 10 : (days[i - 1] ?? 0) + log - previous);
    previous = log;
  }
  return days;
}

const model: Measure = (goals, destination, untilDay) => {
  const day = sailDays(goals)[destination];
  return day !== undefined && day <= untilDay ? day : undefined;
};

describe('calibrateGoals', () => {
  it('fits each goal so its sail lands by its target and within 0.01 days of it', () => {
    const fitted = calibrateGoals(model, options);
    expect(fitted).toHaveLength(4);
    expect(
      fitted.filter(
        (g) =>
          g.day === undefined || g.day > g.target || g.day < g.target - 0.01,
      ),
    ).toEqual([]);
  });

  it('fits each later goal about a gap of decades above the one before', () => {
    // Each later sail 2 days after the one before: 2 decades in the model.
    const goals = calibrateGoals(model, options).map((g) => g.goal);
    const ratios = goals.slice(1).map((g, i) => g / (goals[i] ?? NaN));
    expect(ratios.filter((r) => Math.abs(r / 100 - 1) > 0.01)).toEqual([]);
    expect(goals[0]).toBe(9.99);
  });

  it('writes each goal with 3 significant figures', () => {
    const goals = calibrateGoals(model, options).map((g) => g.goal);
    expect(goals.filter((g) => Number(g.toPrecision(3)) !== g)).toEqual([]);
  });

  it('aims each sail at a cumulative target', () => {
    expect(calibrateGoals(model, options).map((g) => g.target)).toEqual([
      0.1, 2.1, 4.1, 6.1,
    ]);
  });

  it('shows the measure only the goals fitted so far, the rest unreachable', () => {
    const seen: number[][] = [];
    calibrateGoals(
      (goals, destination, untilDay) => {
        seen.push([...goals]);
        return model(goals, destination, untilDay);
      },
      { ...options, destinations: 2 },
    );
    expect(seen.every((g) => g.length === 2)).toBe(true);
    expect(seen.slice(0, 31).every((g) => g[1] === UNREACHABLE)).toBe(true);
    expect(seen.slice(31).every((g) => g[0] === 9.99)).toBe(true);
    expect(seen).toHaveLength(62);
  });

  it('treats a sail that never lands as too late', () => {
    // A game where nothing ever sails: every step moves down to the floor.
    const fitted = calibrateGoals(() => undefined, {
      ...options,
      destinations: 1,
    });
    expect(fitted[0]?.goal).toBe(1);
    expect(fitted[0]?.day).toBeUndefined();
  });

  it('calls progress once per goal, in order', () => {
    const order: number[] = [];
    calibrateGoals(model, options, (g) => order.push(g.destination));
    expect(order).toEqual([0, 1, 2, 3]);
  });
});

describe('threeFiguresDown', () => {
  it.each([
    [123_456, 123_000],
    [123.6, 123],
    [0.0012345, 0.00123],
    [9.996e21, 9.99e21],
    [999.7, 999],
    [9.99999, 9.99],
    [2.18e9, 2.18e9],
  ])('rounds %s down to %s', (x, expected) => {
    expect(threeFiguresDown(x)).toBe(expected);
  });
});
