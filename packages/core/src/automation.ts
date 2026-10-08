/**
 * Pemandu, the automation guide (M1 design §5, parent §4.4, #33).
 *
 * Pemandu opens at region 2, or one destination earlier with the stamp
 * upgrade. Both are judged on the route: the destination it opens at is the
 * first one in region `opensAtRegion` or later, and `reached` only ever
 * grows, so once open it stays open, even through a Mastery replay.
 *
 * Each tick buys one unit of the affordable Encounter that pays back
 * soonest: the lowest cost / Δrate, ties by id in code-unit order.
 */
import { BALANCE } from './balance';
import { nextGridTick, simMs, type SimMs } from './clock';
import type { Course, Encounter } from './course';
import { memosOn } from './memo';
import { Num } from './num';
import {
  rateGain,
  rateMsShort,
  segments,
  understandingAfter,
  understandingNow,
} from './production';
import { regionsReached, route } from './route';
import { ownedCount, type GameState } from './state';
import {
  encounterCostFactor,
  encounterPriceAt,
  upgradeLevel,
} from './upgrades';

/**
 * The route number of the destination Pemandu opens at, or `undefined` when
 * the course has no destination that far.
 */
export function automationOpensAt(
  course: Course,
  state: GameState,
): number | undefined {
  const first = route(course).findIndex(
    (stop) => stop.region >= BALANCE.automation.opensAtRegion - 1,
  );
  if (first === -1) return undefined;
  return upgradeLevel(state, 'pemanduEarly') > 0 ? first - 1 : first;
}

/** Whether the player has reached the destination Pemandu opens at. */
export function automationUnlocked(course: Course, state: GameState): boolean {
  const opensAt = automationOpensAt(course, state);
  return opensAt !== undefined && state.reached >= opensAt;
}

interface Candidate {
  readonly encounter: Encounter;
  readonly price: Num;
  readonly gain: Num;
}

/**
 * Whether `a` pays back sooner than `b`: a lower cost / Δrate, compared as
 * `price_a x gain_b < price_b x gain_a` so no gain is ever divided by, then
 * the lower id in code-unit order.
 */
function before(a: Candidate, b: Candidate): boolean {
  const order = Num.cmp(Num.mul(a.price, b.gain), Num.mul(b.price, a.gain));
  if (order !== 0) return order < 0;
  return a.encounter.id < b.encounter.id;
}

/** One state's buyable Encounters and the price of one more of each. */
interface Priced {
  readonly encounters: readonly Encounter[];
  readonly prices: readonly Num[];
  /** The first lowest price, in course order, or none when nothing is buyable. */
  readonly cheapest: Num | undefined;
  /** How many of each were owned when priced. */
  readonly counts: readonly number[];
  readonly factor: number;
  readonly reached: number;
}

/**
 * Each course's last prices: the next owned object, one purchase on, has
 * moved one count, so only that Encounter is priced again (#297).
 */
const lastPriced = new WeakMap<Course, Priced>();

/**
 * Each owned-counts object's prices, kept by course, then by the object, with
 * the other two things a price reads, the cost factor and the regions
 * reached; only the last is kept per object. A Pemandu purchase and the
 * search for the next one read the same counts, so they price the
 * Encounters once (#297). State is never mutated, so an owned object stands
 * for its contents.
 */
const pricedMemo = new WeakMap<Course, WeakMap<GameState['owned'], Priced>>();

function pricedAt(course: Course, state: GameState): Priced {
  const factor = encounterCostFactor(state);
  const reached = regionsReached(course, state);
  if (!memosOn()) return priceList(course, state, factor, reached, undefined);
  let byOwned = pricedMemo.get(course);
  if (byOwned === undefined) {
    byOwned = new WeakMap();
    pricedMemo.set(course, byOwned);
  }
  const kept = byOwned.get(state.owned);
  if (kept !== undefined && kept.factor === factor && kept.reached === reached)
    return kept;
  const last = lastPriced.get(course);
  const same =
    last !== undefined && last.factor === factor && last.reached === reached
      ? last
      : undefined;
  const priced = priceList(course, state, factor, reached, same);
  byOwned.set(state.owned, priced);
  lastPriced.set(course, priced);
  return priced;
}

/**
 * The buyable Encounters priced, reusing `same`'s price wherever its count
 * is the state's: a price depends on nothing else `same` was priced under.
 */
function priceList(
  course: Course,
  state: GameState,
  factor: number,
  reached: number,
  same: Priced | undefined,
): Priced {
  const encounters =
    same?.encounters ??
    course.regions.slice(0, reached).flatMap((region) => region.encounters);
  const counts = encounters.map((encounter) => ownedCount(state, encounter.id));
  const prices = encounters.map((encounter, i) => {
    const owned = counts[i] ?? 0;
    const known = same?.counts[i] === owned ? same.prices[i] : undefined;
    return known ?? encounterPriceAt(encounter, owned, 1, factor);
  });
  // The first lowest, as a reduce over the prices in order would keep.
  let cheapest: Num | undefined;
  for (const price of prices) {
    if (cheapest === undefined || Num.cmp(price, cheapest) < 0)
      cheapest = price;
  }
  return { encounters, prices, cheapest, counts, factor, reached };
}

/**
 * The Encounter one Pemandu tick buys at the state's simulated time: of
 * those in the regions reached whose next unit the Understanding held pays
 * for, the one with the lowest cost / Δrate (design §5). `undefined` when
 * none is affordable.
 */
export function bestPayback(
  course: Course,
  state: GameState,
): string | undefined {
  const held = understandingNow(course, state);
  const gainOf = rateGain(course, state, state.sim);
  const { encounters, prices } = pricedAt(course, state);
  let best: Candidate | undefined;
  for (const [i, encounter] of encounters.entries()) {
    const price = prices[i];
    if (price === undefined || Num.cmp(price, held) > 0) continue;
    const candidate = { encounter, price, gain: gainOf(encounter) };
    if (best === undefined || before(candidate, best)) best = candidate;
  }
  return best?.encounter.id;
}

/** Grid ticks `first`, `first + every`, ..., none after `last`. */
export interface TickGrid {
  readonly first: number;
  /** The latest a tick may fall; it need not be on the grid. */
  readonly last: number;
  readonly every: number;
}

/** The first tick found, if any, and how many ticks were tested. */
export interface Found {
  readonly tick: number | undefined;
  readonly checks: number;
}

/**
 * The first tick of `grid` at which `holds` is true, for a test that is
 * false and then true along the grid. It starts from `guess` snapped up to
 * the grid, steps back while the tick before also holds, and otherwise
 * steps on until one does, so an exact guess costs two tests, that tick and
 * the one before (AC3), and a wrong one still gives the scan's answer.
 */
export function firstHolding(
  grid: TickGrid,
  guess: number,
  holds: (tick: number) => boolean,
): Found {
  if (Number.isNaN(guess)) {
    throw new RangeError('firstHolding: the guess must not be NaN');
  }
  const { first, every } = grid;
  // The last tick on the grid at or before `grid.last`.
  const last = first + Math.floor((grid.last - first) / every) * every;
  let checks = 0;
  const test = (tick: number): boolean => {
    checks += 1;
    return holds(tick);
  };
  const snapped = first + Math.ceil((guess - first) / every) * every;
  let tick = Math.min(Math.max(snapped, first), last + every);
  let back = false;
  while (tick - every >= first && test(tick - every)) {
    tick -= every;
    back = true;
  }
  if (back) return { tick, checks };
  while (tick <= last && !test(tick)) tick += every;
  return { tick: tick <= last ? tick : undefined, checks };
}

/** A tick Pemandu buys at, and the Understanding held there. */
export interface PurchaseTick {
  readonly tick: SimMs;
  readonly understanding: Num;
}

/**
 * Pemandu's next purchase: the first tick of its grid in `(anchor, until]`
 * at which Understanding pays for the cheapest unit of the regions reached
 * (design §2.2 item 5). It walks the segments `understandingNow` walks from
 * the anchor, adding in the same order, so the Understanding it tests at a
 * tick is the bits `understandingNow` gives there. In each segment the rate
 * is constant, so the tick is solved from it and confirmed by
 * `firstHolding`; the answer never depends on how far `until` reaches.
 * The Understanding returned with the tick is the one tested there, so a
 * purchase can anchor at the tick without walking the segments again.
 */
export function nextPurchaseTick(
  course: Course,
  state: GameState,
  until: SimMs,
): { readonly next: PurchaseTick | undefined; readonly checks: number } {
  const { cheapest } = pricedAt(course, state);
  if (cheapest === undefined) return { next: undefined, checks: 0 };
  const every = state.automation.intervalMs;
  const from = state.anchor.sim;
  const anchor = Num.fromTuple(state.anchor.understanding);
  let total = Num.from(0);
  let checks = 0;
  // `until + 1` makes `until` itself a tick of the last segment, cut exactly
  // where `understandingNow` at `until` would cut it.
  for (const { start, end, rate } of segments(
    course,
    state,
    from,
    simMs(until + 1),
  )) {
    const before = total;
    const at = (tick: number): Num =>
      understandingAfter(
        anchor,
        Num.add(before, Num.mul(rate, Num.from(tick - start))),
      );
    const short = rateMsShort(anchor, before, cheapest);
    const guess =
      Num.cmp(short, Num.from(0)) <= 0
        ? -Infinity
        : rate.mantissa === 0
          ? Infinity
          : start + Num.toNumber(Num.div(short, rate));
    const found = firstHolding(
      {
        first: nextGridTick(start === from ? from : simMs(start - 1), every),
        last: end - 1,
        every,
      },
      guess,
      (tick) => Num.cmp(cheapest, at(tick)) <= 0,
    );
    checks += found.checks;
    if (found.tick !== undefined) {
      const tick = simMs(found.tick);
      return { next: { tick, understanding: at(tick) }, checks };
    }
    total = Num.add(total, Num.mul(rate, Num.from(end - start)));
  }
  return { next: undefined, checks };
}
