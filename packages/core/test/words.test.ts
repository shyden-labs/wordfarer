import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import Decimal from 'decimal.js';
import { BALANCE, type Rank } from '../src/balance';
import {
  DAY_MS,
  HOUR_MS,
  bucketStart,
  simMs,
  wallMs,
  type WallMs,
} from '../src/clock';
import type { Course, Encounter, LexiconItem } from '../src/course';
import { encounterOutput } from '../src/encounters';
import {
  insightFor,
  newWordMemory,
  RANKS,
  review,
  reviewQueue,
  wordRetrievability,
  type WordMemory,
} from '../src/memory';
import { Num } from '../src/num';
import {
  producedBetween,
  rateAt,
  understandingNow,
  wordMultiplier,
} from '../src/production';
import {
  advance,
  answerPractice,
  answerReview,
  buyEncounter,
  integrate,
  listen,
  pickUpWord,
  type Result,
} from '../src/sim';
import { view } from '../src/view';
import { initialState, pickedWord, type GameState } from '../src/state';
import { pickUpCost, wordBonus } from '../src/words';
import { exactMean, exactR } from './fsrs-reference';

/**
 * Words, ranks and FSRS review in the game (#28 AC1, AC2, AC4 to AC9).
 *
 * The course is declared here, so it is checked against the `Course`
 * contract rather than sharing it. Its first destination lists its lexicon
 * out of CEFR order on purpose, and holds an id that is an
 * `Object.prototype` member.
 */

const tea: Encounter = { id: 'tea', tags: ['food'], c0: 10, p0: 1 };
const bus: Encounter = { id: 'bus', tags: ['transport'], c0: 10, p0: 2 };
/** Shares both of `both`'s tags. */
const stall: Encounter = {
  id: 'stall',
  tags: ['food', 'transport'],
  c0: 10,
  p0: 3,
};

const lexicon: readonly LexiconItem[] = [
  { id: 'b1-food', tags: ['food'], cefr: 'B1' },
  { id: 'a1-food', tags: ['food'], cefr: 'A1' },
  { id: 'both', tags: ['food', 'transport'], cefr: 'A2' },
  { id: 'a1-bus', tags: ['transport'], cefr: 'A1' },
  { id: 'toString', tags: ['market'], cefr: 'A2' },
];
const CURRICULUM = ['a1-food', 'a1-bus', 'both', 'toString', 'b1-food'];

const course: Course = {
  id: 'words-course',
  tags: ['food', 'transport', 'market'],
  regions: [
    {
      id: 'r0',
      destinations: [
        { id: 'd0', lexicon },
        { id: 'd1', lexicon: [{ id: 'later', tags: ['food'], cefr: 'A1' }] },
      ],
      encounters: [tea, bus, stall],
      cardSets: [],
      cultureCards: [],
      grammarNodes: [],
    },
  ],
};

const START: WallMs = wallMs(Date.UTC(2027, 0, 4));
const D = Decimal.clone({ precision: 50 });

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** A new game holding `understanding` and owning `owned`. */
function rich(
  understanding: number,
  owned: Record<string, number> = {},
): GameState {
  const base = initialState(START, 1);
  return deepFreeze({
    ...base,
    anchor: {
      ...base.anchor,
      understanding: Num.toTuple(Num.from(understanding)),
    },
    owned,
  });
}

function ok(result: Result): GameState {
  if (!result.ok) {
    throw new Error(`rejected: ${JSON.stringify(result.rejection)}`);
  }
  return deepFreeze(result.state);
}

function held(state: GameState): number {
  return Num.toNumber(understandingNow(course, state));
}

function at(state: GameState, deltaMs: number): GameState {
  return deepFreeze(advance(course, state, wallMs(state.wall + deltaMs)).state);
}

/**
 * A played game: all five words picked up, Encounters owned, the first
 * three words reviewed correctly at different times, then left alone. The
 * first answer waits the 4 minutes until the tutorial word is due.
 */
function played(): GameState {
  let s = rich(1e6, { tea: 3, bus: 2, stall: 1 });
  for (let k = 0; k < 5; k++) s = ok(pickUpWord(course, s));
  s = at(s, 240_000);
  s = ok(answerReview(course, s, 'a1-food', true));
  s = at(s, 7 * HOUR_MS + 123_457);
  s = ok(answerReview(course, s, 'a1-bus', true));
  s = at(s, 3 * DAY_MS);
  s = ok(answerReview(course, s, 'both', true));
  s = ok(answerReview(course, s, 'a1-food', true));
  return at(s, 5 * HOUR_MS + 999);
}

/** Exact R of a word at wall time `wall`, straight from the curve. */
function exactWordR(word: WordMemory, wall: Decimal): Decimal {
  const { lastReview, stability } = word.card;
  if (lastReview === null) return new D(0);
  return exactR(stability, wall.minus(lastReview).div(DAY_MS));
}

/**
 * The continuous model's Understanding over sim [from, to), in decimal:
 * for each owned Encounter, output x (1 + sum of rankBonus x (0.5 + 0.5 R))
 * over the words sharing a tag, R taken on the wall clock (sim + skew).
 * The rate is linear in each word's R, so the integral is exact: each
 * Encounter's output times the span, plus, per word sharing a tag, its bonus
 * times half the span and half R's integral, which is closed form.
 *
 * Measured for #76: the 60-digit result agrees with a 120-digit run in all
 * 45 digits compared, and the Simpson's rule over 2,000 panels it replaces
 * to 4.5e-23 or better. Each of the four tests that call it takes
 * 6 to 11 ms alone, against 2.8 to 4.6 s with Simpson's rule, and up to
 * 118 ms over ten full-suite runs, so they run under the global timeout.
 */
function continuous(state: GameState, from: number, to: number): Decimal {
  const skew = state.wall - state.sim;
  const span = new D(to - from);
  // Each word's term is integrated once and shared by every Encounter.
  const terms = Object.entries(state.words).map(([id, word]) => {
    const { lastReview, stability } = word.card;
    const integralOfR =
      lastReview === null
        ? new D(0)
        : exactMean(
            stability,
            new D(from + skew - lastReview).div(DAY_MS),
            span.div(DAY_MS),
          ).mul(span);
    return {
      tags: lexicon.find((x) => x.id === id)?.tags ?? [],
      value: new D(BALANCE.words.rankBonus[word.rank]).mul(
        span.plus(integralOfR).mul(0.5),
      ),
    };
  });
  let total = new D(0);
  for (const e of [tea, bus, stall]) {
    const owned = state.owned[e.id] ?? 0;
    if (owned === 0) continue;
    let m = span;
    for (const { tags, value } of terms) {
      if (tags.some((g) => e.tags.includes(g))) m = m.plus(value);
    }
    total = total.plus(new D(Num.toNumber(encounterOutput(e, owned))).mul(m));
  }
  return total.div(1000);
}

// The random-sequence property replays 300 games through the real actions:
// 5.8 s measured inside the full core suite; 4086 to 5182 ms alone and up to
// 11734 ms over ten loaded full-suite runs (#72).
const PROPERTY_TIMEOUT_MS = 60_000;

function relative(got: number, want: Decimal): number {
  return new D(got).minus(want).div(want).abs().toNumber();
}

describe('picking up a word (AC1)', () => {
  it('takes the destination’s items in CEFR order, then course order', () => {
    let s = rich(1e6);
    const picked: string[] = [];
    for (let k = 0; k < 5; k++) {
      const before = new Set(Object.keys(s.words));
      s = ok(pickUpWord(course, s));
      picked.push(...Object.keys(s.words).filter((id) => !before.has(id)));
    }
    expect(picked).toEqual(CURRICULUM);
  });

  it('costs 20 × 1.15^n, n being the items already picked in the destination', () => {
    expect(Num.toNumber(pickUpCost(0))).toBe(20);
    expect(Num.toNumber(pickUpCost(1))).toBeCloseTo(23, 12);
    expect(Num.toNumber(pickUpCost(4))).toBeCloseTo(20 * 1.15 ** 4, 10);
  });

  for (const n of [0, 1, 2, 3, 4])
    it(`charges pickUpCost(${String(n)}) with ${String(n)} already picked`, () => {
      let s = rich(1e6);
      for (let k = 0; k < n; k++) s = ok(pickUpWord(course, s));
      expect(Object.keys(s.words)).toHaveLength(n);
      const next = ok(pickUpWord(course, s));
      expect(Num.toTuple(understandingNow(course, next))).toEqual(
        Num.toTuple(Num.sub(understandingNow(course, s), pickUpCost(n))),
      );
    });

  it('adds the first word Heard, a new card due 4 minutes later (parent §4.1)', () => {
    const s = ok(pickUpWord(course, rich(100)));
    expect(s.words['a1-food']?.card.due).toBe(START + 240_000);
    expect(s.words).toEqual({
      'a1-food': newWordMemory(START, wallMs(START + 240_000)),
    });
  });

  it('the tutorial word is not due a millisecond before its 4 minutes', () => {
    const s = at(ok(pickUpWord(course, rich(100))), 240_000 - 1);
    expect(answerReview(course, s, 'a1-food', true)).toEqual({
      ok: false,
      rejection: { kind: 'notDue', itemId: 'a1-food', due: START + 240_000 },
    });
  });

  it('the tutorial word is due at 4 minutes', () => {
    const s = at(ok(pickUpWord(course, rich(100))), 240_000);
    expect(ok(answerReview(course, s, 'a1-food', true)).insight).toEqual([
      1, 0,
    ]);
  });

  it('adds every later word Heard, a new card due at once', () => {
    const s = ok(pickUpWord(course, ok(pickUpWord(course, rich(100)))));
    expect(s.words['a1-bus']).toEqual(newWordMemory(START));
  });

  it('is refused when the pool is empty, never reaching a later destination', () => {
    let s = rich(1e6);
    for (let k = 0; k < 5; k++) s = ok(pickUpWord(course, s));
    const r = pickUpWord(course, s);
    expect(r).toEqual({ ok: false, rejection: { kind: 'poolEmpty' } });
    expect(Object.keys(s.words)).not.toContain('later');
  });

  it('is refused as empty, not unaffordable, when the next pick-up could not be paid for either', () => {
    // The five pick-ups cost 134.85 in all, which leaves 15.15: less than the
    // 40.23 a sixth would cost.
    let s = rich(150);
    for (let k = 0; k < 5; k++) s = ok(pickUpWord(course, s));
    expect(Num.cmp(understandingNow(course, s), pickUpCost(5))).toBeLessThan(0);
    expect(pickUpWord(course, s)).toEqual({
      ok: false,
      rejection: { kind: 'poolEmpty' },
    });
  });

  it('is refused when unaffordable, leaving the state alone', () => {
    const s = rich(19.99);
    const before = JSON.stringify(s);
    const r = pickUpWord(course, s);
    expect(r).toEqual({
      ok: false,
      rejection: {
        kind: 'unaffordable',
        cost: Num.toTuple(Num.from(20)),
        understanding: Num.toTuple(Num.from(19.99)),
      },
    });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('picks up with exactly the cost, leaving zero', () => {
    expect(held(ok(pickUpWord(course, rich(20))))).toBe(0);
  });

  it('pays from Understanding produced since the anchor, and re-anchors', () => {
    const s = integrate(course, rich(0, { tea: 1 }), 25_000);
    expect(held(s)).toBe(25);
    const next = ok(pickUpWord(course, s));
    expect(next.anchor.sim).toBe(25_000);
    expect(held(next)).toBe(5);
  });
});

describe('the word bonus (AC2)', () => {
  // rankBonus × (0.5 + 0.5 R̄), one row per rank.
  const bonuses: readonly (readonly [Rank, number, number])[] = [
    ['heard', 0, 0.01],
    ['recognised', 1, 0.05],
    ['recalled', 0.5, 0.09],
    ['fluent', 0.5, 0.1875],
    ['mastered', 1, 0.4],
  ];
  for (const [rank, r, bonus] of bonuses)
    it(`is ${String(bonus)} for ${rank} at R̄ = ${String(r)}`, () => {
      expect(wordBonus(rank, r)).toBeCloseTo(bonus, 15);
    });

  it('M_words is 1 plus the bonus of each word sharing a tag, counted once', () => {
    const s = played();
    const t = s.sim;
    const bonusOf = (id: string): number => {
      const one = {
        ...s,
        words: { [id]: s.words[id] ?? newWordMemory(START) },
      };
      return wordMultiplier(course, one, stall, t) - 1;
    };
    // stall shares food with a1-food and b1-food, transport with a1-bus,
    // and both tags with both, which still counts once; toString shares none.
    const want =
      1 +
      bonusOf('a1-food') +
      bonusOf('b1-food') +
      bonusOf('a1-bus') +
      bonusOf('both');
    expect(wordMultiplier(course, s, stall, t)).toBeCloseTo(want, 14);
    expect(bonusOf('toString')).toBe(0);
    expect(wordMultiplier(course, s, tea, t)).toBeCloseTo(
      1 + bonusOf('a1-food') + bonusOf('b1-food') + bonusOf('both'),
      14,
    );
  });

  it('over a whole hour with no event, production equals the continuous model to 1e-12', () => {
    const s = played();
    const h = bucketStart(simMs(s.sim + HOUR_MS));
    const later = integrate(course, s, h - s.sim);
    const want = continuous(later, h, h + HOUR_MS);
    const got = Num.toNumber(
      producedBetween(course, later, h, simMs(h + HOUR_MS)),
    );
    expect(relative(got, want)).toBeLessThan(1e-12);
    // Liveness: the words move production, so a word-blind rate would fail.
    const blind = { ...later, words: {} };
    expect(
      relative(
        Num.toNumber(producedBetween(course, blind, h, simMs(h + HOUR_MS))),
        want,
      ),
    ).toBeGreaterThan(1e-3);
  });

  it('across three hour boundaries, production equals the continuous model to 1e-12', () => {
    // Whole hours only: each hour runs at its own mean, which equals the
    // exact integral over a whole bucket, so a span using one hour's rate
    // for all three (no bucket split) is off by R's decay across them.
    const s = played();
    const h = bucketStart(simMs(s.sim + HOUR_MS));
    const later = integrate(course, s, h - s.sim);
    const got = Num.toNumber(
      producedBetween(course, later, h, simMs(h + 3 * HOUR_MS)),
    );
    expect(relative(got, continuous(later, h, h + 3 * HOUR_MS))).toBeLessThan(
      1e-12,
    );
  });

  it('after a review mid-hour, production to the hour’s end equals the continuous model', () => {
    let s = played();
    s = integrate(course, s, HOUR_MS - (s.sim % HOUR_MS) + 1_234_567);
    s = ok(answerReview(course, s, 'a1-bus', false));
    const end = bucketStart(s.sim) + HOUR_MS;
    const got = Num.toNumber(producedBetween(course, s, s.sim, simMs(end)));
    expect(relative(got, continuous(s, s.sim, end))).toBeLessThan(1e-12);
  });

  it('keeps each word’s mean over the hour through a purchase', () => {
    let s = played();
    s = integrate(course, s, HOUR_MS - (s.sim % HOUR_MS) + 600_000);
    const before = wordMultiplier(course, s, tea, simMs(s.sim + 1000));
    const bought = ok(buyEncounter(course, s, 'tea', 1));
    expect(bought.anchor.sim).toBe(s.sim);
    expect(wordMultiplier(course, bought, tea, simMs(bought.sim + 1000))).toBe(
      before,
    );
  });

  it('takes R on the wall clock, not the simulated one', () => {
    const s = played();
    const skewed = { ...s, wall: wallMs(s.wall + 20 * DAY_MS) };
    const t = s.sim;
    expect(wordMultiplier(course, skewed, tea, t)).toBeLessThan(
      wordMultiplier(course, s, tea, t),
    );
  });

  it('includes the word multipliers in the rate', () => {
    const s = played();
    const t = s.sim;
    let want = Num.from(0);
    for (const e of [tea, bus, stall]) {
      want = Num.add(
        want,
        Num.mul(
          encounterOutput(e, s.owned[e.id] ?? 0),
          Num.from(wordMultiplier(course, s, e, t)),
        ),
      );
    }
    expect(Num.toTuple(rateAt(course, s, t))).toEqual(Num.toTuple(want));
  });
});

describe('the floor (AC4)', () => {
  it('a never-reviewed word gives exactly half its rank bonus', () => {
    let s = rich(1e6, { tea: 1 });
    s = ok(pickUpWord(course, s));
    expect(wordMultiplier(course, s, tea, s.sim)).toBe(
      1 + 0.5 * BALANCE.words.rankBonus.heard,
    );
  });

  for (const rank of RANKS)
    it(`gives ${rank} exactly half its rank bonus at R̄ = 0`, () => {
      expect(wordBonus(rank, 0)).toBe(0.5 * BALANCE.words.rankBonus[rank]);
    });

  // A word reviewed once, by tea, and the multiplier its floor allows.
  const reviewedFloor = 1 + 0.5 * BALANCE.words.rankBonus.recognised;
  function reviewedTeaAfter(days: number): number {
    let s = rich(1e6, { tea: 1 });
    s = ok(pickUpWord(course, s));
    s = at(s, 240_000);
    s = ok(answerReview(course, s, 'a1-food', true));
    const later = integrate(course, s, Math.round(days * DAY_MS));
    return wordMultiplier(course, later, tea, later.sim);
  }

  it('a reviewed word’s bonus starts above the floor', () => {
    expect(reviewedTeaAfter(0)).toBeGreaterThan(reviewedFloor);
  });

  for (const [earlier, later] of [
    [0, 1],
    [1, 30],
    [30, 365],
    [365, 36_525],
    [36_525, 1e8],
  ] as const)
    it(`a reviewed word’s bonus falls from ${String(earlier)} to ${String(later)} days and stays above the floor`, () => {
      const m = reviewedTeaAfter(later);
      expect(m).toBeGreaterThan(reviewedFloor);
      expect(m).toBeLessThan(reviewedTeaAfter(earlier));
    });

  it('a reviewed word’s bonus has fallen 90% of the way to the floor by 1e8 days', () => {
    // A power law falls slowly: at 1e8 days R is about 0.067 (FSRS-6, S = 2.3 d).
    expect(reviewedTeaAfter(1e8) - reviewedFloor).toBeLessThan(
      0.1 * (reviewedTeaAfter(0) - reviewedFloor),
    );
  });

  it('ranks and memory never change through absence', () => {
    const s = played();
    fc.assert(
      fc.property(fc.integer({ min: -DAY_MS, max: 400 * DAY_MS }), (delta) => {
        expect(advance(course, s, wallMs(s.wall + delta)).state.words).toEqual(
          s.words,
        );
        expect(integrate(course, s, Math.max(delta, 0)).words).toEqual(s.words);
      }),
      { numRuns: 200 },
    );
  });
});

describe('answering a review (AC5, AC7)', () => {
  for (const id of ['a1-food', 'both', 'b1-food'])
    it(`a correct due answer to ${id} gives 1 + 0.5 × rank index Insight, by the rank it was asked at`, () => {
      const s = at(played(), 400 * DAY_MS);
      const word = s.words[id];
      if (word === undefined) throw new Error(id);
      const next = ok(answerReview(course, s, id, true));
      expect(
        Num.toNumber(
          Num.sub(Num.fromTuple(next.insight), Num.fromTuple(s.insight)),
        ),
      ).toBe(insightFor(word.rank));
      expect(next.words[id]).toEqual(review(word, s.wall, true));
    });

  it('a wrong answer costs nothing and reschedules the word', () => {
    const s = at(played(), 400 * DAY_MS);
    const next = ok(answerReview(course, s, 'both', false));
    expect(next.insight).toEqual(s.insight);
    expect(held(next)).toBe(held(s));
    expect(next.words.both?.card.due).toBeGreaterThan(s.wall);
    expect(next.words.both).toEqual(
      review(s.words.both ?? newWordMemory(START), s.wall, false),
    );
  });

  it('re-anchors at the answer and restarts every word’s hour mean there', () => {
    const s = at(played(), 400 * DAY_MS);
    const next = ok(answerReview(course, s, 'both', true));
    expect(next.anchor.sim).toBe(s.sim);
    expect(next.memorySince).toBe(s.sim);
    expect(Num.toTuple(understandingNow(course, next))).toEqual(
      Num.toTuple(understandingNow(course, s)),
    );
  });

  it('refuses an item that is not due, leaving the state alone', () => {
    let s = rich(1e6);
    s = ok(pickUpWord(course, s));
    s = at(s, 240_000);
    s = ok(answerReview(course, s, 'a1-food', true));
    const word = s.words['a1-food'];
    expect(word && word.card.due > s.wall).toBe(true);
    const before = JSON.stringify(s);
    expect(answerReview(course, s, 'a1-food', true)).toEqual({
      ok: false,
      rejection: { kind: 'notDue', itemId: 'a1-food', due: word?.card.due },
    });
    expect(JSON.stringify(s)).toBe(before);
  });

  // Not picked up, including Object.prototype names.
  for (const id of [
    'later',
    'nope',
    'constructor',
    '__proto__',
    'hasOwnProperty',
  ])
    it(`refuses ${id}, a word not picked up`, () => {
      expect(answerReview(course, played(), id, true)).toEqual({
        ok: false,
        rejection: { kind: 'unknownWord', itemId: id },
      });
    });

  it('answers a word whose id is an Object.prototype member', () => {
    let s = rich(1e6);
    for (let k = 0; k < 4; k++) s = ok(pickUpWord(course, s));
    expect(Object.hasOwn(s.words, 'toString')).toBe(true);
    s = ok(answerReview(course, s, 'toString', true));
    expect(pickedWord(s, 'toString')?.rank).toBe('recognised');
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('practice (AC8)', () => {
  for (const id of CURRICULUM)
    it(`on ${id} changes no currency, no FSRS state and no rank`, () => {
      const s = played();
      const r = answerPractice(s, id);
      expect(r.ok && r.state).toEqual(s);
    });

  it('is open at any time, due or not, over random states', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 * DAY_MS }),
        fc.constantFrom(...CURRICULUM),
        (delta, id) => {
          const s = at(played(), delta);
          const r = answerPractice(s, id);
          expect(r).toEqual({ ok: true, state: s });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('refuses a word not picked up', () => {
    expect(answerPractice(rich(0), 'a1-food')).toEqual({
      ok: false,
      rejection: { kind: 'unknownWord', itemId: 'a1-food' },
    });
  });
});

describe('the view (AC6, DN23)', () => {
  it('holds Understanding, the rate and its breakdown (#29), Insight, the queue, the sail preview and the unfold flags (#31), the shop (#35), and nothing else', () => {
    const v = view(course, played(), wallMs(START + 9 * DAY_MS));
    expect(Object.keys(v).sort()).toEqual([
      'breakdown',
      'insight',
      'queue',
      'rate',
      'sail',
      'shop',
      'understanding',
      'unfold',
    ]);
  });

  it('shows the same 10 whether 11 or 50 items are due', () => {
    // Fifty due words, all newer than the ten oldest, in a course that
    // holds them: the view's shop prices every held word (#35).
    const ids = Array.from(
      { length: 50 },
      (_, i) => `x${String(i).padStart(2, '0')}`,
    );
    const region = course.regions[0];
    if (region === undefined) throw new Error('the course has no region');
    const crowded: Course = {
      ...course,
      regions: [
        {
          ...region,
          destinations: [
            {
              id: 'd0',
              lexicon: [
                ...lexicon,
                ...ids.map((id) => ({
                  id,
                  tags: ['market'],
                  cefr: 'A1' as const,
                })),
              ],
            },
            ...region.destinations.slice(1),
          ],
        },
      ],
    };
    const words = (n: number): Record<string, WordMemory> => {
      const out: Record<string, WordMemory> = {};
      for (let i = 0; i < n; i++) {
        const lastReview = START - (60 - i) * DAY_MS;
        out[`x${String(i).padStart(2, '0')}`] = {
          rank: 'recalled',
          card: {
            ...review(
              newWordMemory(wallMs(lastReview)),
              wallMs(lastReview),
              true,
            ).card,
            due: START,
          },
        };
      }
      return out;
    };
    // Through the view, so the wiring is tested; review.test.ts owns the cap.
    const queueOf = (n: number) =>
      view(crowded, { ...rich(0), words: words(n) }, START).queue;
    expect(queueOf(50)).toHaveLength(10);
    expect(queueOf(11)).toEqual(queueOf(50));
  });

  it('shows the rate with the word multipliers and the queue at the view’s time', () => {
    const s = played();
    const now = wallMs(s.wall + 2 * DAY_MS);
    const v = view(course, s, now);
    const later = advance(course, s, now).state;
    expect(Num.toTuple(v.rate)).toEqual(
      Num.toTuple(rateAt(course, later, later.sim)),
    );
    expect(v.queue).toEqual(reviewQueue(later.words, now));
    expect(Num.toTuple(v.insight)).toEqual(later.insight);
  });
});

describe('memory ages on the wall clock (AC9)', () => {
  it('after a capped 30-day absence, R reflects 30 days and Understanding the cap', () => {
    const s = played();
    const now = wallMs(s.wall + 30 * DAY_MS);
    const { state: back, summary } = advance(course, s, now);
    expect(summary.creditedMs).toBe(BALANCE.offline.capMs);
    expect(summary.clipped).toBe(true);
    expect(Num.toTuple(understandingNow(course, back))).toEqual(
      Num.toTuple(
        understandingNow(course, integrate(course, s, BALANCE.offline.capMs)),
      ),
    );
    const word = s.words['a1-food'];
    if (word === undefined) throw new Error('a1-food');
    const item = view(course, back, now).queue.find(
      (q) => q.itemId === 'a1-food',
    );
    expect(item?.retrievability).toBe(wordRetrievability(word, now));
    expect(
      relative(item?.retrievability ?? 0, exactWordR(word, new D(now))),
    ).toBeLessThan(1e-13);
  });

  it('after a clipped return mid-hour, production to the hour’s end equals the continuous model', () => {
    let s = played();
    s = integrate(course, s, HOUR_MS - (s.sim % HOUR_MS) + 1_234_567);
    const { state: back, summary } = advance(
      course,
      s,
      wallMs(s.wall + 30 * DAY_MS),
    );
    expect(summary.clipped).toBe(true);
    // The cap is whole hours, so the clip lands 1,234,567 ms into an hour.
    expect(back.sim % HOUR_MS).toBe(1_234_567);
    const end = bucketStart(back.sim) + HOUR_MS;
    const got = Num.toNumber(
      producedBetween(course, back, back.sim, simMs(end)),
    );
    expect(relative(got, continuous(back, back.sim, end))).toBeLessThan(1e-12);
  });
});

describe('no reachable state holds NaN, a negative or an infinite value', () => {
  type Step =
    | { readonly kind: 'listen' }
    | { readonly kind: 'buy'; readonly id: string }
    | { readonly kind: 'pick' }
    | {
        readonly kind: 'answer';
        readonly pick: number;
        readonly correct: boolean;
      }
    | { readonly kind: 'advance'; readonly deltaMs: number };

  const step: fc.Arbitrary<Step> = fc.oneof(
    { arbitrary: fc.constant({ kind: 'listen' as const }), weight: 2 },
    {
      arbitrary: fc.record({
        kind: fc.constant('buy' as const),
        id: fc.constantFrom('tea', 'bus', 'stall'),
      }),
      weight: 2,
    },
    { arbitrary: fc.constant({ kind: 'pick' as const }), weight: 2 },
    {
      arbitrary: fc.record({
        kind: fc.constant('answer' as const),
        pick: fc.nat(),
        correct: fc.boolean(),
      }),
      weight: 4,
    },
    {
      arbitrary: fc.record({
        kind: fc.constant('advance' as const),
        deltaMs: fc.integer({ min: -DAY_MS, max: 40 * DAY_MS }),
      }),
      weight: 3,
    },
  );

  function sane(s: GameState): void {
    for (const t of [s.sim, s.wall, s.anchor.sim, s.memorySince]) {
      expect(Number.isSafeInteger(t) && t >= 0).toBe(true);
    }
    expect(s.memorySince).toBeLessThanOrEqual(s.anchor.sim);
    expect(s.anchor.sim).toBeLessThanOrEqual(s.sim);
    for (const n of [
      Num.fromTuple(s.insight),
      understandingNow(course, s),
      rateAt(course, s, s.sim),
    ]) {
      expect(Number.isFinite(n.mantissa) && n.mantissa >= 0).toBe(true);
    }
    for (const w of Object.values(s.words)) {
      for (const x of [
        w.card.due,
        w.card.stability,
        w.card.difficulty,
        w.card.reps,
        w.card.lapses,
      ]) {
        expect(Number.isFinite(x) && x >= 0).toBe(true);
      }
      if (w.card.lastReview !== null)
        expect(w.card.lastReview).toBeLessThanOrEqual(s.wall);
    }
  }

  it(
    'over random sequences of pick-ups, answers, purchases and returns',
    { timeout: PROPERTY_TIMEOUT_MS },
    () => {
      let picks = 0;
      let answers = 0;
      fc.assert(
        fc.property(
          fc.array(step, { minLength: 20, maxLength: 120, size: 'max' }),
          (steps) => {
            let s = rich(500);
            for (const e of steps) {
              let r: Result | undefined;
              if (e.kind === 'listen') s = listen(course, s);
              if (e.kind === 'buy') r = buyEncounter(course, s, e.id, 1);
              if (e.kind === 'pick') {
                r = pickUpWord(course, s);
                if (r.ok) picks++;
              }
              if (e.kind === 'answer') {
                const due = reviewQueue(s.words, s.wall);
                const q = due[e.pick % Math.max(due.length, 1)];
                if (q !== undefined) {
                  r = answerReview(course, s, q.itemId, e.correct);
                  if (r.ok) answers++;
                }
              }
              if (e.kind === 'advance')
                s = advance(course, s, wallMs(s.wall + e.deltaMs)).state;
              if (r?.ok === true) s = r.state;
              sane(s);
            }
          },
        ),
        { numRuns: 300 },
      );
      expect(picks).toBeGreaterThan(300);
      expect(answers).toBeGreaterThan(1000);
    },
  );
});

/** Not an AC: the bucket helpers the tests rely on behave as stated. */
describe('test fixtures', () => {
  it('played() picks all five words and reviews three, at a sim time mid-hour', () => {
    const s = played();
    expect(Object.keys(s.words).sort()).toEqual([...CURRICULUM].sort());
    expect(
      Object.values(s.words).filter((w) => w.card.lastReview !== null),
    ).toHaveLength(3);
    expect(s.sim % HOUR_MS).not.toBe(0);
  });
});
