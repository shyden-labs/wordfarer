import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { syntheticCourse } from '../fixtures/synthetic-course';
import { HOUR_MS, wallMs, type WallMs } from '../src/clock';
import type { Course } from '../src/course';
import type { GameEvent } from '../src/events';
import { collectJourney, startJourney } from '../src/journeys';
import { apply, replay } from '../src/log';
import { newWordMemory } from '../src/memory';
import { Num } from '../src/num';
import { sailPreview, setSail } from '../src/sail';
import {
  advance,
  answerPractice,
  answerReview,
  buyEncounter,
  buyGrammarNode,
  buyUpgrade,
  listen,
  pickUpWord,
  setAutomation,
  type Result,
} from '../src/sim';
import { initialState, type GameState } from '../src/state';
import { offlineCapMs } from '../src/upgrades';

/**
 * `apply` and `replay` (#34 AC2, AC3, AC6; design §4, §7): the event log is
 * the only way the live state changes. Each event type is checked against
 * the action it names, called directly on the state advanced to the
 * event's wall time.
 */

const START: WallMs = wallMs(Date.UTC(2027, 0, 4, 8));
const MINUTE_MS = 60_000;

let builtCourse: Course | undefined;
/** The synthetic course, built on first use rather than at collection (#97). */
function course(): Course {
  builtCourse ??= syntheticCourse(1);
  return builtCourse;
}

/** The number of the first destination of region 2: grammar and Pemandu are open there. */
function regionTwoStart(c: Course): number {
  return c.regions[0]?.destinations.length ?? 0;
}

/**
 * A state at region 2's first destination with plenty of every currency and
 * every word of its lexicon but the last held and due, so each event type
 * has something it can do. Plain data, so it is built by spreading.
 */
function rich(c: Course): GameState {
  const number = regionTwoStart(c);
  const lexicon = c.regions[1]?.destinations[0]?.lexicon ?? [];
  const base = initialState(START, 34);
  return {
    ...base,
    anchor: { sim: base.sim, understanding: Num.toTuple(Num.from(1e40)) },
    insight: Num.toTuple(Num.from(1e12)),
    stamps: 1000,
    stampsEarned: 1000,
    destination: number,
    reached: number,
    words: Object.fromEntries(
      lexicon.slice(0, -1).map((item) => [item.id, newWordMemory(START)]),
    ),
  };
}

function firstWord(c: Course): string {
  return c.regions[1]?.destinations[0]?.lexicon[0]?.id ?? '';
}

/**
 * One event of each type, in an order where each is accepted: resume first,
 * Set Sail last, since a sail resets Encounters and Understanding.
 */
function scenario(c: Course): readonly GameEvent[] {
  const at = (minutes: number): WallMs => wallMs(START + minutes * MINUTE_MS);
  const encounter = c.regions[0]?.encounters[0]?.id ?? '';
  const node = c.regions[0]?.grammarNodes[0]?.id ?? '';
  return [
    { type: 'resume', seq: 1, wallMs: at(1) },
    { type: 'listen', seq: 2, wallMs: at(2) },
    { type: 'buyEncounter', seq: 3, wallMs: at(3), id: encounter, count: 3 },
    { type: 'pickUpWord', seq: 4, wallMs: at(4) },
    {
      type: 'answerReview',
      seq: 5,
      wallMs: at(5),
      itemId: firstWord(c),
      correct: true,
      latencyMs: 2500,
      promptType: 'choice',
    },
    { type: 'answerPractice', seq: 6, wallMs: at(6), itemId: firstWord(c) },
    { type: 'buyUpgrade', seq: 7, wallMs: at(7), id: 'offlineCap' },
    { type: 'startJourney', seq: 8, wallMs: at(8), slot: 0, durationId: '2h' },
    { type: 'collectJourney', seq: 9, wallMs: at(8 + 121), slot: 0 },
    { type: 'buyGrammarNode', seq: 10, wallMs: at(130), id: node },
    {
      type: 'setAutomation',
      seq: 11,
      wallMs: at(131),
      enabled: true,
      intervalMs: 10_000,
    },
    { type: 'setSail', seq: 12, wallMs: at(132) },
  ];
}

/**
 * The action an event names, called directly: the reference `apply` is
 * checked against. Written out here rather than shared with `log.ts`.
 */
function direct(c: Course, state: GameState, event: GameEvent): Result {
  const at = advance(c, state, event.wallMs).state;
  switch (event.type) {
    case 'resume':
      return { ok: true, state: at };
    case 'listen':
      return { ok: true, state: listen(c, at) };
    case 'buyEncounter':
      return buyEncounter(c, at, event.id, event.count);
    case 'pickUpWord':
      return pickUpWord(c, at);
    case 'answerReview':
      return answerReview(c, at, event.itemId, event.correct);
    case 'answerPractice':
      return answerPractice(at, event.itemId);
    case 'buyUpgrade':
      return buyUpgrade(c, at, event.id);
    case 'startJourney':
      return startJourney(c, at, event.slot, event.durationId);
    case 'collectJourney':
      return collectJourney(c, at, event.slot);
    case 'setSail':
      return setSail(c, at, event.to);
    case 'buyGrammarNode':
      return buyGrammarNode(c, at, event.id);
    case 'setAutomation':
      return setAutomation(c, at, event.enabled, event.intervalMs);
  }
}

const befores = new WeakMap<Course, GameState[]>();

/**
 * The state before scenario event `index`, every earlier one accepted,
 * memoised per course: states are immutable, and the property below asks
 * for them hundreds of times.
 */
function before(c: Course, index: number): GameState {
  const states = befores.get(c) ?? [rich(c)];
  befores.set(c, states);
  const events = scenario(c);
  while (states.length <= index) {
    const event = events[states.length - 1];
    const last = states[states.length - 1];
    if (event === undefined || last === undefined) {
      throw new RangeError(`no scenario state ${String(index)}`);
    }
    const result = apply(c, last, event);
    if (!result.ok) throw new Error(`scenario ${String(event.seq)} refused`);
    states.push(result.state);
  }
  const state = states[index];
  if (state === undefined)
    throw new RangeError(`no scenario state ${String(index)}`);
  return state;
}

/** A deep copy of plain data, kept apart from the value it copies. */
function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepCopy) as T;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, deepCopy(child)]),
    ) as T;
  }
  return value;
}

/** Freeze a state all the way down, so any write to it throws. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const TYPES = [
  'resume',
  'listen',
  'buyEncounter',
  'pickUpWord',
  'answerReview',
  'answerPractice',
  'buyUpgrade',
  'startJourney',
  'collectJourney',
  'buyGrammarNode',
  'setAutomation',
  'setSail',
] as const;

describe('apply dispatches each event to its action (design §4)', () => {
  it('the scenario has one event of each type, in this order', () => {
    expect(scenario(course()).map((e) => e.type)).toEqual(TYPES);
  });

  it.each(TYPES.map((type, index) => ({ type, index })))(
    '$type: accepted, the action’s state with the event’s seq',
    ({ index }) => {
      const c = course();
      const state = before(c, index);
      const event = scenario(c)[index];
      if (event === undefined) throw new Error(`no event ${String(index)}`);
      const expected = direct(c, state, event);
      expect(expected.ok).toBe(true);
      if (!expected.ok) return;
      expect(apply(c, state, event)).toEqual({
        ok: true,
        state: { ...expected.state, seq: event.seq },
      });
    },
  );

  it('Set Sail is available where the scenario sails', () => {
    const c = course();
    const state = before(c, TYPES.length - 1);
    expect(sailPreview(c, advance(c, state, state.wall).state).available).toBe(
      true,
    );
  });

  it('a refusal is the action’s own refusal', () => {
    const c = course();
    const event: GameEvent = {
      type: 'buyUpgrade',
      seq: 1,
      wallMs: wallMs(START + MINUTE_MS),
      id: 'noSuchUpgrade',
    };
    expect(apply(c, rich(c), event)).toEqual({
      ok: false,
      rejection: { kind: 'unknownUpgrade', id: 'noSuchUpgrade' },
    });
  });
});

describe('seq (AC2)', () => {
  it('a new game has seq 0', () => {
    expect(initialState(START, 1).seq).toBe(0);
  });

  it.each([
    ['equal to the last', 4, 4],
    ['below the last', 3, 4],
    ['zero on a new game', 0, 0],
  ])('refuses a seq %s as staleSeq', (_name, seq, last) => {
    const c = course();
    const state = { ...rich(c), seq: last };
    expect(apply(c, state, { type: 'listen', seq, wallMs: START })).toEqual({
      ok: false,
      rejection: { kind: 'staleSeq', seq, last },
    });
  });

  it('checks seq before anything else', () => {
    const c = course();
    const state = { ...rich(c), seq: 9 };
    const event: GameEvent = {
      type: 'buyUpgrade',
      seq: 9,
      wallMs: START,
      id: 'none',
    };
    expect(apply(c, state, event)).toEqual({
      ok: false,
      rejection: { kind: 'staleSeq', seq: 9, last: 9 },
    });
  });

  it('allows a gap: a refused event keeps its number', () => {
    const c = course();
    const result = apply(
      c,
      { ...rich(c), seq: 1 },
      { type: 'listen', seq: 7, wallMs: START },
    );
    expect(result.ok && result.state.seq).toBe(7);
  });

  it('accepts the next seq after the last', () => {
    const c = course();
    const result = apply(
      c,
      { ...rich(c), seq: 1 },
      { type: 'listen', seq: 2, wallMs: START },
    );
    expect(result.ok && result.state.seq).toBe(2);
  });
});

describe('the wall clock (AC3, DN21)', () => {
  it('an earlier wallMs is clamped, not refused: nothing is credited', () => {
    const c = course();
    const lived = before(c, 3);
    // Five Understanding held at the anchor, so the tap's +1 shows: on the
    // scenario's 1e40 it would be lost to rounding.
    const state: GameState = {
      ...lived,
      anchor: { sim: lived.sim, understanding: Num.toTuple(Num.from(5)) },
    };
    const result = apply(c, state, {
      type: 'listen',
      seq: 4,
      wallMs: wallMs(state.wall - HOUR_MS),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.wall).toBe(state.wall);
    expect(result.state.sim).toBe(state.sim);
    expect(result.state).toEqual({ ...listen(c, state), seq: 4 });
    expect(result.state.anchor.understanding).toEqual(Num.toTuple(Num.from(6)));
  });

  it('a later wallMs is credited as advance credits it', () => {
    const c = course();
    const state = before(c, 3);
    const event: GameEvent = {
      type: 'resume',
      seq: 4,
      wallMs: wallMs(state.wall + 3 * HOUR_MS),
    };
    const result = apply(c, state, event);
    expect(result).toEqual({
      ok: true,
      state: { ...advance(c, state, event.wallMs).state, seq: 4 },
    });
    expect(result.ok && result.state.sim - state.sim).toBe(3 * HOUR_MS);
  });
});

describe('resume (operator, 2026-10-03)', () => {
  /** A Listen 40 h after `state`, with or without a resume at 30 h. */
  function after40h(withResume: boolean): GameState {
    const c = course();
    const state = before(c, 3);
    const events: GameEvent[] = [
      ...(withResume
        ? [
            {
              type: 'resume',
              seq: 10,
              wallMs: wallMs(state.wall + 30 * HOUR_MS),
            } as const,
          ]
        : []),
      { type: 'listen', seq: 11, wallMs: wallMs(state.wall + 40 * HOUR_MS) },
    ];
    return replay(c, state, events).state;
  }

  it('a visit with no other action banks its capped time', () => {
    const c = course();
    const start = before(c, 3);
    const cap = offlineCapMs(start);
    expect(cap).toBeLessThan(30 * HOUR_MS);
    expect(after40h(true).sim - start.sim).toBe(cap + 10 * HOUR_MS);
  });

  it('without it, the whole gap is capped once', () => {
    const c = course();
    const start = before(c, 3);
    expect(after40h(false).sim - start.sim).toBe(offlineCapMs(start));
  });
});

describe('a refused event leaves state unchanged (AC2)', () => {
  it('for any event at any point of the scenario, apply never throws and never writes to its input', () => {
    const c = course();
    let refused = 0;
    let accepted = 0;
    const acceptedTypes = new Set<string>();
    const refusedKinds = new Set<string>();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: TYPES.length }),
        anyEvent(c),
        (index, partial) => {
          const state = deepFreeze(before(c, index));
          const snapshot = deepCopy(state);
          // The arbitrary's wallMs is an offset from the state's wall clock.
          const event = {
            ...partial,
            seq: state.seq + 1,
            wallMs: wallMs(state.wall + partial.wallMs),
          } as GameEvent;
          const result = apply(c, state, event);
          expect(state).toEqual(snapshot);
          if (result.ok) {
            accepted += 1;
            acceptedTypes.add(event.type);
          } else {
            refused += 1;
            refusedKinds.add(result.rejection.kind);
          }
          expect(result).toEqual(
            (() => {
              const reference = direct(c, state, event);
              return reference.ok
                ? { ok: true, state: { ...reference.state, seq: event.seq } }
                : reference;
            })(),
          );
        },
      ),
      { seed: 34, numRuns: 400 },
    );
    // Both outcomes were reached. Measured on seed 34: 244 refused over 16
    // kinds, 156 accepted over 11 types; each floor is that figure less one.
    expect(refused).toBeGreaterThanOrEqual(243);
    expect(accepted).toBeGreaterThanOrEqual(155);
    expect(refusedKinds.size).toBeGreaterThanOrEqual(15);
    expect(acceptedTypes.size).toBeGreaterThanOrEqual(10);
  }, 120_000);

  it('a log with a refused event inserted replays to the state without it', () => {
    const c = course();
    const events = scenario(c);
    const inserted: GameEvent = {
      type: 'buyUpgrade',
      seq: 6,
      wallMs: events[4]?.wallMs ?? START,
      id: 'noSuchUpgrade',
    };
    const renumbered = events.map((e) => ({ ...e, seq: e.seq * 2 }));
    const withRefusal = [
      ...renumbered.slice(0, 5),
      { ...inserted, seq: 11 },
      ...renumbered.slice(5),
    ];
    const plain = replay(c, rich(c), renumbered);
    const noisy = replay(c, rich(c), withRefusal);
    expect(noisy.state).toEqual(plain.state);
    expect(noisy.refused).toEqual([
      { seq: 11, rejection: { kind: 'unknownUpgrade', id: 'noSuchUpgrade' } },
    ]);
    expect(plain.refused).toEqual([]);
  });
});

describe('replay (AC6)', () => {
  it('equals applying each event in turn', () => {
    const c = course();
    expect(replay(c, rich(c), scenario(c))).toEqual({
      state: before(c, TYPES.length),
      refused: [],
    });
  });

  it('of an empty log is the state it was given', () => {
    const c = course();
    const state = rich(c);
    expect(replay(c, state, [])).toEqual({ state, refused: [] });
  });

  it('lists each refusal with its seq, in log order', () => {
    const c = course();
    const result = replay(c, rich(c), [
      { type: 'listen', seq: 2, wallMs: START },
      { type: 'listen', seq: 2, wallMs: START },
      { type: 'collectJourney', seq: 3, wallMs: START, slot: 0 },
    ]);
    expect(result.refused).toEqual([
      { seq: 2, rejection: { kind: 'staleSeq', seq: 2, last: 2 } },
      { seq: 3, rejection: { kind: 'slotEmpty', slot: 0 } },
    ]);
    expect(result.state.seq).toBe(2);
  });

  it('round-trips through JSON: the log and the state are plain data', () => {
    const c = course();
    const log: unknown = JSON.parse(JSON.stringify(scenario(c)));
    const live = replay(c, rich(c), scenario(c)).state;
    const again = replay(c, rich(c), log as GameEvent[]).state;
    expect(again).toEqual(live);
    expect(JSON.parse(JSON.stringify(live))).toEqual(live);
  });
});

describe('apply and advance commute within the offline cap (design §7)', () => {
  it('advance then apply equals apply then advance, the event being later', () => {
    const c = course();
    let reached = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: TYPES.length }),
        fc.integer({ min: 0, max: 4 * HOUR_MS }),
        fc.integer({ min: 0, max: 2 * HOUR_MS }),
        (index, first, second) => {
          reached += 1;
          const state = before(c, index);
          const t = wallMs(state.wall + first);
          const event: GameEvent = {
            type: 'listen',
            seq: state.seq + 1,
            wallMs: wallMs(t + second),
          };
          const viaAdvance = apply(c, advance(c, state, t).state, event);
          const applied = apply(c, state, event);
          if (!applied.ok) throw new Error('listen refused');
          expect(viaAdvance).toEqual({
            ok: true,
            state: advance(c, applied.state, t).state,
          });
        },
      ),
      { seed: 34, numRuns: 60 },
    );
    expect(reached).toBe(60);
  }, 120_000);

  it('but not when the cap clips: advancing first banks the cap at the earlier time', () => {
    const c = course();
    const state = before(c, 3);
    const t = wallMs(state.wall + 30 * HOUR_MS);
    const event: GameEvent = {
      type: 'listen',
      seq: state.seq + 1,
      wallMs: wallMs(t + HOUR_MS),
    };
    const viaAdvance = apply(c, advance(c, state, t).state, event);
    const applied = apply(c, state, event);
    expect(viaAdvance.ok && applied.ok).toBe(true);
    if (!viaAdvance.ok || !applied.ok) return;
    expect(viaAdvance.state.sim - applied.state.sim).toBe(HOUR_MS);
  });
});

/**
 * Any event of any type, its seq and wall time set by the caller: ids from the course and
 * some it does not have, slots and counts in and out of range.
 */
function anyEvent(c: Course): fc.Arbitrary<GameEvent> {
  // An offset from the state's wall clock, back by up to an hour (clamped)
  // or on by up to three: the caller adds the state's wall time.
  const wall = fc.integer({ min: -HOUR_MS, max: 3 * HOUR_MS });
  const ids = (known: readonly string[]): fc.Arbitrary<string> =>
    fc.oneof(fc.constantFrom(...known, 'none'), fc.string());
  const encounters = c.regions.flatMap((r) => r.encounters.map((e) => e.id));
  const nodes = c.regions.flatMap((r) => r.grammarNodes.map((n) => n.id));
  const words = c.regions[1]?.destinations[0]?.lexicon.map((i) => i.id) ?? [];
  const destinations = c.regions.flatMap((r) =>
    r.destinations.map((d) => d.id),
  );
  const count = fc.oneof(
    fc.integer({ min: 1, max: 5 }),
    fc.constant(Number.MAX_SAFE_INTEGER),
  );
  const slot = fc.integer({ min: 0, max: 4 });
  const seq = fc.constant(0);
  const arbitraries: fc.Arbitrary<unknown>[] = [
    fc.record({ type: fc.constant('resume'), seq, wallMs: wall }),
    fc.record({ type: fc.constant('listen'), seq, wallMs: wall }),
    fc.record({
      type: fc.constant('buyEncounter'),
      seq,
      wallMs: wall,
      id: ids(encounters),
      count,
    }),
    fc.record({ type: fc.constant('pickUpWord'), seq, wallMs: wall }),
    fc.record({
      type: fc.constant('answerReview'),
      seq,
      wallMs: wall,
      itemId: ids(words),
      correct: fc.boolean(),
      latencyMs: fc.integer({ min: 0, max: 60_000 }),
      promptType: fc.constantFrom('choice', 'typed', 'tiles'),
    }),
    fc.record({
      type: fc.constant('answerPractice'),
      seq,
      wallMs: wall,
      itemId: ids(words),
    }),
    fc.record({
      type: fc.constant('buyUpgrade'),
      seq,
      wallMs: wall,
      id: ids(['offlineCap', 'journeySlot2', 'journeySlot3', 'pemanduFaster1']),
    }),
    fc.record({
      type: fc.constant('startJourney'),
      seq,
      wallMs: wall,
      slot,
      durationId: ids(['tutorial', '2h', '4h', '8h', '24h']),
    }),
    fc.record({ type: fc.constant('collectJourney'), seq, wallMs: wall, slot }),
    fc.record(
      {
        type: fc.constant('setSail'),
        seq,
        wallMs: wall,
        to: ids(destinations),
      },
      { requiredKeys: ['type', 'seq', 'wallMs'] },
    ),
    fc.record({
      type: fc.constant('buyGrammarNode'),
      seq,
      wallMs: wall,
      id: ids(nodes),
    }),
    fc.record({
      type: fc.constant('setAutomation'),
      seq,
      wallMs: wall,
      enabled: fc.boolean(),
      intervalMs: fc.constantFrom(1000, 2000, 5000, 10_000, 7),
    }),
  ];
  return fc.oneof(...arbitraries) as fc.Arbitrary<GameEvent>;
}
