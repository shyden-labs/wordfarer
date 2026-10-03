import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN,
  goldenStart,
  playGolden,
  readGolden,
  writeGolden,
  type GoldenRun,
} from '../../packages/core/fixtures/golden-log';
import { syntheticCourse } from '../../packages/core/fixtures/synthetic-course';
import type { GameEvent } from '../../packages/core/src/events';
import { stateHash } from '../../packages/core/src/hash';
import { apply, replay, type Replayed } from '../../packages/core/src/log';
import type { GameState } from '../../packages/core/src/state';

/**
 * The golden event log (#34 AC5, AC6; M1 design §7). The committed fixture
 * is exactly what the golden policy writes, it replays in Node to the live
 * hash its header records, and the engines suite replays the same file in
 * Chromium, WebKit and Firefox. The live 5-week state and the replay of its
 * log, read back through JSON and `parseEvent`, are the same state.
 */

const FIXTURE = 'packages/core/fixtures/golden-log.jsonl';
const REGENERATE = 'regenerate with `npm run golden-log`';

/**
 * Accepted events by type in the fixture, measured when #34 wrote it; each
 * floor is the measured figure less one. Regenerating the log may move
 * them, deliberately.
 */
const ACCEPTED_FLOORS: Readonly<Record<GameEvent['type'], number>> = {
  resume: 174, // 175
  listen: 60, // 61
  buyEncounter: 112, // 113
  pickUpWord: 294, // 295
  answerReview: 2071, // 2072
  answerPractice: 145, // 146
  buyUpgrade: 33, // 34
  startJourney: 321, // 322
  collectJourney: 318, // 319
  setSail: 10, // 11
  buyGrammarNode: 6, // 7
  setAutomation: 3, // 4
};

/** Refused events by kind in the fixture, measured likewise, less one. */
const REFUSED_FLOORS: Readonly<Record<string, number>> = {
  staleSeq: 30, // 31
  notDue: 25, // 26
  unknownWord: 27, // 28
  unknownEncounter: 20, // 21
  slotEmpty: 10, // 11
  unknownSlot: 18, // 19
  sailGoalUnmet: 32, // 33
  unknownUpgrade: 32, // 33
};

interface Walked {
  readonly state: GameState;
  readonly accepted: Readonly<Record<string, number>>;
  readonly refused: Readonly<Record<string, number>>;
  /** Events whose wall time is before an earlier event's. */
  readonly clockBack: number;
}

let fixture: { text: string; replayed: Replayed; walked: Walked } | undefined;

/**
 * The fixture, read, replayed and walked once, on first use rather than at
 * collection (#97). The walk applies each event itself and counts what it
 * sees, independently of `replay`.
 */
function golden(): NonNullable<typeof fixture> {
  if (fixture === undefined) {
    const text = readFileSync(FIXTURE, 'utf8');
    const { header, events } = readGolden(text);
    const { course, initial } = goldenStart(header);
    let state = initial;
    const accepted: Record<string, number> = {};
    const refused: Record<string, number> = {};
    let clockBack = 0;
    let latest = 0;
    for (const event of events) {
      const result = apply(course, state, event);
      if (result.ok) {
        state = result.state;
        accepted[event.type] = (accepted[event.type] ?? 0) + 1;
      } else {
        const { kind } = result.rejection;
        refused[kind] = (refused[kind] ?? 0) + 1;
      }
      if (event.wallMs < latest) clockBack += 1;
      latest = Math.max(latest, event.wallMs);
    }
    fixture = {
      text,
      replayed: replay(course, initial, events),
      walked: { state, accepted, refused, clockBack },
    };
  }
  return fixture;
}

let played: GoldenRun | undefined;
/** The golden policy's 5 weeks, played live once (about 5 s of CPU). */
function live(): GoldenRun {
  played ??= playGolden(syntheticCourse(GOLDEN.courseSeed));
  return played;
}

// Whichever test runs first reads, replays and walks the 5-week log, or
// plays it (about 4 s and 5 s of CPU alone, more beside the parallel
// suite), so each may take long.
describe('the golden log fixture (AC5)', { timeout: 600_000 }, () => {
  it('was played with the golden seeds for 5 weeks', () => {
    const { header } = readGolden(readFileSync(FIXTURE, 'utf8'));
    expect(header).toMatchObject({
      format: 1,
      courseSeed: GOLDEN.courseSeed,
      stateSeed: GOLDEN.stateSeed,
      policySeed: GOLDEN.policySeed,
      days: 35,
    });
  });

  it('is exactly what the golden policy writes', () => {
    expect(writeGolden(live()) === golden().text, REGENERATE).toBe(true);
  });

  it('replays in Node to the live hash its header records', () => {
    const { text, replayed } = golden();
    expect(stateHash(replayed.state), REGENERATE).toBe(
      readGolden(text).header.liveHash,
    );
  });

  it('replay reaches the state a walk of the same events reaches', () => {
    const { replayed, walked } = golden();
    expect(replayed.state).toEqual(walked.state);
    expect(replayed.refused).toHaveLength(
      Object.values(walked.refused).reduce((a, b) => a + b, 0),
    );
  });

  it.each(Object.entries(ACCEPTED_FLOORS))(
    'accepts %s events, at least the floor',
    (type, floor) => {
      expect(golden().walked.accepted[type] ?? 0).toBeGreaterThanOrEqual(floor);
    },
  );

  it.each(Object.entries(REFUSED_FLOORS))(
    'refuses %s events, at least the floor',
    (kind, floor) => {
      expect(golden().walked.refused[kind] ?? 0).toBeGreaterThanOrEqual(floor);
    },
  );

  it('refuses nothing else', () => {
    expect(Object.keys(golden().walked.refused).sort()).toEqual(
      Object.keys(REFUSED_FLOORS).sort(),
    );
  });

  it('steps the device clock back once a day (AC3): 35 measured', () => {
    expect(golden().walked.clockBack).toBeGreaterThanOrEqual(34);
  });
});

describe('the live state and its replay (AC6)', { timeout: 600_000 }, () => {
  it('are deep-equal, the log read back through JSON and parseEvent', () => {
    expect(golden().replayed.state).toEqual(live().live);
  });

  it('start from the same state', () => {
    const { header } = readGolden(golden().text);
    expect(goldenStart(header).initial).toEqual(live().initial);
  });

  it('hash equally', () => {
    expect(stateHash(live().live)).toBe(stateHash(golden().replayed.state));
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
