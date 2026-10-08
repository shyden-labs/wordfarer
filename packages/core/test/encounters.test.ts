import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import Decimal from 'decimal.js';
import type { Encounter } from '../src/course';
import {
  encounterOutput,
  milestonesReached,
  purchaseCost,
} from '../src/encounters';
import { BALANCE } from '../src/balance';
import { Num as NumOf, type Num, type NumTuple } from '../src/num';

/**
 * Encounter costs, bulk buy and milestones (#27 AC2, AC3).
 *
 * Costs are compared with a 60-digit decimal.js reference. They cannot be
 * bit-exact: `Num.pow` builds g^n as 10^(n x log10 g), so the error in
 * log10 g is multiplied by n. Its documented bound is
 * 6e-16 x (|n| + |log10 result| + 2) per power; the series term
 * (g^k - 1) / (g - 1) can magnify one power's error by g^k / (g^k - 1),
 * at most 1.15 / 0.15 < 8 (k = 1). So a cost is within
 * 8 x 6e-16 x (n + k + |log10 cost| + 4) of the exact value.
 * Measured worst over n <= 1000, k <= 300: 1.07e-13 against the reference,
 * 2.9e-14 between a bulk buy and the same purchases made singly.
 */

const D = Decimal.clone({ precision: 60 });
const GROWTH = new D('1.15');

const tea: Encounter = { id: 'tea', tags: ['food'], c0: 10, p0: 0.1 };

function exact(n: Num): Decimal {
  return new D(n.mantissa).mul(new D(10).pow(n.exponent));
}

function relativeError(got: Num, want: Decimal): number {
  return exact(got).sub(want).div(want).abs().toNumber();
}

function costBound(owned: number, count: number, cost: Decimal): number {
  const log10 = Math.abs(cost.log(10).toNumber());
  return 8 * 6e-16 * (owned + count + log10 + 4);
}

function exactCost(c0: number, owned: number, count: number): Decimal {
  return new D(c0)
    .mul(GROWTH.pow(owned))
    .mul(GROWTH.pow(count).sub(1))
    .div(GROWTH.sub(1));
}

describe('purchaseCost (AC2)', () => {
  it.each([
    [0, 10],
    [1, 11.5],
    [2, 13.225],
  ])('the purchase after %i owned costs %s', (owned, want) => {
    const got = purchaseCost(tea, owned, 1);
    expect(relativeError(got, new D(want))).toBeLessThan(
      costBound(owned, 1, new D(want)),
    );
  });

  for (let owned = 0; owned <= 2000; owned++)
    it(`the purchase after ${String(owned)} owned costs c0 x 1.15^${String(owned)}`, () => {
      const want = exactCost(tea.c0, owned, 1);
      const got = purchaseCost(tea, owned, 1);
      expect(relativeError(got, want)).toBeLessThan(costBound(owned, 1, want));
    });

  it('buying k uses the geometric series closed form', () => {
    // 280 random purchases a run against 60-digit decimal.js (#474: 1,000
    // took 0.7 s of CPU), and every run draws 280 new ones.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2000 }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (owned, count, c0) => {
          const encounter = { ...tea, c0 };
          const want = exactCost(c0, owned, count);
          const got = purchaseCost(encounter, owned, count);
          expect(relativeError(got, want)).toBeLessThan(
            costBound(owned, count, want),
          );
        },
      ),
      { numRuns: 280 },
    );
  });

  it('buying k at once costs what k single purchases cost', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1, max: 200 }),
        (owned, count) => {
          const bulk = exact(purchaseCost(tea, owned, count));
          let singles = new D(0);
          for (let i = 0; i < count; i++) {
            singles = singles.add(exact(purchaseCost(tea, owned + i, 1)));
          }
          const difference = bulk.sub(singles).div(singles).abs().toNumber();
          expect(difference).toBeLessThan(2 * costBound(owned, count, singles));
        },
      ),
      { numRuns: 200 },
    );
  });

  it.each([
    [-1, 1],
    [1.5, 1],
    [Number.NaN, 1],
    [0, 0],
    [0, -1],
    [0, 2.5],
    [0, Number.POSITIVE_INFINITY],
  ])('refuses owned %s, count %s', (owned, count) => {
    expect(() => purchaseCost(tea, owned, count)).toThrow(
      /must be a safe (non-negative|positive) integer/,
    );
  });
});

/**
 * g^owned and the series (g^count - 1) / (g - 1) are kept for every
 * Encounter at once (#297 AC5): neither reads `c0`. Each test asks a fresh
 * Encounter, so the per-Encounter cost memo cannot answer, after another
 * Encounter has filled the shared memo at a different key part, and wants
 * the bits the formula gives unmemoised, in the same order.
 */
describe('purchaseCost shared powers (#297 AC5)', () => {
  // Worked out inside each test, never at collection.
  const formula = (c0: number, owned: number, count: number): NumTuple => {
    const g = NumOf.from(BALANCE.encounters.costGrowth);
    const one = NumOf.from(1);
    return NumOf.toTuple(
      NumOf.mul(
        NumOf.mul(NumOf.from(c0), NumOf.pow(g, owned)),
        NumOf.div(NumOf.sub(NumOf.pow(g, count), one), NumOf.sub(g, one)),
      ),
    );
  };
  const fresh = (c0: number): Encounter => ({
    id: 'fresh',
    tags: [],
    c0,
    p0: 0.1,
  });

  it('keys g^owned by the count owned', () => {
    purchaseCost(fresh(10), 41, 1);
    expect(NumOf.toTuple(purchaseCost(fresh(10), 42, 1))).toEqual(
      formula(10, 42, 1),
    );
  });

  it('keys the series by the count bought', () => {
    purchaseCost(fresh(10), 43, 3);
    expect(NumOf.toTuple(purchaseCost(fresh(10), 43, 4))).toEqual(
      formula(10, 43, 4),
    );
  });

  it('keeps c0 out of the shared powers', () => {
    purchaseCost(fresh(10), 44, 1);
    expect(NumOf.toTuple(purchaseCost(fresh(20), 44, 1))).toEqual(
      formula(20, 44, 1),
    );
  });
});

describe('milestones (AC3)', () => {
  it.each([
    [0, 0],
    [9, 0],
    [10, 1],
    [11, 1],
    [24, 1],
    [25, 2],
    [49, 2],
    [50, 3],
    [99, 3],
    [100, 4],
    [101, 4],
    [199, 4],
    [200, 5],
    [201, 5],
    [299, 5],
    [300, 6],
    [1000, 13],
  ])('%i owned have reached %i milestones', (owned, want) => {
    expect(milestonesReached(owned)).toBe(want);
  });
});

describe('encounterOutput (AC3)', () => {
  it.each([
    [0, 0],
    [9, 0],
    [10, 1],
    [11, 1],
    [24, 1],
    [25, 2],
    [99, 3],
    [100, 4],
    [101, 4],
    [199, 4],
    [200, 5],
  ])('%i owned produce p0 x owned x 2^%i per second', (owned, m) => {
    const want = new D(tea.p0).mul(owned).mul(new D(2).pow(m));
    const got = encounterOutput(tea, owned);
    if (owned === 0) {
      expect(got.mantissa).toBe(0);
    } else {
      expect(relativeError(got, want)).toBeLessThan(1e-14);
    }
  });

  it('reaching a milestone doubles the output per Encounter', () => {
    const perOne = (owned: number): Decimal =>
      exact(encounterOutput(tea, owned)).div(owned);
    expect(perOne(10).div(perOne(9)).toNumber()).toBeCloseTo(2, 12);
    expect(perOne(100).div(perOne(99)).toNumber()).toBeCloseTo(2, 12);
    expect(perOne(200).div(perOne(199)).toNumber()).toBeCloseTo(2, 12);
  });
});
