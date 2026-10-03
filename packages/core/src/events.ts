/**
 * The player's actions as typed, serialisable events, and the validator that
 * turns untrusted input into one (M1 design §4, #34).
 *
 * Every event carries `seq`, which orders the log, and `wallMs`, the device's
 * wall clock when it happened. `parseEvent` checks a stored log or a request
 * body field by field and returns the first defect as a typed `EventError`,
 * never a throw, so M5 can report exactly what a client sent.
 */
import type { WallMs } from './clock';

/** Parent §3.4's prompt types: multiple choice, typed answer, sentence tiles. */
export const PROMPT_TYPES = ['choice', 'typed', 'tiles'] as const;
export type PromptType = (typeof PROMPT_TYPES)[number];

interface Stamp {
  /** The event's place in the log: above every accepted event's before it. */
  readonly seq: number;
  /** The device's wall clock; an earlier time than the state's is clamped. */
  readonly wallMs: WallMs;
}

export type GameEvent = Stamp &
  (
    | { readonly type: 'resume' }
    | { readonly type: 'listen' }
    | {
        readonly type: 'buyEncounter';
        readonly id: string;
        readonly count: number;
      }
    | { readonly type: 'pickUpWord' }
    | {
        readonly type: 'answerReview';
        readonly itemId: string;
        readonly correct: boolean;
        readonly latencyMs: number;
        readonly promptType: PromptType;
      }
    | { readonly type: 'answerPractice'; readonly itemId: string }
    | { readonly type: 'buyUpgrade'; readonly id: string }
    | {
        readonly type: 'startJourney';
        readonly slot: number;
        readonly durationId: string;
      }
    | { readonly type: 'collectJourney'; readonly slot: number }
    | { readonly type: 'setSail'; readonly to?: string }
    | { readonly type: 'buyGrammarNode'; readonly id: string }
    | {
        readonly type: 'setAutomation';
        readonly enabled: boolean;
        readonly intervalMs: number;
      }
  );

export type EventType = GameEvent['type'];

export type EventError =
  | { readonly kind: 'notAnObject' }
  | { readonly kind: 'unknownType'; readonly found: string }
  | { readonly kind: 'missingField'; readonly field: string }
  | {
      readonly kind: 'wrongType';
      readonly field: string;
      readonly expected: 'string' | 'boolean' | 'integer';
    }
  | {
      readonly kind: 'notInteger';
      readonly field: string;
      readonly value: number;
    }
  | {
      readonly kind: 'outOfRange';
      readonly field: string;
      readonly value: number;
      readonly min: number;
    }
  | {
      readonly kind: 'notOneOf';
      readonly field: string;
      readonly value: string;
      readonly allowed: readonly string[];
    }
  | { readonly kind: 'unexpectedField'; readonly field: string };

export type ParsedEvent =
  | { readonly ok: true; readonly event: GameEvent }
  | { readonly ok: false; readonly error: EventError };

type Field =
  | { readonly name: string; readonly kind: 'string'; readonly optional?: true }
  | { readonly name: string; readonly kind: 'boolean' }
  | { readonly name: string; readonly kind: 'integer'; readonly min: number }
  | { readonly name: string; readonly kind: 'promptType' };

const STAMP: readonly Field[] = [
  { name: 'seq', kind: 'integer', min: 1 },
  { name: 'wallMs', kind: 'integer', min: 0 },
];

/** Each type's fields after `type`, in the order they are checked. */
const SHAPES: Readonly<Record<EventType, readonly Field[]>> = {
  resume: STAMP,
  listen: STAMP,
  buyEncounter: [
    ...STAMP,
    { name: 'id', kind: 'string' },
    { name: 'count', kind: 'integer', min: 1 },
  ],
  pickUpWord: STAMP,
  answerReview: [
    ...STAMP,
    { name: 'itemId', kind: 'string' },
    { name: 'correct', kind: 'boolean' },
    { name: 'latencyMs', kind: 'integer', min: 0 },
    { name: 'promptType', kind: 'promptType' },
  ],
  answerPractice: [...STAMP, { name: 'itemId', kind: 'string' }],
  buyUpgrade: [...STAMP, { name: 'id', kind: 'string' }],
  startJourney: [
    ...STAMP,
    { name: 'slot', kind: 'integer', min: 0 },
    { name: 'durationId', kind: 'string' },
  ],
  collectJourney: [...STAMP, { name: 'slot', kind: 'integer', min: 0 }],
  setSail: [...STAMP, { name: 'to', kind: 'string', optional: true }],
  buyGrammarNode: [...STAMP, { name: 'id', kind: 'string' }],
  setAutomation: [
    ...STAMP,
    { name: 'enabled', kind: 'boolean' },
    { name: 'intervalMs', kind: 'integer', min: 1 },
  ],
};

/** The event types, `resume` first and then in design §4's order. */
export const EVENT_TYPES = Object.keys(SHAPES) as readonly EventType[];

/** Whether `input` is plain data's object: a prototype of `Object` or none. */
export function isPlainObject(
  input: unknown,
): input is Readonly<Record<string, unknown>> {
  if (typeof input !== 'object' || input === null) return false;
  const proto: unknown = Object.getPrototypeOf(input);
  return proto === Object.prototype || proto === null;
}

function isEventType(type: string): type is EventType {
  return Object.hasOwn(SHAPES, type);
}

/** The first defect of one field's value, or `undefined` when it is valid. */
function fieldError(field: Field, value: unknown): EventError | undefined {
  const { name } = field;
  switch (field.kind) {
    case 'string':
      return typeof value === 'string'
        ? undefined
        : { kind: 'wrongType', field: name, expected: 'string' };
    case 'boolean':
      return typeof value === 'boolean'
        ? undefined
        : { kind: 'wrongType', field: name, expected: 'boolean' };
    case 'promptType':
      if (typeof value !== 'string') {
        return { kind: 'wrongType', field: name, expected: 'string' };
      }
      return (PROMPT_TYPES as readonly string[]).includes(value)
        ? undefined
        : { kind: 'notOneOf', field: name, value, allowed: PROMPT_TYPES };
    case 'integer':
      if (typeof value !== 'number') {
        return { kind: 'wrongType', field: name, expected: 'integer' };
      }
      if (!Number.isSafeInteger(value)) {
        return { kind: 'notInteger', field: name, value };
      }
      return value < field.min
        ? { kind: 'outOfRange', field: name, value, min: field.min }
        : undefined;
  }
}

/**
 * Turn untrusted input into a `GameEvent`, or the first defect found: not a
 * plain object, a missing or unknown `type`, then each of that type's fields
 * in order (missing, of the wrong type, not a safe integer, out of range),
 * then any field the type does not have, in code-unit order. An optional
 * field is absent or of its type. The event returned is a fresh object
 * holding only the type's fields.
 */
export function parseEvent(input: unknown): ParsedEvent {
  if (!isPlainObject(input)) {
    return { ok: false, error: { kind: 'notAnObject' } };
  }
  if (!Object.hasOwn(input, 'type')) {
    return { ok: false, error: { kind: 'missingField', field: 'type' } };
  }
  const type = input['type'];
  if (typeof type !== 'string' || !isEventType(type)) {
    const found =
      typeof type === 'string' ? type : type === null ? 'null' : typeof type;
    return { ok: false, error: { kind: 'unknownType', found } };
  }
  const fields = SHAPES[type];
  const event: Record<string, unknown> = { type };
  for (const field of fields) {
    if (!Object.hasOwn(input, field.name)) {
      if (field.kind === 'string' && field.optional === true) continue;
      return { ok: false, error: { kind: 'missingField', field: field.name } };
    }
    const value = input[field.name];
    const error = fieldError(field, value);
    if (error !== undefined) return { ok: false, error };
    event[field.name] = value;
  }
  const known = new Set(['type', ...fields.map((f) => f.name)]);
  const unexpected = Object.keys(input)
    .filter((key) => !known.has(key))
    .sort();
  const first = unexpected[0];
  if (first !== undefined) {
    return { ok: false, error: { kind: 'unexpectedField', field: first } };
  }
  // Every field of the type's shape was checked just above, and nothing
  // else was copied, so the object is the union member `type` names.
  return { ok: true, event: event as unknown as GameEvent };
}
