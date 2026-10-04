import { describe, expect, it } from 'vitest';
import {
  BOT_EPOCH_WALL_MS,
  syntheticCourse,
} from '../fixtures/synthetic-course';
import { wallMs } from '../src/clock';
import type { Course } from '../src/course';
import { startJourney } from '../src/journeys';
import { Num } from '../src/num';
import {
  buyEncounter,
  buyGrammarNode,
  buyUpgrade,
  pickUpWord,
  type Result,
} from '../src/sim';
import { initialState, type GameState } from '../src/state';
import { view, type EncounterOffer, type UpgradeOffer } from '../src/view';

/**
 * `view.shop` (#35 AC3): every offer a UI shows, so the pacing bots read
 * nothing a player could not. Each value is checked against what the real
 * action does, never against the helper that computes it: a price is what
 * buying takes, a gain is how far buying moves `view`'s rate, and
 * `affordable` is whether the action is accepted, at the boundary itself.
 */

let built: Course | undefined;

/** The synthetic course(), built on first use rather than at collection. */
function course(): Course {
  built ??= syntheticCourse(1);
  return built;
}
const START = wallMs(BOT_EPOCH_WALL_MS);
/** The route number of region 1's first destination, where grammar and Pemandu open. */
const REGION_1 = 4;

function fresh(): GameState {
  return initialState(START, 7);
}

/** `state` holding exactly `understanding`, anchored at its simulated time. */
function holding(state: GameState, understanding: Num): GameState {
  return {
    ...state,
    anchor: { sim: state.sim, understanding: Num.toTuple(understanding) },
  };
}

function shopOf(state: GameState): ReturnType<typeof view>['shop'] {
  return view(course(), state, state.wall).shop;
}

function accepted(result: Result): GameState {
  if (!result.ok) throw new Error(JSON.stringify(result.rejection));
  return result.state;
}

function encounterOffer(state: GameState, id: string): EncounterOffer {
  const offer = shopOf(state).encounters.find((o) => o.id === id);
  if (offer === undefined) throw new Error(`no offer for ${id}`);
  return offer;
}

function upgradeOffer(state: GameState, id: string): UpgradeOffer {
  const offer = shopOf(state).upgrades.find((o) => o.id === id);
  if (offer === undefined) throw new Error(`no offer for ${id}`);
  return offer;
}

/** Just under `value`: a millionth less, far above the arithmetic's error. */
function under(value: Num): Num {
  return Num.mul(value, Num.from(1 - 1e-6));
}

/** `a` and `b` agree to 1e-9 of their size, and are not both zero. */
function expectClose(a: Num, b: Num): void {
  const scale = Math.max(Math.abs(Num.toNumber(a)), Math.abs(Num.toNumber(b)));
  expect(scale).toBeGreaterThan(0);
  expect(Math.abs(Num.toNumber(Num.sub(a, b)))).toBeLessThanOrEqual(
    scale * 1e-9,
  );
}

/** A new game owning() five of region 0's six Encounters. */
function owning(): GameState {
  return {
    ...fresh(),
    owned: { 'r0-e0': 5, 'r0-e1': 3, 'r0-e2': 9, 'r0-e3': 1, 'r0-e4': 2 },
  };
}

describe('the shop lists the Encounters of the regions reached', () => {
  it('offers region 0’s six on a new game, in course order', () => {
    expect(shopOf(fresh()).encounters.map((o) => o.id)).toEqual([
      'r0-e0',
      'r0-e1',
      'r0-e2',
      'r0-e3',
      'r0-e4',
      'r0-e5',
    ]);
  });

  it('adds region 1’s six once region 1 is reached, each with its region', () => {
    const offers = shopOf({ ...fresh(), reached: REGION_1 }).encounters;
    expect(offers.map((o) => `${String(o.region)}:${o.id}`)).toEqual([
      '0:r0-e0',
      '0:r0-e1',
      '0:r0-e2',
      '0:r0-e3',
      '0:r0-e4',
      '0:r0-e5',
      '1:r1-e0',
      '1:r1-e1',
      '1:r1-e2',
      '1:r1-e3',
      '1:r1-e4',
      '1:r1-e5',
    ]);
  });

  it('shows how many of each are owned', () => {
    expect(shopOf(owning()).encounters.map((o) => o.owned)).toEqual([
      5, 3, 9, 1, 2, 0,
    ]);
  });
});

describe('an Encounter offer matches buying one', () => {
  it('prices one more at exactly what buying it takes', () => {
    const { price } = encounterOffer(owning(), 'r0-e1');
    const bought = accepted(
      buyEncounter(course(), holding(owning(), price), 'r0-e1', 1),
    );
    expect(
      Num.toTuple(view(course(), bought, bought.wall).understanding),
    ).toEqual(Num.toTuple(Num.from(0)));
  });

  it('is affordable holding exactly its price', () => {
    const { price } = encounterOffer(owning(), 'r0-e1');
    expect(encounterOffer(holding(owning(), price), 'r0-e1').affordable).toBe(
      true,
    );
  });

  it('is unaffordable holding just under its price, as buying is refused', () => {
    const { price } = encounterOffer(owning(), 'r0-e1');
    const short = holding(owning(), under(price));
    expect(encounterOffer(short, 'r0-e1').affordable).toBe(false);
    expect(buyEncounter(course(), short, 'r0-e1', 1).ok).toBe(false);
  });

  it('adds to the rate exactly what buying one adds to view’s rate', () => {
    const rich = holding(owning(), Num.from(1e30));
    const { gain } = encounterOffer(rich, 'r0-e2');
    const bought = accepted(buyEncounter(course(), rich, 'r0-e2', 1));
    expectClose(
      gain,
      Num.sub(
        view(course(), bought, bought.wall).rate,
        view(course(), rich, rich.wall).rate,
      ),
    );
  });
});

describe('the pick-up offer matches picking a word up', () => {
  it('prices the next pick-up at exactly what picking it up takes', () => {
    const offer = shopOf(owning()).pickUp;
    if (offer === undefined) throw new Error('no pick-up offered');
    const picked = accepted(
      pickUpWord(course(), holding(owning(), offer.cost)),
    );
    expect(
      Num.toTuple(view(course(), picked, picked.wall).understanding),
    ).toEqual(Num.toTuple(Num.from(0)));
  });

  it('is affordable holding exactly its cost', () => {
    const cost = shopOf(owning()).pickUp?.cost ?? Num.from(Infinity);
    expect(shopOf(holding(owning(), cost)).pickUp?.affordable).toBe(true);
  });

  it('is unaffordable holding just under its cost, as picking up is refused', () => {
    const cost = shopOf(owning()).pickUp?.cost ?? Num.from(Infinity);
    const short = holding(owning(), under(cost));
    expect(shopOf(short).pickUp?.affordable).toBe(false);
    expect(pickUpWord(course(), short).ok).toBe(false);
  });

  it('adds to the rate exactly what picking the word up adds to view’s rate', () => {
    const everyTag: GameState = {
      ...owning(),
      owned: { ...owning().owned, 'r0-e5': 4 },
    };
    const rich = holding(everyTag, Num.from(1e30));
    const offer = shopOf(rich).pickUp;
    if (offer === undefined) throw new Error('no pick-up offered');
    const picked = accepted(pickUpWord(course(), rich));
    expectClose(
      offer.gain,
      Num.sub(
        view(course(), picked, picked.wall).rate,
        view(course(), rich, rich.wall).rate,
      ),
    );
  });

  it('is absent once the pool is empty', () => {
    let state = holding(owning(), Num.from(1e300));
    // one scenario: picking up every word of the pool is one player's
    // journey to an empty pool.
    for (let n = 0; n < 1000; n += 1) {
      const next = pickUpWord(course(), state);
      if (!next.ok) break;
      state = next.state;
    }
    expect(pickUpWord(course(), state)).toEqual({
      ok: false,
      rejection: { kind: 'poolEmpty' },
    });
    // Destination 0's lexicon in the synthetic course: the pool was walked.
    expect(Object.keys(state.words)).toHaveLength(38);
    expect(shopOf(state).pickUp).toBeUndefined();
  });
});

describe('the upgrade offers match buying an upgrade', () => {
  it('lists the catalogue in order, each at its level', () => {
    const offers = shopOf({ ...fresh(), upgrades: { offlineCap: 1 } }).upgrades;
    expect(offers.map((o) => `${o.id}@${String(o.level)}`)).toEqual([
      'journeySlot2@0',
      'journeySlot3@0',
      'offlineCap@1',
      'phrasebook:food@0',
      'phrasebook:transport@0',
      'phrasebook:greetings@0',
      'phrasebook:market@0',
      'phrasebook:family@0',
      'phrasebook:numbers@0',
      'phrasebook:ceremony@0',
      'phrasebook:weather@0',
      'phrasebook:work@0',
      'phrasebook:travel@0',
      'pemanduFaster1@0',
      'pemanduFaster2@0',
      'pemanduFaster3@0',
      'startingUnderstanding@0',
      'encounterDiscount@0',
      'journeyCut@0',
      'pemanduEarly@0',
    ]);
  });

  it('shows each upgrade’s currency', () => {
    const currencies = shopOf(fresh()).upgrades.map((o) => o.currency);
    expect(currencies.filter((c) => c === 'insight')).toHaveLength(16);
    expect(currencies.filter((c) => c === 'stamps')).toHaveLength(4);
  });

  it('prices an Insight upgrade’s next level at exactly what buying it takes', () => {
    const level1: GameState = { ...fresh(), upgrades: { offlineCap: 1 } };
    const { cost } = upgradeOffer(level1, 'offlineCap');
    if (cost === undefined) throw new Error('offlineCap shows no cost');
    const bought = accepted(
      buyUpgrade(
        course(),
        { ...level1, insight: Num.toTuple(cost) },
        'offlineCap',
      ),
    );
    expect(bought.insight).toEqual(Num.toTuple(Num.from(0)));
    expect(bought.upgrades.offlineCap).toBe(2);
  });

  it('is affordable holding exactly its cost, and not one Insight under', () => {
    const { cost } = upgradeOffer(fresh(), 'journeySlot2');
    if (cost === undefined) throw new Error('journeySlot2 shows no cost');
    const exact = { ...fresh(), insight: Num.toTuple(cost) };
    const short = {
      ...fresh(),
      insight: Num.toTuple(Num.sub(cost, Num.from(1))),
    };
    expect(upgradeOffer(exact, 'journeySlot2').affordable).toBe(true);
    expect(upgradeOffer(short, 'journeySlot2').affordable).toBe(false);
    expect(buyUpgrade(course(), short, 'journeySlot2').ok).toBe(false);
  });

  it('judges a stamps upgrade by the stamps held', () => {
    const { cost } = upgradeOffer(fresh(), 'startingUnderstanding');
    if (cost === undefined)
      throw new Error('startingUnderstanding shows no cost');
    const stamps = Num.toNumber(cost);
    const exact = { ...fresh(), stamps };
    const short = { ...fresh(), stamps: stamps - 1 };
    expect(upgradeOffer(exact, 'startingUnderstanding').affordable).toBe(true);
    expect(buyUpgrade(course(), exact, 'startingUnderstanding').ok).toBe(true);
    expect(upgradeOffer(short, 'startingUnderstanding').affordable).toBe(false);
  });

  it('shows no cost at the last level, and is not affordable', () => {
    const maxed = {
      ...fresh(),
      upgrades: { offlineCap: 2 },
      insight: Num.toTuple(Num.from(1e30)),
    };
    const offer = upgradeOffer(maxed, 'offlineCap');
    expect(offer.cost).toBeUndefined();
    expect(offer.affordable).toBe(false);
    expect(buyUpgrade(course(), maxed, 'offlineCap').ok).toBe(false);
  });

  it('is not affordable while its prerequisite is missing, however much is held', () => {
    const rich = { ...fresh(), insight: Num.toTuple(Num.from(1e30)) };
    expect(upgradeOffer(rich, 'journeySlot3').affordable).toBe(false);
    expect(buyUpgrade(course(), rich, 'journeySlot3').ok).toBe(false);
  });
});

/** A new game at region 1's first destination, where grammar opens. */
function opened(): GameState {
  return { ...fresh(), reached: REGION_1 };
}

describe('the grammar offers match buying a node', () => {
  it('lists every node not yet owned, in course order', () => {
    const offers = shopOf({
      ...opened(),
      grammar: ['r0-gram-1', 'r1-gram-3'],
    }).grammar;
    expect(offers.map((o) => `${String(o.region)}:${o.id}`)).toEqual([
      '0:r0-gram-0',
      '0:r0-gram-2',
      '0:r0-gram-3',
      '1:r1-gram-0',
      '1:r1-gram-1',
      '1:r1-gram-2',
      '2:r2-gram-0',
      '2:r2-gram-1',
      '2:r2-gram-2',
      '2:r2-gram-3',
    ]);
  });

  it('prices a node at exactly what buying it takes', () => {
    const offer = shopOf(opened()).grammar.find((o) => o.id === 'r0-gram-0');
    if (offer === undefined) throw new Error('no offer for r0-gram-0');
    const bought = accepted(
      buyGrammarNode(
        course(),
        { ...opened(), insight: Num.toTuple(offer.cost) },
        'r0-gram-0',
      ),
    );
    expect(bought.insight).toEqual(Num.toTuple(Num.from(0)));
  });

  it('is affordable holding exactly its cost, and not just under', () => {
    const cost =
      shopOf(opened()).grammar.find((o) => o.id === 'r1-gram-0')?.cost ??
      Num.from(Infinity);
    const exact = { ...opened(), insight: Num.toTuple(cost) };
    const short = { ...opened(), insight: Num.toTuple(under(cost)) };
    const affordable = (s: GameState) =>
      shopOf(s).grammar.find((o) => o.id === 'r1-gram-0')?.affordable;
    expect(affordable(exact)).toBe(true);
    expect(affordable(short)).toBe(false);
    expect(buyGrammarNode(course(), short, 'r1-gram-0').ok).toBe(false);
  });

  it('is not affordable before grammar opens, however much Insight is held', () => {
    const rich = { ...fresh(), insight: Num.toTuple(Num.from(1e30)) };
    expect(shopOf(rich).grammar.filter((o) => o.affordable)).toEqual([]);
    expect(shopOf(rich).grammar).toHaveLength(12);
    expect(buyGrammarNode(course(), rich, 'r0-gram-0').ok).toBe(false);
  });

  it('is not affordable for a region not reached', () => {
    const rich = { ...opened(), insight: Num.toTuple(Num.from(1e30)) };
    const offer = shopOf(rich).grammar.find((o) => o.id === 'r2-gram-0');
    expect(offer?.affordable).toBe(false);
    expect(buyGrammarNode(course(), rich, 'r2-gram-0').ok).toBe(false);
  });
});

describe('the Journey offers match starting a Journey', () => {
  it('shows every slot’s status', () => {
    expect(shopOf(fresh()).journeys.slots).toEqual([
      'empty',
      'locked',
      'locked',
    ]);
  });

  it('offers every duration on a new game, the tutorial first', () => {
    expect(shopOf(fresh()).journeys.startable.map((o) => o.durationId)).toEqual(
      ['tutorial', '2h', '4h', '8h', '24h'],
    );
  });

  it('no longer offers the tutorial once it has been used', () => {
    const used = { ...fresh(), tutorialJourneyUsed: true };
    expect(shopOf(used).journeys.startable.map((o) => o.durationId)).toEqual([
      '2h',
      '4h',
      '8h',
      '24h',
    ]);
  });

  it('offers nothing while every open slot is busy', () => {
    const away = accepted(startJourney(course(), fresh(), 0, '8h'));
    expect(shopOf(away).journeys.slots).toEqual(['away', 'locked', 'locked']);
    expect(shopOf(away).journeys.startable).toEqual([]);
  });

  it('states how long each Journey takes, as starting one schedules it', () => {
    const offer = shopOf(fresh()).journeys.startable.find(
      (o) => o.durationId === '4h',
    );
    if (offer === undefined) throw new Error('no 4h offer');
    const away = accepted(startJourney(course(), fresh(), 0, '4h'));
    expect(away.journeys[0]?.returnsAt).toBe(away.sim + offer.durationMs);
    expect(offer.durationMs).toBe(4 * 3_600_000);
  });
});

describe('the shop shows Pemandu', () => {
  it('shows it closed and off on a new game', () => {
    expect(shopOf(fresh()).pemandu).toEqual({
      opened: false,
      enabled: false,
      intervalMs: 10_000,
      owned: [10_000],
    });
  });

  it('shows its setting and the intervals owned once it opens', () => {
    const on: GameState = {
      ...fresh(),
      reached: REGION_1,
      upgrades: { pemanduFaster1: 1 },
      automation: { enabled: true, intervalMs: 5_000 },
    };
    expect(shopOf(on).pemandu).toEqual({
      opened: true,
      enabled: true,
      intervalMs: 5_000,
      owned: [10_000, 5_000],
    });
  });
});

describe('reading the shop', () => {
  it('changes nothing in the state', () => {
    const state = holding(owning(), Num.from(1e12));
    const before = JSON.stringify(state);
    shopOf(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});
