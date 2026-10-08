/**
 * Production over simulated time (M1 design §2.2).
 *
 * The rate is constant inside each clock hour, a bucket. Each Encounter's
 * output is multiplied by M_words = 1 + the sum of b_w over the words sharing
 * one of its tags (parent §3.3), by x2 for each owned Phrasebook of one of
 * its tags, by its held culture cards and complete sets (design §5, #30),
 * and by the global stamp bonus (design §5, #29). A word whose root an owned
 * grammar node attaches to has its bonus multiplied by that root's factor;
 * the `grammar` line is how much that raises M_words (#32). Each multiplier
 * is a named line of the rate breakdown (DN6), and the rate is the product
 * of its lines, so what is shown is what is paid. A word's bonus in a bucket uses its
 * exact mean retrievability over the bucket, on the wall clock, from the
 * later of the bucket's start and `memorySince`. The rate is linear in each
 * word's R, so an hour with no event produces exactly what the continuous
 * model does. A purchase leaves `memorySince` alone, so a bucket's means are
 * reused across it; a review or an offline-cap clip moves it, so the means
 * restart there. A held festival card's window edge splits a bucket, since
 * the card's bonus doubles from that wall-clock millisecond (#30).
 */
import { BALANCE } from './balance';
import { DAY_MS, HOUR_MS, bucketStart, simMs, type SimMs } from './clock';
import { cardFactor, heldCards, nextFestivalEdge, setFactor } from './cards';
import type { Course, CultureCard, Encounter } from './course';
import { encounterOutput, milestoneFactor } from './encounters';
import { rootFactors } from './grammar';
import { meanRetrievability } from './memory';
import { memosOn } from './memo';
import { Num } from './num';
import { ownedCount, type GameState } from './state';
import { globalMultiplier, phrasebookId, upgradeLevel } from './upgrades';
import { lexiconItem, sharesTag, wordBonus } from './words';

const THOUSAND = Num.from(1000);
const PHRASEBOOK = Num.from(BALANCE.insightUpgrades.phrasebookMultiplier);

/** One named multiplier of an Encounter's rate (DN6). */
export interface RateLine {
  /**
   * `encounters`, `milestones`, `words`, `grammar`, `phrasebook:<tag>`,
   * `cards`, `sets` or `stamps`.
   */
  readonly name: string;
  readonly factor: Num;
}

/** An owned Encounter's rate and the lines it is the product of. */
export interface EncounterRate {
  readonly id: string;
  readonly lines: readonly RateLine[];
  readonly rate: Num;
}

interface TaggedBonus {
  readonly tags: readonly string[];
  readonly bonus: number;
  /** The word's grammar factor: its root's, or 1 (#32). */
  readonly grammar: number;
}

/** Understanding per second from every owned Encounter, before any multiplier. */
export function encounterRate(course: Course, state: GameState): Num {
  let rate = Num.from(0);
  for (const region of course.regions) {
    for (const encounter of region.encounters) {
      const owned = ownedCount(state, encounter.id);
      if (owned > 0) rate = Num.add(rate, encounterOutput(encounter, owned));
    }
  }
  return rate;
}

/**
 * Every word's bonus in the bucket holding `t`, in code-unit order of id, so
 * the sums that use them add in the same order on every engine.
 */
function bucketBonuses(
  course: Course,
  state: GameState,
  t: SimMs,
): readonly TaggedBonus[] {
  const start = bucketStart(t);
  const from = Math.max(start, state.memorySince);
  const spanDays = (start + HOUR_MS - from) / DAY_MS;
  const skew = state.wall - state.sim;
  const factors = rootFactors(course, state);
  return sortedWords(state.words).map(([id, word]) => {
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

/** What one bucket's words give an Encounter: M_words, and grammar's ratio if any. */
interface WordFactors {
  readonly words: number;
  readonly grammar: number | undefined;
}

/** A bucket's word bonuses and, worked out on first use, each Encounter's factors. */
interface BucketWords {
  readonly bonuses: readonly TaggedBonus[];
  /** Which bonuses share a tag with each Encounter: the words object's. */
  readonly matched: Map<Encounter, readonly number[]>;
  readonly factors: Map<Encounter, WordFactors>;
}

/**
 * Each words object's entries in code-unit order of id, the order every sum
 * over them adds in, sorted once rather than once an hour (#297).
 */
const sortedMemo = new WeakMap<
  GameState['words'],
  readonly (readonly [string, GameState['words'][string]])[]
>();

function sortWords(
  words: GameState['words'],
): readonly (readonly [string, GameState['words'][string]])[] {
  return Object.entries(words).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function sortedWords(
  words: GameState['words'],
): readonly (readonly [string, GameState['words'][string]])[] {
  if (!memosOn()) return sortWords(words);
  let sorted = sortedMemo.get(words);
  if (sorted === undefined) {
    sorted = sortWords(words);
    sortedMemo.set(words, sorted);
  }
  return sorted;
}

/**
 * For each words object, which of its words (by place in id order) share a
 * tag with each Encounter. Tags come from the course's lexicon, so they hold
 * for every bucket; each bucket's sums then add those words' bonuses alone,
 * in the same order, to the same bits (#297).
 */
const matchedMemo = new WeakMap<
  Course,
  WeakMap<GameState['words'], Map<Encounter, readonly number[]>>
>();

function matchedOf(
  course: Course,
  words: GameState['words'],
): Map<Encounter, readonly number[]> {
  if (!memosOn()) return new Map();
  let byWords = matchedMemo.get(course);
  if (byWords === undefined) {
    byWords = new WeakMap();
    matchedMemo.set(course, byWords);
  }
  let matched = byWords.get(words);
  if (matched === undefined) {
    matched = new Map();
    byWords.set(words, matched);
  }
  return matched;
}

/**
 * Each bucket's word bonuses, kept by course, then by the words held, then by
 * everything else `bucketBonuses` reads: `memorySince`, the skew, the grammar
 * owned and the bucket. A purchase changes none of them, so the purchases
 * Pemandu makes in a return reuse one bucket's bonuses rather than working
 * them out again for every word (#33). State is never mutated, so a words
 * object stands for its contents, as a course does for `lexiconItem`'s index.
 */
const bucketMemo = new WeakMap<
  Course,
  WeakMap<object, Map<string, BucketWords>>
>();

function bucketWords(course: Course, state: GameState, t: SimMs): BucketWords {
  const bucket = keptBucket(course, state, t);
  // Plain, the hour's word bonuses are #33's, kept by their own key-part
  // tests; what #297 keeps on them, each Encounter's matches and factors,
  // is worked out afresh.
  return memosOn()
    ? bucket
    : { bonuses: bucket.bonuses, matched: new Map(), factors: new Map() };
}

function keptBucket(course: Course, state: GameState, t: SimMs): BucketWords {
  let byWords = bucketMemo.get(course);
  if (byWords === undefined) {
    byWords = new WeakMap();
    bucketMemo.set(course, byWords);
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
      bonuses: bucketBonuses(course, state, t),
      matched: matchedOf(course, state.words),
      factors: new Map(),
    };
    byKey.set(key, bucket);
  }
  return bucket;
}

function wordFactors(bucket: BucketWords, encounter: Encounter): WordFactors {
  let factors = bucket.factors.get(encounter);
  if (factors === undefined) {
    let matched = bucket.matched.get(encounter);
    if (matched === undefined) {
      matched = bucket.bonuses.flatMap(({ tags }, i) =>
        sharesTag(tags, encounter.tags) ? [i] : [],
      );
      bucket.matched.set(encounter, matched);
    }
    factors = {
      words: multiplier(bucket.bonuses, matched),
      grammar: grammarRatio(bucket.bonuses, matched),
    };
    bucket.factors.set(encounter, factors);
  }
  return factors;
}

/** 1 + the matched words' bonuses, added in id order. */
function multiplier(
  bonuses: readonly TaggedBonus[],
  matched: readonly number[],
): number {
  let m = 1;
  for (const i of matched) m += bonuses[i]?.bonus ?? 0;
  return m;
}

/**
 * How much grammar raises `encounter`'s M_words: 1 + the multiplied bonuses
 * over 1 + the bonuses, or undefined when no word on its tags has a factor
 * (#32). The words line times this is what is paid.
 */
function grammarRatio(
  bonuses: readonly TaggedBonus[],
  matched: readonly number[],
): number | undefined {
  let multiplied = 1;
  let covered = false;
  for (const i of matched) {
    const word = bonuses[i];
    if (word === undefined) continue;
    multiplied += word.bonus * word.grammar;
    if (word.grammar !== 1) covered = true;
  }
  return covered ? multiplied / multiplier(bonuses, matched) : undefined;
}

/** The `words` and `grammar` lines' figures for `encounter` in the bucket holding `t`. */
function wordFactorsAt(
  course: Course,
  state: GameState,
  encounter: Encounter,
  t: SimMs,
): WordFactors {
  return wordFactors(bucketWords(course, state, t), encounter);
}

/** M_words for `encounter` in the bucket holding `t`, before grammar. */
export function wordMultiplier(
  course: Course,
  state: GameState,
  encounter: Encounter,
  t: SimMs,
): number {
  return wordFactors(bucketWords(course, state, t), encounter).words;
}

/** What every Encounter's lines share at one moment. */
interface Shared {
  readonly held: readonly CultureCard[];
  readonly wall: number;
  readonly sets: number | undefined;
  readonly stamps: Num;
}

function linesFor(
  state: GameState,
  encounter: Encounter,
  owned: number,
  words: WordFactors,
  shared: Shared,
): readonly RateLine[] {
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

function sharedAt(course: Course, state: GameState, t: SimMs): Shared {
  const held = heldCards(course, state);
  return {
    held,
    wall: t + state.wall - state.sim,
    sets: setFactor(course, held),
    stamps: Num.from(globalMultiplier(state)),
  };
}

/**
 * The course's Encounters in course order, every region, with each one's
 * place: the order `rateBreakdown` adds rates in (#297).
 */
const encountersMemo = new WeakMap<
  Course,
  {
    readonly list: readonly Encounter[];
    readonly index: ReadonlyMap<Encounter, number>;
  }
>();

function encountersOf(course: Course): {
  readonly list: readonly Encounter[];
  readonly index: ReadonlyMap<Encounter, number>;
} {
  let kept = encountersMemo.get(course);
  if (kept === undefined) {
    const list = course.regions.flatMap((region) => region.encounters);
    kept = { list, index: new Map(list.map((e, i) => [e, i])) };
    encountersMemo.set(course, kept);
  }
  return kept;
}

/**
 * One stretch of a rate book in which nothing but the counts moves: one
 * clock hour's words, and one span between festival edges, so each held
 * card's season is fixed. For each Encounter it keeps its word factors and
 * its rate at each count asked for; and for the counts last added up, each
 * Encounter's count and the total so far, so the next total re-adds only
 * from the first Encounter whose count moved, in the same order and so to
 * the same bits.
 */
interface RateContext {
  /** Any wall time of the span: a card's season is the same at all of them. */
  readonly wall: number;
  readonly t: SimMs;
  readonly words: (WordFactors | undefined)[];
  readonly rates: (Map<number, Num> | undefined)[];
  readonly counts: (number | undefined)[];
  readonly totals: (Num | undefined)[];
}

/** What every rate of one state's catch-up shares (#297). */
interface RateBook {
  readonly held: readonly CultureCard[];
  readonly sets: number | undefined;
  readonly stamps: Num;
  readonly skew: number;
  /** By bucket start, then by the festival edge ahead. */
  readonly contexts: Map<number, Map<number | undefined, RateContext>>;
  /** The last festival edge looked up: the edge after every wall in `[from, edge)`. */
  edge:
    { readonly from: number; readonly edge: number | undefined } | undefined;
}

/**
 * Each rate book, kept by course, then by the objects a Pemandu purchase
 * never replaces (the words, the cards, the upgrades, the grammar owned),
 * then by the numbers it reads (`memorySince`, the skew, the stamps
 * earned). Everything `linesFor` and the bucket's words read is in the key
 * but the counts, which the book keeps per count (#297). State is never
 * mutated, so each object stands for its contents.
 */
const bookMemo = new WeakMap<
  Course,
  WeakMap<
    object,
    WeakMap<
      object,
      WeakMap<
        object,
        WeakMap<object, Map<number, Map<number, Map<number, RateBook>>>>
      >
    >
  >
>();

function within<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
}

function step<K extends object, V>(
  map: WeakMap<K, V>,
  key: K,
  make: () => V,
): V {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
}

function rateBook(course: Course, state: GameState): RateBook {
  const byWords = step(bookMemo, course, () => new WeakMap());
  const byCards = step(byWords, state.words, () => new WeakMap());
  const byUpgrades = step(byCards, state.cards, () => new WeakMap());
  const byGrammar = step(byUpgrades, state.upgrades, () => new WeakMap());
  const bySince = step(
    byGrammar,
    state.grammar,
    () => new Map<number, Map<number, Map<number, RateBook>>>(),
  );
  const skew = state.wall - state.sim;
  const bySkew = within(
    bySince,
    state.memorySince,
    () => new Map<number, Map<number, RateBook>>(),
  );
  const byStamps = within(bySkew, skew, () => new Map<number, RateBook>());
  let book = byStamps.get(state.stampsEarned);
  if (book === undefined) {
    const held = heldCards(course, state);
    book = {
      held,
      sets: setFactor(course, held),
      stamps: Num.from(globalMultiplier(state)),
      skew,
      contexts: new Map(),
      edge: undefined,
    };
    byStamps.set(state.stampsEarned, book);
  }
  return book;
}

/** The first festival edge after `wall`, reusing the last lookup while it holds. */
function edgeAfter(book: RateBook, wall: number): number | undefined {
  const last = book.edge;
  if (
    last !== undefined &&
    wall >= last.from &&
    (last.edge === undefined || wall < last.edge)
  )
    return last.edge;
  const edge = nextFestivalEdge(book.held, wall);
  book.edge = { from: wall, edge };
  return edge;
}

function contextAt(
  course: Course,
  state: GameState,
  book: RateBook,
  t: SimMs,
): RateContext {
  const wall = t + book.skew;
  const byEdge = within(
    book.contexts,
    bucketStart(t),
    () => new Map<number | undefined, RateContext>(),
  );
  const edge = edgeAfter(book, wall);
  let context = byEdge.get(edge);
  if (context === undefined) {
    const n = encountersOf(course).list.length;
    context = {
      wall,
      t,
      words: new Array<WordFactors | undefined>(n),
      rates: new Array<Map<number, Num> | undefined>(n),
      counts: new Array<number | undefined>(n),
      totals: new Array<Num | undefined>(n),
    };
    byEdge.set(edge, context);
  }
  return context;
}

/** Encounter `i`'s rate with `owned` held in `context`: the product of its lines. */
function contextRate(
  course: Course,
  state: GameState,
  book: RateBook,
  context: RateContext,
  i: number,
  encounter: Encounter,
  owned: number,
): Num {
  let byOwned = context.rates[i];
  if (byOwned === undefined) {
    byOwned = new Map();
    context.rates[i] = byOwned;
  }
  let rate = byOwned.get(owned);
  if (rate === undefined) {
    let words = context.words[i];
    if (words === undefined) {
      words = wordFactorsAt(course, state, encounter, context.t);
      context.words[i] = words;
    }
    const shared: Shared = {
      held: book.held,
      wall: context.wall,
      sets: book.sets,
      stamps: book.stamps,
    };
    rate = product(linesFor(state, encounter, owned, words, shared));
    byOwned.set(owned, rate);
  }
  return rate;
}

/** A rate as the product of its lines, multiplied in order. */
function product(lines: readonly RateLine[]): Num {
  return lines.reduce((r, l) => Num.mul(r, l.factor), Num.from(1));
}

/**
 * Each owned Encounter's rate at simulated time `t`, in course order, with
 * the named lines it is the product of (DN6). The words' means are the
 * bucket's; a festival is judged at `t`'s wall time, `t` plus the skew.
 */
export function rateBreakdown(
  course: Course,
  state: GameState,
  t: SimMs,
): readonly EncounterRate[] {
  let bucket: BucketWords | undefined;
  const shared = sharedAt(course, state, t);
  const rates: EncounterRate[] = [];
  for (const region of course.regions) {
    for (const encounter of region.encounters) {
      const owned = ownedCount(state, encounter.id);
      if (owned === 0) continue;
      bucket ??= bucketWords(course, state, t);
      const words = wordFactors(bucket, encounter);
      const lines = linesFor(state, encounter, owned, words, shared);
      rates.push({ id: encounter.id, lines, rate: product(lines) });
    }
  }
  return rates;
}

/**
 * How much one more of an Encounter would raise the rate at simulated time
 * `t`: its rate with one more, less its rate now, every multiplier included,
 * so a unit that reaches a milestone gains the doubling of all its kind
 * (#33). Only its own `encounters` and `milestones` lines move, so the
 * bucket's word bonuses and the shared lines are worked out once.
 */
export function rateGain(
  course: Course,
  state: GameState,
  t: SimMs,
): (encounter: Encounter) => Num {
  if (!memosOn()) {
    const bucket = bucketWords(course, state, t);
    const shared = sharedAt(course, state, t);
    return (encounter) => {
      const owned = ownedCount(state, encounter.id);
      const words = wordFactors(bucket, encounter);
      const now = product(linesFor(state, encounter, owned, words, shared));
      const more = product(
        linesFor(state, encounter, owned + 1, words, shared),
      );
      return Num.sub(more, now);
    };
  }
  const book = rateBook(course, state);
  const context = contextAt(course, state, book, t);
  const { index } = encountersOf(course);
  return (encounter) => {
    const i = index.get(encounter);
    if (i === undefined)
      throw new RangeError(
        `rateGain: ${encounter.id} is not in course ${course.id}`,
      );
    const owned = ownedCount(state, encounter.id);
    const now = contextRate(course, state, book, context, i, encounter, owned);
    const more = contextRate(
      course,
      state,
      book,
      context,
      i,
      encounter,
      owned + 1,
    );
    return Num.sub(more, now);
  };
}

/** The total of a breakdown's rates, added in its order. */
export function totalRate(breakdown: readonly EncounterRate[]): Num {
  return breakdown.reduce((total, e) => Num.add(total, e.rate), Num.from(0));
}

/**
 * Understanding per second at simulated time `t`, every multiplier included:
 * `totalRate(rateBreakdown(...))`, the same lines multiplied and the same
 * rates added in the same order, kept in the rate book (#297).
 */
export function rateAt(course: Course, state: GameState, t: SimMs): Num {
  if (!memosOn()) return totalRate(rateBreakdown(course, state, t));
  const book = rateBook(course, state);
  const context = contextAt(course, state, book, t);
  const { list } = encountersOf(course);
  let from = 0;
  while (
    from < list.length &&
    context.counts[from] === ownedCount(state, list[from]?.id ?? '')
  )
    from += 1;
  let total =
    from === 0 ? Num.from(0) : (context.totals[from - 1] ?? Num.from(0));
  for (let i = from; i < list.length; i += 1) {
    const encounter = list[i];
    if (encounter === undefined) continue;
    const owned = ownedCount(state, encounter.id);
    context.counts[i] = owned;
    if (owned > 0)
      total = Num.add(
        total,
        contextRate(course, state, book, context, i, encounter, owned),
      );
    context.totals[i] = total;
  }
  return list.length === 0
    ? Num.from(0)
    : (context.totals[list.length - 1] ?? Num.from(0));
}

/**
 * Each state's Understanding, kept by course, then by the state object.
 * State is never mutated, so a state object stands for its contents, as a
 * words object does for `bucketMemo`. A purchase judged, a view and the
 * action after it all read one state's Understanding, and each would walk
 * every hour since its anchor again (#473).
 */
const heldMemo = new WeakMap<Course, WeakMap<GameState, Num>>();

/** Understanding at the state's simulated time: the anchor's, plus production since. */
export function understandingNow(course: Course, state: GameState): Num {
  if (!memosOn()) {
    return understandingAfter(
      Num.fromTuple(state.anchor.understanding),
      rateMs(course, state, state.anchor.sim, state.sim),
    );
  }
  let byState = heldMemo.get(course);
  if (byState === undefined) {
    byState = new WeakMap();
    heldMemo.set(course, byState);
  }
  let held = byState.get(state);
  if (held === undefined) {
    held = understandingAfter(
      Num.fromTuple(state.anchor.understanding),
      rateMs(course, state, state.anchor.sim, state.sim),
    );
    byState.set(state, held);
  }
  return held;
}

/**
 * Understanding `total` rate-milliseconds past `anchor`: the one way every
 * walk from an anchor, `understandingNow`'s and Pemandu's, turns what it
 * added up into Understanding, so both reach the same bits (#33).
 */
export function understandingAfter(anchor: Num, total: Num): Num {
  return Num.add(anchor, Num.div(total, THOUSAND));
}

/**
 * The rate-milliseconds still to add to `total` for Understanding walked
 * from `anchor` to reach `target`; zero or less when it already has.
 */
export function rateMsShort(anchor: Num, total: Num, target: Num): Num {
  return Num.sub(Num.mul(Num.sub(target, anchor), THOUSAND), total);
}

/** A stretch of simulated time, `[start, end)`, paid at one rate per second. */
export interface Segment {
  readonly start: SimMs;
  readonly end: SimMs;
  readonly rate: Num;
}

/**
 * `[from, to)` cut at each hour bucket's end and at each held festival
 * card's window edge, in order, with the rate paid over each piece.
 */
export function* segments(
  course: Course,
  state: GameState,
  from: SimMs,
  to: SimMs,
): Generator<Segment, void, undefined> {
  const skew = state.wall - state.sim;
  const book = memosOn() ? rateBook(course, state) : undefined;
  const held = book === undefined ? heldCards(course, state) : [];
  for (let t = from; t < to;) {
    const edge =
      book === undefined
        ? nextFestivalEdge(held, t + skew)
        : edgeAfter(book, t + skew);
    const end = simMs(
      Math.min(
        bucketStart(t) + HOUR_MS,
        to,
        edge === undefined ? to : edge - skew,
      ),
    );
    // An edge found on the wrong clock could end a segment at or before its
    // start, and the loop would never finish: refuse it instead.
    if (end <= t) {
      throw new RangeError(
        `producedBetween: the segment from ${String(t)} ends at ${String(end)}`,
      );
    }
    yield { start: t, end, rate: rateAt(course, state, t) };
    t = end;
  }
}

/** Rate-milliseconds over `[from, to)`: each segment's rate times its length, added in order. */
function rateMs(course: Course, state: GameState, from: SimMs, to: SimMs): Num {
  if (to < from) {
    throw new RangeError(
      `producedBetween: ${String(to)} is before ${String(from)}`,
    );
  }
  // An empty stretch has no segments: what the loop below would return,
  // without building them (a Pemandu purchase reads one at its tick, #297).
  if (to === from) return Num.from(0);
  let total = Num.from(0);
  for (const { start, end, rate } of segments(course, state, from, to)) {
    total = Num.add(total, Num.mul(rate, Num.from(end - start)));
  }
  return total;
}

/**
 * Understanding produced over `[from, to)`, bucket by bucket, each bucket
 * split at a held festival card's window edges.
 */
export function producedBetween(
  course: Course,
  state: GameState,
  from: SimMs,
  to: SimMs,
): Num {
  return Num.div(rateMs(course, state, from, to), THOUSAND);
}
