import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { JOURNEY_DURATION_IDS } from '../src/balance';
import { heldCards } from '../src/cards';
import { DAY_MS, HOUR_MS, simMs, wallMs, type WallMs } from '../src/clock';
import type {
  Course,
  CultureCard,
  Encounter,
  LexiconItem,
} from '../src/course';
import { collectJourney, journeyStatus, startJourney } from '../src/journeys';
import { Num } from '../src/num';
import { rateAt, rateBreakdown, understandingNow } from '../src/production';
import { createStreams, nextInt, type RngState } from '../src/rng';
import { currentDestination } from '../src/route';
import {
  advance,
  integrate,
  pickUpWord,
  type Rejection,
  type Result,
} from '../src/sim';
import { initialState, type GameState } from '../src/state';
import { pickUpPool } from '../src/words';

/**
 * Journeys (#30 AC1 to AC3, AC5 to AC7): slots, durations, the return, the
 * seeded draw with repeats, collection and the repeat reward.
 *
 * The courses are declared here, so they are checked against the
 * `Course` contract rather than sharing it.
 */

const START: WallMs = wallMs(Date.UTC(2027, 0, 4));
const FEAST_START = START + 14 * DAY_MS;
const FEAST_END = FEAST_START + 7 * DAY_MS;

const tea: Encounter = { id: 'tea', tags: ['food'], c0: 10, p0: 1 };

function card(id: string, setId: string, extra: Partial<CultureCard> = {}) {
  return {
    id,
    setId,
    tags: ['food'],
    bonus: 0.05,
    phrasePack: [],
    ...extra,
  } satisfies CultureCard;
}

const pool = [
  card('satay', 'eats'),
  card('rendang', 'eats'),
  card('becak', 'rides', { tags: ['transport'] }),
  card('lebaran', 'rides', {
    festival: {
      windows: [{ startWallMs: FEAST_START, endWallMs: FEAST_END }],
    },
  }),
];

function courseWith(cards: readonly CultureCard[]): Course {
  return {
    id: 'journeys-course',
    tags: ['food', 'transport'],
    regions: [
      {
        id: 'r0',
        destinations: [],
        encounters: [tea],
        cardSets: [
          { id: 'eats', bonus: 0.25 },
          { id: 'rides', bonus: 0.5 },
        ],
        cultureCards: cards,
        grammarNodes: [],
      },
    ],
  };
}

const course = courseWith(pool);
/** Every Journey brings back the same card. */
const solo = courseWith([card('solo', 'eats')]);

/** A game from `seed` owning 5 tea, with upgrade levels `upgrades`. */
function game(
  seed = 1,
  upgrades: Readonly<Record<string, number>> = {},
  wall: number = START,
): GameState {
  return { ...initialState(wallMs(wall), seed), owned: { tea: 5 }, upgrades };
}

function ok(result: Result): GameState {
  if (!result.ok) {
    throw new Error(`refused: ${JSON.stringify(result.rejection)}`);
  }
  return result.state;
}

function refusal(result: Result): Rejection {
  if (result.ok) throw new Error('expected a rejection');
  return result.rejection;
}

/** The card the Journey in `slot` carries. */
function cardIn(state: GameState, slot: number): string {
  const journey = state.journeys[slot];
  if (journey === undefined || journey === null) {
    throw new Error(`slot ${String(slot)} is empty`);
  }
  return journey.cardId;
}

/** Start a 2 h Journey in slot 0, let it return, collect it. */
function roundTrip(c: Course, state: GameState): GameState {
  const out = ok(startJourney(c, state, 0, '2h'));
  return ok(collectJourney(c, integrate(c, out, 2 * HOUR_MS), 0));
}

/** The indexes the `cards` stream of `seed` draws over `n` cards, `count` times. */
function streamDraws(seed: number, n: number, count: number): number[] {
  let state: RngState | undefined = createStreams(seed, ['cards'])['cards'];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    if (state === undefined) throw new Error('no cards stream');
    const r = nextInt(state, n);
    out.push(r.value);
    state = r.state;
  }
  return out;
}

/** The cards `count` round trips from `start` bring back, in order. */
function drawSequence(start: GameState, count: number): string[] {
  let s = start;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(cardIn(ok(startJourney(course, s, 0, '2h')), 0));
    s = roundTrip(course, s);
  }
  return out;
}

/** Listed durations, written out from parent §4.2. */
const LISTED_MS: Readonly<Record<string, number>> = {
  tutorial: 1_800_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '8h': 28_800_000,
  '24h': 86_400_000,
};

describe('starting a Journey (AC1)', () => {
  for (const id of JOURNEY_DURATION_IDS)
    it(`sends a ${id} Journey out for its listed duration`, () => {
      const s = integrate(course, game(), 5_000);
      const out = ok(startJourney(course, s, 0, id));
      expect(out.journeys[0]?.returnsAt).toBe(5_000 + (LISTED_MS[id] ?? -1));
      expect(out.journeys[0]?.durationId).toBe(id);
    });

  it.each<[number, number]>([
    [1, 6_480_000],
    [2, 5_760_000],
    [3, 5_040_000],
    [4, 5_040_000],
  ])('a stamp cut of level %i makes a 2 h Journey %i ms', (level, ms) => {
    const out = ok(
      startJourney(course, game(1, { journeyCut: level }), 0, '2h'),
    );
    expect(out.journeys[0]?.returnsAt).toBe(ms);
  });

  it('rounds a cut duration to whole ms: 24 h at level 3 is 60_480_000 ms', () => {
    // 86_400_000 x 0.7 is 60_479_999.99999999 in binary floating point.
    const out = ok(startJourney(course, game(1, { journeyCut: 3 }), 0, '24h'));
    expect(out.journeys[0]?.returnsAt).toBe(60_480_000);
  });

  it('opens one slot at the start', () => {
    expect(refusal(startJourney(course, game(), 1, '2h'))).toEqual({
      kind: 'slotLocked',
      slot: 1,
      open: 1,
    });
    expect(journeyStatus(game(), 0)).toBe('empty');
    expect(journeyStatus(game(), 1)).toBe('locked');
  });

  it('opens a slot per slot upgrade, up to 3', () => {
    const two = game(1, { journeySlot2: 1 });
    expect(ok(startJourney(course, two, 1, '2h')).journeys[1]).not.toBeNull();
    expect(refusal(startJourney(course, two, 2, '2h'))).toEqual({
      kind: 'slotLocked',
      slot: 2,
      open: 2,
    });
    const three = game(1, { journeySlot2: 1, journeySlot3: 1 });
    expect(ok(startJourney(course, three, 2, '2h')).journeys[2]).not.toBeNull();
  });

  it.each([-1, 1.5, 3, Number.NaN])('refuses slot %s as unknown', (slot) => {
    expect(refusal(startJourney(course, game(), slot, '2h'))).toEqual({
      kind: 'unknownSlot',
      slot,
    });
  });

  it('refuses a slot whose Journey is away', () => {
    const out = ok(startJourney(course, game(), 0, '2h'));
    expect(refusal(startJourney(course, out, 0, '4h'))).toEqual({
      kind: 'slotBusy',
      slot: 0,
    });
  });

  it('refuses a slot whose Journey has returned but is not collected', () => {
    const back = integrate(
      course,
      ok(startJourney(course, game(), 0, '2h')),
      DAY_MS,
    );
    expect(journeyStatus(back, 0)).toBe('returned');
    expect(refusal(startJourney(course, back, 0, '4h'))).toEqual({
      kind: 'slotBusy',
      slot: 0,
    });
  });

  it('refuses a duration it does not list', () => {
    expect(refusal(startJourney(course, game(), 0, '3h'))).toEqual({
      kind: 'unknownDuration',
      durationId: '3h',
    });
  });

  it('allows the tutorial Journey once per game', () => {
    const first = ok(startJourney(course, game(), 0, 'tutorial'));
    expect(first.tutorialJourneyUsed).toBe(true);
    const back = ok(
      collectJourney(course, integrate(course, first, HOUR_MS), 0),
    );
    expect(refusal(startJourney(course, back, 0, 'tutorial'))).toEqual({
      kind: 'tutorialUsed',
    });
    expect(ok(startJourney(course, back, 0, '2h')).journeys[0]).not.toBeNull();
  });

  it('refuses when the region has no cards', () => {
    expect(refusal(startJourney(courseWith([]), game(), 0, '2h'))).toEqual({
      kind: 'noCards',
    });
  });
});

describe('the return (AC2)', () => {
  it('is away until its return time and returned from that ms', () => {
    const out = ok(startJourney(course, game(), 0, '2h'));
    expect(journeyStatus(integrate(course, out, 2 * HOUR_MS - 1), 0)).toBe(
      'away',
    );
    expect(journeyStatus(integrate(course, out, 2 * HOUR_MS), 0)).toBe(
      'returned',
    );
  });

  it('falls at the same time however integrate is split, with Journeys in flight', () => {
    const three = game(1, { journeySlot2: 1, journeySlot3: 1 });
    let s = ok(startJourney(course, three, 0, '2h'));
    s = ok(startJourney(course, integrate(course, s, 1_234), 1, '8h'));
    s = ok(startJourney(course, s, 2, '24h'));
    const out = s;
    const gap = fc.integer({ min: 0, max: 30 * HOUR_MS });
    fc.assert(
      fc.property(gap, gap, (a, b) => {
        const split = integrate(course, integrate(course, out, a), b);
        const whole = integrate(course, out, a + b);
        expect(split).toEqual(whole);
        expect([0, 1, 2].map((slot) => journeyStatus(split, slot))).toEqual(
          [0, 1, 2].map((slot) => journeyStatus(whole, slot)),
        );
        expect(understandingNow(course, split)).toEqual(
          understandingNow(course, whole),
        );
      }),
      { numRuns: 300 },
    );
  });

  it('is counted by advance in the time it credits', () => {
    let s = ok(startJourney(course, game(1, { journeySlot2: 1 }), 0, '2h'));
    s = ok(startJourney(course, s, 1, '8h'));
    const first = advance(course, s, wallMs(s.wall + 4 * HOUR_MS));
    expect(first.summary.journeysReturned).toBe(1);
    const second = advance(course, first.state, wallMs(START + 8 * HOUR_MS));
    expect(second.summary.journeysReturned).toBe(1);
    const third = advance(course, second.state, wallMs(START + 9 * HOUR_MS));
    expect(third.summary.journeysReturned).toBe(0);
  });
});

describe('the card draw (AC3, AC5)', () => {
  it("draws each card as the cards stream's uniform draw over the pool in course order, repeats included, until every card has come", () => {
    let s = game(7);
    const drawn: string[] = [];
    // one scenario: draws until the pool is covered, a count only the run knows.
    while (new Set(drawn).size < pool.length && drawn.length < 100) {
      const out = ok(startJourney(course, s, 0, '2h'));
      drawn.push(cardIn(out, 0));
      s = ok(collectJourney(course, integrate(course, out, 2 * HOUR_MS), 0));
    }
    expect(new Set(drawn).size).toBe(pool.length);
    expect(drawn.length).toBeGreaterThan(pool.length);
    expect(drawn).toEqual(
      streamDraws(7, pool.length, drawn.length).map((i) => pool[i]?.id),
    );
  });

  it('draws the same cards from the same seed and others from another', () => {
    expect(drawSequence(game(3), 8)).toEqual(drawSequence(game(3), 8));
    expect(drawSequence(game(3), 8)).not.toEqual(drawSequence(game(4), 8));
  });

  it('draws a festival card in and out of its season alike (DN15)', () => {
    const inSeason = drawSequence(game(7, {}, FEAST_START), 12);
    expect(inSeason).toContain('lebaran');
    expect(drawSequence(game(7, {}, FEAST_END), 12)).toEqual(inSeason);
  });
});

describe('collecting (AC4, AC6)', () => {
  it('refuses one ms before the return, naming the return time', () => {
    const out = ok(startJourney(course, game(), 0, '2h'));
    expect(
      refusal(
        collectJourney(course, integrate(course, out, 2 * HOUR_MS - 1), 0),
      ),
    ).toEqual({ kind: 'notReturned', slot: 0, returnsAt: 2 * HOUR_MS });
  });

  it('collects at the return time and empties the slot', () => {
    const out = ok(startJourney(course, game(), 0, '2h'));
    const back = ok(
      collectJourney(course, integrate(course, out, 2 * HOUR_MS), 0),
    );
    expect(back.cards).toEqual([cardIn(out, 0)]);
    expect(journeyStatus(back, 0)).toBe('empty');
  });

  it('credits the card exactly once when collected days later', () => {
    const out = ok(startJourney(course, game(), 0, '2h'));
    const back = ok(
      collectJourney(course, integrate(course, out, 3 * DAY_MS), 0),
    );
    expect(back.cards).toEqual([cardIn(out, 0)]);
    expect(refusal(collectJourney(course, back, 0))).toEqual({
      kind: 'slotEmpty',
      slot: 0,
    });
  });

  it.each([-1, 3])('refuses slot %s as unknown', (slot) => {
    expect(refusal(collectJourney(course, game(), slot))).toEqual({
      kind: 'unknownSlot',
      slot,
    });
  });

  it("counts a new card's bonus from collection, not from the return", () => {
    const out = ok(startJourney(solo, game(), 0, '2h'));
    const late = integrate(course, out, DAY_MS);
    const back = ok(collectJourney(solo, late, 0));
    expect(understandingNow(solo, back)).toEqual(understandingNow(solo, late));
    const ratio = Num.toNumber(
      Num.div(rateAt(solo, back, back.sim), rateAt(solo, late, late.sim)),
    );
    expect(Math.abs(ratio - 1.05 * 1.25)).toBeLessThan(1e-12);
  });

  it('grants a set bonus once, whatever repeats follow', () => {
    const s: GameState = { ...game(), cards: ['satay'] };
    const twoCards: GameState = {
      ...s,
      journeys: [
        { durationId: '2h', returnsAt: simMs(0), cardId: 'rendang' },
        null,
        null,
      ],
    };
    const complete = ok(collectJourney(course, twoCards, 0));
    const lines = rateBreakdown(course, complete, complete.sim);
    expect(lines[0]?.lines.find((l) => l.name === 'sets')?.factor).toEqual(
      Num.from(1.25),
    );
    const repeat = ok(
      collectJourney(
        course,
        {
          ...complete,
          journeys: [
            { durationId: '2h', returnsAt: simMs(0), cardId: 'rendang' },
            null,
            null,
          ],
        },
        0,
      ),
    );
    expect(repeat.cards).toEqual(['satay', 'rendang']);
    expect(rateBreakdown(course, repeat, repeat.sim)).toEqual(lines);
  });
});

/** A repeat's reward, written out from design §5 (operator, 2026-10-03). */
const REPEAT: Readonly<Record<string, readonly [number, number]>> = {
  tutorial: [1, 450_000],
  '2h': [2, 1_800_000],
  '4h': [3, 3_600_000],
  '8h': [5, 7_200_000],
  '24h': [10, 21_600_000],
};

describe('a repeat card (AC7)', () => {
  for (const id of JOURNEY_DURATION_IDS)
    it(`pays a ${id} repeat in Insight and in Understanding at the rate now`, () => {
      const [insight, ms] = REPEAT[id] ?? [-1, -1];
      const held: GameState = { ...game(), cards: ['solo'] };
      const out = ok(startJourney(solo, held, 0, id));
      const back = integrate(solo, out, DAY_MS);
      const paid = ok(collectJourney(solo, back, 0));
      expect(Num.toNumber(Num.fromTuple(paid.insight))).toBe(insight);
      const want = Num.add(
        understandingNow(solo, back),
        Num.div(
          Num.mul(rateAt(solo, back, back.sim), Num.from(ms)),
          Num.from(1000),
        ),
      );
      const got = understandingNow(solo, paid);
      expect(
        Math.abs(Num.toNumber(Num.div(Num.sub(got, want), want))),
      ).toBeLessThan(1e-12);
      expect(
        Num.toNumber(Num.sub(got, understandingNow(solo, back))),
      ).toBeGreaterThan(0);
    });

  it('changes no held card and no bonus', () => {
    const held: GameState = { ...game(), cards: ['solo'] };
    const back = integrate(
      solo,
      ok(startJourney(solo, held, 0, '2h')),
      2 * HOUR_MS,
    );
    const paid = ok(collectJourney(solo, back, 0));
    expect(paid.cards).toEqual(['solo']);
    expect(rateBreakdown(solo, paid, paid.sim)).toEqual(
      rateBreakdown(solo, back, back.sim),
    );
  });

  it('pays two Journeys out with the same card once as new and once as a repeat', () => {
    let s = ok(startJourney(solo, game(1, { journeySlot2: 1 }), 0, '2h'));
    s = ok(startJourney(solo, s, 1, '2h'));
    expect([cardIn(s, 0), cardIn(s, 1)]).toEqual(['solo', 'solo']);
    const first = ok(collectJourney(solo, integrate(solo, s, 2 * HOUR_MS), 1));
    expect(first.cards).toEqual(['solo']);
    expect(first.insight).toEqual(s.insight);
    const second = ok(collectJourney(solo, first, 0));
    expect(second.cards).toEqual(['solo']);
    expect(Num.toNumber(Num.fromTuple(second.insight))).toBe(2);
  });
});

const word = (id: string, cefr: LexiconItem['cefr']): LexiconItem => ({
  id,
  tags: ['food'],
  cefr,
});

/** A destination of two words and one card whose pack holds two more. */
const packCourse: Course = {
  ...solo,
  regions: [
    {
      id: 'r0',
      destinations: [
        { id: 'd0', lexicon: [word('d-b1', 'B1'), word('d-a1', 'A1')] },
      ],
      encounters: [tea],
      cardSets: [{ id: 'eats', bonus: 0.25 }],
      cultureCards: [
        card('gado', 'eats', {
          phrasePack: [word('p-a2', 'A2'), word('p-a1', 'A1')],
        }),
      ],
      grammarNodes: [],
    },
  ],
};

const poolIds = (state: GameState): string[] =>
  pickUpPool(
    currentDestination(packCourse, state),
    heldCards(packCourse, state),
    [],
  ).map((w) => w.id);

describe('phrase packs (AC4)', () => {
  it("adds a collected card's pack to the pick-up pool, in curriculum order", () => {
    expect(poolIds(game())).toEqual(['d-a1', 'd-b1']);
    expect(poolIds(roundTrip(packCourse, game()))).toEqual([
      'd-a1',
      'p-a1',
      'p-a2',
      'd-b1',
    ]);
  });

  it('adds nothing while the card is still away', () => {
    expect(poolIds(ok(startJourney(packCourse, game(), 0, '2h')))).toEqual([
      'd-a1',
      'd-b1',
    ]);
  });

  it('lets a pack word be picked up, and it pays like any word', () => {
    let s: GameState = {
      ...roundTrip(packCourse, game()),
      anchor: {
        sim: simMs(2 * HOUR_MS),
        understanding: Num.toTuple(Num.from(1e6)),
      },
    };
    // one scenario: three pick-ups walk the pool to its first pack words.
    for (let i = 0; i < 3; i++) s = ok(pickUpWord(packCourse, s));
    expect(Object.keys(s.words).sort()).toEqual(['d-a1', 'p-a1', 'p-a2']);
    const words = rateBreakdown(packCourse, s, s.sim)[0]?.lines.find(
      (l) => l.name === 'words',
    );
    expect(Num.toNumber(words?.factor ?? Num.from(0))).toBeGreaterThan(1);
  });
});
