import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { HOUR_MS, simMs, wallMs, type WallMs } from '../src/clock';
import type { Course, Encounter } from '../src/course';
import { encounterOutput, purchaseCost } from '../src/encounters';
import { Num, type NumTuple } from '../src/num';
import { encounterRate, understandingNow } from '../src/production';
import { advance, buyEncounter, integrate, listen } from '../src/sim';
import { view } from '../src/view';
import { createStreams } from '../src/rng';
import { initialState, ownedCount, type GameState } from '../src/state';

/**
 * The time model and the Encounter actions (#27 AC1, AC4 to AC9).
 *
 * The course is declared here rather than imported, so it is checked against
 * the `Course` contract instead of sharing it.
 */

const DAY_MS = 24 * HOUR_MS;
const CAP_MS = DAY_MS;

const tea: Encounter = { id: 'tea', tags: ['food'], c0: 10, p0: 0.1 };
const market: Encounter = { id: 'market', tags: ['food'], c0: 100, p0: 1 };
/** An id that is also an `Object.prototype` member. */
const odd: Encounter = { id: 'toString', tags: ['food'], c0: 5, p0: 0.5 };

const course: Course = {
  id: 'test-course',
  tags: ['food'],
  regions: [
    {
      id: 'r0',
      destinations: [],
      encounters: [tea, market, odd],
      cardSets: [],
      cultureCards: [],
      grammarNodes: [],
    },
  ],
};

const START: WallMs = wallMs(Date.UTC(2027, 0, 4));

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function stateWith(
  owned: Record<string, number>,
  understanding: number,
  leadMs = 0,
): GameState {
  const base = initialState(START, 1);
  return deepFreeze({
    ...base,
    sim: simMs(leadMs),
    wall: wallMs(START + leadMs),
    anchor: {
      sim: simMs(0),
      understanding: Num.toTuple(Num.from(understanding)),
    },
    owned,
  });
}

function u(state: GameState): NumTuple {
  return Num.toTuple(understandingNow(course, state));
}

function units(state: GameState): number {
  return Object.values(state.owned).reduce((a, b) => a + b, 0);
}

function json(state: GameState): string {
  return JSON.stringify(state);
}

// The random-sequence property replays games through the real actions: 1.8 s
// alone, 9.8 s measured inside the full core suite on a loaded machine (#28);
// 1537 to 1721 ms alone and up to 13482 ms over ten loaded full-suite runs
// (#72). AC6 walks every hour bucket from the anchor (D-M1-2.3) over spans of
// up to 216 h: 1.3 s alone, over 5 s in the full suite (#28; 53 ms before
// buckets); 837 to 1371 ms alone and up to 6896 ms loaded (#72).
// Both properties are correctness, so a 5 s timeout would guard only the load.
const PROPERTY_TIMEOUT_MS = 60_000;
// AC6 with Pemandu buying replays every purchase three times over: 7.3 s
// beside one other file (#33), so 60 s would leave under 9x for load.
const PEMANDU_TIMEOUT_MS = 120_000;

function relativeError(got: Num, want: Num): number {
  return Math.abs(Num.toNumber(Num.div(Num.sub(got, want), want)));
}

describe('initialState', () => {
  it('starts with nothing at simulated time 0', () => {
    const s = initialState(START, 1);
    expect(s).toEqual({
      sim: 0,
      wall: START,
      anchor: { sim: 0, understanding: [0, 0] },
      owned: {},
      insight: [0, 0],
      words: {},
      memorySince: 0,
      stamps: 0,
      stampsEarned: 0,
      upgrades: {},
      rng: createStreams(1, ['cards']),
      journeys: [null, null, null],
      cards: [],
      tutorialJourneyUsed: false,
      destination: 0,
      reached: 0,
      finale: false,
      replays: {},
      runSpent: [0, 0],
      playableRegions: 3,
      grammar: [],
      automation: { enabled: false, intervalMs: 10_000 },
      seq: 0,
    });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('plays every region of v1 unless told otherwise', () => {
    expect(initialState(START, 1).playableRegions).toBe(3);
    expect(initialState(START, 1, 1).playableRegions).toBe(1);
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'refuses %s playable regions',
    (regions) => {
      expect(() => initialState(START, 1, regions)).toThrow(
        /playable regions must be a positive safe integer/,
      );
    },
  );

  it('seeds its card stream from the seed', () => {
    expect(initialState(START, 2).rng).toEqual(createStreams(2, ['cards']));
    expect(initialState(START, 2).rng).not.toEqual(initialState(START, 1).rng);
  });

  it.each([-1, 1.5, Number.NaN])('refuses the seed %s', (seed) => {
    expect(() => initialState(START, seed)).toThrow(
      /a seed must be a safe non-negative integer/,
    );
  });

  it('reads owned counts from own keys only', () => {
    const s = initialState(START, 1);
    expect(ownedCount(s, 'toString')).toBe(0);
    expect(ownedCount(s, 'constructor')).toBe(0);
    expect(ownedCount(stateWith({ tea: 3 }, 0), 'tea')).toBe(3);
  });
});

describe('listen (AC1)', () => {
  it('adds exactly 0.5 Understanding to a new game', () => {
    expect(u(listen(course, initialState(START, 1)))).toEqual([5, -1]);
  });

  it('adds exactly 0.5 to whatever is held, production included', () => {
    const s = stateWith({ tea: 10, market: 3 }, 123.456, 90_000);
    const before = understandingNow(course, s);
    const after = listen(course, s);
    expect(u(after)).toEqual(Num.toTuple(Num.add(before, Num.from(0.5))));
    expect(after.anchor.sim).toBe(s.sim);
  });

  it('1,000 taps on a new game hold exactly 500', () => {
    let s = initialState(START, 1);
    for (let i = 0; i < 1000; i++) s = listen(course, s);
    expect(u(s)).toEqual(Num.toTuple(Num.from(500)));
  });
});

describe('view (AC4)', () => {
  it('derives values at a later time without changing the state', () => {
    const s = stateWith({ tea: 12, market: 2 }, 50, 1_000);
    const before = json(s);
    const later = wallMs(s.wall + 30 * 60_000);
    const v = view(course, s, later);
    expect(json(s)).toBe(before);
    expect(Num.toTuple(v.understanding)).toEqual(
      u(advance(course, s, later).state),
    );
    expect(Num.toTuple(v.rate)).toEqual(Num.toTuple(encounterRate(course, s)));
  });

  it('at the state own wall time, shows the anchored value plus production since', () => {
    const s = stateWith({ tea: 5 }, 7, 60_000);
    const want = Num.add(
      Num.from(7),
      Num.div(
        Num.mul(encounterRate(course, s), Num.from(60_000)),
        Num.from(1000),
      ),
    );
    expect(Num.toTuple(view(course, s, s.wall).understanding)).toEqual(
      Num.toTuple(want),
    );
  });

  it('stores nothing but the anchor: integrate leaves the anchor alone', () => {
    const s = stateWith({ tea: 5 }, 7, 60_000);
    expect(integrate(course, s, 3 * HOUR_MS).anchor).toEqual(s.anchor);
  });
});

describe('encounterRate (AC3)', () => {
  it('sums the output of every owned Encounter in the course', () => {
    const s = stateWith({ tea: 37, market: 4, toString: 2 }, 0);
    const want = Num.add(
      Num.add(encounterOutput(tea, 37), encounterOutput(market, 4)),
      encounterOutput(odd, 2),
    );
    expect(relativeError(encounterRate(course, s), want)).toBeLessThan(1e-15);
  });

  it('is zero with nothing owned', () => {
    expect(encounterRate(course, stateWith({}, 0)).mantissa).toBe(0);
  });
});

describe('production inside an hour (AC5)', () => {
  it('is linear at the Encounter rate between any two times', () => {
    const s = stateWith({ tea: 37, market: 4, toString: 2 }, 0);
    const rate = encounterRate(course, s);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: HOUR_MS - 2 }),
        fc.integer({ min: 1, max: HOUR_MS - 1 }),
        (from, span) => {
          const to = Math.min(from + span, HOUR_MS - 1);
          fc.pre(to > from);
          const a = understandingNow(course, integrate(course, s, from));
          const b = understandingNow(course, integrate(course, s, to));
          const perSecond = Num.div(
            Num.mul(Num.sub(b, a), Num.from(1000)),
            Num.from(to - from),
          );
          expect(relativeError(perSecond, rate)).toBeLessThan(1e-9);
        },
      ),
    );
  });
});

const arbState = fc
  .record({
    tea: fc.integer({ min: 0, max: 300 }),
    market: fc.integer({ min: 0, max: 300 }),
    understanding: fc.double({ min: 0, max: 1e15, noNaN: true }),
    anchorSim: fc.integer({ min: 0, max: 1e12 }),
    lead: fc.integer({ min: 0, max: 72 * HOUR_MS }),
    wall: fc.integer({ min: 1.7e12, max: 1.9e12 }),
    stampsEarned: fc.integer({ min: 0, max: 20 }),
    phrasebook: fc.boolean(),
  })
  .map((r): GameState => ({
    sim: simMs(r.anchorSim + r.lead),
    wall: wallMs(r.wall),
    anchor: {
      sim: simMs(r.anchorSim),
      understanding: Num.toTuple(Num.from(r.understanding)),
    },
    owned: { tea: r.tea, market: r.market },
    insight: Num.toTuple(Num.from(0)),
    words: {},
    memorySince: simMs(r.anchorSim),
    stamps: 0,
    stampsEarned: r.stampsEarned,
    upgrades: r.phrasebook ? { 'phrasebook:food': 1 } : {},
    rng: createStreams(1, ['cards']),
    journeys: [null, null, null],
    cards: [],
    tutorialJourneyUsed: false,
    destination: 0,
    reached: 0,
    finale: false,
    replays: {},
    runSpent: Num.toTuple(Num.from(0)),
    playableRegions: 3,
    grammar: [],
    automation: { enabled: false, intervalMs: 10_000 },
    seq: 0,
  }));

describe('integrate (AC6)', () => {
  it(
    'integrate(integrate(s, a), b) deep-equals integrate(s, a + b), bit for bit',
    { timeout: PROPERTY_TIMEOUT_MS },
    () => {
      const gap = fc.integer({ min: 0, max: 72 * HOUR_MS });
      fc.assert(
        fc.property(arbState, gap, gap, (s, a, b) => {
          const split = integrate(course, integrate(course, s, a), b);
          const whole = integrate(course, s, a + b);
          expect(split).toEqual(whole);
          expect(u(split)).toEqual(u(whole));
        }),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'integrate(integrate(s, a), b) deep-equals integrate(s, a + b) with Pemandu buying (#33 AC4)',
    { timeout: PEMANDU_TIMEOUT_MS },
    () => {
      const gap = fc.integer({ min: 0, max: 72 * HOUR_MS });
      const pemandu = fc
        .tuple(arbState, fc.constantFrom(10_000, 5_000, 2_000, 1_000))
        .map(([s, intervalMs]): GameState => ({
          ...s,
          automation: { enabled: true, intervalMs },
        }));
      let bought = 0;
      fc.assert(
        fc.property(pemandu, gap, gap, (s, a, b) => {
          const split = integrate(course, integrate(course, s, a), b);
          const whole = integrate(course, s, a + b);
          expect(split).toEqual(whole);
          expect(u(split)).toEqual(u(whole));
          bought += units(whole) - units(s);
        }),
        { numRuns: 300, seed: 33 },
      );
      // Seeded: the 300 states bought 63,533 units (measured, #33), less one.
      expect(bought).toBeGreaterThan(63_532);
    },
  );

  it('moves both clocks by the same amount', () => {
    const s = stateWith({ tea: 1 }, 0, 500);
    const t = integrate(course, s, 1234);
    expect(t.sim - s.sim).toBe(1234);
    expect(t.wall - s.wall).toBe(1234);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses an elapsed time of %s',
    (elapsed) => {
      expect(() => integrate(course, stateWith({}, 0, 5_000), elapsed)).toThrow(
        /SimMs must be a safe non-negative integer/,
      );
    },
  );
});

describe('advance (AC7)', () => {
  let s: GameState;
  beforeEach(() => {
    s = stateWith({ tea: 25, market: 1 }, 1_000, 5_000);
  });

  it('credits 1 hour in full', () => {
    const { state, summary } = advance(course, s, wallMs(s.wall + HOUR_MS));
    expect(summary.creditedMs).toBe(HOUR_MS);
    expect(summary.clipped).toBe(false);
    expect(state.sim).toBe(s.sim + HOUR_MS);
    expect(state.wall).toBe(s.wall + HOUR_MS);
    expect(summary.understandingEarned).toEqual(
      Num.toTuple(
        Num.sub(understandingNow(course, state), understandingNow(course, s)),
      ),
    );
    const want = Num.mul(encounterRate(course, s), Num.from(3600));
    expect(
      relativeError(Num.fromTuple(summary.understandingEarned), want),
    ).toBeLessThan(1e-12);
  });

  it('credits 1 day, exactly the cap, without clipping', () => {
    const { state, summary } = advance(course, s, wallMs(s.wall + DAY_MS));
    expect(summary.creditedMs).toBe(CAP_MS);
    expect(summary.clipped).toBe(false);
    expect(state.sim).toBe(s.sim + DAY_MS);
    expect(state.anchor).toEqual(s.anchor);
  });

  it('clips 1 ms over the cap', () => {
    const { summary } = advance(course, s, wallMs(s.wall + CAP_MS + 1));
    expect(summary.creditedMs).toBe(CAP_MS);
    expect(summary.clipped).toBe(true);
  });

  it('caps 30 days at 24 hours, moves the wall clock all the way, and re-anchors', () => {
    const now = wallMs(s.wall + 30 * DAY_MS);
    const { state, summary } = advance(course, s, now);
    expect(summary.creditedMs).toBe(CAP_MS);
    expect(summary.clipped).toBe(true);
    expect(state.sim).toBe(s.sim + CAP_MS);
    expect(state.wall).toBe(now);
    expect(state.anchor.sim).toBe(state.sim);
    const oneDay = advance(course, s, wallMs(s.wall + DAY_MS));
    expect(summary.understandingEarned).toEqual(
      oneDay.summary.understandingEarned,
    );
    expect(u(state)).toEqual(u(oneDay.state));
  });

  it.each([
    ['an hour back', -HOUR_MS],
    ['the same instant', 0],
  ])('advances nothing for %s', (_label, delta) => {
    const { state, summary } = advance(course, s, wallMs(s.wall + delta));
    expect(state).toEqual(s);
    expect(summary).toEqual({
      creditedMs: 0,
      clipped: false,
      understandingEarned: [0, 0],
      journeysReturned: 0,
    });
  });

  it('leaves its input unchanged', () => {
    const before = json(s);
    advance(course, s, wallMs(s.wall + 30 * DAY_MS));
    expect(json(s)).toBe(before);
  });
});

function sane(state: GameState): void {
  for (const t of [state.sim, state.wall, state.anchor.sim]) {
    expect(Number.isSafeInteger(t) && t >= 0).toBe(true);
  }
  expect(state.anchor.sim).toBeLessThanOrEqual(state.sim);
  const held = Num.fromTuple(state.anchor.understanding);
  expect(Number.isFinite(held.mantissa) && held.mantissa >= 0).toBe(true);
  const now = understandingNow(course, state);
  expect(Number.isFinite(now.mantissa) && now.mantissa >= 0).toBe(true);
  for (const n of Object.values(state.owned)) {
    expect(Number.isSafeInteger(n) && n >= 0).toBe(true);
  }
}

describe('no reachable state holds NaN, a negative or an infinite value (AC8)', () => {
  type Step =
    | { readonly kind: 'listen' }
    | { readonly kind: 'buy'; readonly id: string; readonly count: number }
    | { readonly kind: 'advance'; readonly deltaMs: number };

  const step: fc.Arbitrary<Step> = fc.oneof(
    { arbitrary: fc.constant({ kind: 'listen' as const }), weight: 5 },
    {
      arbitrary: fc.record({
        kind: fc.constant('buy' as const),
        id: fc.constantFrom('tea', 'market', 'toString'),
        count: fc.integer({ min: 1, max: 20 }),
      }),
      weight: 3,
    },
    {
      arbitrary: fc.record({
        kind: fc.constant('advance' as const),
        deltaMs: fc.integer({ min: -DAY_MS, max: 40 * DAY_MS }),
      }),
      weight: 2,
    },
  );

  it(
    'over random sequences of listens, purchases and returns',
    { timeout: PROPERTY_TIMEOUT_MS },
    () => {
      let reached = 0;
      fc.assert(
        fc.property(
          fc.array(step, { minLength: 20, maxLength: 120, size: 'max' }),
          (steps) => {
            let s = initialState(START, 1);
            for (const e of steps) {
              if (e.kind === 'listen') s = listen(course, s);
              if (e.kind === 'buy') {
                const r = buyEncounter(course, s, e.id, e.count);
                if (r.ok) {
                  s = r.state;
                  reached++;
                }
              }
              if (e.kind === 'advance') {
                s = advance(course, s, wallMs(s.wall + e.deltaMs)).state;
              }
              sane(s);
            }
          },
        ),
        { numRuns: 500 },
      );
      expect(reached).toBeGreaterThan(100);
    },
  );
});

describe('buyEncounter (AC9)', () => {
  it('rejects an unaffordable purchase with a typed Rejection and leaves state alone', () => {
    const s = stateWith({}, 9.99);
    const before = json(s);
    const r = buyEncounter(course, s, 'tea', 1);
    expect(r).toEqual({
      ok: false,
      rejection: {
        kind: 'unaffordable',
        cost: Num.toTuple(purchaseCost(tea, 0, 1)),
        understanding: Num.toTuple(Num.from(9.99)),
      },
    });
    expect(json(s)).toBe(before);
  });

  it('buys when Understanding equals the cost exactly, leaving zero', () => {
    const cost = purchaseCost(market, 3, 2);
    const s = deepFreeze({
      ...stateWith({ market: 3 }, 0),
      anchor: { sim: simMs(0), understanding: Num.toTuple(cost) },
    });
    const r = buyEncounter(course, s, 'market', 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(u(r.state)).toEqual([0, 0]);
    expect(ownedCount(r.state, 'market')).toBe(5);
  });

  it('pays from Understanding produced since the anchor, and re-anchors', () => {
    const s = stateWith({ tea: 10 }, 0, 10 * 60_000);
    const held = understandingNow(course, s);
    const r = buyEncounter(course, s, 'tea', 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.anchor.sim).toBe(s.sim);
    expect(r.state.anchor.understanding).toEqual(
      Num.toTuple(Num.sub(held, purchaseCost(tea, 10, 1))),
    );
    expect(ownedCount(r.state, 'tea')).toBe(11);
  });

  it('buys an Encounter whose id is an Object.prototype member', () => {
    const r = buyEncounter(course, stateWith({}, 100), 'toString', 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ownedCount(r.state, 'toString')).toBe(3);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
  });

  it.each(['nope', 'constructor', '__proto__', ''])(
    'rejects the unknown Encounter %j',
    (id) => {
      const s = stateWith({}, 1e9);
      const before = json(s);
      expect(buyEncounter(course, s, id, 1)).toEqual({
        ok: false,
        rejection: { kind: 'unknownEncounter', id },
      });
      expect(json(s)).toBe(before);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a count of %s',
    (count) => {
      const s = stateWith({}, 1e9);
      const before = json(s);
      expect(buyEncounter(course, s, 'tea', count)).toEqual({
        ok: false,
        rejection: { kind: 'invalidCount', count },
      });
      expect(json(s)).toBe(before);
    },
  );
});
