import { describe, expect, it } from 'vitest';
import { HOUR_MS, wallMs, type WallMs } from '../src/clock';
import type {
  Course,
  Destination,
  GrammarNode,
  LexiconItem,
  Region,
} from '../src/course';
import {
  grammarNodeCost,
  ownedGrammarNodes,
  rootFactors,
} from '../src/grammar';
import { newWordMemory } from '../src/memory';
import { Num, type NumTuple } from '../src/num';
import { rateBreakdown, understandingNow } from '../src/production';
import {
  buyGrammarNode,
  integrate,
  pickUpWord,
  type Rejection,
  type Result,
} from '../src/sim';
import { view } from '../src/view';
import { initialState, type GameState } from '../src/state';
import { lexiconItem, pickUpPool } from '../src/words';

/**
 * Grammar nodes (#32 AC1 to AC4): buying one, the words it multiplies, the
 * derived words it teaches, its breakdown line, and that a sail keeps it.
 *
 * The course is declared here, so it is checked against the `Course`
 * contract rather than sharing it. The cost curve is written out as literals
 * (50 x 1.5^n Insight, open from region 2), so a change to `BALANCE.grammar`
 * fails here as well as in its own pin.
 */

const START: WallMs = wallMs(Date.UTC(2027, 0, 4));

function word(
  id: string,
  tags: readonly string[],
  cefr: LexiconItem['cefr'],
  root?: string,
): LexiconItem {
  return { id, tags, cefr, ...(root === undefined ? {} : { root }) };
}

/** Region 1's first destination holds the roots; every other one is filler. */
function destination(r: number, d: number): Destination {
  const id = `r${String(r)}-d${String(d)}`;
  if (r === 0 && d === 0) {
    return {
      id,
      lexicon: [
        word('ajar', ['food'], 'A1', 'ajar'),
        word('makan', ['food'], 'A1', 'makan'),
        word('teh', ['food'], 'A1'),
        word('jalan', ['travel'], 'A1', 'jalan'),
      ],
    };
  }
  return {
    id,
    lexicon: [0, 1, 2].map((k) => word(`${id}-w${String(k)}`, ['food'], 'A1')),
  };
}

/** ber- and me- in region 1, di- in region 2, -kan in region 3. */
const NODES: readonly (readonly GrammarNode[])[] = [
  [
    {
      id: 'ber-',
      roots: ['ajar'],
      derived: [word('belajar', ['food'], 'A2', 'ajar')],
    },
    {
      id: 'me-',
      roots: ['ajar', 'makan'],
      derived: [
        word('mengajar', ['food'], 'A1', 'ajar'),
        word('memakan', ['food'], 'B1', 'makan'),
      ],
    },
  ],
  [
    {
      id: 'di-',
      roots: ['makan'],
      derived: [word('dimakan', ['travel'], 'A1', 'makan')],
    },
  ],
  [
    {
      id: '-kan',
      roots: ['jalan'],
      derived: [word('jalankan', ['travel'], 'A2', 'jalan')],
    },
  ],
];

function region(r: number): Region {
  return {
    id: `r${String(r)}`,
    destinations: [0, 1, 2, 3].map((d) => destination(r, d)),
    encounters: [
      { id: `food${String(r)}`, tags: ['food'], c0: 10, p0: 1 },
      { id: `travel${String(r)}`, tags: ['travel'], c0: 10, p0: 1 },
    ],
    cardSets: [],
    cultureCards: [],
    grammarNodes: NODES[r] ?? [],
  };
}

const course: Course = {
  id: 'grammar-course',
  tags: ['food', 'travel'],
  regions: [region(0), region(1), region(2)],
};

function tuple(x: number): NumTuple {
  return Num.toTuple(Num.from(x));
}

/**
 * A state at destination `at` (4 per region: 4 is region 2's first), having
 * reached it, holding `insight`, owning `grammar`, with one of each region-1
 * Encounter producing for an hour.
 */
function stateAt(
  at: number,
  insight: number,
  grammar: readonly string[] = [],
): GameState {
  const base = initialState(START, 1);
  return integrate(
    course,
    {
      ...base,
      destination: at,
      reached: at,
      insight: tuple(insight),
      grammar,
      owned: { food0: 1, travel0: 1 },
    },
    HOUR_MS,
  );
}

function ok(result: Result): GameState {
  if (!result.ok) throw new Error(`rejected: ${result.rejection.kind}`);
  return result.state;
}

function rejected(result: Result): Rejection {
  if (result.ok) throw new Error('expected a rejection');
  return result.rejection;
}

describe('grammarNodeCost (#32 AC1)', () => {
  it.each([
    [0, 50],
    [1, 75],
    [2, 112.5],
    [3, 168.75],
  ])('costs %i owned -> %d Insight', (owned, cost) => {
    expect(Num.toNumber(grammarNodeCost(owned))).toBe(cost);
  });

  it.each([-1, 1.5, Number.NaN])('refuses %s nodes owned', (owned) => {
    expect(() => grammarNodeCost(owned)).toThrow(
      /owned must be a safe non-negative integer/,
    );
  });
});

describe('buyGrammarNode (#32 AC1)', () => {
  it('buys a region-1 node at region 2, paying 50 Insight', () => {
    const s = stateAt(4, 60);
    const out = ok(buyGrammarNode(course, s, 'ber-'));
    expect(out.grammar).toEqual(['ber-']);
    expect(Num.toNumber(Num.fromTuple(out.insight))).toBe(10);
  });

  it('buys a region-2 node at region 2', () => {
    expect(ok(buyGrammarNode(course, stateAt(4, 60), 'di-')).grammar).toEqual([
      'di-',
    ]);
  });

  it('prices the next node by the nodes owned: the second costs 75', () => {
    const out = ok(buyGrammarNode(course, stateAt(4, 80, ['ber-']), 'me-'));
    expect(out.grammar).toEqual(['ber-', 'me-']);
    expect(Num.toNumber(Num.fromTuple(out.insight))).toBe(5);
  });

  it('buys with exactly the cost held', () => {
    const out = ok(buyGrammarNode(course, stateAt(4, 50), 'ber-'));
    expect(out.insight).toEqual(tuple(0));
  });

  it('banks production up to the purchase at the rates before it', () => {
    const s = stateAt(4, 60);
    const out = ok(buyGrammarNode(course, s, 'ber-'));
    expect(out.anchor).toEqual({
      sim: s.sim,
      understanding: Num.toTuple(understandingNow(course, s)),
    });
    // Liveness: an hour of two Encounters produced something to bank.
    expect(Num.toNumber(understandingNow(course, s))).toBeGreaterThan(0);
  });

  it('changes only the anchor, Insight and grammar', () => {
    const s = stateAt(4, 60);
    const out = ok(buyGrammarNode(course, s, 'ber-'));
    const changed = ['anchor', 'insight', 'grammar'];
    const kept = Object.keys(s).filter((k) => !changed.includes(k));
    // Measured 18 of the state's 21 keys at #32.
    expect(kept.length).toBeGreaterThan(17);
    expect(
      Object.fromEntries(kept.map((k) => [k, out[k as keyof GameState]])),
    ).toEqual(
      Object.fromEntries(kept.map((k) => [k, s[k as keyof GameState]])),
    );
  });

  it('refuses a node the course does not have', () => {
    expect(rejected(buyGrammarNode(course, stateAt(4, 60), 'pe-an'))).toEqual({
      kind: 'unknownGrammarNode',
      id: 'pe-an',
    });
  });

  it('refuses an inherited property name as a node id', () => {
    expect(
      rejected(buyGrammarNode(course, stateAt(4, 60), 'constructor')),
    ).toEqual({ kind: 'unknownGrammarNode', id: 'constructor' });
  });

  it('refuses a node already owned', () => {
    expect(
      rejected(buyGrammarNode(course, stateAt(4, 600, ['ber-']), 'ber-')),
    ).toEqual({ kind: 'grammarNodeOwned', id: 'ber-' });
  });

  it('refuses every node in region 1: grammar opens at region 2', () => {
    expect(rejected(buyGrammarNode(course, stateAt(3, 60), 'ber-'))).toEqual({
      kind: 'grammarNodeLocked',
      id: 'ber-',
      region: 0,
      regionsReached: 1,
    });
  });

  it('refuses a node whose own region is not reached', () => {
    expect(rejected(buyGrammarNode(course, stateAt(7, 60), '-kan'))).toEqual({
      kind: 'grammarNodeLocked',
      id: '-kan',
      region: 2,
      regionsReached: 2,
    });
  });

  it('buys a region-3 node once region 3 is reached', () => {
    expect(ok(buyGrammarNode(course, stateAt(8, 60), '-kan')).grammar).toEqual([
      '-kan',
    ]);
  });

  it('refuses a node the player cannot pay for, naming cost and Insight', () => {
    expect(
      rejected(buyGrammarNode(course, stateAt(4, 74, ['ber-']), 'me-')),
    ).toEqual({
      kind: 'grammarNodeUnaffordable',
      id: 'me-',
      cost: tuple(75),
      held: tuple(74),
    });
  });

  // Each row names its state's destination and grammar; the test builds it,
  // so a throwing setup fails that test by name, never the file (#97).
  it.each<[string, number, readonly string[], string, Rejection['kind']]>([
    ['owned before locked', 3, ['ber-'], 'ber-', 'grammarNodeOwned'],
    ['owned before unaffordable', 4, ['ber-'], 'ber-', 'grammarNodeOwned'],
    ['locked before unaffordable', 3, [], 'me-', 'grammarNodeLocked'],
  ])('checks %s', (_, at, grammar, id, kind) => {
    expect(
      rejected(buyGrammarNode(course, stateAt(at, 0, grammar), id)).kind,
    ).toBe(kind);
  });
});

/**
 * Every word below is held unreviewed, so its mean R is 0 and its bonus is
 * heard's 0.04 x the floor share 0.8 = 0.032 (parent §3.3, as tuned in #35).
 * Region 1's first destination holds ajar, makan and teh on food and jalan on
 * travel, so a food Encounter's words line is 1 + 3 x 0.032 = 1.096 and
 * travel's is 1.032.
 */
function holding(grammar: readonly string[]): GameState {
  const s = stateAt(4, 0, grammar);
  return {
    ...s,
    words: Object.fromEntries(
      ['ajar', 'makan', 'teh', 'jalan'].map((id) => [id, newWordMemory(START)]),
    ),
  };
}

/** Encounter `id`'s lines as [name, value] pairs. */
function linesOf(s: GameState, id: string): [string, number][] {
  const rate = rateBreakdown(course, s, s.sim).find((e) => e.id === id);
  if (rate === undefined) throw new Error(`${id} is not owned`);
  return rate.lines.map((l) => [l.name, Num.toNumber(l.factor)]);
}

function line(s: GameState, id: string, name: string): number | undefined {
  return linesOf(s, id).find(([n]) => n === name)?.[1];
}

describe('the grammar multiplier (#32 AC2)', () => {
  it.each<[string, readonly string[], number]>([
    // ajar x 1.5: (1 + 0.048 + 0.032 + 0.032) / 1.096
    ['ber- multiplies ajar alone', ['ber-'], 1.112 / 1.096],
    // ajar and makan x 1.5: (1 + 0.048 + 0.048 + 0.032) / 1.096
    ['me- multiplies ajar and makan', ['me-'], 1.128 / 1.096],
    // makan x 1.5, from a region-2 node
    ['di- multiplies makan alone', ['di-'], 1.112 / 1.096],
    // ajar x 1.5 x 1.5 and makan x 1.5: (1 + 0.072 + 0.048 + 0.032) / 1.096
    ['ber- and me- compound on ajar', ['ber-', 'me-'], 1.152 / 1.096],
  ])('%s on a food Encounter', (_, grammar, want) => {
    expect(line(holding(grammar), 'food0', 'grammar')).toBeCloseTo(want, 12);
  });

  it.each<[string, readonly string[]]>([
    ['nothing owned', []],
    ['ber-', ['ber-']],
    ['ber- and me-', ['ber-', 'me-']],
  ])('leaves the words line at 1.096 with %s', (_, grammar) => {
    expect(line(holding(grammar), 'food0', 'words')).toBeCloseTo(1.096, 12);
  });

  it('leaves an Encounter whose words no owned node covers unchanged: no grammar line', () => {
    // jalan, travel's only word, has no node at region 2.
    const s = holding(['ber-', 'me-', 'di-']);
    expect(line(s, 'travel0', 'grammar')).toBeUndefined();
    expect(line(s, 'travel0', 'words')).toBeCloseTo(1.032, 12);
    // Liveness: the travel Encounter is in the breakdown.
    expect(linesOf(s, 'travel0').length).toBeGreaterThan(2);
  });

  it('shows no grammar line before a node is owned', () => {
    expect(line(holding([]), 'food0', 'grammar')).toBeUndefined();
    expect(line(holding([]), 'food0', 'words')).toBeCloseTo(1.096, 12);
  });

  it('pays the multiplied rate: words x grammar is 1 + the multiplied bonuses', () => {
    const s = holding(['ber-', 'me-']);
    const lines = linesOf(s, 'food0');
    const product = lines.reduce((p, [, v]) => p * v, 1);
    const rate = rateBreakdown(course, s, s.sim).find((e) => e.id === 'food0');
    expect(Num.toNumber(rate?.rate ?? Num.from(0))).toBeCloseTo(product, 12);
    // 1 food0 at p0 = 1, no milestone, no stamps: the rate is 1.152.
    expect(Num.toNumber(rate?.rate ?? Num.from(0))).toBeCloseTo(1.152, 12);
  });
});

describe('rootFactors (#32 AC2)', () => {
  it('gives each covered root 1.5 per owned node on it', () => {
    expect(rootFactors(course, holding(['ber-', 'me-']))).toEqual(
      new Map([
        ['ajar', 2.25],
        ['makan', 1.5],
      ]),
    );
  });

  it('is empty with no node owned', () => {
    expect(rootFactors(course, holding([])).size).toBe(0);
  });

  it('refuses an owned node the course does not have', () => {
    expect(() => rootFactors(course, holding(['pe-an']))).toThrow(
      /grammar node pe-an is not in course grammar-course/,
    );
  });
});

describe('the grammar breakdown line (#32 AC4, DN6)', () => {
  it('names grammar after words and before stamps', () => {
    expect(linesOf(holding(['ber-']), 'food0').map(([n]) => n)).toEqual([
      'encounters',
      'milestones',
      'words',
      'grammar',
      'stamps',
    ]);
  });

  it('reaches the player through view', () => {
    const s = holding(['ber-']);
    const food = view(course, s, s.wall).breakdown.find(
      (e) => e.id === 'food0',
    );
    expect(food?.lines.map((l) => l.name)).toContain('grammar');
  });
});

/** Region 2's first destination's lexicon: three A1 filler words. */
const REGION_2_LEXICON = ['r1-d0-w0', 'r1-d0-w1', 'r1-d0-w2'];

/** At region 2's first destination with its lexicon held, owning `grammar`. */
function lexiconDone(grammar: readonly string[]): GameState {
  const s = stateAt(4, 0, grammar);
  return {
    ...s,
    words: Object.fromEntries(
      REGION_2_LEXICON.map((id) => [id, newWordMemory(START)]),
    ),
  };
}

function poolIds(s: GameState): string[] {
  return pickUpPool(
    course.regions[1]?.destinations[0],
    [],
    ownedGrammarNodes(course, s),
  ).map((w) => w.id);
}

describe('derived words (#32 AC3)', () => {
  it('lists the owned nodes in course order, not the order bought', () => {
    expect(
      ownedGrammarNodes(course, stateAt(4, 0, ['di-', 'me-', 'ber-'])).map(
        (n) => n.id,
      ),
    ).toEqual(['ber-', 'me-', 'di-']);
  });

  it("adds the owned nodes' derived words to the pool, in curriculum order", () => {
    // Bought di- first, but A1 lists me-'s mengajar before di-'s dimakan,
    // in course order; then A2 belajar, then B1 memakan.
    expect(poolIds(stateAt(4, 0, ['di-', 'me-', 'ber-']))).toEqual([
      ...REGION_2_LEXICON,
      'mengajar',
      'dimakan',
      'belajar',
      'memakan',
    ]);
  });

  it('adds no derived word without a node', () => {
    expect(poolIds(stateAt(4, 0))).toEqual(REGION_2_LEXICON);
  });

  it('puts derived words after the card packs at one CEFR level', () => {
    const pack = { id: 'pack-a1', tags: ['food'], cefr: 'A1' as const };
    const pool = pickUpPool(
      course.regions[1]?.destinations[0],
      [
        {
          id: 'card',
          setId: 'set',
          tags: ['food'],
          bonus: 0.05,
          phrasePack: [pack],
        },
      ],
      ownedGrammarNodes(course, stateAt(4, 0, ['di-'])),
    );
    expect(pool.map((w) => w.id)).toEqual([
      ...REGION_2_LEXICON,
      'pack-a1',
      'dimakan',
    ]);
  });

  it('picks up a derived word once the lexicon is held', () => {
    const out = ok(pickUpWord(course, lexiconDone(['ber-'])));
    expect(Object.keys(out.words)).toEqual([...REGION_2_LEXICON, 'belajar']);
  });

  it('finds the pool empty with the lexicon held and no node owned', () => {
    expect(rejected(pickUpWord(course, lexiconDone([])))).toEqual({
      kind: 'poolEmpty',
    });
  });

  it("prices a derived word by the pool's words held: the fourth costs 20 x 1.15^3", () => {
    const s = lexiconDone(['ber-']);
    const out = ok(pickUpWord(course, s));
    const paid =
      Num.toNumber(understandingNow(course, s)) -
      Num.toNumber(Num.fromTuple(out.anchor.understanding));
    expect(paid).toBeCloseTo(20 * 1.15 ** 3, 9);
  });

  it('knows a derived word as a lexicon item', () => {
    expect(lexiconItem(course, 'dimakan')).toEqual({
      id: 'dimakan',
      tags: ['travel'],
      cefr: 'A1',
      root: 'makan',
    });
  });

  it('pays a held derived word on its tags, multiplied by its node', () => {
    // dimakan alone on travel, root makan, with di- owned: 1 + 0.032 x 1.5.
    const s = {
      ...stateAt(4, 0, ['di-']),
      words: { dimakan: newWordMemory(START) },
    };
    expect(line(s, 'travel0', 'words')).toBeCloseTo(1.032, 12);
    expect(line(s, 'travel0', 'grammar')).toBeCloseTo(1.048 / 1.032, 12);
  });
});
