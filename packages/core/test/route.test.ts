import { describe, expect, it } from 'vitest';
import { DAY_MS, simMs, wallMs, type WallMs } from '../src/clock';
import type {
  Course,
  CultureCard,
  Destination,
  Encounter,
  Region,
} from '../src/course';
import { cardPool } from '../src/journeys';
import { Num, type NumTuple } from '../src/num';
import {
  currentDestination,
  currentRegion,
  regionsReached,
  route,
} from '../src/route';
import {
  buyEncounter,
  integrate,
  listen,
  pickUpWord,
  type Result,
} from '../src/sim';
import { initialState, type GameState } from '../src/state';
import { pickUpCost, pickUpPool } from '../src/words';

/**
 * The route (#31 AC4 and design §5): destinations numbered region by region,
 * the pick-up pool and the Journey card pool following the current
 * destination, Encounters from every region reached, and the Understanding a
 * run spends.
 *
 * The course is declared here, so it is checked against the `Course`
 * contract rather than sharing it.
 */

const START: WallMs = wallMs(Date.UTC(2027, 0, 4));

function destination(r: number, d: number): Destination {
  return {
    id: `r${String(r)}-d${String(d)}`,
    lexicon: [0, 1, 2].map((k) => ({
      id: `r${String(r)}d${String(d)}w${String(k)}`,
      tags: ['food'],
      cefr: 'A1' as const,
    })),
  };
}

function encounter(r: number): Encounter {
  return { id: `e${String(r)}`, tags: ['food'], c0: 10 * 1000 ** r, p0: 1 };
}

function card(r: number): CultureCard {
  return {
    id: `c${String(r)}`,
    setId: `s${String(r)}`,
    tags: ['food'],
    bonus: 0.05,
    phrasePack: [{ id: `c${String(r)}p`, tags: ['food'], cefr: 'A2' as const }],
  };
}

function region(r: number): Region {
  return {
    id: `r${String(r)}`,
    destinations: [0, 1, 2, 3].map((d) => destination(r, d)),
    encounters: [encounter(r)],
    cardSets: [{ id: `s${String(r)}`, bonus: 0.1 }],
    cultureCards: [card(r)],
    grammarNodes: [],
  };
}

const course: Course = {
  id: 'route-course',
  tags: ['food'],
  regions: [region(0), region(1), region(2)],
};

/** A new game at destination `at` having reached `reached`, holding `understanding`. */
function at(at: number, reached: number, understanding = 0): GameState {
  return {
    ...initialState(START, 1),
    destination: at,
    reached,
    anchor: { sim: simMs(0), understanding: tuple(understanding) },
  };
}

function tuple(x: number): NumTuple {
  return Num.toTuple(Num.from(x));
}

function ok(result: Result): GameState {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
  return result.state;
}

describe('route', () => {
  it('numbers the destinations region by region in course order', () => {
    expect(
      route(course).map((stop) => [stop.region, stop.destination.id]),
    ).toEqual([
      [0, 'r0-d0'],
      [0, 'r0-d1'],
      [0, 'r0-d2'],
      [0, 'r0-d3'],
      [1, 'r1-d0'],
      [1, 'r1-d1'],
      [1, 'r1-d2'],
      [1, 'r1-d3'],
      [2, 'r2-d0'],
      [2, 'r2-d1'],
      [2, 'r2-d2'],
      [2, 'r2-d3'],
    ]);
  });

  it('skips a region with no destinations', () => {
    const gappy: Course = {
      ...course,
      regions: [region(0), { ...region(1), destinations: [] }, region(2)],
    };
    expect(route(gappy).map((stop) => stop.region)).toEqual([
      0, 0, 0, 0, 2, 2, 2, 2,
    ]);
  });
});

describe('the current destination and region', () => {
  it('a new game is at the first destination of the first region', () => {
    const s = initialState(START, 1);
    expect(currentDestination(course, s)?.id).toBe('r0-d0');
    expect(currentRegion(course, s).id).toBe('r0');
  });

  it('destination 5 is the second of the second region', () => {
    expect(currentDestination(course, at(5, 5))?.id).toBe('r1-d1');
    expect(currentRegion(course, at(5, 5)).id).toBe('r1');
  });

  it('a new game is in the first region even when the course gives it no destinations', () => {
    const bare: Course = {
      ...course,
      regions: [{ ...region(0), destinations: [] }],
    };
    const s = initialState(START, 1);
    expect(currentDestination(bare, s)).toBeUndefined();
    expect(currentRegion(bare, s).id).toBe('r0');
    expect(regionsReached(bare, s)).toBe(1);
  });

  it('refuses a destination the course does not have, naming it', () => {
    expect(() => currentDestination(course, at(12, 12))).toThrow(
      /the course has no destination 12/,
    );
    expect(() => currentRegion(course, at(12, 12))).toThrow(
      /the course has no destination 12/,
    );
    expect(() => regionsReached(course, at(0, 12))).toThrow(
      /the course has no destination 12/,
    );
  });

  it('a Mastery replay of an earlier destination keeps every region reached', () => {
    const replaying = { ...at(1, 11), finale: true };
    expect(currentRegion(course, replaying).id).toBe('r0');
    expect(regionsReached(course, replaying)).toBe(3);
  });
});

describe('the pools follow the current destination', () => {
  it("the pick-up pool is destination 5's lexicon, then the held packs", () => {
    const s = { ...at(5, 5), cards: ['c0'] };
    expect(
      pickUpPool(currentDestination(course, s), [card(0)], []).map((w) => w.id),
    ).toEqual(['r1d1w0', 'r1d1w1', 'r1d1w2', 'c0p']);
  });

  it("a pick-up at destination 5 takes that destination's first word", () => {
    const s = ok(pickUpWord(course, at(5, 5, 1_000)));
    expect(Object.keys(s.words)).toEqual(['r1d1w0']);
  });

  it("the Journey card pool is the current region's cards", () => {
    expect(cardPool(course, at(5, 5)).map((c) => c.id)).toEqual(['c1']);
    expect(cardPool(course, at(9, 9)).map((c) => c.id)).toEqual(['c2']);
    expect(cardPool(course, initialState(START, 1)).map((c) => c.id)).toEqual([
      'c0',
    ]);
  });
});

describe('Encounters from every region reached (operator, 2026-10-03)', () => {
  const rich = 1e12;

  it("refuses a later region's Encounter, naming it and its region", () => {
    const result = buyEncounter(course, at(3, 3, rich), 'e1', 1);
    expect(result).toEqual({
      ok: false,
      rejection: { kind: 'encounterLocked', id: 'e1', region: 1 },
    });
  });

  it("buys region 2's Encounter once region 2 is reached", () => {
    expect(ok(buyEncounter(course, at(4, 4, rich), 'e1', 1)).owned).toEqual({
      e1: 1,
    });
  });

  it("still buys region 1's Encounter in region 2", () => {
    expect(ok(buyEncounter(course, at(4, 4, rich), 'e0', 1)).owned).toEqual({
      e0: 1,
    });
  });

  it("buys region 3's Encounter while replaying region 1 after the finale", () => {
    const replaying = { ...at(0, 11, rich), finale: true };
    expect(ok(buyEncounter(course, replaying, 'e2', 1)).owned).toEqual({
      e2: 1,
    });
  });

  it('still calls an id no region has unknown', () => {
    expect(buyEncounter(course, at(0, 0, rich), 'nope', 1)).toEqual({
      ok: false,
      rejection: { kind: 'unknownEncounter', id: 'nope' },
    });
  });
});

describe('Understanding spent this run', () => {
  it('a purchase adds its cost', () => {
    const s = ok(buyEncounter(course, at(0, 0, 100), 'e0', 2));
    // 10 + 10 x 1.15, the first two purchases (parent §3.2).
    expect(Num.toNumber(Num.fromTuple(s.runSpent))).toBeCloseTo(21.5, 12);
    expect(Num.toNumber(Num.fromTuple(s.anchor.understanding))).toBeCloseTo(
      78.5,
      12,
    );
  });

  it('a pick-up adds its cost', () => {
    const s = ok(pickUpWord(course, at(0, 0, 100)));
    expect(Num.fromTuple(s.runSpent)).toEqual(pickUpCost(0));
    expect(Num.toNumber(Num.fromTuple(s.runSpent))).toBe(20);
  });

  it('spending adds to what was spent before', () => {
    const s = ok(pickUpWord(course, { ...at(0, 0, 100), runSpent: tuple(7) }));
    expect(Num.toNumber(Num.fromTuple(s.runSpent))).toBe(27);
  });

  it('a Listen tap and the passing of time spend nothing', () => {
    const s = { ...at(0, 0, 100), runSpent: tuple(7) };
    expect(listen(course, s).runSpent).toEqual(tuple(7));
    expect(integrate(course, s, DAY_MS).runSpent).toEqual(tuple(7));
  });
});
