import {
  firstHolding,
  type PurchaseTick,
} from '../../packages/core/src/automation';
import { BALANCE } from '../../packages/core/src/balance';
import {
  cardFactor,
  nextFestivalEdge,
  setFactor,
} from '../../packages/core/src/cards';
import {
  DAY_MS,
  HOUR_MS,
  bucketStart,
  nextGridTick,
  simMs,
  wallMs,
  type SimMs,
} from '../../packages/core/src/clock';
import type {
  Course,
  CultureCard,
  Encounter,
} from '../../packages/core/src/course';
import {
  milestoneFactor,
  purchaseCost,
} from '../../packages/core/src/encounters';
import { Num } from '../../packages/core/src/num';
import { rootFactors } from '../../packages/core/src/grammar';
import { meanRetrievability } from '../../packages/core/src/memory';
import {
  rateMsShort,
  understandingAfter,
  type RateLine,
} from '../../packages/core/src/production';
import { regionsReached } from '../../packages/core/src/route';
import { ownedCount, type GameState } from '../../packages/core/src/state';
import {
  encounterCostFactor,
  globalMultiplier,
  phrasebookId,
  upgradeLevel,
} from '../../packages/core/src/upgrades';
import {
  lexiconItem,
  sharesTag,
  wordBonus,
} from '../../packages/core/src/words';

/**
 * Pemandu's purchases as core made them before #297, kept as the reference
 * the faster implementation is held to, purchase by purchase (AC2). Each
 * function is the pre-#297 code with a `ref` name, built only on parts #297
 * leaves alone: each word's bonus, the card, milestone, cost and upgrade
 * arithmetic, `firstHolding`, and `Num`. The bucket's word factors and the
 * held cards are worked out here too, since #297 keeps them.
 */

const PHRASEBOOK = Num.from(BALANCE.insightUpgrades.phrasebookMultiplier);

function refHeldCards(
  course: Course,
  state: GameState,
): readonly CultureCard[] {
  const held = new Set(state.cards);
  return course.regions.flatMap((region) =>
    region.cultureCards.filter((card) => held.has(card.id)),
  );
}

interface Shared {
  readonly held: readonly CultureCard[];
  readonly wall: number;
  readonly sets: number | undefined;
  readonly stamps: Num;
}

interface TaggedBonus {
  readonly tags: readonly string[];
  readonly bonus: number;
  readonly grammar: number;
}

function refBucketBonuses(
  course: Course,
  state: GameState,
  t: SimMs,
): readonly TaggedBonus[] {
  const start = bucketStart(t);
  const from = Math.max(start, state.memorySince);
  const spanDays = (start + HOUR_MS - from) / DAY_MS;
  const skew = state.wall - state.sim;
  const factors = rootFactors(course, state);
  return Object.entries(state.words)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, word]) => {
      const { lastReview, stability } = word.card;
      const meanR =
        lastReview === null
          ? 0
          : meanRetrievability(
              stability,
              (from + skew - lastReview) / DAY_MS,
              spanDays,
            );
      const { tags, root } = lexiconItem(course, id);
      return {
        tags,
        bonus: wordBonus(word.rank, meanR),
        grammar: root === undefined ? 1 : (factors.get(root) ?? 1),
      };
    });
}

interface RefBucket {
  readonly bonuses: readonly TaggedBonus[];
  readonly factors: Map<
    Encounter,
    { readonly words: number; readonly grammar: number | undefined }
  >;
}

/**
 * The pre-#297 bucket memo: by course, words object, then the bucket's key,
 * each bucket keeping every Encounter's factors once worked out.
 */
const refBucketMemo = new WeakMap<
  Course,
  WeakMap<object, Map<string, RefBucket>>
>();

function refBucket(course: Course, state: GameState, t: SimMs): RefBucket {
  let byWords = refBucketMemo.get(course);
  if (byWords === undefined) {
    byWords = new WeakMap();
    refBucketMemo.set(course, byWords);
  }
  let byKey = byWords.get(state.words);
  if (byKey === undefined) {
    byKey = new Map();
    byWords.set(state.words, byKey);
  }
  const key = JSON.stringify([
    bucketStart(t),
    state.memorySince,
    state.wall - state.sim,
    state.grammar,
  ]);
  let bucket = byKey.get(key);
  if (bucket === undefined) {
    bucket = {
      bonuses: refBucketBonuses(course, state, t),
      factors: new Map(),
    };
    byKey.set(key, bucket);
  }
  return bucket;
}

function refMultiplier(
  bonuses: readonly TaggedBonus[],
  encounter: Encounter,
): number {
  let m = 1;
  for (const { tags, bonus } of bonuses) {
    if (sharesTag(tags, encounter.tags)) m += bonus;
  }
  return m;
}

function refGrammarRatio(
  bonuses: readonly TaggedBonus[],
  encounter: Encounter,
): number | undefined {
  let multiplied = 1;
  let covered = false;
  for (const { tags, bonus, grammar } of bonuses) {
    if (!sharesTag(tags, encounter.tags)) continue;
    multiplied += bonus * grammar;
    if (grammar !== 1) covered = true;
  }
  return covered ? multiplied / refMultiplier(bonuses, encounter) : undefined;
}

function refLinesFor(
  course: Course,
  state: GameState,
  encounter: Encounter,
  owned: number,
  t: SimMs,
  shared: Shared,
): readonly RateLine[] {
  const bucket = refBucket(course, state, t);
  let words = bucket.factors.get(encounter);
  if (words === undefined) {
    words = {
      words: refMultiplier(bucket.bonuses, encounter),
      grammar: refGrammarRatio(bucket.bonuses, encounter),
    };
    bucket.factors.set(encounter, words);
  }
  const lines: RateLine[] = [
    { name: 'encounters', factor: Num.from(encounter.p0 * owned) },
    { name: 'milestones', factor: milestoneFactor(owned) },
    { name: 'words', factor: Num.from(words.words) },
  ];
  if (words.grammar !== undefined)
    lines.push({ name: 'grammar', factor: Num.from(words.grammar) });
  for (const tag of encounter.tags) {
    const id = phrasebookId(tag);
    if (upgradeLevel(state, id) > 0)
      lines.push({ name: id, factor: PHRASEBOOK });
  }
  const cards = cardFactor(shared.held, encounter, shared.wall);
  if (cards !== undefined)
    lines.push({ name: 'cards', factor: Num.from(cards) });
  if (shared.sets !== undefined)
    lines.push({ name: 'sets', factor: Num.from(shared.sets) });
  lines.push({ name: 'stamps', factor: shared.stamps });
  return lines;
}

function refSharedAt(course: Course, state: GameState, t: SimMs): Shared {
  const held = refHeldCards(course, state);
  return {
    held,
    wall: t + state.wall - state.sim,
    sets: setFactor(course, held),
    stamps: Num.from(globalMultiplier(state)),
  };
}

function refProduct(lines: readonly RateLine[]): Num {
  return lines.reduce((r, l) => Num.mul(r, l.factor), Num.from(1));
}

/** Every owned Encounter's lines at `t`, in course order. */
export function refRateBreakdown(
  course: Course,
  state: GameState,
  t: SimMs,
): readonly {
  readonly id: string;
  readonly lines: readonly RateLine[];
  readonly rate: Num;
}[] {
  const shared = refSharedAt(course, state, t);
  const rates = [];
  for (const region of course.regions) {
    for (const encounter of region.encounters) {
      const owned = ownedCount(state, encounter.id);
      if (owned === 0) continue;
      const lines = refLinesFor(course, state, encounter, owned, t, shared);
      rates.push({ id: encounter.id, lines, rate: refProduct(lines) });
    }
  }
  return rates;
}

export function refRateAt(course: Course, state: GameState, t: SimMs): Num {
  return refRateBreakdown(course, state, t).reduce(
    (total, e) => Num.add(total, e.rate),
    Num.from(0),
  );
}

function refRateGain(
  course: Course,
  state: GameState,
  t: SimMs,
): (encounter: Encounter) => Num {
  const shared = refSharedAt(course, state, t);
  return (encounter) => {
    const owned = ownedCount(state, encounter.id);
    const now = refProduct(
      refLinesFor(course, state, encounter, owned, t, shared),
    );
    const more = refProduct(
      refLinesFor(course, state, encounter, owned + 1, t, shared),
    );
    return Num.sub(more, now);
  };
}

function* refSegments(
  course: Course,
  state: GameState,
  from: SimMs,
  to: SimMs,
): Generator<{ start: SimMs; end: SimMs; rate: Num }, void, undefined> {
  const skew = state.wall - state.sim;
  const held = refHeldCards(course, state);
  for (let t = from; t < to;) {
    const edge = nextFestivalEdge(held, t + skew);
    const end = simMs(
      Math.min(
        bucketStart(t) + HOUR_MS,
        to,
        edge === undefined ? to : edge - skew,
      ),
    );
    if (end <= t) throw new RangeError(`refSegments: ${String(t)}`);
    yield { start: t, end, rate: refRateAt(course, state, t) };
    t = end;
  }
}

function refUnderstandingNow(course: Course, state: GameState): Num {
  let total = Num.from(0);
  for (const { start, end, rate } of refSegments(
    course,
    state,
    state.anchor.sim,
    state.sim,
  )) {
    total = Num.add(total, Num.mul(rate, Num.from(end - start)));
  }
  return understandingAfter(Num.fromTuple(state.anchor.understanding), total);
}

export function refEncounterPrice(state: GameState, encounter: Encounter): Num {
  return Num.mul(
    purchaseCost(encounter, ownedCount(state, encounter.id), 1),
    Num.from(encounterCostFactor(state)),
  );
}

interface Candidate {
  readonly encounter: Encounter;
  readonly price: Num;
  readonly gain: Num;
}

function refBefore(a: Candidate, b: Candidate): boolean {
  const order = Num.cmp(Num.mul(a.price, b.gain), Num.mul(b.price, a.gain));
  if (order !== 0) return order < 0;
  return a.encounter.id < b.encounter.id;
}

export function refBestPayback(
  course: Course,
  state: GameState,
): Encounter | undefined {
  const held = refUnderstandingNow(course, state);
  const gainOf = refRateGain(course, state, state.sim);
  let best: Candidate | undefined;
  for (const region of course.regions.slice(0, regionsReached(course, state))) {
    for (const encounter of region.encounters) {
      const price = refEncounterPrice(state, encounter);
      if (Num.cmp(price, held) > 0) continue;
      const candidate = { encounter, price, gain: gainOf(encounter) };
      if (best === undefined || refBefore(candidate, best)) best = candidate;
    }
  }
  return best?.encounter;
}

export function refNextPurchaseTick(
  course: Course,
  state: GameState,
  until: SimMs,
): PurchaseTick | undefined {
  const prices = course.regions
    .slice(0, regionsReached(course, state))
    .flatMap((region) => region.encounters)
    .map((encounter) => refEncounterPrice(state, encounter));
  const cheapest = prices.reduce<Num | undefined>(
    (low, p) => (low === undefined || Num.cmp(p, low) < 0 ? p : low),
    undefined,
  );
  if (cheapest === undefined) return undefined;
  const every = state.automation.intervalMs;
  const from = state.anchor.sim;
  const anchor = Num.fromTuple(state.anchor.understanding);
  let total = Num.from(0);
  for (const { start, end, rate } of refSegments(
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
    if (found.tick !== undefined) {
      const tick = simMs(found.tick);
      return { tick, understanding: at(tick) };
    }
    total = Num.add(total, Num.mul(rate, Num.from(end - start)));
  }
  return undefined;
}

/** One purchase as the reference makes it: the tick, what it bought, the state after. */
export interface RefPurchase extends PurchaseTick {
  readonly id: string;
  readonly after: GameState;
}

/**
 * Pemandu over `elapsedMs` from `state` as the reference makes it: each
 * purchase, then the state at the end, as `integrate` leaves it.
 */
export function refIntegrate(
  course: Course,
  state: GameState,
  elapsedMs: number,
): { readonly purchases: readonly RefPurchase[]; readonly end: GameState } {
  const until = simMs(state.sim + elapsedMs);
  const purchases: RefPurchase[] = [];
  let current = state;
  if (state.automation.enabled) {
    let found = refNextPurchaseTick(course, current, until);
    while (found !== undefined) {
      const { tick, understanding } = found;
      const at: GameState = {
        ...current,
        sim: tick,
        wall: wallMs(current.wall + tick - current.sim),
        anchor: { sim: tick, understanding: Num.toTuple(understanding) },
      };
      const encounter = refBestPayback(course, at);
      if (encounter === undefined)
        throw new Error(`refIntegrate: nothing to buy at ${String(tick)}`);
      // As `buyEncounter`: priced first, then re-anchored at the tick (a
      // walk of nothing, still added), then paid from the stored bits.
      const price = refEncounterPrice(at, encounter);
      const anchored = Num.fromTuple(
        Num.toTuple(refUnderstandingNow(course, at)),
      );
      current = {
        ...at,
        anchor: {
          sim: tick,
          understanding: Num.toTuple(Num.sub(anchored, price)),
        },
        owned: {
          ...at.owned,
          [encounter.id]: ownedCount(at, encounter.id) + 1,
        },
        runSpent: Num.toTuple(Num.add(Num.fromTuple(at.runSpent), price)),
      };
      purchases.push({ tick, understanding, id: encounter.id, after: current });
      found = refNextPurchaseTick(course, current, until);
    }
  }
  return {
    purchases,
    end: {
      ...current,
      sim: until,
      wall: wallMs(state.wall + elapsedMs),
    },
  };
}
