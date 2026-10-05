import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
  bestPayback,
  initialState,
  Num,
  pickUpWord,
  upgradeCatalogue,
  view,
  wallMs,
  type Course,
  type GameEvent,
  type GameState,
} from '@yawelo-idle/core';
import {
  BOT_EPOCH_WALL_MS,
  syntheticCourse,
} from '@yawelo-idle/core/fixtures/synthetic-course';
import { Player, STEP_MS } from '../src/player';
import { persona } from '../src/personas';
import { QUICK_RETURN_MS } from '../src/schedule';
import { Streams } from '../src/streams';

/**
 * The policy (#35 AC3, M1 design §6): what a persona does at an open,
 * decided from `view` alone and sent through `apply`.
 */

const HOUR_MS = 3_600_000;
const FIRST_OPEN = BOT_EPOCH_WALL_MS + 8 * HOUR_MS;
/** The route number of region 1's first destination, where Pemandu opens. */
const REGION_1 = 4;
/** An open long enough for its opening actions and exactly one check. */
const ONE_CHECK = 25_000;

let built: Course | undefined;
function course(): Course {
  built ??= syntheticCourse(1);
  return built;
}

function fresh(): GameState {
  return initialState(wallMs(FIRST_OPEN), 35);
}

/** `state` holding exactly `understanding`, anchored at its simulated time. */
function holding(state: GameState, understanding: number): GameState {
  return {
    ...state,
    anchor: {
      sim: state.sim,
      understanding: Num.toTuple(Num.from(understanding)),
    },
    runSpent: Num.toTuple(Num.from(0)),
  };
}

/** `state` with `n` words of the pool picked up, due at once. */
function withWords(state: GameState, n: number): GameState {
  let s = holding(state, 1e30);
  // one scenario: picking up n words is one player's run of pick-ups.
  for (let k = 0; k < n; k += 1) {
    const r = pickUpWord(course(), s);
    if (!r.ok) throw new Error(JSON.stringify(r.rejection));
    s = r.state;
  }
  return s;
}

/** Play one open of `lengthMs` on `state` as `name`; every accepted event, in order. */
function play(
  name: string,
  state: GameState,
  lengthMs: number,
  nextOpenMs: number = state.wall + 8 * HOUR_MS,
): { events: GameEvent[]; player: Player; decision: boolean } {
  const events: GameEvent[] = [];
  const p = persona(name);
  const player = new Player(course(), p, state, new Streams(p.seed), {
    applied: (event) => events.push(event),
  });
  const decision = player.open(state.wall, lengthMs, nextOpenMs);
  return { events, player, decision };
}

/** An Idler's player on a state with nothing affordable, due, free or available. */
function idlePlayer(
  change: (idle: GameState) => Partial<GameState> = () => ({}),
): Player {
  const away = play('casual', fresh(), ONE_CHECK).player.state;
  const base: GameState = {
    ...holding(away, 0),
    owned: {},
    wall: wallMs(away.wall + 60_000),
  };
  const idle: GameState = { ...base, ...change(base) };
  const p = persona('idler');
  return new Player(course(), p, idle, new Streams(p.seed));
}

/** What the shop offered just after the open's last action, before the clock moved on. */
function shopAfter(player: Player, events: readonly GameEvent[]) {
  const last = events.at(-1);
  if (last === undefined) throw new Error('the open sent nothing');
  return view(course(), player.state, wallMs(last.wallMs + STEP_MS)).shop;
}

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const buys = (events: readonly GameEvent[]) =>
  events.filter((e) => e.type === 'buyEncounter' || e.type === 'pickUpWord');

describe('the player reads nothing but view (AC3)', () => {
  /** The value imports of a bots module, by module specifier. */
  function valueImports(file: string): Record<string, string[]> {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.ES2022,
    );
    const found: Record<string, string[]> = {};
    // runtime population: the import declarations the module holds.
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const from = (statement.moduleSpecifier as ts.StringLiteral).text;
      const clause = statement.importClause;
      if (
        clause === undefined ||
        clause.phaseModifier === ts.SyntaxKind.TypeKeyword
      )
        continue;
      const bindings = clause.namedBindings;
      if (bindings === undefined || !ts.isNamedImports(bindings)) {
        throw new Error(`${file}: an import from ${from} is not named`);
      }
      found[from] = bindings.elements
        .filter((e) => !e.isTypeOnly)
        .map((e) => e.name.text)
        .sort();
    }
    return found;
  }

  it('the player imports from core only apply, view and what they take', () => {
    expect(valueImports('packages/bots/src/player.ts')).toEqual({
      '@yawelo-idle/core': ['Num', 'PROMPT_TYPES', 'apply', 'view', 'wallMs'],
    });
  });

  it('the run starts the game and reads the state only to measure, through view for when each goal was reached', () => {
    expect(valueImports('packages/bots/src/run.ts')).toEqual({
      '@yawelo-idle/core': ['Num', 'initialState', 'view', 'wallMs'],
      './player': ['Player'],
      './schedule': ['DAY_MS', 'QUICK_RETURN_MS', 'WAKE_MS', 'dayOpens'],
      './streams': ['Streams'],
    });
  });
});

describe('an open', () => {
  it('starts with resume', () => {
    expect(play('casual', fresh(), 60_000).events[0]?.type).toBe('resume');
  });

  it('sends the tutorial Journey first', () => {
    const started = play('casual', fresh(), 60_000).events.filter(
      (e) => e.type === 'startJourney',
    );
    expect(started).toEqual([
      expect.objectContaining({ slot: 0, durationId: 'tutorial' }),
    ]);
  });

  it('taps Listen while it owns nothing and nothing is affordable, then buys', () => {
    const order = types(play('casual', fresh(), ONE_CHECK).events);
    const firstBuy = order.indexOf('buyEncounter');
    expect(firstBuy).toBeGreaterThan(0);
    expect(
      order.slice(0, firstBuy).filter((t) => t === 'listen').length,
    ).toBeGreaterThan(5);
    expect(order.slice(firstBuy).filter((t) => t === 'listen')).toEqual([]);
  });

  it('buys until nothing is affordable', () => {
    const { player, events } = play(
      'casual',
      holding(withWords(fresh(), 3), 1e7),
      ONE_CHECK,
    );
    const shop = shopAfter(player, events);
    expect(buys(events).length).toBeGreaterThan(5);
    expect(shop.encounters.filter((o) => o.affordable)).toEqual([]);
    expect(shop.pickUp?.affordable ?? false).toBe(false);
  });

  it('buys first the Encounter Pemandu would, by payback, when every word is held', () => {
    let s = holding(fresh(), 1e30);
    // one scenario: picking up the whole pool is one player's run of pick-ups.
    for (let r = pickUpWord(course(), s); r.ok; r = pickUpWord(course(), s)) {
      s = r.state;
    }
    const rich = holding({ ...s, owned: { 'r0-e0': 3, 'r0-e2': 1 } }, 500);
    const first = buys(play('nonlearner', rich, ONE_CHECK).events)[0];
    expect(bestPayback(course(), rich)).toBeDefined();
    expect(first).toMatchObject({
      type: 'buyEncounter',
      id: bestPayback(course(), rich),
      count: 1,
    });
  });

  it('the Capped Buyer makes 5 purchases in a check where the Casual Learner makes more', () => {
    const rich = holding(withWords(fresh(), 3), 1e7);
    expect(buys(play('capped', rich, ONE_CHECK).events)).toHaveLength(5);
    expect(buys(play('casual', rich, ONE_CHECK).events).length).toBeGreaterThan(
      5,
    );
  });

  it('the Random Buyer buys until nothing is affordable, in its own order', () => {
    const rich = holding(withWords(fresh(), 3), 1e7);
    const random = play('random', rich, ONE_CHECK);
    const greedy = play('casual', rich, ONE_CHECK);
    const shop = shopAfter(random.player, random.events);
    expect(shop.encounters.filter((o) => o.affordable)).toEqual([]);
    expect(buys(random.events).length).toBeGreaterThan(5);
    expect(buys(random.events)).not.toEqual(buys(greedy.events));
  });

  it('a learner answers every due review', () => {
    const due = withWords(fresh(), 12);
    const { events, player } = play('casual', due, ONE_CHECK);
    expect(
      events.filter((e) => e.type === 'answerReview').length,
    ).toBeGreaterThan(0);
    expect(view(course(), player.state, wallMs(player.now)).queue).toEqual([]);
  });

  it('a Non-learner answers none', () => {
    const due = withWords(fresh(), 12);
    const { events, player } = play('nonlearner', due, ONE_CHECK);
    expect(events.filter((e) => e.type === 'answerReview')).toEqual([]);
    expect(
      view(course(), player.state, wallMs(player.now)).queue.length,
    ).toBeGreaterThan(0);
  });

  it('sends the longest Journey back before the next open', () => {
    const used = { ...fresh(), tutorialJourneyUsed: true };
    const started = play(
      'casual',
      used,
      1,
      used.wall + 5 * HOUR_MS,
    ).events.find((e) => e.type === 'startJourney');
    expect(started).toMatchObject({ durationId: '4h' });
  });

  it('sends the shortest Journey when none is back before the next open', () => {
    const used = { ...fresh(), tutorialJourneyUsed: true };
    const started = play(
      'casual',
      used,
      ONE_CHECK,
      used.wall + HOUR_MS,
    ).events.find((e) => e.type === 'startJourney');
    expect(started).toMatchObject({ durationId: '2h' });
  });

  it('buys every affordable upgrade in catalogue order', () => {
    const rich = { ...fresh(), insight: Num.toTuple(Num.from(1e6)) };
    const bought = play('casual', rich, ONE_CHECK)
      .events.filter((e) => e.type === 'buyUpgrade')
      .map((e) => e.id);
    const catalogue = upgradeCatalogue(course())
      .filter((u) => u.currency === 'insight')
      .flatMap((u) => u.costs.map(() => u.id));
    expect(catalogue).toHaveLength(17);
    expect(bought).toEqual(catalogue);
  });

  it('sets Pemandu to its fastest owned interval once it opens', () => {
    const opened: GameState = {
      ...fresh(),
      reached: REGION_1,
      upgrades: { pemanduFaster1: 1 },
    };
    expect(
      play('casual', opened, ONE_CHECK).events.find(
        (e) => e.type === 'setAutomation',
      ),
    ).toMatchObject({ enabled: true, intervalMs: 5_000 });
  });

  it('sets sail at the first check the goal is met, buying nothing in it', () => {
    const words = withWords(fresh(), 10);
    const goal = view(course(), words, words.wall).sail.goal.understanding;
    const ready = holding(words, Num.toNumber(goal));
    expect(view(course(), ready, ready.wall).sail.available).toBe(true);
    const after = play('nonlearner', ready, ONE_CHECK).events;
    const sail = after.findIndex((e) => e.type === 'setSail');
    expect(sail).toBeGreaterThan(0);
    expect(buys(after.slice(0, sail))).toEqual([]);
  });

  it('the Clicker taps Listen 10 times a second through the open', () => {
    const rich = holding(fresh(), 0);
    const taps = play('clicker', rich, 60_000).events.filter(
      (e) => e.type === 'listen',
    ).length;
    expect(taps).toBeGreaterThan(500);
    expect(taps).toBeLessThanOrEqual(600 + 300);
  });

  it('reports a decision when one is on offer', () => {
    expect(play('casual', fresh(), ONE_CHECK).decision).toBe(true);
  });

  it('reports no decision when nothing is affordable, due, free or available', () => {
    const away = play('casual', fresh(), ONE_CHECK).player.state;
    const idle: GameState = {
      ...holding(away, 0),
      owned: {},
      wall: wallMs(away.wall + 60_000),
    };
    const { shop, queue, sail } = view(course(), idle, idle.wall);
    expect(shop.journeys.slots).toEqual(['away', 'locked', 'locked']);
    expect(queue).toEqual([]);
    expect(sail.available).toBe(false);
    expect(play('idler', idle, ONE_CHECK).decision).toBe(false);
  });

  it('judges a later return on a copy, changing nothing', () => {
    const { player } = play('casual', fresh(), ONE_CHECK);
    const before = player.state;
    const now = player.now;
    expect(player.returnAfter(QUICK_RETURN_MS)).toBe('decision');
    expect(player.state).toBe(before);
    expect(player.now).toBe(now);
  });

  it('finds only Practice on a return before anything arrives, holding a word not yet due', () => {
    // The word is picked up now, so it falls due minutes after the return.
    const player = idlePlayer((idle) => ({ words: withWords(idle, 1).words }));
    expect(Object.keys(player.state.words)).toHaveLength(1);
    expect(player.returnAfter(1_000)).toBe('practice');
  });

  it('finds nothing on a return before anything arrives, holding no word', () => {
    const player = idlePlayer(() => ({ words: {} }));
    expect(player.returnAfter(1_000)).toBe('nothing');
  });

  it('finds the returned Journey on a return a day later', () => {
    expect(idlePlayer().returnAfter(25 * HOUR_MS)).toBe('decision');
  });
});
