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
import { floorBreach } from '../../../tests/floors';

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
  it('adds exactly 0.25 Understanding to a new game', () => {
    expect(u(listen(course, initialState(START, 1)))).toEqual([2.5, -1]);
  });

  it('adds exactly 0.25 to whatever is held, production included', () => {
    const s = stateWith({ tea: 10, market: 3 }, 123.456, 90_000);
    const before = understandingNow(course, s);
    const after = listen(course, s);
    expect(u(after)).toEqual(Num.toTuple(Num.add(before, Num.from(0.25))));
    expect(after.anchor.sim).toBe(s.sim);
  });

  it('1,000 taps on a new game hold exactly 250', () => {
    let s = initialState(START, 1);
    for (let i = 0; i < 1000; i++) s = listen(course, s);
    expect(u(s)).toEqual(Num.toTuple(Num.from(250)));
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

/**
 * A gap of simulated time: none, any length up to `maxHours`, or one that ends on
 * an hour edge or a millisecond either side of it, `hours` edges further on.
 * Uniform lengths almost never end on an edge, and an edge is where a split
 * can go wrong: it is where a production bucket and every Pemandu grid
 * (10 s, 5 s, 2 s and 1 s all divide an hour) change (#474).
 */
type Gap =
  | { readonly ms: number }
  | { readonly hours: number; readonly nudge: -1 | 0 | 1 };

function arbGap(maxHours: number): fc.Arbitrary<Gap> {
  return fc.oneof(
    { arbitrary: fc.constant({ ms: 0 }), weight: 1 },
    {
      arbitrary: fc.record({
        ms: fc.integer({ min: 0, max: maxHours * HOUR_MS }),
      }),
      weight: 4,
    },
    {
      arbitrary: fc.record({
        hours: fc.integer({ min: 0, max: maxHours - 1 }),
        nudge: fc.constantFrom(-1 as const, 0 as const, 1 as const),
      }),
      weight: 3,
    },
  );
}

/** The gap's length in ms when it starts at `from`. */
function gapFrom(from: number, gap: Gap): number {
  if ('ms' in gap) return gap.ms;
  const edge = from - (from % HOUR_MS) + (gap.hours + 1) * HOUR_MS;
  return edge + gap.nudge - from;
}

/** What a split reached: a zero part, and where the split fell against an hour edge. */
const SPLITS = ['zero-part', 'on-edge', 'beside-edge'] as const;
type Split = Record<(typeof SPLITS)[number], number>;

function countSplit(seen: Split, s: GameState, a: number, b: number): void {
  if (a === 0 || b === 0) seen['zero-part']++;
  const at = (s.sim + a) % HOUR_MS;
  if (at === 0) seen['on-edge']++;
  if (at === 1 || at === HOUR_MS - 1) seen['beside-edge']++;
}

/**
 * Splits `s`'s next `a + b` ms at `a` and checks the two halves land where
 * the whole does: the state deep-equal, and Understanding read back equal,
 * since a memo keyed wrongly could answer two equal states differently.
 */
function checkSplit(s: GameState, a: number, b: number): GameState {
  const split = integrate(course, integrate(course, s, a), b);
  const whole = integrate(course, s, a + b);
  expect(split).toEqual(whole);
  expect(u(split)).toEqual(u(whole));
  return whole;
}

describe('integrate (AC6)', () => {
  let plain: Split | undefined;

  /**
   * 90 seeded splits over spans of up to 144 h, 37 of them on or beside an
   * hour edge (#474). 1,000 uniform splits took 1.5 s of CPU, and a uniform
   * split ends on an edge about once in 3.6 million.
   */
  function playPlain(): Split {
    if (plain !== undefined) return plain;
    const seen: Split = { 'zero-part': 0, 'on-edge': 0, 'beside-edge': 0 };
    const gap = arbGap(72);
    fc.assert(
      fc.property(arbState, gap, gap, (s, ga, gb) => {
        const a = gapFrom(s.sim, ga);
        const b = gapFrom(s.sim + a, gb);
        countSplit(seen, s, a, b);
        checkSplit(s, a, b);
      }),
      { seed: 474, numRuns: 90 },
    );
    plain = seen;
    return seen;
  }

  it('integrate(integrate(s, a), b) deep-equals integrate(s, a + b), bit for bit', () => {
    expect(Object.keys(playPlain())).toEqual([...SPLITS]);
  });

  it.each(SPLITS)('the splits reach %s as often as recorded', (name) => {
    expect(
      floorBreach(`core-sim/split-${name}`, playPlain()[name]),
    ).toBeUndefined();
  });

  const PEMANDU = [...SPLITS, 'bought'] as const;
  type PemanduSplit = Record<(typeof PEMANDU)[number], number>;
  let pemandu: PemanduSplit | undefined;

  /**
   * With Pemandu buying, every purchase is replayed three times over, so
   * this plays 15 shorter splits, up to 12 h a side, in which Pemandu buys
   * 3,544 units (#474; 300 splits of up to 144 h took 2.3 s of CPU).
   */
  function playPemandu(): PemanduSplit {
    if (pemandu !== undefined) return pemandu;
    const seen: PemanduSplit = {
      'zero-part': 0,
      'on-edge': 0,
      'beside-edge': 0,
      bought: 0,
    };
    const gap = arbGap(12);
    const buying = fc
      .tuple(arbState, fc.constantFrom(10_000, 5_000, 2_000, 1_000))
      .map(([s, intervalMs]): GameState => ({
        ...s,
        automation: { enabled: true, intervalMs },
      }));
    fc.assert(
      fc.property(buying, gap, gap, (s, ga, gb) => {
        const a = gapFrom(s.sim, ga);
        const b = gapFrom(s.sim + a, gb);
        countSplit(seen, s, a, b);
        seen.bought += units(checkSplit(s, a, b)) - units(s);
      }),
      { seed: 474, numRuns: 15 },
    );
    pemandu = seen;
    return seen;
  }

  it('integrate(integrate(s, a), b) deep-equals integrate(s, a + b) with Pemandu buying (#33 AC4)', () => {
    expect(Object.keys(playPemandu())).toEqual([...PEMANDU]);
  });

  it.each(PEMANDU)(
    'the splits with Pemandu buying reach %s as often as recorded',
    (name) => {
      expect(
        floorBreach(`core-sim/pemandu-${name}`, playPemandu()[name]),
      ).toBeUndefined();
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

/**
 * Every way `state` breaks AC8, and how many values were checked: thrown as
 * one error rather than an `expect` a field (#474). The count is a recorded
 * floor, so a check that stops reading the state fails.
 */
function faults(state: GameState): { checked: number; found: string[] } {
  const found: string[] = [];
  let checked = 0;
  const times = { sim: state.sim, wall: state.wall, anchor: state.anchor.sim };
  for (const [name, t] of Object.entries(times)) {
    checked++;
    if (!Number.isSafeInteger(t) || t < 0)
      found.push(`${name} time ${String(t)}`);
  }
  checked++;
  if (state.anchor.sim > state.sim) found.push('anchor after sim');
  const values = {
    held: Num.fromTuple(state.anchor.understanding),
    now: understandingNow(course, state),
  };
  for (const [name, n] of Object.entries(values)) {
    checked++;
    if (!Number.isFinite(n.mantissa) || n.mantissa < 0)
      found.push(`${name} ${String(n.mantissa)}`);
  }
  for (const [id, n] of Object.entries(state.owned)) {
    checked++;
    if (!Number.isSafeInteger(n) || n < 0)
      found.push(`owns ${String(n)} ${id}`);
  }
  return { checked, found };
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

  // What the sequences reached (#474), each a recorded floor: purchases
  // made and refused, a clock stepped back, an absence the cap clipped, and
  // the values checked.
  const REACHED = [
    'bought',
    'buy-refused',
    'clock-back',
    'clipped',
    'checked',
  ] as const;
  type Reached = Record<(typeof REACHED)[number], number>;
  let played: Reached | undefined;

  /** 100 seeded games of 20 to 120 steps (#474): 500 unseeded took 1.4 s of CPU. */
  function play(): Reached {
    if (played !== undefined) return played;
    const reached: Reached = {
      bought: 0,
      'buy-refused': 0,
      'clock-back': 0,
      clipped: 0,
      checked: 0,
    };
    fc.assert(
      fc.property(
        fc.array(step, { minLength: 20, maxLength: 120, size: 'max' }),
        (steps) => {
          let s = initialState(START, 1);
          // one scenario: each step plays on from the state the last one left
          for (const e of steps) {
            if (e.kind === 'listen') s = listen(course, s);
            if (e.kind === 'buy') {
              const r = buyEncounter(course, s, e.id, e.count);
              reached[r.ok ? 'bought' : 'buy-refused']++;
              if (r.ok) s = r.state;
            }
            if (e.kind === 'advance') {
              const moved = advance(course, s, wallMs(s.wall + e.deltaMs));
              if (e.deltaMs < 0) reached['clock-back']++;
              if (moved.summary.clipped) reached.clipped++;
              s = moved.state;
            }
            const { checked, found } = faults(s);
            reached.checked += checked;
            if (found.length > 0) throw new Error(found.join('; '));
          }
        },
      ),
      { seed: 474, numRuns: 100 },
    );
    played = reached;
    return reached;
  }

  it('over random sequences of listens, purchases and returns', () => {
    expect(Object.keys(play())).toEqual([...REACHED]);
  });

  it.each(REACHED)(
    'the random sequences reach %s as often as recorded',
    (name) => {
      expect(
        floorBreach(`core-sim/sequence-${name}`, play()[name]),
      ).toBeUndefined();
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
