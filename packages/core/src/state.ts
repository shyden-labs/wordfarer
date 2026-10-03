/**
 * The game state and its anchor (M1 design §2.2, §2.3, §4).
 *
 * State is plain, serialisable data: integer-millisecond clocks, `Num`s as
 * `[mantissa, exponent]` tuples, counts as integers. Every stored quantity is
 * its value at the **anchor**, the simulated time of the last event; values at
 * any later time are derived and never stored. That is what makes splitting
 * an interval unable to change any stored arithmetic.
 */
import { BALANCE, type JourneyDurationId } from './balance';
import { simMs, type SimMs, type WallMs } from './clock';
import type { WordMemory } from './memory';
import { Num, type NumTuple } from './num';
import { createStreams, type RngStreams } from './rng';

/** The state's own random streams, one per purpose (design §3). */
export const RNG_STREAMS = ['cards'] as const;

/** A Journey out in a slot (design §5, #30). */
export interface Journey {
  readonly durationId: JourneyDurationId;
  /** The simulated time it returns, fixed when it started. */
  readonly returnsAt: SimMs;
  /** The culture card it brings back, drawn when it started. */
  readonly cardId: string;
}

/** Pemandu's setting (design §5, #33): off or on, at the interval chosen. */
export interface Automation {
  readonly enabled: boolean;
  /** The tick interval, one of those owned; kept while Pemandu is off. */
  readonly intervalMs: number;
}

export interface Anchor {
  /** The simulated time the stored quantities hold at. */
  readonly sim: SimMs;
  readonly understanding: NumTuple;
}

export interface GameState {
  /** The simulated (economy) clock. */
  readonly sim: SimMs;
  /** The latest wall-clock time seen: drives memory and the calendar. */
  readonly wall: WallMs;
  readonly anchor: Anchor;
  /** Encounters owned, by id. An id that is absent is owned 0 times. */
  readonly owned: Readonly<Record<string, number>>;
  /** Insight held. Only correct due reviews earn it, so it never accrues between events. */
  readonly insight: NumTuple;
  /** Words picked up, by lexicon item id: each one's rank and FSRS card. */
  readonly words: Readonly<Record<string, WordMemory>>;
  /**
   * The simulated time since which every word's retrievability curve and the
   * wall-minus-sim skew have held unchanged: the last review or offline-cap
   * clip. Each word's mean R in an hour bucket is taken from here or the
   * bucket's start, whichever is later (design §2.2 item 3).
   */
  readonly memorySince: SimMs;
  /** Passport Stamps held: what stamp upgrades are paid from. */
  readonly stamps: number;
  /**
   * Every stamp ever earned: the global production bonus counts these, so
   * spending stamps never lowers it (operator, 2026-10-02, #29).
   */
  readonly stampsEarned: number;
  /** Upgrade levels, by upgrade id. An id that is absent is at level 0. */
  readonly upgrades: Readonly<Record<string, number>>;
  /** The random streams, named by `RNG_STREAMS`, so a replay draws the same. */
  readonly rng: RngStreams;
  /** Each Journey slot in turn, `null` when empty: `BALANCE.journeys.maxSlots` long. */
  readonly journeys: readonly (Journey | null)[];
  /** Culture cards held, by id, in the order they were collected. */
  readonly cards: readonly string[];
  /** Whether the once-per-game tutorial Journey has been started. */
  readonly tutorialJourneyUsed: boolean;
  /**
   * The current destination's number: the course's destinations counted
   * region by region in course order, from 0 (design §5, #31).
   */
  readonly destination: number;
  /** The furthest destination sailed to: every one up to it has been visited. */
  readonly reached: number;
  /** Whether the course's last destination has been completed (parent §4.7). */
  readonly finale: boolean;
  /** Mastery replays, by destination id. An id that is absent has had none. */
  readonly replays: Readonly<Record<string, number>>;
  /**
   * Understanding this run has spent on Encounters and pick-ups: with what is
   * held, it makes the Understanding earned this run (`U_run`).
   */
  readonly runSpent: NumTuple;
  /** How many of the course's regions, from the first, may be sailed to. */
  readonly playableRegions: number;
  /** Grammar nodes owned, by id, in the order they were bought (#32). */
  readonly grammar: readonly string[];
  /** Pemandu's setting, which a sail keeps (#33). */
  readonly automation: Automation;
  /** The last accepted event's `seq`, 0 before any (#34): the next must be above it. */
  readonly seq: number;
}

/**
 * A new game at wall time `wall` whose draws come from `seed`: nothing owned,
 * no currency, no words, no upgrades or grammar, every Journey slot empty, Pemandu
 * off at its starting interval, at the first destination, able to sail through the first `playableRegions` regions.
 */
export function initialState(
  wall: WallMs,
  seed: number,
  playableRegions: number = BALANCE.sail.playableRegions,
): GameState {
  if (!Number.isSafeInteger(playableRegions) || playableRegions < 1) {
    throw new RangeError(
      `playable regions must be a positive safe integer, got ${String(playableRegions)}`,
    );
  }
  const start = simMs(0);
  return {
    sim: start,
    wall,
    anchor: { sim: start, understanding: Num.toTuple(Num.from(0)) },
    owned: {},
    insight: Num.toTuple(Num.from(0)),
    words: {},
    memorySince: start,
    stamps: 0,
    stampsEarned: 0,
    upgrades: {},
    rng: createStreams(seed, RNG_STREAMS),
    journeys: Array.from({ length: BALANCE.journeys.maxSlots }, () => null),
    cards: [],
    tutorialJourneyUsed: false,
    destination: 0,
    reached: 0,
    finale: false,
    replays: {},
    runSpent: Num.toTuple(Num.from(0)),
    playableRegions,
    grammar: [],
    automation: {
      enabled: false,
      intervalMs: BALANCE.automation.intervalsMs[0],
    },
    seq: 0,
  };
}

/** How many of Encounter `id` the state owns. Reads own keys only. */
export function ownedCount(state: GameState, id: string): number {
  return Object.hasOwn(state.owned, id) ? (state.owned[id] ?? 0) : 0;
}

/** The memory of word `id` if it has been picked up. Reads own keys only. */
export function pickedWord(
  state: GameState,
  id: string,
): WordMemory | undefined {
  return Object.hasOwn(state.words, id) ? state.words[id] : undefined;
}
