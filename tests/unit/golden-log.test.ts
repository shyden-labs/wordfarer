import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN,
  goldenPolicyStart,
  goldenStart,
  playGoldenDay,
  readGolden,
  readGoldenDays,
  replayGolden,
  type GoldenDay,
} from '../../packages/core/fixtures/golden-log';
import type { GameEvent } from '../../packages/core/src/events';
import { stateHash } from '../../packages/core/src/hash';
import { apply, replay } from '../../packages/core/src/log';
import type { GameState } from '../../packages/core/src/state';

/**
 * The golden event log (#34 AC5, AC6; M1 design §7), checked one day per
 * test (#473). `npm run golden-log` writes the log and, beside it, where
 * each day of the play began. For every day, the policy resumed at the
 * day's start writes exactly the day's events, and both `replay` and a walk
 * of the same events with `apply` reach where the next day starts; the last
 * day reaches the live hash the header records. Day 0 starts where a freshly
 * seeded policy does, so the days chain from the first state to the live
 * one, and the live state and its replay are the same state at every day's
 * end. The engines suite replays the whole file in Chromium, WebKit and
 * Firefox.
 */

const FIXTURE = 'packages/core/fixtures/golden-log.jsonl';
const DAYS_FIXTURE = 'packages/core/fixtures/golden-days.jsonl';
const REGENERATE = 'regenerate with `npm run golden-log`';

/**
 * Accepted events by type in the fixture, measured when #35's tuned balance
 * regenerated it (2026-10-04); each floor is the measured figure less one and
 * the count must exceed it, so it may not fall below the measurement and a
 * type measured once cannot vanish. Regenerating the log may move them,
 * deliberately. On this balance Insight comes early, so Pemandu opens with
 * its fastest interval already owned and `setAutomation` is sent once.
 */
const ACCEPTED_FLOORS: Readonly<Record<GameEvent['type'], number>> = {
  resume: 174, // 175
  listen: 114, // 115
  buyEncounter: 1664, // 1665
  pickUpWord: 282, // 283
  answerReview: 2011, // 2012
  answerPractice: 123, // 124
  buyUpgrade: 27, // 28
  startJourney: 315, // 316
  collectJourney: 312, // 313
  setSail: 7, // 8
  buyGrammarNode: 11, // 12
  setAutomation: 0, // 1
};

/** Refused events by kind in the fixture, measured likewise, less one. */
const REFUSED_FLOORS: Readonly<Record<string, number>> = {
  staleSeq: 29, // 30
  notDue: 30, // 31
  unknownWord: 34, // 35
  unknownEncounter: 27, // 28
  slotEmpty: 11, // 12
  unknownSlot: 10, // 11
  sailGoalUnmet: 28, // 29
  unknownUpgrade: 31, // 32
};

/** The days the golden policy plays, known before the run: one test each. */
const DAYS = Array.from({ length: GOLDEN.days }, (_, day) => day);
/** Every day but the last, which ends at the live hash rather than a next day. */
const DAYS_WITH_A_NEXT = DAYS.slice(0, -1);
const LAST_DAY = GOLDEN.days - 1;

let read:
  | {
      readonly text: string;
      readonly daysText: string;
      readonly header: ReturnType<typeof readGolden>['header'];
      readonly events: readonly GameEvent[];
      readonly days: readonly GoldenDay[];
      readonly course: ReturnType<typeof goldenStart>['course'];
      readonly initial: GameState;
    }
  | undefined;

/** Both fixtures, read on first use rather than at collection (#97): no replay. */
function fixtures(): NonNullable<typeof read> {
  if (read === undefined) {
    const text = readFileSync(FIXTURE, 'utf8');
    const daysText = readFileSync(DAYS_FIXTURE, 'utf8');
    const { header, events } = readGolden(text);
    const { course, initial } = goldenStart(header);
    const days = readGoldenDays(daysText);
    read = { text, daysText, header, events, days, course, initial };
  }
  return read;
}

/** Day `n` as recorded, its events in the log, and the day after it, if any. */
function dayOf(n: number): {
  readonly day: GoldenDay;
  readonly events: readonly GameEvent[];
  /** The day's events as the fixture's own lines, the header line not counted. */
  readonly lines: readonly string[];
  readonly next: GoldenDay | undefined;
} {
  const { text, events, days } = fixtures();
  const day = days[n];
  if (day === undefined)
    throw new Error(`${DAYS_FIXTURE} has no day ${String(n)}`);
  const next = days[n + 1];
  const to = next?.from ?? events.length;
  return {
    day,
    events: events.slice(day.from, to),
    lines: text.split('\n').slice(1 + day.from, 1 + to),
    next,
  };
}

/** Day `n`'s start's successor: the next day's recorded start, which must exist. */
function nextStart(n: number): GoldenDay['start'] {
  const { next } = dayOf(n);
  if (next === undefined) throw new Error(`day ${String(n)} is the last day`);
  return next.start;
}

/** Walk events from a state with `apply`, counting what is accepted and refused. */
function walk(
  state: GameState,
  events: readonly GameEvent[],
): Pick<GoldenDay, 'accepted' | 'refused'> & { readonly state: GameState } {
  const { course } = fixtures();
  let current = state;
  const accepted: Record<string, number> = {};
  const refused: Record<string, number> = {};
  for (const event of events) {
    const result = apply(course, current, event);
    if (result.ok) {
      current = result.state;
      accepted[event.type] = (accepted[event.type] ?? 0) + 1;
    } else {
      const { kind } = result.rejection;
      refused[kind] = (refused[kind] ?? 0) + 1;
    }
  }
  return { state: current, accepted, refused };
}

/** The recorded counts of every day added up: each day's own tests prove its counts. */
function totals(
  which: 'accepted' | 'refused',
): Readonly<Record<string, number>> {
  const sum: Record<string, number> = {};
  for (const day of fixtures().days) {
    for (const [key, n] of Object.entries(day[which]))
      sum[key] = (sum[key] ?? 0) + n;
  }
  return sum;
}

const total = (counts: Readonly<Record<string, number>>): number =>
  Object.values(counts).reduce((a, b) => a + b, 0);

describe('the golden log fixture (AC5)', () => {
  it('was played with the golden seeds for 5 weeks', () => {
    expect(fixtures().header).toMatchObject({
      format: 1,
      courseSeed: GOLDEN.courseSeed,
      stateSeed: GOLDEN.stateSeed,
      policySeed: GOLDEN.policySeed,
      days: 35,
    });
  });

  it('records one day for each day the policy plays', () => {
    expect(fixtures().days.map((day) => day.day)).toEqual(DAYS);
  });

  it('starts its first day at the first event, where a freshly seeded policy starts', () => {
    const { days, initial } = fixtures();
    expect(days[0]?.from).toBe(0);
    expect(days[0]?.start).toEqual(goldenPolicyStart(initial));
  });

  it('opens with the header line writeGolden writes', () => {
    const { text, header, events, initial } = fixtures();
    const written = JSON.stringify({
      format: 1,
      courseSeed: GOLDEN.courseSeed,
      stateSeed: GOLDEN.stateSeed,
      policySeed: GOLDEN.policySeed,
      days: GOLDEN.days,
      startWallMs: initial.wall,
      events: events.length,
      liveHash: header.liveHash,
    });
    expect(text.split('\n')[0], REGENERATE).toBe(written);
  });

  it('keeps its days in the form writeGoldenDays writes', () => {
    const { daysText, days } = fixtures();
    expect(
      days.map((day) => JSON.stringify(day)).join('\n') + '\n' === daysText,
      REGENERATE,
    ).toBe(true);
  });

  it.each(DAYS_WITH_A_NEXT)(
    'day %i: the policy, resumed at its start, writes exactly its events and ends where the next day starts',
    (n) => {
      const { day, events, lines } = dayOf(n);
      const played = playGoldenDay(fixtures().course, day);
      expect(played.events, REGENERATE).toEqual(events);
      expect(
        played.events.map((e) => JSON.stringify(e)),
        REGENERATE,
      ).toEqual(lines);
      expect(played.end, REGENERATE).toEqual(nextStart(n));
      expect({ accepted: played.accepted, refused: played.refused }).toEqual({
        accepted: day.accepted,
        refused: day.refused,
      });
    },
  );

  it('the last day: the policy, resumed at its start, writes exactly its events and ends at the live hash', () => {
    const { day, events, lines } = dayOf(LAST_DAY);
    const played = playGoldenDay(fixtures().course, day);
    expect(played.events, REGENERATE).toEqual(events);
    expect(
      played.events.map((e) => JSON.stringify(e)),
      REGENERATE,
    ).toEqual(lines);
    expect(stateHash(played.end.state), REGENERATE).toBe(
      fixtures().header.liveHash,
    );
    expect({ accepted: played.accepted, refused: played.refused }).toEqual({
      accepted: day.accepted,
      refused: day.refused,
    });
  });

  it.each(DAYS_WITH_A_NEXT)(
    'day %i: replay of its events from its start reaches where the next day starts',
    (n) => {
      const { day, events } = dayOf(n);
      const replayed = replay(fixtures().course, day.start.state, events);
      expect(replayed.state, REGENERATE).toEqual(nextStart(n).state);
      expect(replayed.refused).toHaveLength(total(day.refused));
    },
  );

  it('the last day: replay of its events from its start reaches the live hash', () => {
    const { day, events } = dayOf(LAST_DAY);
    const replayed = replay(fixtures().course, day.start.state, events);
    expect(stateHash(replayed.state), REGENERATE).toBe(
      fixtures().header.liveHash,
    );
    expect(replayed.refused).toHaveLength(total(day.refused));
  });

  it.each(DAYS_WITH_A_NEXT)(
    'day %i: a walk of its events with apply reaches where the next day starts and counts what was recorded',
    (n) => {
      const { day, events } = dayOf(n);
      const walked = walk(day.start.state, events);
      expect(walked.state, REGENERATE).toEqual(nextStart(n).state);
      expect({ accepted: walked.accepted, refused: walked.refused }).toEqual({
        accepted: day.accepted,
        refused: day.refused,
      });
    },
  );

  it('the last day: a walk of its events with apply reaches the live hash and counts what was recorded', () => {
    const { day, events } = dayOf(LAST_DAY);
    const walked = walk(day.start.state, events);
    expect(stateHash(walked.state), REGENERATE).toBe(
      fixtures().header.liveHash,
    );
    expect({ accepted: walked.accepted, refused: walked.refused }).toEqual({
      accepted: day.accepted,
      refused: day.refused,
    });
  });

  it.each(Object.entries(ACCEPTED_FLOORS))(
    'accepts %s events, at least the floor',
    (type, floor) => {
      expect(totals('accepted')[type] ?? 0).toBeGreaterThan(floor);
    },
  );

  it.each(Object.entries(REFUSED_FLOORS))(
    'refuses %s events, at least the floor',
    (kind, floor) => {
      expect(totals('refused')[kind] ?? 0).toBeGreaterThan(floor);
    },
  );

  it('refuses nothing else', () => {
    expect(Object.keys(totals('refused')).sort()).toEqual(
      Object.keys(REFUSED_FLOORS).sort(),
    );
  });

  it('steps the device clock back once a day (AC3): 35 measured', () => {
    let clockBack = 0;
    let latest = 0;
    for (const event of fixtures().events) {
      if (event.wallMs < latest) clockBack += 1;
      latest = Math.max(latest, event.wallMs);
    }
    expect(clockBack).toBeGreaterThanOrEqual(34);
  });
});

describe('the live state and its replay (AC6)', () => {
  it('start from the same state', () => {
    const { header, days } = fixtures();
    expect(goldenStart(header).initial).toEqual(days[0]?.start.state);
  });
});

describe('replayGolden (AC5)', () => {
  /** The fixture's first day alone, its header's count set to match. */
  function firstDay(): string {
    const { text, days } = fixtures();
    const length = days[1]?.from ?? 0;
    const lines = text.split('\n').slice(0, length + 1);
    const header = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    lines[0] = JSON.stringify({ ...header, events: length });
    return lines.join('\n') + '\n';
  }

  it('gives Node, over the first day, the hash of where the second day starts', () => {
    const { days } = fixtures();
    expect(replayGolden(firstDay())).toEqual({
      hash: stateHash(nextStart(0).state),
      events: days[1]?.from,
      refused: total(days[0]?.refused ?? {}),
    });
  });
});

describe('readGolden (AC5)', () => {
  /** The fixture's first 20 lines with its header's count set to match. */
  function head(): string[] {
    const lines = readFileSync(FIXTURE, 'utf8').split('\n').slice(0, 21);
    const header = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    lines[0] = JSON.stringify({ ...header, events: 20 });
    return lines;
  }

  it('reads a well-formed log', () => {
    expect(readGolden(head().join('\n')).events).toHaveLength(20);
  });

  it('names the line that does not parse', () => {
    const lines = head();
    lines[3] = JSON.stringify({ type: 'listen', seq: 0, wallMs: 0 });
    expect(() => readGolden(lines.join('\n'))).toThrow('golden log line 4');
  });

  it('refuses a log whose length differs from its header', () => {
    expect(() => readGolden(head().slice(0, -2).join('\n'))).toThrow(
      'header says',
    );
  });

  it('refuses an empty log', () => {
    expect(() => readGolden('')).toThrow('empty');
  });
});

describe('readGoldenDays (#473)', () => {
  /** The days fixture's first three lines. */
  function firstDays(): string[] {
    return readFileSync(DAYS_FIXTURE, 'utf8').split('\n').slice(0, 3);
  }

  it('reads well-formed days', () => {
    expect(readGoldenDays(firstDays().join('\n')).map((d) => d.day)).toEqual([
      0, 1, 2,
    ]);
  });

  it('names a line whose day is out of order', () => {
    const lines = firstDays();
    [lines[1], lines[2]] = [lines[2] ?? '', lines[1] ?? ''];
    expect(() => readGoldenDays(lines.join('\n'))).toThrow(
      'golden days line 2 is day 2',
    );
  });

  it('names a line whose first event comes before the day before’s', () => {
    const lines = firstDays();
    const second = JSON.parse(lines[1] ?? '{}') as Record<string, unknown>;
    lines[1] = JSON.stringify({ ...second, from: -1 });
    expect(() => readGoldenDays(lines.join('\n'))).toThrow(
      'golden days line 2 starts at event -1',
    );
  });

  it('refuses empty days', () => {
    expect(() => readGoldenDays('')).toThrow('empty');
  });
});
