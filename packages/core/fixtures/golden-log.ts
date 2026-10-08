import { automationUnlocked, bestPayback } from '../src/automation';
import { wallMs, type WallMs } from '../src/clock';
import type { Course } from '../src/course';
import { parseEvent, PROMPT_TYPES, type GameEvent } from '../src/events';
import { stateHash } from '../src/hash';
import { journeyDurationMs, journeyStatus } from '../src/journeys';
import { apply, replay } from '../src/log';
import { reviewQueue } from '../src/memory';
import { nextFloat, nextInt, seedRng, type RngState } from '../src/rng';
import { sailPreview } from '../src/sail';
import { advance } from '../src/sim';
import { initialState, type GameState } from '../src/state';
import {
  journeySlots,
  pemanduIntervalsMs,
  upgradeCatalogue,
} from '../src/upgrades';
import { BOT_EPOCH_WALL_MS, syntheticCourse } from './synthetic-course';

/**
 * The golden event log (M1 design §7, #34 AC5): a seeded 5-week
 * Diligent-style player on the synthetic course, written as a committed
 * fixture by `npm run golden-log` and replayed in Node and in each browser
 * engine to the same `stateHash`.
 *
 * The player opens 5 times a day for 8 minutes (60 minutes on the first
 * open), between 08:00 and 22:00, and records `resume` on each open. It
 * collects returned Journeys, answers every due review (correct with the
 * word's retrievability), restarts Journeys with the longest duration that
 * returns before the next open, buys upgrades in catalogue order and grammar
 * nodes in course order when it can, turns Pemandu on once it opens and
 * moves it to the fastest interval it owns, sails
 * as soon as it can, and in between buys the Encounter that pays back
 * soonest (until Pemandu buys for it), picks up words and practises one.
 * It taps Listen while it owns nothing.
 *
 * So the replay exercises refusals too, each open also sends one event the
 * rules refuse (a stale `seq`, a review not due, an unknown Encounter, an
 * empty slot, an unmet sail, an unknown upgrade), and once a day the device
 * clock steps back 5 minutes, which `apply` clamps. The refusal goes after
 * collecting and reviewing and before Journeys restart, so a slot that has
 * just been collected is empty when an empty-slot refusal is drawn (on #35's
 * balance every slot was busy by the end of the open, and none was sent).
 */

export const GOLDEN = {
  courseSeed: 1,
  stateSeed: 34,
  policySeed: 3434,
  days: 35,
} as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** The gap between two events of one burst. */
const STEP_MS = 500;
/** How often an open makes its purchases. */
const PASS_MS = 2 * MINUTE_MS;

export interface GoldenRun {
  readonly initial: GameState;
  readonly events: readonly GameEvent[];
  /** The state the player lived: every event applied as it was decided. */
  readonly live: GameState;
  /** Each day of the play: where it began and what it sent (#473). */
  readonly days: readonly GoldenDay[];
}

/** Where the policy stands at a moment: all it needs to play on from there. */
export interface PlayerStart {
  readonly state: GameState;
  readonly rng: RngState;
  readonly seq: number;
  readonly t: number;
}

/**
 * One day of the golden play (#473): the policy as the day began, the index
 * of the day's first event in the log, and the day's events the rules
 * accepted, by type, and refused, by kind, as the play itself counted them.
 */
export interface GoldenDay {
  readonly day: number;
  readonly from: number;
  readonly start: PlayerStart;
  readonly accepted: Readonly<Record<string, number>>;
  readonly refused: Readonly<Record<string, number>>;
}

/** What one day played again from its recorded start sends, and where it ends. */
export interface PlayedDay {
  readonly events: readonly GameEvent[];
  readonly end: PlayerStart;
  readonly accepted: Readonly<Record<string, number>>;
  readonly refused: Readonly<Record<string, number>>;
}

/** The refusals an open may send, one per open, drawn from the policy stream. */
const REFUSALS = [
  'staleSeq',
  'notDue',
  'unknownEncounter',
  'slotEmpty',
  'sailGoalUnmet',
  'unknownUpgrade',
] as const;

class Player {
  state: GameState;
  private rng: RngState;
  private seq: number;
  private t: number;
  readonly events: GameEvent[] = [];
  private accepted: Record<string, number> = {};
  private refused: Record<string, number> = {};

  constructor(
    private readonly course: Course,
    start: PlayerStart,
  ) {
    this.state = start.state;
    this.rng = start.rng;
    this.seq = start.seq;
    this.t = start.t;
  }

  /** Where the policy stands now: what a day played from here starts from. */
  start(): PlayerStart {
    return { state: this.state, rng: this.rng, seq: this.seq, t: this.t };
  }

  /** What was sent since the last call, accepted by type and refused by kind. */
  takeCounts(): Pick<GoldenDay, 'accepted' | 'refused'> {
    const counts = { accepted: this.accepted, refused: this.refused };
    this.accepted = {};
    this.refused = {};
    return counts;
  }

  float(): number {
    const draw = nextFloat(this.rng);
    this.rng = draw.state;
    return draw.value;
  }

  int(n: number): number {
    const draw = nextInt(this.rng, n);
    this.rng = draw.state;
    return draw.value;
  }

  now(): WallMs {
    return wallMs(this.t);
  }

  /** The state as the player sees it now: advanced, never stored. */
  seen(): GameState {
    return advance(this.course, this.state, this.now()).state;
  }

  /**
   * Send one event at the current time. An accepted one is kept; a refused
   * one is kept only when `expectRefusal` says the player meant it, and an
   * event the player meant to be refused but was accepted is thrown.
   */
  send(event: GameEvent, expectRefusal = false): boolean {
    const result = apply(this.course, this.state, event);
    if (result.ok === expectRefusal) {
      if (expectRefusal) {
        throw new Error(
          `meant to be refused, accepted: ${JSON.stringify(event)}`,
        );
      }
      return false;
    }
    this.events.push(event);
    if (result.ok) {
      this.state = result.state;
      this.accepted[event.type] = (this.accepted[event.type] ?? 0) + 1;
    } else {
      const { kind } = result.rejection;
      this.refused[kind] = (this.refused[kind] ?? 0) + 1;
    }
    this.t += STEP_MS;
    return result.ok;
  }

  /** The fields every event carries, numbering a new one. */
  stamp(): { seq: number; wallMs: WallMs } {
    this.seq += 1;
    return { seq: this.seq, wallMs: this.now() };
  }

  /** Undo the numbering of an event that was not sent. */
  unstamp(): void {
    this.seq -= 1;
  }

  try(make: (stamp: { seq: number; wallMs: WallMs }) => GameEvent): boolean {
    const sent = this.send(make(this.stamp()));
    if (!sent) this.unstamp();
    return sent;
  }

  open(
    start: number,
    lengthMs: number,
    nextOpen: number,
    clockBack: boolean,
  ): void {
    this.t = Math.max(start, this.t + STEP_MS);
    const end = this.t + lengthMs;
    this.try((s) => ({ type: 'resume', ...s }));
    this.collect();
    this.review();
    this.refusal();
    this.journeys(nextOpen);
    this.upgrades();
    this.grammar();
    this.automation();
    let pass = 0;
    while (this.t < end) {
      if (clockBack && pass === 1) {
        // The device clock steps back: clamped, never refused (DN21).
        this.t -= 5 * MINUTE_MS;
        this.try((s) => ({ type: 'listen', ...s }));
        this.t += 5 * MINUTE_MS;
      }
      this.purchases();
      this.t += PASS_MS;
      pass += 1;
    }
  }

  collect(): void {
    for (let slot = 0; slot < journeySlots(this.state); slot += 1) {
      if (journeyStatus(this.seen(), slot) === 'returned') {
        this.try((s) => ({ type: 'collectJourney', ...s, slot }));
      }
    }
  }

  review(): void {
    for (let guard = 0; guard < 200; guard += 1) {
      const item = reviewQueue(this.seen().words, this.now())[0];
      if (item === undefined) return;
      const correct = this.float() < item.retrievability;
      const latencyMs = 1000 + this.int(4000);
      const promptType =
        PROMPT_TYPES[this.int(PROMPT_TYPES.length)] ?? 'choice';
      const event = (s: { seq: number; wallMs: WallMs }): GameEvent => ({
        type: 'answerReview',
        ...s,
        itemId: item.itemId,
        correct,
        latencyMs,
        promptType,
      });
      if (!this.try(event))
        throw new Error(`due review refused: ${item.itemId}`);
    }
  }

  journeys(nextOpen: number): void {
    for (let slot = 0; slot < journeySlots(this.state); slot += 1) {
      if (journeyStatus(this.seen(), slot) !== 'empty') continue;
      const gap = nextOpen - this.t;
      const ids = this.state.tutorialJourneyUsed
        ? (['24h', '8h', '4h', '2h'] as const)
        : (['tutorial'] as const);
      const durationId =
        ids.find((id) => journeyDurationMs(this.state, id) <= gap) ??
        ids[ids.length - 1];
      if (durationId === undefined) return;
      this.try((s) => ({ type: 'startJourney', ...s, slot, durationId }));
    }
  }

  upgrades(): void {
    for (const { id } of upgradeCatalogue(this.course)) {
      while (this.try((s) => ({ type: 'buyUpgrade', ...s, id }))) {
        // Buy every level it can pay for now.
      }
    }
  }

  grammar(): void {
    for (const region of this.course.regions) {
      for (const { id } of region.grammarNodes) {
        if (!this.state.grammar.includes(id)) {
          this.try((s) => ({ type: 'buyGrammarNode', ...s, id }));
        }
      }
    }
  }

  automation(): void {
    if (!automationUnlocked(this.course, this.state)) return;
    const intervalMs = Math.min(...pemanduIntervalsMs(this.state));
    const { enabled, intervalMs: current } = this.state.automation;
    if (enabled && current === intervalMs) return;
    this.try((s) => ({
      type: 'setAutomation',
      ...s,
      enabled: true,
      intervalMs,
    }));
  }

  purchases(): void {
    const preview = sailPreview(this.course, this.seen());
    if (preview.available) {
      const to = preview.next === undefined ? preview.destination : undefined;
      this.try((s) => ({
        type: 'setSail',
        ...s,
        ...(to === undefined ? {} : { to }),
      }));
      return;
    }
    for (let k = 0; k < 5; k += 1) {
      if (this.float() < 0.3 && this.try((s) => ({ type: 'pickUpWord', ...s })))
        continue;
      if (this.state.automation.enabled) break;
      const id = bestPayback(this.course, this.seen());
      if (id === undefined) break;
      this.try((s) => ({ type: 'buyEncounter', ...s, id, count: 1 }));
    }
    if (Object.keys(this.state.owned).length === 0) {
      this.try((s) => ({ type: 'listen', ...s }));
    }
    const word = Object.keys(this.state.words)[0];
    if (word !== undefined && this.float() < 0.2) {
      this.try((s) => ({ type: 'answerPractice', ...s, itemId: word }));
    }
  }

  /** One event the rules refuse, so the replay exercises a refusal. */
  refusal(): void {
    const kind = REFUSALS[this.int(REFUSALS.length)] ?? 'unknownUpgrade';
    const seen = this.seen();
    switch (kind) {
      case 'staleSeq': {
        // A resend: the last accepted event's number again.
        const event: GameEvent = {
          type: 'listen',
          seq: this.state.seq,
          wallMs: this.now(),
        };
        this.send(event, true);
        return;
      }
      case 'notDue': {
        const notDue = Object.entries(seen.words).find(
          ([, word]) => word.card.due > seen.wall,
        );
        const itemId = notDue?.[0] ?? 'noSuchWord';
        this.send(
          { ...this.stamp(), type: 'answerPractice', itemId: 'noSuchWord' },
          true,
        );
        this.send(
          {
            ...this.stamp(),
            type: 'answerReview',
            itemId,
            correct: true,
            latencyMs: 1500,
            promptType: 'choice',
          },
          true,
        );
        return;
      }
      case 'unknownEncounter':
        this.send(
          {
            ...this.stamp(),
            type: 'buyEncounter',
            id: 'noSuchEncounter',
            count: 1,
          },
          true,
        );
        return;
      case 'slotEmpty': {
        const empty = seen.journeys.findIndex((journey) => journey === null);
        const slot = empty < 0 ? 99 : empty;
        this.send({ ...this.stamp(), type: 'collectJourney', slot }, true);
        return;
      }
      case 'sailGoalUnmet':
        if (sailPreview(this.course, seen).available) {
          this.send(
            { ...this.stamp(), type: 'buyUpgrade', id: 'noSuchUpgrade' },
            true,
          );
        } else {
          this.send({ ...this.stamp(), type: 'setSail' }, true);
        }
        return;
      case 'unknownUpgrade':
        this.send(
          { ...this.stamp(), type: 'buyUpgrade', id: 'noSuchUpgrade' },
          true,
        );
        return;
    }
  }
}

/** Day `day` of the golden policy: five opens, their times drawn first. */
function playDay(player: Player, day: number): void {
  const base = BOT_EPOCH_WALL_MS + day * DAY_MS;
  const opens = Array.from(
    { length: 5 },
    () => base + 8 * HOUR_MS + player.int(14 * 3600) * 1000,
  ).sort((a, b) => a - b);
  if (day === 0) opens[0] = base + 8 * HOUR_MS;
  for (let i = 0; i < opens.length; i += 1) {
    const start = opens[i] ?? base;
    const next = opens[i + 1] ?? base + DAY_MS + 8 * HOUR_MS;
    const first = day === 0 && i === 0;
    player.open(start, first ? HOUR_MS : 8 * MINUTE_MS, next, i === 2);
  }
}

/** The policy before its first day: the first state, the policy seed, no events. */
export function goldenPolicyStart(initial: GameState): PlayerStart {
  return {
    state: initial,
    rng: seedRng(GOLDEN.policySeed),
    seq: 0,
    t: initial.wall,
  };
}

/** Play the golden policy for `days` days on `course`. */
export function playGolden(
  course: Course,
  days: number = GOLDEN.days,
): GoldenRun {
  const initial = initialState(wallMs(BOT_EPOCH_WALL_MS), GOLDEN.stateSeed);
  const player = new Player(course, goldenPolicyStart(initial));
  const played: GoldenDay[] = [];
  for (let day = 0; day < days; day += 1) {
    const start = player.start();
    const from = player.events.length;
    playDay(player, day);
    played.push({ day, from, start, ...player.takeCounts() });
  }
  return { initial, events: player.events, live: player.state, days: played };
}

/** Play one recorded day again from its start (#473). */
export function playGoldenDay(course: Course, day: GoldenDay): PlayedDay {
  const player = new Player(course, day.start);
  playDay(player, day.day);
  return { events: player.events, end: player.start(), ...player.takeCounts() };
}

/** The fixture's first line: what the log was played on, and where it ended. */
export interface GoldenHeader {
  readonly format: 1;
  readonly courseSeed: number;
  readonly stateSeed: number;
  readonly policySeed: number;
  readonly days: number;
  readonly startWallMs: number;
  readonly events: number;
  readonly liveHash: string;
}

/** The fixture's text: the header, then one event per line. */
export function writeGolden(
  run: GoldenRun,
  days: number = GOLDEN.days,
): string {
  const header: GoldenHeader = {
    format: 1,
    courseSeed: GOLDEN.courseSeed,
    stateSeed: GOLDEN.stateSeed,
    policySeed: GOLDEN.policySeed,
    days,
    startWallMs: run.initial.wall,
    events: run.events.length,
    liveHash: stateHash(run.live),
  };
  return (
    [header, ...run.events].map((line) => JSON.stringify(line)).join('\n') +
    '\n'
  );
}

/**
 * Read a fixture: the header and every event, each through `parseEvent` as
 * any untrusted log would be. A line that does not parse is thrown by number.
 */
export function readGolden(text: string): {
  readonly header: GoldenHeader;
  readonly events: readonly GameEvent[];
} {
  const lines = text.split('\n').filter((line) => line !== '');
  const [first, ...rest] = lines;
  if (first === undefined) throw new Error('golden log is empty');
  const header = JSON.parse(first) as GoldenHeader;
  const events = rest.map((line, index) => {
    const parsed = parseEvent(JSON.parse(line));
    if (!parsed.ok) {
      throw new Error(
        `golden log line ${String(index + 2)}: ${JSON.stringify(parsed.error)}`,
      );
    }
    return parsed.event;
  });
  if (events.length !== header.events) {
    throw new Error(
      `golden log holds ${String(events.length)} events, header says ${String(header.events)}`,
    );
  }
  return { header, events };
}

/** The course and first state a header names, to replay its log from. */
export function goldenStart(header: GoldenHeader): {
  readonly course: Course;
  readonly initial: GameState;
} {
  return {
    course: syntheticCourse(header.courseSeed),
    initial: initialState(wallMs(header.startWallMs), header.stateSeed),
  };
}

/** What a replay of a fixture's text reached: for the cross-engine check. */
export interface GoldenReplay {
  readonly hash: string;
  readonly events: number;
  readonly refused: number;
}

/** The days fixture's text: one line per day of the play (#473). */
export function writeGoldenDays(run: GoldenRun): string {
  return run.days.map((day) => JSON.stringify(day)).join('\n') + '\n';
}

/**
 * Read the days fixture. Each line is one day, numbered from 0 in order, and
 * a day's first event comes no earlier than the day before's. What a day
 * holds is not checked here: the tests play and replay each day from it.
 */
export function readGoldenDays(text: string): readonly GoldenDay[] {
  const lines = text.split('\n').filter((line) => line !== '');
  if (lines.length === 0) throw new Error('golden days are empty');
  let from = 0;
  return lines.map((line, index) => {
    const day = JSON.parse(line) as GoldenDay;
    if (day.day !== index) {
      throw new Error(
        `golden days line ${String(index + 1)} is day ${String(day.day)}`,
      );
    }
    if (!Number.isSafeInteger(day.from) || day.from < from) {
      throw new Error(
        `golden days line ${String(index + 1)} starts at event ${String(day.from)}, before ${String(from)}`,
      );
    }
    from = day.from;
    return day;
  });
}

/** Read a fixture's text, replay it from the start its header names, and hash the result. */
export function replayGolden(text: string): GoldenReplay {
  const { header, events } = readGolden(text);
  const { course, initial } = goldenStart(header);
  const { state, refused } = replay(course, initial, events);
  return {
    hash: stateHash(state),
    events: events.length,
    refused: refused.length,
  };
}
