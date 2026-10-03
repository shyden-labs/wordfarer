import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  EVENT_TYPES,
  parseEvent,
  PROMPT_TYPES,
  type EventError,
  type GameEvent,
} from '../src/events';

/**
 * The event union and its validator (#34 AC1, design §4). Every field case
 * is generated from the examples and limits declared here, so the tests
 * check the validator against the contract rather than sharing its table.
 */

/** One valid event of each type, in design §4's order with `resume` first. */
const EXAMPLES = {
  resume: { type: 'resume', seq: 1, wallMs: 0 },
  listen: { type: 'listen', seq: 2, wallMs: 10 },
  buyEncounter: {
    type: 'buyEncounter',
    seq: 3,
    wallMs: 20,
    id: 'e0',
    count: 2,
  },
  pickUpWord: { type: 'pickUpWord', seq: 4, wallMs: 30 },
  answerReview: {
    type: 'answerReview',
    seq: 5,
    wallMs: 40,
    itemId: 'w0',
    correct: true,
    latencyMs: 2500,
    promptType: 'choice',
  },
  answerPractice: { type: 'answerPractice', seq: 6, wallMs: 50, itemId: 'w0' },
  buyUpgrade: { type: 'buyUpgrade', seq: 7, wallMs: 60, id: 'offlineCap' },
  startJourney: {
    type: 'startJourney',
    seq: 8,
    wallMs: 70,
    slot: 0,
    durationId: '2h',
  },
  collectJourney: { type: 'collectJourney', seq: 9, wallMs: 80, slot: 1 },
  setSail: { type: 'setSail', seq: 10, wallMs: 90, to: 'd0' },
  buyGrammarNode: { type: 'buyGrammarNode', seq: 11, wallMs: 100, id: 'g0' },
  setAutomation: {
    type: 'setAutomation',
    seq: 12,
    wallMs: 110,
    enabled: true,
    intervalMs: 10_000,
  },
} as const;

type Kind = 'string' | 'boolean' | 'integer' | 'promptType';

/** Each field's kind and, for integers, its least value (design §4, #34). */
const FIELDS: Readonly<Record<string, { kind: Kind; min?: number }>> = {
  seq: { kind: 'integer', min: 1 },
  wallMs: { kind: 'integer', min: 0 },
  id: { kind: 'string' },
  count: { kind: 'integer', min: 1 },
  itemId: { kind: 'string' },
  correct: { kind: 'boolean' },
  latencyMs: { kind: 'integer', min: 0 },
  promptType: { kind: 'promptType' },
  slot: { kind: 'integer', min: 0 },
  durationId: { kind: 'string' },
  to: { kind: 'string' },
  enabled: { kind: 'boolean' },
  intervalMs: { kind: 'integer', min: 1 },
};

/** A value of the wrong JavaScript type for each kind. */
const WRONG: Readonly<Record<Kind, unknown>> = {
  string: 7,
  boolean: 'true',
  integer: '1',
  promptType: 3,
};

const TYPES = Object.keys(EXAMPLES) as (keyof typeof EXAMPLES)[];

/** Every (type, field) pair but `type` itself, in each example's own order. */
const FIELD_CASES = TYPES.flatMap((type) =>
  Object.keys(EXAMPLES[type])
    .filter((field) => field !== 'type')
    .map((field) => ({ type, field })),
);

const INTEGER_CASES = FIELD_CASES.filter(
  ({ field }) => FIELDS[field]?.kind === 'integer',
);

function without(
  object: Readonly<Record<string, unknown>>,
  field: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(object).filter(([key]) => key !== field),
  );
}

/** A class instance that looks like an event: not plain data. */
class ListenLike {
  readonly type = 'listen';
  readonly seq = 1;
  readonly wallMs = 0;
}

function errorOf(input: unknown): EventError {
  const result = parseEvent(input);
  if (result.ok) throw new Error(`accepted ${JSON.stringify(input)}`);
  return result.error;
}

describe('the union (AC1)', () => {
  it('has design §4 types, with resume, in this order', () => {
    expect(EVENT_TYPES).toEqual(TYPES);
  });

  it('has the three prompt types of parent §3.4', () => {
    expect(PROMPT_TYPES).toEqual(['choice', 'typed', 'tiles']);
  });

  it('declares a kind for every field the examples use', () => {
    const used = new Set(FIELD_CASES.map(({ field }) => field));
    expect([...used].sort()).toEqual(Object.keys(FIELDS).sort());
  });

  // Liveness of the generated cases below: 12 types, 39 fields between them, 29 of them integers.
  it('generates a case for every field of every type', () => {
    expect(FIELD_CASES).toHaveLength(39);
    expect(INTEGER_CASES).toHaveLength(29);
  });
});

describe('parseEvent accepts (AC1)', () => {
  it.each(TYPES)('a valid %s, as a fresh object equal to it', (type) => {
    const input = EXAMPLES[type];
    const result = parseEvent(input);
    expect(result).toEqual({ ok: true, event: input });
    if (result.ok) expect(result.event).not.toBe(input);
  });

  it.each(INTEGER_CASES)(
    '$type with $field at its least value',
    ({ type, field }) => {
      const input = { ...EXAMPLES[type], [field]: FIELDS[field]?.min };
      expect(parseEvent(input)).toEqual({ ok: true, event: input });
    },
  );

  it.each(INTEGER_CASES)(
    '$type with $field at the largest safe integer',
    ({ type, field }) => {
      const input = { ...EXAMPLES[type], [field]: Number.MAX_SAFE_INTEGER };
      expect(parseEvent(input)).toEqual({ ok: true, event: input });
    },
  );

  it.each(['choice', 'typed', 'tiles'])(
    'answerReview with promptType %s',
    (promptType) => {
      const input = { ...EXAMPLES.answerReview, promptType };
      expect(parseEvent(input)).toEqual({ ok: true, event: input });
    },
  );

  it('answerReview with correct false', () => {
    const input = { ...EXAMPLES.answerReview, correct: false };
    expect(parseEvent(input)).toEqual({ ok: true, event: input });
  });

  it('setSail without a destination: `to` is optional', () => {
    const input = without(EXAMPLES.setSail, 'to');
    const result = parseEvent(input);
    expect(result).toEqual({ ok: true, event: input });
    if (result.ok) expect(Object.hasOwn(result.event, 'to')).toBe(false);
  });

  it('an object with no prototype, as JSON parsers may build', () => {
    const input = Object.assign(Object.create(null) as object, EXAMPLES.listen);
    expect(parseEvent(input)).toEqual({
      ok: true,
      event: { ...EXAMPLES.listen },
    });
  });

  it('a round trip through JSON, for any valid event', () => {
    let reached = 0;
    fc.assert(
      fc.property(validEvent(), (event) => {
        reached += 1;
        expect(parseEvent(JSON.parse(JSON.stringify(event)))).toEqual({
          ok: true,
          event,
        });
      }),
      { seed: 34, numRuns: 500 },
    );
    expect(reached).toBe(500);
  });
});

describe('parseEvent refuses (AC1)', () => {
  // Each input is built inside its test: a constructor run at collection
  // would fail the whole file rather than one test (#97).
  it.each([
    ['null', (): unknown => null],
    ['an array', (): unknown => [EXAMPLES.listen]],
    ['a string', (): unknown => 'listen'],
    ['a number', (): unknown => 1],
    ['undefined', (): unknown => undefined],
    ['a Date', (): unknown => new Date(0)],
    ['a class instance', (): unknown => new ListenLike()],
  ])('%s: not a plain object', (_name, make) => {
    expect(errorOf(make())).toEqual({ kind: 'notAnObject' });
  });

  it('an event with no type', () => {
    expect(errorOf(without(EXAMPLES.listen, 'type'))).toEqual({
      kind: 'missingField',
      field: 'type',
    });
  });

  it.each([
    ['an unknown name', 'tap', 'tap'],
    ['a name off the prototype', 'toString', 'toString'],
    ['a number', 3, 'number'],
    ['null', null, 'null'],
  ])('a type that is %s', (_name, type, found) => {
    expect(errorOf({ ...EXAMPLES.listen, type })).toEqual({
      kind: 'unknownType',
      found,
    });
  });

  it.each(FIELD_CASES.filter(({ field }) => field !== 'to'))(
    '$type without $field',
    ({ type, field }) => {
      expect(errorOf(without(EXAMPLES[type], field))).toEqual({
        kind: 'missingField',
        field,
      });
    },
  );

  it.each(FIELD_CASES)(
    '$type with $field of the wrong type',
    ({ type, field }) => {
      const kind = FIELDS[field]?.kind ?? 'string';
      expect(errorOf({ ...EXAMPLES[type], [field]: WRONG[kind] })).toEqual({
        kind: 'wrongType',
        field,
        expected: kind === 'promptType' ? 'string' : kind,
      });
    },
  );

  it('setSail with `to` present but undefined: present means typed', () => {
    expect(errorOf({ ...EXAMPLES.setSail, to: undefined })).toEqual({
      kind: 'wrongType',
      field: 'to',
      expected: 'string',
    });
  });

  it.each(
    INTEGER_CASES.flatMap(({ type, field }) =>
      [1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53].map((value) => ({
        type,
        field,
        value,
      })),
    ),
  )(
    '$type with $field = $value: not a safe integer',
    ({ type, field, value }) => {
      expect(errorOf({ ...EXAMPLES[type], [field]: value })).toEqual({
        kind: 'notInteger',
        field,
        value,
      });
    },
  );

  it.each(INTEGER_CASES)(
    '$type with $field one below its least',
    ({ type, field }) => {
      const min = FIELDS[field]?.min ?? 0;
      expect(errorOf({ ...EXAMPLES[type], [field]: min - 1 })).toEqual({
        kind: 'outOfRange',
        field,
        value: min - 1,
        min,
      });
    },
  );

  it('a negative zero wall time is in range: -0 is not below 0', () => {
    expect(parseEvent({ ...EXAMPLES.listen, wallMs: -0 }).ok).toBe(true);
  });

  it('an unknown prompt type', () => {
    expect(errorOf({ ...EXAMPLES.answerReview, promptType: 'voice' })).toEqual({
      kind: 'notOneOf',
      field: 'promptType',
      value: 'voice',
      allowed: ['choice', 'typed', 'tiles'],
    });
  });

  it.each(TYPES)('%s with a field it does not have', (type) => {
    expect(errorOf({ ...EXAMPLES[type], extra: 1 })).toEqual({
      kind: 'unexpectedField',
      field: 'extra',
    });
  });

  it('a `__proto__` key that JSON.parse made an own field', () => {
    const input: unknown = JSON.parse(
      '{"type":"listen","seq":1,"wallMs":0,"__proto__":{}}',
    );
    expect(errorOf(input)).toEqual({
      kind: 'unexpectedField',
      field: '__proto__',
    });
  });
});

describe('parseEvent checks in order (AC1)', () => {
  it('type before any field', () => {
    expect(errorOf({ type: 'tap' })).toEqual({
      kind: 'unknownType',
      found: 'tap',
    });
  });

  it('fields in their listed order: seq before wallMs', () => {
    expect(errorOf({ type: 'listen' })).toEqual({
      kind: 'missingField',
      field: 'seq',
    });
  });

  it('fields in their listed order: wallMs before the type’s own', () => {
    expect(errorOf({ type: 'buyEncounter', seq: 1 })).toEqual({
      kind: 'missingField',
      field: 'wallMs',
    });
  });

  it('within a field: wrong type before range', () => {
    expect(errorOf({ ...EXAMPLES.listen, seq: '0' })).toEqual({
      kind: 'wrongType',
      field: 'seq',
      expected: 'integer',
    });
  });

  it('a missing field before an unexpected one', () => {
    expect(errorOf({ ...without(EXAMPLES.buyUpgrade, 'id'), aaa: 1 })).toEqual({
      kind: 'missingField',
      field: 'id',
    });
  });

  it('unexpected fields in code-unit order, whatever order they were added', () => {
    expect(errorOf({ ...EXAMPLES.listen, zeta: 1, Zeta: 1, alpha: 1 })).toEqual(
      {
        kind: 'unexpectedField',
        field: 'Zeta',
      },
    );
  });

  it('never throws, for any JSON value or any mangled event', () => {
    let reached = 0;
    fc.assert(
      fc.property(
        fc.oneof(
          fc.jsonValue(),
          fc.record({
            type: fc.constantFrom(...TYPES, 'tap'),
            seq: fc.oneof(fc.integer(), fc.double(), fc.string()),
            wallMs: fc.oneof(fc.integer(), fc.double(), fc.constant(null)),
            id: fc.oneof(fc.string(), fc.integer()),
            count: fc.oneof(fc.integer(), fc.double()),
          }),
        ),
        (input) => {
          reached += 1;
          const result = parseEvent(input);
          expect(typeof result.ok).toBe('boolean');
        },
      ),
      { seed: 34, numRuns: 2000 },
    );
    expect(reached).toBe(2000);
  });
});

/** Any valid event: every type, every field anywhere in its range. */
function validEvent(): fc.Arbitrary<GameEvent> {
  const stamp = {
    seq: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    wallMs: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  };
  const natural = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
  const positive = fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER });
  const arbitraries: fc.Arbitrary<unknown>[] = [
    fc.record({ type: fc.constant('resume'), ...stamp }),
    fc.record({ type: fc.constant('listen'), ...stamp }),
    fc.record({
      type: fc.constant('buyEncounter'),
      ...stamp,
      id: fc.string(),
      count: positive,
    }),
    fc.record({ type: fc.constant('pickUpWord'), ...stamp }),
    fc.record({
      type: fc.constant('answerReview'),
      ...stamp,
      itemId: fc.string(),
      correct: fc.boolean(),
      latencyMs: natural,
      promptType: fc.constantFrom('choice', 'typed', 'tiles'),
    }),
    fc.record({
      type: fc.constant('answerPractice'),
      ...stamp,
      itemId: fc.string(),
    }),
    fc.record({ type: fc.constant('buyUpgrade'), ...stamp, id: fc.string() }),
    fc.record({
      type: fc.constant('startJourney'),
      ...stamp,
      slot: natural,
      durationId: fc.string(),
    }),
    fc.record({ type: fc.constant('collectJourney'), ...stamp, slot: natural }),
    fc.record(
      { type: fc.constant('setSail'), ...stamp, to: fc.string() },
      { requiredKeys: ['type', 'seq', 'wallMs'] },
    ),
    fc.record({
      type: fc.constant('buyGrammarNode'),
      ...stamp,
      id: fc.string(),
    }),
    fc.record({
      type: fc.constant('setAutomation'),
      ...stamp,
      enabled: fc.boolean(),
      intervalMs: positive,
    }),
  ];
  return fc.oneof(...arbitraries) as fc.Arbitrary<GameEvent>;
}
