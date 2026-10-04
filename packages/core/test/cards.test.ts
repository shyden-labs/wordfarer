import { describe, expect, it } from 'vitest';
import { heldCards } from '../src/cards';
import { DAY_MS, HOUR_MS, simMs, wallMs, type WallMs } from '../src/clock';
import type { Course, CultureCard, Encounter } from '../src/course';
import { Num } from '../src/num';
import { producedBetween, rateAt, type RateLine } from '../src/production';
import { view } from '../src/view';
import { initialState, type GameState } from '../src/state';

/**
 * Culture card bonuses (#30 AC4, AC5): the `cards` and `sets` lines of the
 * rate breakdown, the festival doubling and the production split at a
 * festival edge.
 *
 * The course is declared here, so it is checked against the `Course`
 * contract rather than sharing it.
 */

const START: WallMs = wallMs(Date.UTC(2027, 0, 4));
/** The festival's first window: a week from 14 days after START. */
const FEAST_START = START + 14 * DAY_MS;
const FEAST_END = FEAST_START + 7 * DAY_MS;
/** Its second window: one day, a year on. */
const FEAST2_START = FEAST_START + 364 * DAY_MS;

const tea: Encounter = { id: 'tea', tags: ['food'], c0: 10, p0: 1 };
const bus: Encounter = { id: 'bus', tags: ['transport'], c0: 10, p0: 2 };
const home: Encounter = { id: 'home', tags: ['family'], c0: 10, p0: 3 };

const satay: CultureCard = {
  id: 'satay',
  setId: 'eats',
  tags: ['food'],
  bonus: 0.05,
  phrasePack: [],
};
const rendang: CultureCard = {
  id: 'rendang',
  setId: 'eats',
  tags: ['food'],
  bonus: 0.1,
  phrasePack: [],
};
const becak: CultureCard = {
  id: 'becak',
  setId: 'rides',
  tags: ['transport'],
  bonus: 0.05,
  phrasePack: [],
  festival: {
    windows: [
      { startWallMs: FEAST_START, endWallMs: FEAST_END },
      { startWallMs: FEAST2_START, endWallMs: FEAST2_START + DAY_MS },
    ],
  },
};
const ojek: CultureCard = {
  id: 'ojek',
  setId: 'rides',
  tags: ['transport'],
  bonus: 0.2,
  phrasePack: [],
};

const course: Course = {
  id: 'cards-course',
  tags: ['food', 'transport', 'family'],
  regions: [
    {
      id: 'r0',
      destinations: [],
      encounters: [tea, bus, home],
      cardSets: [
        { id: 'eats', bonus: 0.25 },
        { id: 'rides', bonus: 0.5 },
        // A set no card belongs to is never complete.
        { id: 'empty', bonus: 9 },
      ],
      cultureCards: [satay, rendang, becak, ojek],
      grammarNodes: [],
    },
  ],
};

/** A state at wall time `wall` owning one of each Encounter and holding `cards`. */
function holding(
  cards: readonly string[],
  wall: number = START,
  upgrades: Readonly<Record<string, number>> = {},
): GameState {
  return {
    ...initialState(wallMs(wall), 1),
    owned: { tea: 1, bus: 1, home: 1 },
    cards,
    upgrades,
  };
}

/** Encounter `id`'s lines in the view at the state's own wall time. */
function linesOf(state: GameState, id: string): readonly RateLine[] {
  const found = view(course, state, state.wall).breakdown.find(
    (e) => e.id === id,
  );
  if (found === undefined) throw new Error(`no rate for ${id}`);
  return found.lines;
}

/** The factor of line `name`, or `undefined` when the line is not shown. */
function factorOf(
  state: GameState,
  id: string,
  name: string,
): number | undefined {
  const line = linesOf(state, id).find((l) => l.name === name);
  return line === undefined ? undefined : Num.toNumber(line.factor);
}

describe('the cards line (AC4)', () => {
  it('adds a held card to every Encounter sharing its tag, and to no other', () => {
    const s = holding(['satay']);
    expect(factorOf(s, 'tea', 'cards')).toBe(1.05);
    expect(factorOf(s, 'bus', 'cards')).toBeUndefined();
    expect(factorOf(s, 'home', 'cards')).toBeUndefined();
  });

  it('adds the bonuses of held cards sharing a tag, in course order', () => {
    expect(factorOf(holding(['rendang', 'satay']), 'tea', 'cards')).toBe(
      1 + 0.05 + 0.1,
    );
  });

  it('is not shown while no card is held', () => {
    expect(linesOf(holding([]), 'tea').map((l) => l.name)).not.toContain(
      'cards',
    );
  });

  it('refuses a held card the course does not have', () => {
    expect(() => heldCards(course, holding(['ghost']))).toThrow(
      /card ghost is not in course cards-course/,
    );
  });
});

describe('the sets line (AC4)', () => {
  it('is not shown while a set is incomplete', () => {
    const s = holding(['satay', 'becak']);
    expect(factorOf(s, 'tea', 'sets')).toBeUndefined();
    expect(factorOf(s, 'bus', 'sets')).toBeUndefined();
  });

  it('adds a complete set to every Encounter', () => {
    const s = holding(['satay', 'rendang']);
    expect(factorOf(s, 'tea', 'sets')).toBe(1.25);
    expect(factorOf(s, 'bus', 'sets')).toBe(1.25);
    expect(factorOf(s, 'home', 'sets')).toBe(1.25);
  });

  it('adds every complete set, and never one with no cards', () => {
    const s = holding(['satay', 'rendang', 'becak', 'ojek']);
    expect(factorOf(s, 'home', 'sets')).toBe(1 + 0.25 + 0.5);
  });
});

describe('the breakdown (AC4, DN6)', () => {
  it('lists cards and sets after the Phrasebooks and before the stamps', () => {
    const s = holding(['satay', 'rendang'], START, { 'phrasebook:food': 1 });
    expect(linesOf(s, 'tea').map((l) => l.name)).toEqual([
      'encounters',
      'milestones',
      'words',
      'phrasebook:food',
      'cards',
      'sets',
      'stamps',
    ]);
  });

  it('pays the product of the lines it shows', () => {
    const s = holding(['satay', 'rendang', 'becak', 'ojek'], FEAST_START);
    const v = view(course, s, s.wall);
    const products = v.breakdown.map((e) =>
      e.lines.reduce((r, l) => Num.mul(r, l.factor), Num.from(1)),
    );
    expect(v.breakdown.map((e) => e.rate)).toEqual(products);
    expect(v.breakdown).toHaveLength(3);
  });
});

describe('the festival (AC5)', () => {
  it.each<[string, number, number]>([
    ['one ms before the window', FEAST_START - 1, 1.05],
    ['its first ms', FEAST_START, 1.1],
    ['its last ms', FEAST_END - 1, 1.1],
    ['one ms after the window', FEAST_END, 1.05],
    ['inside its second window', FEAST2_START, 1.1],
  ])('judges the card at %s', (_, wall, want) => {
    expect(factorOf(holding(['becak'], wall), 'bus', 'cards')).toBe(want);
  });

  it.each<[string, number]>([
    ['start', FEAST_START],
    ['end', FEAST_END],
  ])(
    'splits production at the window %s inside an hour, on the skewed clock',
    (_, edge) => {
      // Simulated 10 h, half an hour before the edge on the wall clock: the
      // edge falls 30 min into the bucket [10 h, 11 h).
      const sim = simMs(10 * HOUR_MS);
      const s: GameState = {
        ...holding(['becak'], edge - 30 * 60_000),
        sim,
        anchor: { sim, understanding: Num.toTuple(Num.from(0)) },
        memorySince: sim,
      };
      const atEdge = simMs(sim + 30 * 60_000);
      const before = rateAt(course, s, sim);
      const after = rateAt(course, s, atEdge);
      expect(Num.toNumber(after)).not.toBe(Num.toNumber(before));
      const want = Num.div(
        Num.add(
          Num.mul(before, Num.from(30 * 60_000)),
          Num.mul(after, Num.from(30 * 60_000)),
        ),
        Num.from(1000),
      );
      const got = producedBetween(course, s, sim, simMs(sim + HOUR_MS));
      expect(
        Math.abs(Num.toNumber(Num.div(Num.sub(got, want), want))),
      ).toBeLessThan(1e-12);
    },
  );
});
