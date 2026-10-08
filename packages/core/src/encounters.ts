/**
 * Encounter costs, bulk buy and milestones (parent spec §3.2, M1 design §5).
 *
 * The n-th purchase (0-based, so n is the number already owned) costs
 * c0 x growth^n. Buying k at once costs the geometric series
 * c0 x growth^n x (growth^k - 1) / (growth - 1). Every power goes through
 * `Num.pow`, so the result has the same bits on every engine (design §2.1).
 */
import { BALANCE } from './balance';
import type { Encounter } from './course';
import { Num } from './num';

const ONE = Num.from(1);
const GROWTH = Num.from(BALANCE.encounters.costGrowth);
const GROWTH_LESS_ONE = Num.sub(GROWTH, ONE);
const MILESTONE_MULTIPLIER = Num.from(BALANCE.encounters.milestoneMultiplier);

function checkOwned(owned: number): void {
  if (!Number.isSafeInteger(owned) || owned < 0) {
    throw new RangeError(
      `owned must be a safe non-negative integer, got ${String(owned)}`,
    );
  }
}

function checkCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError(
      `count must be a safe positive integer, got ${String(count)}`,
    );
  }
}

/**
 * Each Encounter's costs, by count owned and count bought. A cost is a pure
 * function of `c0` and the two counts, and Pemandu prices every Encounter
 * of the regions reached at every purchase (#33), so each is worked out
 * once. A course is never mutated, so an Encounter object stands for its
 * `c0`, as a course does for `lexiconItem`'s index.
 */
const costMemo = new WeakMap<Encounter, Map<string, Num>>();

/** The cost of buying `count` more of `encounter` when `owned` are held. */
export function purchaseCost(
  encounter: Encounter,
  owned: number,
  count: number,
): Num {
  checkOwned(owned);
  checkCount(count);
  let costs = costMemo.get(encounter);
  if (costs === undefined) {
    costs = new Map();
    costMemo.set(encounter, costs);
  }
  const key = `${String(owned)}:${String(count)}`;
  let cost = costs.get(key);
  if (cost === undefined) {
    const first = Num.mul(Num.from(encounter.c0), Num.pow(GROWTH, owned));
    const series = Num.div(
      Num.sub(Num.pow(GROWTH, count), ONE),
      GROWTH_LESS_ONE,
    );
    cost = Num.mul(first, series);
    costs.set(key, cost);
  }
  return cost;
}

/**
 * How many milestones `owned` has reached: each listed count, then one more
 * every `milestoneEvery` past the last listed one.
 */
export function milestonesReached(owned: number): number {
  checkOwned(owned);
  const { milestones, milestoneEvery } = BALANCE.encounters;
  const listed = milestones.filter((m) => owned >= m).length;
  const last = milestones[milestones.length - 1];
  if (last === undefined || owned < last) return listed;
  return listed + Math.floor((owned - last) / milestoneEvery);
}

/** 2^milestones by milestones reached: a pure function of the count, worked out once (#33). */
const milestoneMemo = new Map<number, Num>();

/** The output multiplier from the milestones `owned` has reached: 2^milestones. */
export function milestoneFactor(owned: number): Num {
  const reached = milestonesReached(owned);
  let factor = milestoneMemo.get(reached);
  if (factor === undefined) {
    factor = Num.pow(MILESTONE_MULTIPLIER, reached);
    milestoneMemo.set(reached, factor);
  }
  return factor;
}

/** Understanding per second from `owned` of `encounter`: p0 x owned x 2^milestones. */
export function encounterOutput(encounter: Encounter, owned: number): Num {
  checkOwned(owned);
  if (owned === 0) return Num.from(0);
  return Num.mul(Num.from(encounter.p0 * owned), milestoneFactor(owned));
}
