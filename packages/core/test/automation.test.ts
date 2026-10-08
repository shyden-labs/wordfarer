import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nextGridTick, simMs, wallMs, type WallMs } from '../src/clock';
import type { Course, Destination, Encounter, Region } from '../src/course';
import {
  automationOpensAt,
  automationUnlocked,
  bestPayback,
} from '../src/automation';
import { newWordMemory, review, type WordMemory } from '../src/memory';
import { Num, type NumTuple } from '../src/num';
import { rateBreakdown, rateGain, understandingNow } from '../src/production';
import { setSail } from '../src/sail';
import {
  advance,
  buyEncounter,
  integrate,
  setAutomation,
  type Rejection,
  type Result,
} from '../src/sim';
import { initialState, type GameState } from '../src/state';
import { encounterPrice } from '../src/upgrades';
import { floorBreach } from '../../../tests/floors';

/**
 * Pemandu automation (#33): the unlock and the setting (AC1), the choice
 * and the purchases `integrate` makes (AC2).
 *
 * The course is declared here, so it is checked against the `Course`
 * contract rather than sharing it. Its route numbers destinations 0 to 3 in
 * region 1, 4 to 7 in region 2 and 8 to 11 in region 3, so Pemandu opens at
 * destination 4, or 3 with the stamp upgrade. The opening region and the
 * intervals are written out as literals, so a change to `BALANCE.automation`
 * fails here as well as in its own pin.
 */

const START: WallMs = wallMs(Date.UTC(2027, 0, 4));

function destination(r: number, d: number): Destination {
  const id = `r${String(r)}-d${String(d)}`;
  return {
    id,
    lexicon: Array.from({ length: 20 }, (_, k) => ({
      id: `${id}-w${String(k)}`,
      tags: ['food'],
      cefr: 'A1' as const,
    })),
  };
}

function region(r: number): Region {
  return {
    id: `r${String(r)}`,
    destinations: [0, 1, 2, 3].map((d) => destination(r, d)),
    encounters: [
      { id: `tea${String(r)}`, tags: ['food'], c0: 10, p0: 1 },
      { id: `market${String(r)}`, tags: ['food'], c0: 100, p0: 8 },
    ],
    cardSets: [],
    cultureCards: [],
    grammarNodes: [],
  };
}

const course: Course = {
  id: 'automation-course',
  tags: ['food'],
  regions: [region(0), region(1), region(2)],
};

/** Region 1 only: Pemandu never opens on it. */
const oneRegion: Course = { ...course, regions: [region(0)] };

/** Region 2 has no destinations, so the first one past region 1 is region 3's. */
const hollow: Course = {
  ...course,
  regions: [region(0), { ...region(1), destinations: [] }, region(2)],
};

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function tuple(x: number): NumTuple {
  return Num.toTuple(Num.from(x));
}

interface At {
  readonly upgrades?: Readonly<Record<string, number>>;
  readonly owned?: Readonly<Record<string, number>>;
  readonly held?: number;
  readonly simMs?: number;
  readonly words?: Readonly<Record<string, WordMemory>>;
}

/** A game that has reached destination `reached` and stands there. */
function at(reached: number, opts: At = {}): GameState {
  const base = initialState(START, 1);
  const sim = simMs(opts.simMs ?? 0);
  return deepFreeze({
    ...base,
    sim,
    wall: wallMs(START + sim),
    anchor: { sim: simMs(0), understanding: tuple(opts.held ?? 0) },
    owned: opts.owned ?? {},
    upgrades: opts.upgrades ?? {},
    words: opts.words ?? {},
    destination: reached,
    reached,
  });
}

function ok(result: Result): GameState {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
  return result.state;
}

function refused(result: Result): Rejection {
  if (result.ok) throw new Error('expected a rejection');
  return result.rejection;
}

const EARLY = { pemanduEarly: 1 };
const ALL_TIERS = { pemanduFaster1: 1, pemanduFaster2: 1, pemanduFaster3: 1 };

describe('the automation setting in state (AC1)', () => {
  it('a new game has Pemandu off at the starting 10 s interval', () => {
    expect(initialState(START, 1).automation).toEqual({
      enabled: false,
      intervalMs: 10_000,
    });
  });

  it('a sail keeps the setting', () => {
    // Destination 4's goal: 4.81e17 Understanding (#35's table) and 8 + 2 x 4 words.
    const words = Object.fromEntries(
      Array.from({ length: 16 }, (_, k) => [
        `r1-d0-w${String(k)}`,
        newWordMemory(START),
      ]),
    );
    const on = ok(
      setAutomation(course, at(4, { held: 4.81e17, words }), true, 10_000),
    );
    const sailed = ok(setSail(course, on));
    expect(sailed.destination).toBe(5);
    expect(sailed.automation).toEqual({ enabled: true, intervalMs: 10_000 });
  });
});

describe('where Pemandu opens (AC1)', () => {
  it.each([
    ['region 2, without the stamp upgrade', course, {}, 4],
    ['one destination earlier, with it', course, EARLY, 3],
    ['region 3 when region 2 has no destinations', hollow, {}, 4],
    ['never on a course with one region', oneRegion, {}, undefined],
    [
      'never on a course with one region, even early',
      oneRegion,
      EARLY,
      undefined,
    ],
  ] as const)('%s', (_label, c, upgrades, want) => {
    expect(automationOpensAt(c, at(0, { upgrades }))).toBe(want);
  });

  it.each([
    ['locked at destination 3', 3, {}, false],
    ['open at destination 4, region 2', 4, {}, true],
    ['open at destination 11, region 3', 11, {}, true],
    ['open at destination 3 with the stamp upgrade', 3, EARLY, true],
    ['locked at destination 2 even with it', 2, EARLY, false],
  ] as const)('%s', (_label, reached, upgrades, want) => {
    expect(automationUnlocked(course, at(reached, { upgrades }))).toBe(want);
  });

  it('stays open after a replay of an earlier destination', () => {
    const replaying = { ...at(6), destination: 1 };
    expect(automationUnlocked(course, replaying)).toBe(true);
  });

  it.each([
    ['without the stamp upgrade', {}],
    ['with it', EARLY],
  ] as const)(
    'is locked on a course with one region, %s',
    (_label, upgrades) => {
      expect(automationUnlocked(oneRegion, at(3, { upgrades }))).toBe(false);
    },
  );
});

describe('setAutomation (AC1)', () => {
  it.each([
    ['turning it on', true],
    ['turning it off', false],
  ] as const)('refuses %s before Pemandu opens', (_label, enabled) => {
    expect(refused(setAutomation(course, at(3), enabled, 10_000))).toEqual({
      kind: 'automationLocked',
      reached: 3,
    });
  });

  it('refuses a locked Pemandu before judging the interval', () => {
    expect(refused(setAutomation(course, at(3), true, 3_000)).kind).toBe(
      'automationLocked',
    );
  });

  it('turns Pemandu on at the starting interval once open', () => {
    const s = ok(setAutomation(course, at(4), true, 10_000));
    expect(s.automation).toEqual({ enabled: true, intervalMs: 10_000 });
  });

  it('opens one destination early with the stamp upgrade', () => {
    const s = ok(
      setAutomation(course, at(3, { upgrades: EARLY }), true, 10_000),
    );
    expect(s.automation.enabled).toBe(true);
  });

  it('turns Pemandu off and keeps the interval chosen', () => {
    const on = ok(
      setAutomation(course, at(4, { upgrades: ALL_TIERS }), true, 2_000),
    );
    expect(ok(setAutomation(course, on, false, 2_000)).automation).toEqual({
      enabled: false,
      intervalMs: 2_000,
    });
  });

  it.each([
    ['5 s with its tier', { pemanduFaster1: 1 }, 5_000],
    ['2 s with its tier', { pemanduFaster1: 1, pemanduFaster2: 1 }, 2_000],
    ['1 s with every tier', ALL_TIERS, 1_000],
    ['10 s with every tier', ALL_TIERS, 10_000],
  ] as const)('accepts %s', (_label, upgrades, intervalMs) => {
    const s = ok(setAutomation(course, at(4, { upgrades }), true, intervalMs));
    expect(s.automation.intervalMs).toBe(intervalMs);
  });

  it.each([
    ['5 s without its tier', {}, 5_000, [10_000]],
    [
      '1 s with only the first tier',
      { pemanduFaster1: 1 },
      1_000,
      [10_000, 5_000],
    ],
    [
      '3 s, which no tier gives',
      ALL_TIERS,
      3_000,
      [10_000, 5_000, 2_000, 1_000],
    ],
    ['0 ms', ALL_TIERS, 0, [10_000, 5_000, 2_000, 1_000]],
    ['-10 s', ALL_TIERS, -10_000, [10_000, 5_000, 2_000, 1_000]],
    ['NaN', ALL_TIERS, Number.NaN, [10_000, 5_000, 2_000, 1_000]],
  ] as const)('refuses %s', (_label, upgrades, intervalMs, owned) => {
    expect(
      refused(setAutomation(course, at(4, { upgrades }), true, intervalMs)),
    ).toEqual({ kind: 'intervalNotOwned', intervalMs, owned });
  });

  it('refuses an interval not owned when turning Pemandu off too', () => {
    expect(refused(setAutomation(course, at(4), false, 5_000)).kind).toBe(
      'intervalNotOwned',
    );
  });

  it('banks production first, so ticks start after the setting', () => {
    const s = at(4, { owned: { tea0: 3 }, held: 7, simMs: 90_000 });
    const before = understandingNow(course, s);
    const on = ok(setAutomation(course, s, true, 10_000));
    expect(on.anchor.sim).toBe(90_000);
    expect(on.anchor.understanding).toEqual(Num.toTuple(before));
    expect(Num.toNumber(before)).toBe(7 + 3 * 90);
  });

  it('changes nothing else', () => {
    const s = at(4, { owned: { tea0: 3 }, held: 7, simMs: 90_000 });
    const on = ok(setAutomation(course, s, true, 10_000));
    expect({ ...on, anchor: s.anchor, automation: s.automation }).toEqual(s);
  });
});

/**
 * The choice (AC2): with nothing owned, no words and no stamps, an
 * Encounter's first unit adds exactly its p0, so cost / Δrate is c0 / p0:
 * tea 10, inn 5, market 6.67, palace 50, and region 2's ferry 0.1.
 */
const TEA: Encounter = { id: 'tea', tags: ['food'], c0: 10, p0: 1 };

function shopRegion(r: number): Region {
  const encounters =
    r === 0
      ? [
          TEA,
          { id: 'inn', tags: ['travel'], c0: 50, p0: 10 },
          { id: 'market', tags: ['food'], c0: 100, p0: 15 },
          { id: 'palace', tags: ['travel'], c0: 10_000, p0: 200 },
        ]
      : [{ id: `ferry${String(r)}`, tags: ['travel'], c0: 10, p0: 100 }];
  return { ...region(r), encounters };
}

const shop: Course = {
  id: 'shop-course',
  tags: ['food', 'travel'],
  regions: [shopRegion(0), shopRegion(1), shopRegion(2)],
};

/** Two Encounters alike in all but id: 'Zed' sorts before 'apple' by code unit. */
const twins: Course = {
  ...shop,
  regions: [
    {
      ...region(0),
      encounters: [
        { id: 'apple', tags: ['food'], c0: 10, p0: 1 },
        { id: 'Zed', tags: ['food'], c0: 10, p0: 1 },
      ],
    },
  ],
};

describe('rateGain (AC2)', () => {
  /**
   * Words reviewed two days before the game, so each word's bonus depends on
   * the hour bucket the gain is taken in. Built per test, so a throwing setup
   * fails each test by name, never the file (#97).
   */
  function gainState(): GameState {
    const reviewedAt = wallMs(START - 2 * 86_400_000);
    return at(4, {
      owned: { tea: 9, inn: 3, ferry1: 1 },
      upgrades: { 'phrasebook:food': 1 },
      words: Object.fromEntries(
        ['r0-d0-w0', 'r0-d0-w1'].map((id) => [
          id,
          review(newWordMemory(reviewedAt), reviewedAt, true),
        ]),
      ),
      simMs: 5 * 3_600_000 + 17,
    });
  }
  const reachable = shop.regions.flatMap((r) => r.encounters);

  it.each(reachable.map((e) => [e.id, e] as const))(
    '%s: its rate with one more, less its rate now, bit for bit',
    (_id, encounter) => {
      const s = gainState();
      const gain = rateGain(shop, s, s.sim)(encounter);
      const plus = {
        ...s,
        owned: { ...s.owned, [encounter.id]: (s.owned[encounter.id] ?? 0) + 1 },
      };
      const rateOf = (state: GameState) =>
        rateBreakdown(shop, state, s.sim).find((e) => e.id === encounter.id)
          ?.rate ?? Num.from(0);
      expect(gain).toEqual(Num.sub(rateOf(plus), rateOf(s)));
    },
  );

  it('the 10th tea doubles every tea, so it gains 11 of them', () => {
    const plain = at(0, { owned: { tea: 9 } });
    expect(rateGain(shop, plain, simMs(0))(TEA)).toEqual(Num.from(11));
  });
});

describe('bestPayback (AC2)', () => {
  it.each([
    ['nothing, when no unit is affordable', 0, 9, {}, {}, undefined],
    ['tea, the only one affordable', 0, 10, {}, {}, 'tea'],
    ['inn at 5 over tea at 10, not the cheapest', 0, 50, {}, {}, 'inn'],
    ['inn at 5 over palace, which gains the most', 0, 1e5, {}, {}, 'inn'],
    ['inn, since ferry is in region 2', 3, 1e5, {}, {}, 'inn'],
    ['ferry at 0.1 once region 2 is reached', 4, 1e5, {}, {}, 'ferry1'],
    ['tea at 3.2 when its 10th unit doubles it', 0, 1e5, { tea: 9 }, {}, 'tea'],
    ['inn over tea at 30.6 one unit earlier', 0, 1e5, { tea: 8 }, {}, 'inn'],
    [
      'market at 3.33 once a Phrasebook doubles food',
      0,
      1e5,
      {},
      { 'phrasebook:food': 1 },
      'market',
    ],
    [
      'tea at 9.5 with one level of stamp discount',
      0,
      9.6,
      {},
      { encounterDiscount: 1 },
      'tea',
    ],
    ['nothing at 9.6 without it', 0, 9.6, {}, {}, undefined],
  ] as const)('chooses %s', (_label, reached, held, owned, upgrades, want) => {
    expect(bestPayback(shop, at(reached, { held, owned, upgrades }))).toBe(
      want,
    );
  });

  it('buys a unit whose price is exactly the Understanding held', () => {
    const s = at(0);
    const price = encounterPrice(s, TEA, 1);
    const held = {
      ...s,
      anchor: { sim: s.sim, understanding: Num.toTuple(price) },
    };
    expect(bestPayback(shop, held)).toBe('tea');
  });

  it('breaks a tie by id in code-unit order', () => {
    expect(bestPayback(twins, at(0, { held: 100 }))).toBe('Zed');
  });
});

/** Pemandu on at `intervalMs` from the state's own time, by the real action. */
function pemandu(state: GameState, intervalMs = 10_000): GameState {
  return ok(setAutomation(course, state, true, intervalMs));
}

function unitsOwned(state: GameState): number {
  return Object.values(state.owned).reduce((a, b) => a + b, 0);
}

/** The reference: every tick in (anchor, sim + elapsed], one at a time. */
function tickByTick(c: Course, s: GameState, elapsed: number): GameState {
  const until = s.sim + elapsed;
  const every = s.automation.intervalMs;
  let x = s;
  for (
    let t = nextGridTick(s.anchor.sim, every);
    t <= until;
    t = simMs(t + every)
  ) {
    const here = { ...x, sim: t, wall: wallMs(x.wall + t - x.sim) };
    const id = bestPayback(c, here);
    if (id !== undefined) x = ok(buyEncounter(c, here, id, 1));
  }
  return { ...x, sim: simMs(until), wall: wallMs(s.wall + elapsed) };
}

describe('integrate with Pemandu (AC2)', () => {
  const RICH = { held: 1e9, owned: { tea0: 1 } };

  it('buys nothing while Pemandu is off, however much is held', () => {
    const s = at(4, RICH);
    const later = integrate(course, s, 60_000);
    expect(later.owned).toEqual(s.owned);
    expect(later.anchor).toEqual(s.anchor);
  });

  it('buys one unit at each tick, the last one at the new time', () => {
    const later = integrate(course, pemandu(at(4, RICH)), 60_000);
    expect(unitsOwned(later) - 1).toBe(6);
    expect(later.anchor.sim).toBe(60_000);
  });

  it('buys at the multiples of 5 s, not 5 s after Pemandu was set', () => {
    const s = pemandu(
      at(4, { ...RICH, simMs: 2_345, upgrades: ALL_TIERS }),
      5_000,
    );
    const later = integrate(course, s, 9_999);
    expect(unitsOwned(later) - 1).toBe(2);
    expect(later.anchor.sim).toBe(10_000);
  });

  it('buys nothing at the tick Pemandu was set on', () => {
    const s = pemandu(at(4, { ...RICH, simMs: 20_000 }));
    expect(integrate(course, s, 9_999).owned).toEqual(s.owned);
  });

  it('buys nothing when nothing is owned and nothing is affordable', () => {
    const s = pemandu(at(4, { held: 9 }));
    expect(integrate(course, s, 3_600_000).owned).toEqual({});
  });

  it('pays what a purchase by hand pays, with the stamp discount', () => {
    const s = pemandu(at(4, { held: 9.6, upgrades: { encounterDiscount: 1 } }));
    const later = integrate(course, s, 10_000);
    expect(later.owned).toEqual({ tea0: 1 });
    expect(Num.toNumber(Num.fromTuple(later.runSpent))).toBeCloseTo(9.5, 12);
  });

  it('equals buying tick by tick with bestPayback and buyEncounter, over generated states', () => {
    // 45 seeded states (#474: 300 took 0.9 s of CPU). Floors: the units
    // bought, and the states in which nothing was bought.
    let bought = 0;
    let idle = 0;
    fc.assert(
      fc.property(
        fc.record({
          interval: fc.constantFrom(10_000, 5_000, 2_000, 1_000),
          reached: fc.constantFrom(3, 4, 8),
          tea0: fc.integer({ min: 0, max: 40 }),
          market0: fc.integer({ min: 0, max: 20 }),
          tea1: fc.integer({ min: 0, max: 10 }),
          held: fc.integer({ min: 0, max: 5_000 }),
          sim: fc.integer({ min: 0, max: 30 * 3_600_000 }),
          ticks: fc.integer({ min: 0, max: 150 }),
          discount: fc.integer({ min: 0, max: 2 }),
          phrasebook: fc.boolean(),
          reviewed: fc.integer({ min: 0, max: 5 }),
        }),
        (r) => {
          // Reviewed words make each bonus hang on the wall clock, so a
          // tick bought at the wrong skew between the clocks pays wrong.
          // Each review falls before the anchor at 0, as every review in
          // a real game falls at or before `memorySince`.
          const words = Object.fromEntries(
            Array.from({ length: r.reviewed }, (_, k) => {
              const when = wallMs(START - (k + 1) * 86_400_000);
              return [
                `r0-d0-w${String(k)}`,
                review(newWordMemory(when), when, true),
              ];
            }),
          );
          const s = pemandu(
            at(r.reached, {
              held: r.held,
              simMs: r.sim,
              words,
              owned: { tea0: r.tea0, market0: r.market0, tea1: r.tea1 },
              upgrades: {
                ...ALL_TIERS,
                ...EARLY,
                ...(r.discount > 0 ? { encounterDiscount: r.discount } : {}),
                ...(r.phrasebook ? { 'phrasebook:food': 1 } : {}),
              },
            }),
            r.interval,
          );
          const elapsed = r.ticks * r.interval;
          const got = integrate(course, s, elapsed);
          expect(got).toEqual(tickByTick(course, s, elapsed));
          const units = unitsOwned(got) - unitsOwned(s);
          bought += units;
          if (units === 0) idle += 1;
        },
      ),
      { numRuns: 45, seed: 33 },
    );
    expect({
      bought: floorBreach('core-automation/tick-by-tick-bought', bought),
      idle: floorBreach('core-automation/tick-by-tick-idle', idle),
    }).toEqual({ bought: undefined, idle: undefined });
  });
});

describe('advance with Pemandu (AC2)', () => {
  it('reports what was produced, not what is left after Pemandu spent', () => {
    const s = pemandu({
      ...at(4, { held: 1e9, owned: { tea0: 1 } }),
      runSpent: tuple(500),
    });
    const { state: later, summary } = advance(
      course,
      s,
      wallMs(s.wall + 60_000),
    );
    const spent = Num.sub(
      Num.fromTuple(later.runSpent),
      Num.fromTuple(s.runSpent),
    );
    expect(Num.toNumber(spent)).toBeGreaterThan(0);
    expect(summary.understandingEarned).toEqual(
      Num.toTuple(
        Num.add(
          Num.sub(understandingNow(course, later), understandingNow(course, s)),
          spent,
        ),
      ),
    );
  });
});
