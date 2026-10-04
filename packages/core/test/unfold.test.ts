import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DAY_MS, simMs, wallMs, type WallMs } from '../src/clock';
import type { CourseData, Destination } from '../src/course';
import { collectJourney, startJourney } from '../src/journeys';
import { isDue } from '../src/memory';
import { Num } from '../src/num';
import { setSail } from '../src/sail';
import {
  answerReview,
  buyEncounter,
  buyUpgrade,
  integrate,
  listen,
  pickUpWord,
  type Result,
} from '../src/sim';
import { view } from '../src/view';
import { initialState, type GameState } from '../src/state';
import { UNFOLD_FLAGS, unfold, type UnfoldFlag } from '../src/unfold';

/**
 * Unfolding (#31 AC6, DN7): parent §4.1's reveal flags, derived from state
 * alone, in order, each tested at the state just before it turns on and the
 * state just after. Journeys unfold with Review, and the goal with Culture
 * or once it can be met (operator, 2026-10-03).
 *
 * The course is declared here, so it is checked against the `CourseData`
 * contract rather than sharing it.
 */

const START: WallMs = wallMs(Date.UTC(2027, 0, 4));
/** The tutorial word falls due this long after pick-up (parent §4.1). */
const TUTORIAL_MS = 240_000;
/** Destination 0's goal: 10,000 Understanding and 8 words (design §5). */
const GOAL_U = 10_000;
const GOAL_WORDS = 8;

function destination(d: number): Destination {
  return {
    id: `d${String(d)}`,
    lexicon: Array.from({ length: 12 }, (_, k) => ({
      id: `d${String(d)}w${String(k)}`,
      tags: ['food'],
      cefr: 'A1' as const,
    })),
  };
}

const course: CourseData = {
  id: 'unfold-course',
  tags: ['food'],
  regions: [
    {
      id: 'r0',
      destinations: [destination(0), destination(1)],
      encounters: [{ id: 'e0', tags: ['food'], c0: 10, p0: 1 }],
      cardSets: [{ id: 's0', bonus: 0.1 }],
      cultureCards: [
        { id: 'c0', setId: 's0', tags: ['food'], bonus: 0.05, phrasePack: [] },
      ],
      grammarNodes: [],
    },
  ],
};

function ok(result: Result): GameState {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
  return result.state;
}

/** A new game holding `understanding`. */
function holding(understanding: number): GameState {
  const base = initialState(START, 1);
  return {
    ...base,
    anchor: {
      sim: simMs(0),
      understanding: Num.toTuple(Num.from(understanding)),
    },
  };
}

/** A game whose first word was picked up `ms` ago. */
function tutorialAfter(ms: number): GameState {
  return integrate(course, ok(pickUpWord(course, holding(20))), ms);
}

/** A game whose tutorial Journey left at START, `ms` later. */
function journeyAfter(ms: number): GameState {
  return integrate(
    course,
    ok(startJourney(course, holding(0), 0, 'tutorial')),
    ms,
  );
}

/** A game at destination 0 holding its 8 words and `understanding`. */
function nearGoal(understanding: number): GameState {
  let s = holding(1e6);
  for (let k = 0; k < GOAL_WORDS; k++) s = ok(pickUpWord(course, s));
  return {
    ...s,
    anchor: {
      sim: s.sim,
      understanding: Num.toTuple(Num.from(understanding)),
    },
    runSpent: Num.toTuple(Num.from(0)),
  };
}

/** A game that has sailed once, its Understanding and words reset to none. */
function sailed(): GameState {
  return {
    ...holding(0),
    destination: 1,
    reached: 1,
    stamps: 3,
    stampsEarned: 3,
  };
}

const off = (flag: UnfoldFlag, s: GameState): void => {
  expect(unfold(course, s)[flag]).toBe(false);
};
const on = (flag: UnfoldFlag, s: GameState): void => {
  expect(unfold(course, s)[flag]).toBe(true);
};

describe('the flags, in parent §4.1 order', () => {
  it('are exactly these eight, in this order', () => {
    expect(UNFOLD_FLAGS).toEqual([
      'listen',
      'encounters',
      'words',
      'review',
      'upgrades',
      'journeys',
      'culture',
      'goal',
    ]);
  });

  it('a new game shows only Listen', () => {
    expect(unfold(course, initialState(START, 1))).toEqual({
      listen: true,
      encounters: false,
      words: false,
      review: false,
      upgrades: false,
      journeys: false,
      culture: false,
      goal: false,
    });
  });

  it('view carries the flags at its own time', () => {
    const s = tutorialAfter(TUTORIAL_MS - 1);
    expect(view(course, s, s.wall).unfold.review).toBe(false);
    expect(view(course, s, wallMs(s.wall + 1)).unfold.review).toBe(true);
  });
});

/**
 * Each flag at the state just before it turns on and just after (AC6, DN7).
 * Listen has no before: it shows from the first screen (§4.1 step 1).
 */
const EDGES: readonly {
  readonly flag: UnfoldFlag;
  readonly how: string;
  readonly before: (() => GameState) | undefined;
  readonly after: () => GameState;
}[] = [
  {
    flag: 'listen',
    how: 'from the first screen',
    before: undefined,
    after: () => initialState(START, 1),
  },
  {
    flag: 'encounters',
    how: 'at 10 Understanding earned this run',
    before: () => holding(9),
    after: () => holding(10),
  },
  {
    flag: 'encounters',
    how: 'when the 10 was spent, not held',
    before: () => ({ ...holding(0), runSpent: Num.toTuple(Num.from(9)) }),
    after: () => ({ ...holding(0), runSpent: Num.toTuple(Num.from(10)) }),
  },
  {
    flag: 'encounters',
    how: 'after a sail resets the Understanding',
    before: () => holding(0),
    after: sailed,
  },
  {
    flag: 'words',
    how: 'with the first word picked up',
    before: () => holding(20),
    after: () => ok(pickUpWord(course, holding(20))),
  },
  {
    flag: 'review',
    how: 'when the tutorial word falls due',
    before: () => tutorialAfter(TUTORIAL_MS - 1),
    after: () => tutorialAfter(TUTORIAL_MS),
  },
  {
    flag: 'review',
    how: 'and stays once a word is reviewed and not due',
    before: () => tutorialAfter(TUTORIAL_MS - 1),
    after: () =>
      ok(answerReview(course, tutorialAfter(TUTORIAL_MS), 'd0w0', true)),
  },
  {
    flag: 'upgrades',
    how: 'with the first Insight',
    before: () => tutorialAfter(TUTORIAL_MS),
    after: () =>
      ok(answerReview(course, tutorialAfter(TUTORIAL_MS), 'd0w0', true)),
  },
  {
    flag: 'upgrades',
    how: 'and stays once that Insight is spent',
    before: () => holding(0),
    after: () =>
      ok(
        buyUpgrade(
          course,
          { ...holding(0), insight: Num.toTuple(Num.from(25)) },
          'journeySlot2',
        ),
      ),
  },
  {
    flag: 'upgrades',
    how: 'with the first stamp, for a player who never reviews (D1)',
    before: () => ({ ...tutorialAfter(DAY_MS), stampsEarned: 0 }),
    after: () => ({ ...tutorialAfter(DAY_MS), stampsEarned: 1 }),
  },
  {
    flag: 'journeys',
    how: 'with Review, when the tutorial word falls due',
    before: () => tutorialAfter(TUTORIAL_MS - 1),
    after: () => tutorialAfter(TUTORIAL_MS),
  },
  {
    flag: 'culture',
    how: 'when the first Journey returns',
    before: () => journeyAfter(30 * 60_000 - 1),
    after: () => journeyAfter(30 * 60_000),
  },
  {
    flag: 'culture',
    how: 'and stays once its card is collected',
    before: () => journeyAfter(30 * 60_000 - 1),
    after: () => ok(collectJourney(course, journeyAfter(30 * 60_000), 0)),
  },
  {
    flag: 'goal',
    how: 'with Culture',
    before: () => journeyAfter(30 * 60_000 - 1),
    after: () => journeyAfter(30 * 60_000),
  },
  {
    flag: 'goal',
    how: 'once the goal can be met, before any Journey',
    before: () => nearGoal(GOAL_U - 1),
    after: () => nearGoal(GOAL_U),
  },
  {
    flag: 'goal',
    how: 'after a sail',
    before: () => holding(0),
    after: sailed,
  },
];

describe('each flag just before and just after it turns on (AC6)', () => {
  for (const edge of EDGES) {
    const { before } = edge;
    if (before !== undefined)
      it(`${edge.flag} is off just before it shows ${edge.how}`, () => {
        off(edge.flag, before());
      });
    it(`${edge.flag} is on just after it shows ${edge.how}`, () => {
      on(edge.flag, edge.after());
    });
  }

  it('a Mastery replay of the first destination keeps Encounters and the goal shown', () => {
    const replaying = {
      ...holding(0),
      destination: 0,
      reached: 3,
      finale: true,
    };
    on('encounters', replaying);
    on('goal', replaying);
  });

  it('every flag has an edge that turns it on', () => {
    expect(new Set(EDGES.map((e) => e.flag))).toEqual(new Set(UNFOLD_FLAGS));
  });
});

describe('no flag ever turns off', () => {
  type Step =
    | { readonly kind: 'listen'; readonly taps: number }
    | { readonly kind: 'wait'; readonly ms: number }
    | { readonly kind: 'buy' }
    | { readonly kind: 'pickUp' }
    | { readonly kind: 'review' }
    | { readonly kind: 'start'; readonly duration: 'tutorial' | '2h' }
    | { readonly kind: 'collect' }
    | { readonly kind: 'sail' };

  const step: fc.Arbitrary<Step> = fc.oneof(
    fc.record({
      kind: fc.constant('listen'),
      taps: fc.integer({ min: 1, max: 20 }),
    }),
    fc.record({
      kind: fc.constant('wait'),
      ms: fc.integer({ min: 1, max: DAY_MS }),
    }),
    fc.constant({ kind: 'buy' } as const),
    fc.constant({ kind: 'pickUp' } as const),
    fc.constant({ kind: 'review' } as const),
    fc.record({
      kind: fc.constant('start'),
      duration: fc.constantFrom('tutorial' as const, '2h' as const),
    }),
    fc.constant({ kind: 'collect' } as const),
    fc.constant({ kind: 'sail' } as const),
  );

  /** The state after `s`, or `s` itself when the action is refused. */
  function act(s: GameState, a: Step): GameState {
    const kept = (r: Result): GameState => (r.ok ? r.state : s);
    switch (a.kind) {
      case 'listen': {
        let next = s;
        // one scenario: a burst of taps is one action.
        for (let k = 0; k < a.taps; k++) next = listen(course, next);
        return next;
      }
      case 'wait':
        return integrate(course, s, a.ms);
      case 'buy':
        return kept(buyEncounter(course, s, 'e0', 1));
      case 'pickUp':
        return kept(pickUpWord(course, s));
      case 'review': {
        const due = Object.keys(s.words).find((id) => {
          const word = s.words[id];
          return word !== undefined && isDue(word, s.wall);
        });
        return due === undefined ? s : kept(answerReview(course, s, due, true));
      }
      case 'start':
        return kept(startJourney(course, s, 0, a.duration));
      case 'collect':
        return kept(collectJourney(course, s, 0));
      case 'sail':
        return kept(setSail(course, s));
    }
  }

  /**
   * Walks in which each flag turned on, measured at seed 31 over 300 walks
   * (1,886 steps); Listen is on from the first state. Lower one only when
   * the walk is changed on purpose.
   */
  const TURNED_ON: Readonly<Record<UnfoldFlag, number>> = {
    listen: 0,
    encounters: 51,
    words: 8,
    review: 2,
    upgrades: 60,
    journeys: 2,
    culture: 46,
    goal: 60,
  };

  for (const flag of UNFOLD_FLAGS)
    it(`${flag} never turns off over seeded walks from a new game and from one near its goal`, () => {
      let turnedOn = 0;
      let stepsChecked = 0;
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.array(step, { minLength: 1, maxLength: 40 }),
          (startNearGoal, steps) => {
            let s = startNearGoal ? nearGoal(GOAL_U - 100) : holding(0);
            // one scenario: a generated walk, checked after every step.
            for (const a of steps) {
              const before = unfold(course, s)[flag];
              s = act(s, a);
              const after = unfold(course, s)[flag];
              stepsChecked += 1;
              if (before) expect(after).toBe(true);
              if (!before && after) turnedOn += 1;
            }
          },
        ),
        { seed: 31, numRuns: 300 },
      );
      expect(stepsChecked).toBeGreaterThan(1885);
      expect(turnedOn).toBeGreaterThan(TURNED_ON[flag] - 1);
    });
});

describe('the fixtures', () => {
  it('nearGoal holds the 8 words and the Understanding it is given', () => {
    const s = nearGoal(GOAL_U);
    expect(Object.keys(s.words)).toHaveLength(GOAL_WORDS);
    expect(Num.toNumber(Num.fromTuple(s.anchor.understanding))).toBe(GOAL_U);
  });

  it('the tutorial Journey returns after 30 minutes', () => {
    expect(journeyAfter(0).journeys[0]?.returnsAt).toBe(30 * 60_000);
  });
});
