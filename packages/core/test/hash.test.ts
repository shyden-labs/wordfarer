import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { syntheticCourse } from '../fixtures/synthetic-course';
import { HOUR_MS, wallMs, type WallMs } from '../src/clock';
import type { Course } from '../src/course';
import type { GameEvent } from '../src/events';
import { canonical, stateHash } from '../src/hash';
import { replay } from '../src/log';
import { newWordMemory } from '../src/memory';
import { Num } from '../src/num';
import { initialState, type GameState } from '../src/state';

/**
 * `stateHash` (#34 AC4, design §4): SHA-256 of a canonical serialisation
 * whose keys are sorted and whose numbers are their IEEE-754 bits, so equal
 * states hash equally on every engine and a one-ulp change shows.
 */

const START: WallMs = wallMs(Date.UTC(2027, 0, 4, 8));

let builtCourse: Course | undefined;
function course(): Course {
  builtCourse ??= syntheticCourse(1);
  return builtCourse;
}

/**
 * A state with a value in every kind of field: currencies, owned
 * Encounters, reviewed words, a Journey out, upgrades, grammar and Pemandu
 * on, built by replaying a short log over a state set up by spreading.
 */
function lived(c: Course): GameState {
  const number = c.regions[0]?.destinations.length ?? 0;
  const lexicon = c.regions[1]?.destinations[0]?.lexicon ?? [];
  const base = initialState(START, 34);
  const state: GameState = {
    ...base,
    anchor: { sim: base.sim, understanding: Num.toTuple(Num.from(1e40)) },
    insight: Num.toTuple(Num.from(1e12)),
    stamps: 1000,
    stampsEarned: 1000,
    destination: number,
    reached: number,
    words: Object.fromEntries(
      lexicon.slice(0, 3).map((item) => [item.id, newWordMemory(START)]),
    ),
  };
  const at = (minutes: number): WallMs => wallMs(START + minutes * 60_000);
  const word = lexicon[0]?.id ?? '';
  const events: GameEvent[] = [
    { type: 'listen', seq: 1, wallMs: at(1) },
    {
      type: 'buyEncounter',
      seq: 2,
      wallMs: at(2),
      id: c.regions[0]?.encounters[0]?.id ?? '',
      count: 4,
    },
    {
      type: 'answerReview',
      seq: 3,
      wallMs: at(3),
      itemId: word,
      correct: true,
      latencyMs: 2000,
      promptType: 'typed',
    },
    { type: 'buyUpgrade', seq: 4, wallMs: at(4), id: 'offlineCap' },
    { type: 'startJourney', seq: 5, wallMs: at(5), slot: 0, durationId: '4h' },
    {
      type: 'buyGrammarNode',
      seq: 6,
      wallMs: at(6),
      id: c.regions[0]?.grammarNodes[0]?.id ?? '',
    },
    {
      type: 'setAutomation',
      seq: 7,
      wallMs: at(7),
      enabled: true,
      intervalMs: 10_000,
    },
    { type: 'resume', seq: 8, wallMs: wallMs(at(7) + HOUR_MS) },
  ];
  const result = replay(c, state, events);
  if (result.refused.length > 0) {
    throw new Error(`lived log refused: ${JSON.stringify(result.refused)}`);
  }
  return result.state;
}

/** The next double above `value` (from -0 or 0, the least subnormal). */
function nextUp(value: number): number {
  if (value === 0) return Number.MIN_VALUE;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const big = view.getBigUint64(0);
  view.setBigUint64(0, value > 0 ? big + 1n : big - 1n);
  return view.getFloat64(0);
}

/** The path and value of every number in plain data, depth first. */
function numericLeaves(
  value: unknown,
  path: readonly (string | number)[] = [],
): { path: readonly (string | number)[]; value: number }[] {
  if (typeof value === 'number') return [{ path, value }];
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      numericLeaves(child, [...path, index]),
    );
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      numericLeaves(child, [...path, key]),
    );
  }
  return [];
}

/** A copy of plain data with the value at `path` replaced. */
function setAt(
  value: unknown,
  path: readonly (string | number)[],
  next: unknown,
): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return next;
  if (Array.isArray(value)) {
    return (value as unknown[]).map((child, index) =>
      index === head ? setAt(child, rest, next) : child,
    );
  }
  const record = value as Record<string, unknown>;
  return { ...record, [head]: setAt(record[String(head)], rest, next) };
}

describe('canonical (AC4)', () => {
  it('sorts keys in code-unit order, whatever order they were written in', () => {
    expect(canonical({ b: true, a: false, B: null, é: 'x' })).toBe(
      canonical({ é: 'x', B: null, a: false, b: true }),
    );
    expect(canonical({ b: true, a: false, B: null, é: 'x' })).toBe(
      '{"B":null,"a":false,"b":true,"é":"x"}',
    );
  });

  it('writes a number as the 16 hex digits of its IEEE-754 bits', () => {
    expect(canonical(1)).toBe('0x3ff0000000000000');
    expect(canonical(0.1)).toBe('0x3fb999999999999a');
    expect(canonical(-2)).toBe('0xc000000000000000');
    expect(canonical(Number.MIN_VALUE)).toBe('0x0000000000000001');
  });

  it('keeps 0 and -0 apart', () => {
    expect(canonical(0)).toBe('0x0000000000000000');
    expect(canonical(-0)).toBe('0x8000000000000000');
  });

  it('writes strings as JSON does, escapes included', () => {
    expect(canonical('a"b\\c\n ')).toBe(JSON.stringify('a"b\\c\n '));
  });

  it('escapes keys as JSON does, so no key can forge a field', () => {
    expect(canonical({ 'a":true,"b': false })).toBe('{"a\\":true,\\"b":false}');
    expect(canonical({ 'a":true,"b': false })).not.toBe(
      canonical({ a: true, b: false }),
    );
  });

  it('writes arrays in order and nests', () => {
    expect(canonical([1, [true, 'x'], { z: [] }])).toBe(
      '[0x3ff0000000000000,[true,"x"],{"z":[]}]',
    );
  });

  it.each([
    ['NaN', (): unknown => ({ a: Number.NaN }), 'state.a'],
    [
      'Infinity',
      (): unknown => ({ a: [Number.POSITIVE_INFINITY] }),
      'state.a[0]',
    ],
    ['undefined', (): unknown => ({ a: { b: undefined } }), 'state.a.b'],
    ['a Num', (): unknown => ({ a: Num.from(2) }), 'state.a'],
    ['a Date', (): unknown => ({ a: new Date(0) }), 'state.a'],
    ['a function', (): unknown => ({ a: (): number => 1 }), 'state.a'],
    ['a bigint', (): unknown => ({ a: 1n }), 'state.a'],
    [
      'a hole in an array',
      (): unknown => {
        const holed: number[] = [];
        holed[0] = 1;
        holed[2] = 2;
        return { a: holed };
      },
      'state.a[1]',
    ],
  ])('refuses %s by its path', (_name, make, path) => {
    expect(() => canonical(make())).toThrow(path);
  });

  it('reads the same before and after a JSON round trip of a lived state', () => {
    const state = lived(course());
    expect(canonical(JSON.parse(JSON.stringify(state)))).toBe(canonical(state));
  });
});

describe('stateHash (AC4)', () => {
  it('is 64 lowercase hex digits', () => {
    expect(stateHash(initialState(START, 1))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pins a new game’s hash: the canonical form is a stored format', () => {
    expect(stateHash(initialState(START, 1))).toBe(NEW_GAME_HASH);
  });

  it('hashes equal states equally, however they were built', () => {
    const c = course();
    const a = lived(c);
    const b = lived(c);
    expect(b).not.toBe(a);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(stateHash(JSON.parse(JSON.stringify(a)) as GameState)).toBe(
      stateHash(a),
    );
  });

  it('tells different seeds apart', () => {
    expect(stateHash(initialState(START, 1))).not.toBe(
      stateHash(initialState(START, 2)),
    );
  });

  it('changes when any numeric field moves by one ulp', () => {
    const state = lived(course());
    const original = stateHash(state);
    const leaves = numericLeaves(state);
    // runtime population: the numeric fields are those this state holds.
    const unchanged = leaves
      .filter(
        ({ path, value }) =>
          stateHash(setAt(state, path, nextUp(value)) as GameState) ===
          original,
      )
      .map(({ path }) => path.join('.'));
    expect(unchanged).toEqual([]);
    // Liveness: every number was reached. A JSON reviver counts them
    // independently of the walk above.
    let counted = 0;
    JSON.parse(JSON.stringify(state), (_key, value: unknown) => {
      if (typeof value === 'number') counted += 1;
      return value;
    });
    expect(leaves).toHaveLength(counted);
    expect(counted).toBeGreaterThanOrEqual(NUMERIC_FLOOR);
  });

  it('changes when a string or a boolean field changes', () => {
    const state = lived(course());
    expect(stateHash({ ...state, cards: ['x'] })).not.toBe(stateHash(state));
    expect(stateHash({ ...state, finale: !state.finale })).not.toBe(
      stateHash(state),
    );
  });

  it('is a function of the state alone, for any seed and wall time', () => {
    let reached = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 }),
        fc.integer({ min: 0, max: 2 ** 45 }),
        (seed, wall) => {
          reached += 1;
          const state = initialState(wallMs(wall), seed);
          expect(stateHash(state)).toBe(
            stateHash(initialState(wallMs(wall), seed)),
          );
        },
      ),
      { seed: 34, numRuns: 200 },
    );
    expect(reached).toBe(200);
  });
});

/**
 * `initialState(START, 1)`'s hash, measured when #34 fixed the canonical
 * form. A change to the form or to a new game's state moves it: stored
 * checkpoints (M5) depend on the form, so that is a deliberate edit.
 */
const NEW_GAME_HASH =
  'bb53f45ea0d321816ce63613f26fb7c9e2f74be5db685ea7922acbd1e3aecc3b';
/** The lived state holds 60 numbers (measured in #34); the floor is 59. */
const NUMERIC_FLOOR = 59;
