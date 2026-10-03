import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { firstHolding, nextPurchaseTick } from '../src/automation';
import {
  DAY_MS,
  HOUR_MS,
  nextGridTick,
  simMs,
  wallMs,
  type SimMs,
  type WallMs,
} from '../src/clock';
import type { CourseData, CultureCard, Region } from '../src/course';
import { newWordMemory, review, type WordMemory } from '../src/memory';
import { Num } from '../src/num';
import {
  producedBetween,
  rateAt,
  segments,
  understandingNow,
} from '../src/production';
import { createStreams } from '../src/rng';
import type { GameState } from '../src/state';
import { encounterPrice } from '../src/upgrades';

/**
 * Pemandu's next purchase tick (#33 AC3): solved from the segment's linear
 * rate, then confirmed at that tick and the one before, so it equals a
 * tick-by-tick scan.
 *
 * The course is declared here, so it is checked against the `CourseData`
 * contract rather than sharing it. A held festival card cuts segments inside
 * an hour, so the solve meets both kinds of edge.
 */

const START: WallMs = wallMs(Date.UTC(2027, 0, 4));
const INTERVALS = [10_000, 5_000, 2_000, 1_000] as const;

// 10,000 states, each scanned tick by tick through `understandingNow`, and
// 10,000 grids: 3.3 s for the whole file alone (#33), so the timeout guards
// only a hang.
const PROPERTY_TIMEOUT_MS = 120_000;

function words(r: number): Region['destinations'][number]['lexicon'] {
  return [0, 1, 2].map((k) => ({
    id: `r${String(r)}-w${String(k)}`,
    tags: [k === 2 ? 'travel' : 'food'],
    cefr: 'A1' as const,
  }));
}

function lebaran(window: readonly [number, number]): CultureCard {
  return {
    id: 'lebaran',
    setId: 'feasts',
    tags: ['food'],
    bonus: 0.5,
    phrasePack: [],
    festival: { windows: [{ startWallMs: window[0], endWallMs: window[1] }] },
  };
}

function shopRegion(r: number, scale: number, card?: CultureCard): Region {
  return {
    id: `r${String(r)}`,
    destinations: [0, 1, 2, 3].map((d) => ({
      id: `r${String(r)}-d${String(d)}`,
      lexicon: d === 0 ? words(r) : [],
    })),
    encounters:
      r === 0
        ? [
            { id: 'tea', tags: ['food'], c0: 10 * scale, p0: 1 },
            { id: 'inn', tags: ['travel'], c0: 50 * scale, p0: 10 },
            { id: 'market', tags: ['food'], c0: 100 * scale, p0: 15 },
          ]
        : [
            {
              id: `ferry${String(r)}`,
              tags: ['travel'],
              c0: 10 * scale,
              p0: 100,
            },
          ],
    cardSets: card === undefined ? [] : [{ id: 'feasts', bonus: 0.25 }],
    cultureCards: card === undefined ? [] : [card],
    grammarNodes: [],
  };
}

/** Every price is `scale` times the listed one, so a purchase can be hours away. */
function shopWith(window: readonly [number, number], scale = 1): CourseData {
  return {
    id: 'pemandu-course',
    tags: ['food', 'travel'],
    regions: [
      shopRegion(0, scale, lebaran(window)),
      shopRegion(1, scale),
      shopRegion(2, scale),
    ],
  };
}

/** The state at simulated time `t`, the skew between the clocks kept. */
function positioned(state: GameState, t: SimMs): GameState {
  return { ...state, sim: t, wall: wallMs(state.wall + t - state.sim) };
}

/** The reference: every tick in (anchor, until], one at a time. */
function scan(
  course: CourseData,
  state: GameState,
  until: SimMs,
): SimMs | undefined {
  const reachable = course.regions
    .slice(0, state.reached >= 4 ? 2 : 1)
    .flatMap((r) => r.encounters);
  const cheapest = reachable
    .map((e) => encounterPrice(state, e, 1))
    .reduce((a, b) => (Num.cmp(a, b) <= 0 ? a : b));
  const { intervalMs } = state.automation;
  for (
    let t = nextGridTick(state.anchor.sim, intervalMs);
    t <= until;
    t = simMs(t + intervalMs)
  ) {
    const held = understandingNow(course, positioned(state, t));
    if (Num.cmp(cheapest, held) <= 0) return t;
  }
  return undefined;
}

interface Case {
  readonly course: CourseData;
  readonly state: GameState;
  readonly until: SimMs;
}

/**
 * A fraction in thousandths. `fc.double` leans hard on 0 and its bounds:
 * with it, 94% of the states bought at the first tick (measured, #33).
 */
function perMille(min: number, max: number): fc.Arbitrary<number> {
  return fc.integer({ min, max }).map((n) => n / 1000);
}

const arbCase: fc.Arbitrary<Case> = fc
  .record({
    interval: fc.constantFrom(...INTERVALS),
    scale: fc.constantFrom(1, 10, 100, 1_000, 10_000, 100_000, 1_000_000),
    tea: fc.integer({ min: 0, max: 30 }),
    inn: fc.integer({ min: 0, max: 20 }),
    market: fc.integer({ min: 0, max: 10 }),
    ferry: fc.integer({ min: 0, max: 3 }),
    region2: fc.boolean(),
    discount: fc.integer({ min: 0, max: 2 }),
    phrasebook: fc.boolean(),
    stampsEarned: fc.integer({ min: 0, max: 5 }),
    hour: fc.integer({ min: 0, max: 50 }),
    nearHourEnd: fc.boolean(),
    offset: perMille(0, 1000),
    skew: fc.integer({ min: 0, max: 5 * DAY_MS }),
    reviewed: fc.array(
      fc.record({
        k: fc.integer({ min: 0, max: 2 }),
        ageMs: fc.integer({ min: 0, max: 30 * DAY_MS }),
      }),
      { maxLength: 3 },
    ),
    ticks: fc.integer({ min: 0, max: 100 }),
    jitter: perMille(0, 999),
    lead: perMille(-250, 1300),
    festival: fc.boolean(),
    edgeA: perMille(0, 1000),
    edgeB: perMille(0, 1000),
  })
  .map((r): Case => {
    const horizon = r.ticks * r.interval + Math.floor(r.jitter * r.interval);
    const within = r.nearHourEnd
      ? HOUR_MS - Math.floor(r.offset * Math.min(horizon + 1, HOUR_MS))
      : Math.floor(r.offset * HOUR_MS);
    const anchor = simMs(r.hour * HOUR_MS + Math.min(within, HOUR_MS - 1));
    const wall = START + anchor + r.skew;
    const [a, b] = [r.edgeA, r.edgeB].map((x) =>
      Math.floor(wall + x * (horizon + 1)),
    ) as [number, number];
    const window: readonly [number, number] = r.festival
      ? [Math.min(a, b), Math.max(a, b) + 1]
      : [0, 1];
    const course = shopWith(window, r.scale);
    const held: Record<string, WordMemory> = {};
    for (const { k, ageMs } of r.reviewed) {
      const id = `r0-w${String(k)}`;
      held[id] = review(
        newWordMemory(wallMs(wall - ageMs - 1)),
        wallMs(wall - ageMs),
        true,
      );
    }
    const base: GameState = {
      sim: anchor,
      wall: wallMs(wall),
      anchor: { sim: anchor, understanding: Num.toTuple(Num.from(0)) },
      owned: {
        tea: r.tea,
        inn: r.inn,
        market: r.market,
        ...(r.region2 ? { ferry1: r.ferry } : {}),
      },
      insight: Num.toTuple(Num.from(0)),
      words: held,
      memorySince: anchor,
      stamps: 0,
      stampsEarned: r.stampsEarned,
      upgrades: {
        ...(r.discount > 0 ? { encounterDiscount: r.discount } : {}),
        ...(r.phrasebook ? { 'phrasebook:food': 1 } : {}),
      },
      rng: createStreams(1, ['cards']),
      journeys: [null, null, null],
      cards: r.festival ? ['lebaran'] : [],
      tutorialJourneyUsed: false,
      destination: r.region2 ? 4 : 0,
      reached: r.region2 ? 4 : 0,
      finale: false,
      replays: {},
      runSpent: Num.toTuple(Num.from(0)),
      playableRegions: 3,
      grammar: [],
      automation: { enabled: true, intervalMs: r.interval },
      seq: 0,
    };
    // Hold the cheapest price less what `lead` of the horizon earns at the
    // anchor's rate, so most purchases land inside the horizon, some at its
    // first tick and some beyond it.
    const cheapest = course.regions
      .slice(0, r.region2 ? 2 : 1)
      .flatMap((g) => g.encounters)
      .map((e) => Num.toNumber(encounterPrice(base, e, 1)))
      .reduce((x, y) => Math.min(x, y));
    const rate = Num.toNumber(rateAt(course, base, anchor));
    const understanding = Math.max(
      0,
      cheapest - (rate * r.lead * horizon) / 1000,
    );
    return {
      course,
      state: {
        ...base,
        anchor: {
          sim: anchor,
          understanding: Num.toTuple(Num.from(understanding)),
        },
      },
      until: simMs(anchor + horizon),
    };
  });

describe('firstHolding: the first tick of a grid where a monotone test holds', () => {
  const grid = { first: 10_000, last: 100_000, every: 10_000 };
  const from = (threshold: number) => (t: number) => t >= threshold;

  it.each([
    ['guessed exactly, inside the grid', 50_000, 50_000, 50_000, 2],
    ['guessed exactly, at the first tick', 10_000, 10_000, 10_000, 1],
    ['guessed between ticks: the tick after', 50_000, 41_234, 50_000, 2],
    [
      'guessed one tick late: back one, already known to hold',
      50_000,
      60_000,
      50_000,
      2,
    ],
    ['guessed one tick early', 50_000, 40_000, 50_000, 3],
    [
      'guessed past the grid, holding at its last tick',
      100_000,
      Infinity,
      100_000,
      2,
    ],
    ['guessed two ticks late', 50_000, 70_000, 50_000, 3],
    ['guessed past the grid, never holding', 200_000, Infinity, undefined, 1],
    ['guessed before the grid, holding at once', 0, -Infinity, 10_000, 1],
  ] as const)('%s', (_label, threshold, guess, tick, checks) => {
    expect(firstHolding(grid, guess, from(threshold))).toStrictEqual({
      tick,
      checks,
    });
  });

  it.each([
    ['one tick past its last', 20_000],
    ['far past its last', 50_000],
  ] as const)(
    'checks nothing on an empty grid, its first %s',
    (_label, first) => {
      const empty = { first, last: 10_000, every: 10_000 };
      expect(firstHolding(empty, 0, () => true)).toStrictEqual({
        tick: undefined,
        checks: 0,
      });
    },
  );

  it.each([
    ['holding from it: that tick', 100_000, 100_000, 2],
    ['holding only past it: none', 105_000, undefined, 1],
  ] as const)(
    'takes the last tick on the grid when `last` falls between ticks, %s',
    (_label, threshold, tick, checks) => {
      const ragged = { first: 10_000, last: 105_000, every: 10_000 };
      expect(firstHolding(ragged, Infinity, from(threshold))).toStrictEqual({
        tick,
        checks,
      });
    },
  );

  it('refuses a guess that is NaN, since no tick can be snapped to it', () => {
    expect(() => firstHolding(grid, Number.NaN, () => true)).toThrow(
      /guess must not be NaN/,
    );
  });

  it(
    'equals a scan of the grid for any threshold and guess',
    { timeout: PROPERTY_TIMEOUT_MS },
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 0, max: 60 }),
          fc.integer({ min: 0, max: 60 }),
          fc.oneof(
            fc.double({ min: -1e6, max: 1e6, noNaN: true }),
            fc.constantFrom(Infinity, -Infinity),
          ),
          fc.integer({ min: 0, max: 70 }),
          (every, a, b, guess, threshold) => {
            const g = {
              first: Math.min(a, b) * every,
              last: Math.max(a, b) * every,
              every,
            };
            const holds = from(threshold * every);
            let want: number | undefined;
            for (let t = g.first; t <= g.last; t += every) {
              if (holds(t)) {
                want = t;
                break;
              }
            }
            expect(firstHolding(g, guess * every, holds).tick).toBe(want);
          },
        ),
        { numRuns: 10_000 },
      );
    },
  );
});

describe('nextPurchaseTick (AC3)', () => {
  const course = shopWith([0, 1]);

  function state(understanding: number, intervalMs = 10_000): GameState {
    const anchor = simMs(3 * HOUR_MS);
    return {
      sim: anchor,
      wall: wallMs(START + anchor),
      anchor: {
        sim: anchor,
        understanding: Num.toTuple(Num.from(understanding)),
      },
      owned: { tea: 1 },
      insight: Num.toTuple(Num.from(0)),
      words: {},
      memorySince: simMs(0),
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
      runSpent: Num.toTuple(Num.from(0)),
      playableRegions: 3,
      grammar: [],
      automation: { enabled: true, intervalMs },
      seq: 0,
    };
  }

  // One tea earns 1 per second, and the next tea costs 10 x 1.15 = 11.5.
  const at = (s: number) => simMs(3 * HOUR_MS + s * 1000);

  it.each([
    [
      'at the first tick after the anchor, when already affordable',
      50,
      10_000,
      at(10),
    ],
    ['never at the anchor itself, even on the grid', 11.5, 10_000, at(10)],
    ['at the first tick, which pays 11.6 from 1.6 held', 1.6, 10_000, at(10)],
    ['one tick on when 0.6 short at the first', 0.9, 10_000, at(20)],
    ['on the 5 s grid, at 15 s', 0, 5_000, at(15)],
    ['on the 1 s grid, at the first whole second past 11.5', 0, 1_000, at(12)],
  ] as const)('buys %s', (_label, held, intervalMs, want) => {
    expect(
      nextPurchaseTick(course, state(held, intervalMs), at(60)).next?.tick,
    ).toBe(want);
  });

  it('includes the tick at `until` and nothing past it', () => {
    expect(nextPurchaseTick(course, state(0), at(20)).next?.tick).toBe(at(20));
    expect(nextPurchaseTick(course, state(0), at(19)).next).toBeUndefined();
  });

  it('finds nothing when nothing is owned and nothing affordable, testing one tick per hour', () => {
    // Nothing is produced, so no tick can be solved for: each of the six
    // segments, 3 h to 8 h and the instant at 8 h, tests only its last tick.
    const idle = { ...state(5), owned: {} };
    expect(nextPurchaseTick(course, idle, at(3600 * 5))).toStrictEqual({
      next: undefined,
      checks: 6,
    });
  });

  it('buys at the first tick when exactly the price is held and nothing is produced, testing that tick alone', () => {
    const idle = { ...state(0), owned: {} };
    const tea = course.regions[0]?.encounters.find((e) => e.id === 'tea');
    if (tea === undefined) throw new Error('the course sells no tea');
    const price = encounterPrice(idle, tea, 1);
    const exact = {
      ...idle,
      anchor: { sim: idle.anchor.sim, understanding: Num.toTuple(price) },
    };
    expect(nextPurchaseTick(course, exact, at(60))).toStrictEqual({
      next: { tick: at(10), understanding: price },
      checks: 1,
    });
  });

  it('walks no span that ends before it starts: producedBetween refuses one', () => {
    const s = state(0);
    expect(() =>
      producedBetween(course, s, simMs(s.sim + 10), simMs(s.sim + 5)),
    ).toThrow(/producedBetween: \d+ is before \d+/);
  });

  it('finds nothing, testing no tick, when the regions reached sell nothing', () => {
    const bare: CourseData = {
      ...course,
      regions: course.regions.map((r) => ({ ...r, encounters: [] })),
    };
    expect(nextPurchaseTick(bare, state(1e9), at(60))).toStrictEqual({
      next: undefined,
      checks: 0,
    });
  });

  it(
    'equals a tick-by-tick scan over 10,000 generated states, checking at most one more tick than it walks segments',
    { timeout: PROPERTY_TIMEOUT_MS },
    () => {
      const seen = {
        none: 0,
        firstTick: 0,
        midSegment: 0,
        laterSegment: 0,
      };
      fc.assert(
        fc.property(arbCase, ({ course: c, state: s, until }) => {
          const got = nextPurchaseTick(c, s, until);
          const tick = got.next?.tick;
          expect(tick).toBe(scan(c, s, until));
          const anchor = s.anchor.sim;
          const every = s.automation.intervalMs;
          const walked = [...segments(c, s, anchor, simMs(until + 1))];
          // One test per segment that holds no purchase, and two, that tick
          // and the one before, in the segment that does (AC3).
          expect(got.checks).toBeLessThanOrEqual(walked.length + 1);
          if (tick === undefined) {
            seen.none += 1;
            return;
          }
          // The Understanding returned is the bits `understandingNow` gives
          // at the tick, which a purchase there anchors with.
          expect(got.next?.understanding).toEqual(
            understandingNow(c, positioned(s, tick)),
          );
          const k = walked.findIndex((g) => g.start <= tick && tick < g.end);
          const segment = walked[k];
          if (segment === undefined)
            throw new Error(`no segment holds ${String(tick)}`);
          const start =
            segment.start === anchor ? anchor : simMs(segment.start - 1);
          if (tick === nextGridTick(anchor, every)) seen.firstTick += 1;
          else if (tick > nextGridTick(start, every)) seen.midSegment += 1;
          if (k > 0) seen.laterSegment += 1;
        }),
        { numRuns: 10_000, seed: 33 },
      );
      // Seeded, so these are exact; measured 2026-10-03 (#33) at 993 with no
      // purchase in the horizon, 4,886 at the first tick, 3,821 solved past
      // a segment's first tick and 3,070 past the first segment. Each floor
      // is that figure less one: a generator that stops reaching a case
      // fails here rather than passing on fewer.
      expect(seen.none).toBeGreaterThan(992);
      expect(seen.firstTick).toBeGreaterThan(4885);
      expect(seen.midSegment).toBeGreaterThan(3820);
      expect(seen.laterSegment).toBeGreaterThan(3069);
    },
  );
});
