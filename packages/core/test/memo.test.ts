import { describe, expect, it } from 'vitest';
import { HOUR_MS, simMs, wallMs, type WallMs } from '../src/clock';
import type { Course, Encounter } from '../src/course';
import { Num } from '../src/num';
import { understandingNow } from '../src/production';
import { advance } from '../src/sim';
import { initialState, type GameState } from '../src/state';

/**
 * A state's Understanding and its advance to a wall time are worked out once
 * and kept by the state object (#473): asking again returns what was kept,
 * and nothing kept changes an answer. The courses are declared here, so two
 * of them can give one state different rates.
 */

function courseOf(p0: number): Course {
  const tea: Encounter = { id: 'tea', tags: ['food'], c0: 10, p0 };
  return {
    id: `course-${String(p0)}`,
    tags: ['food'],
    regions: [
      {
        id: 'r0',
        destinations: [],
        encounters: [tea],
        cardSets: [],
        cultureCards: [],
        grammarNodes: [],
      },
    ],
  };
}

const slow = courseOf(0.1);
const fast = courseOf(2);

const START: WallMs = wallMs(Date.UTC(2027, 0, 4));

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Three tea, anchored at 0 with 5 Understanding, two hours on. */
function state(): GameState {
  const base = initialState(START, 1);
  return deepFreeze({
    ...base,
    sim: simMs(2 * HOUR_MS),
    wall: wallMs(START + 2 * HOUR_MS),
    anchor: { sim: simMs(0), understanding: Num.toTuple(Num.from(5)) },
    owned: { tea: 3 },
  });
}

const LATER = wallMs(START + 3 * HOUR_MS);
const LATEST = wallMs(START + 5 * HOUR_MS);

describe('understandingNow is worked out once per state (#473)', () => {
  it('returns the Num it kept when asked again for the same state', () => {
    const s = state();
    expect(understandingNow(slow, s)).toBe(understandingNow(slow, s));
  });

  it('gives a copy of the state the same Understanding', () => {
    const s = state();
    expect(Num.toTuple(understandingNow(slow, { ...s }))).toEqual(
      Num.toTuple(understandingNow(slow, s)),
    );
  });

  it('keeps each course apart: one state, two courses, two answers', () => {
    const s = state();
    const onSlow = Num.toTuple(understandingNow(slow, s));
    const onFast = Num.toTuple(understandingNow(fast, s));
    expect(onFast).not.toEqual(onSlow);
    expect(onFast).toEqual(Num.toTuple(understandingNow(fast, { ...s })));
  });
});

describe('advance is worked out once per state and wall time (#473)', () => {
  it('returns the result it kept when asked again for the same time', () => {
    const s = state();
    expect(advance(slow, s, LATER)).toBe(advance(slow, s, LATER));
  });

  it('gives a copy of the state an equal result', () => {
    const s = state();
    expect(advance(slow, { ...s }, LATER)).toEqual(advance(slow, s, LATER));
  });

  it('works out a new time afresh, not the time it kept', () => {
    const s = state();
    advance(slow, s, LATER);
    expect(advance(slow, s, LATEST)).toEqual(advance(slow, { ...s }, LATEST));
  });

  it('works out the first time again after a second replaced it', () => {
    const s = state();
    advance(slow, s, LATER);
    advance(slow, s, LATEST);
    expect(advance(slow, s, LATER)).toEqual(advance(slow, { ...s }, LATER));
  });

  it('keeps each course apart: one state, two courses, two results', () => {
    const s = state();
    const onSlow = advance(slow, s, LATER);
    const onFast = advance(fast, s, LATER);
    expect(onFast.summary.understandingEarned).not.toEqual(
      onSlow.summary.understandingEarned,
    );
    expect(onFast).toEqual(advance(fast, { ...s }, LATER));
  });
});
