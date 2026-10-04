/**
 * One persona playing the real core (M1 design §6, #35 AC3): every decision
 * reads `view` alone, and every action goes through `apply`, exactly as a UI
 * would send it. The policy at each open: answer the queue (learners),
 * collect and restart Journeys, buy upgrades and grammar nodes in a fixed
 * order, keep Pemandu at its fastest interval, then check every `checkMs`
 * to Set Sail as soon as it is available or buy in the persona's style.
 */

import {
  apply,
  Num,
  PROMPT_TYPES,
  view,
  wallMs,
  type Course,
  type EncounterOffer,
  type GameEvent,
  type GameState,
  type JourneyOffer,
  type View,
} from '@wordfarer/core';
import type { Persona } from './personas';
import type { Streams } from './streams';

/** An event before the player stamps it with its sequence number and time. */
export type Action = GameEvent extends infer E
  ? E extends GameEvent
    ? Omit<E, 'seq' | 'wallMs'>
    : never
  : never;

/** The time an action takes a player, when it is not an answer's latency. */
export const STEP_MS = 500;
/** The gap between bootstrap Listen taps. */
export const BOOTSTRAP_TAP_MS = 200;
/** No loop of one open runs longer than this many actions. */
const MAX_ACTIONS = 3_000;
/** The most reviews one open answers. */
const MAX_REVIEWS = 200;
/** The most bootstrap Listen taps one check makes. */
const MAX_BOOTSTRAP_TAPS = 1_000;

/** What the player tells whoever watches it. */
export interface Watcher {
  /** Every view the player decides from. */
  readonly saw?: (v: View) => void;
  /** Every event `apply` accepted, with the state it produced. */
  readonly applied?: (event: GameEvent, state: GameState) => void;
}

/** A unit to buy: what it costs and the rate it adds. */
interface Candidate {
  readonly price: Num;
  readonly gain: Num;
  readonly id: string;
}

/** Lower `price / gain` first, as Pemandu orders them; ties by id. */
function before(a: Candidate, b: Candidate): boolean {
  const order = Num.cmp(Num.mul(a.price, b.gain), Num.mul(b.price, a.gain));
  if (order !== 0) return order < 0;
  return a.id < b.id;
}

function bestEncounter(v: View): EncounterOffer | undefined {
  let best: EncounterOffer | undefined;
  for (const offer of v.shop.encounters) {
    if (!offer.affordable) continue;
    if (best === undefined || before(offer, best)) best = offer;
  }
  return best;
}

/**
 * The next pick-up wins over the best Encounter when its payback is shorter,
 * or when no Encounter is affordable (its words also count towards the
 * sail's goal).
 */
function picksUp(v: View, encounter: EncounterOffer | undefined): boolean {
  const offer = v.shop.pickUp;
  if (offer === undefined || !offer.affordable) return false;
  if (encounter === undefined) return true;
  if (Num.cmp(offer.gain, Num.from(0)) <= 0) return false;
  // cost / gain < price / gain', both gains positive.
  return (
    Num.cmp(
      Num.mul(offer.cost, encounter.gain),
      Num.mul(encounter.price, offer.gain),
    ) < 0
  );
}

/** The Journey to send: the tutorial first, then the longest back within `gapMs`, else the shortest. */
function journeyFor(
  startable: readonly JourneyOffer[],
  gapMs: number,
): JourneyOffer | undefined {
  const tutorial = startable.find((o) => o.durationId === 'tutorial');
  if (tutorial !== undefined) return tutorial;
  const longestFirst = [...startable].sort(
    (a, b) => b.durationMs - a.durationMs,
  );
  return longestFirst.find((o) => o.durationMs <= gapMs) ?? longestFirst.at(-1);
}

/**
 * Whether an open offers a meaningful decision (DN1): an affordable
 * purchase, a due review, a free or returned Journey slot, or Set Sail.
 */
export function offersDecision(v: View): boolean {
  const { shop } = v;
  return (
    shop.encounters.some((o) => o.affordable) ||
    shop.pickUp?.affordable === true ||
    shop.upgrades.some((o) => o.affordable) ||
    shop.grammar.some((o) => o.affordable) ||
    v.queue.length > 0 ||
    shop.journeys.slots.includes('returned') ||
    shop.journeys.startable.length > 0 ||
    v.sail.available
  );
}

/** What a return offers: a decision, only Practice, or nothing at all. */
export type QuickReturn = 'decision' | 'practice' | 'nothing';

export class Player {
  private current: GameState;
  private seq = 0;
  private t: number;

  /** Play `initial` from its own wall time onwards. */
  constructor(
    private readonly course: Course,
    readonly persona: Persona,
    initial: GameState,
    private readonly streams: Streams,
    private readonly watcher: Watcher = {},
  ) {
    this.current = initial;
    this.seq = initial.seq;
    this.t = initial.wall;
  }

  /** The game as stored: for whoever watches the run, never for a decision. */
  get state(): GameState {
    return this.current;
  }

  /** The player's wall clock, in milliseconds. */
  get now(): number {
    return this.t;
  }

  /** What a UI would show now. */
  look(): View {
    const v = view(this.course, this.current, wallMs(this.t));
    this.watcher.saw?.(v);
    return v;
  }

  /** Send `action` now; on acceptance the clock moves on by `stepMs`. */
  act(action: Action, stepMs: number = STEP_MS): boolean {
    const event: GameEvent = {
      ...action,
      seq: this.seq + 1,
      wallMs: wallMs(this.t),
    };
    const result = apply(this.course, this.current, event);
    if (!result.ok) return false;
    this.seq += 1;
    this.current = result.state;
    this.t += stepMs;
    this.watcher.applied?.(event, result.state);
    return true;
  }

  /** Like `act`, for an action the view said would be accepted. */
  private must(action: Action, stepMs: number = STEP_MS): void {
    if (!this.act(action, stepMs)) {
      throw new Error(
        `the view offered ${JSON.stringify(action)} and apply refused it`,
      );
    }
  }

  /**
   * What coming back `ms` from now would offer (DN1), judged as a UI would
   * see it, on a copy: the game and the clock stay as they are. Practice
   * counts only when nothing else is on offer (operator, 2026-10-04).
   */
  returnAfter(ms: number): QuickReturn {
    const at = wallMs(this.t + ms);
    const result = apply(this.course, this.current, {
      type: 'resume',
      seq: this.seq + 1,
      wallMs: at,
    });
    if (!result.ok) {
      throw new Error(
        `a return after ${String(ms)} ms was refused: ${JSON.stringify(result.rejection)}`,
      );
    }
    const v = view(this.course, result.state, at);
    if (offersDecision(v)) return 'decision';
    return v.shop.practice.available ? 'practice' : 'nothing';
  }

  /**
   * One open: `lengthMs` from `startMs`, the next one due at `nextOpenMs`.
   * Returns whether it offered a meaningful decision when it opened (DN1).
   */
  open(startMs: number, lengthMs: number, nextOpenMs: number): boolean {
    this.t = Math.max(startMs, this.t + STEP_MS);
    const end = this.t + lengthMs;
    this.must({ type: 'resume' });
    const decision = offersDecision(this.look());
    this.collect();
    if (this.persona.reviews) this.review();
    this.journeys(nextOpenMs);
    this.upgrades();
    this.grammar();
    this.automation();
    while (this.t < end && !this.current.finale) {
      this.check();
      if (this.persona.tapsPerSecond > 0) {
        const until = Math.min(end, this.t + this.persona.checkMs);
        const gap = 1_000 / this.persona.tapsPerSecond;
        while (this.t < until) this.must({ type: 'listen' }, gap);
      } else {
        this.t += this.persona.checkMs;
      }
    }
    return decision;
  }

  private collect(): void {
    const { slots } = this.look().shop.journeys;
    slots.forEach((status, slot) => {
      if (status === 'returned') this.must({ type: 'collectJourney', slot });
    });
  }

  private review(): void {
    for (let n = 0; n < MAX_REVIEWS; n += 1) {
      const item = this.look().queue[0];
      if (item === undefined) return;
      const correct = this.streams.recalls(item.retrievability);
      const latencyMs = this.streams.latencyMs();
      const promptType =
        PROMPT_TYPES[this.streams.int('prompts', PROMPT_TYPES.length)] ??
        'choice';
      this.must(
        {
          type: 'answerReview',
          itemId: item.itemId,
          correct,
          latencyMs,
          promptType,
        },
        latencyMs,
      );
    }
  }

  private journeys(nextOpenMs: number): void {
    for (let n = 0; n < MAX_ACTIONS; n += 1) {
      const { slots, startable } = this.look().shop.journeys;
      const slot = slots.indexOf('empty');
      const pick = journeyFor(startable, nextOpenMs - this.t);
      if (slot === -1 || pick === undefined) return;
      this.must({ type: 'startJourney', slot, durationId: pick.durationId });
    }
  }

  private upgrades(): void {
    for (let n = 0; n < MAX_ACTIONS; n += 1) {
      const offer = this.look().shop.upgrades.find((o) => o.affordable);
      if (offer === undefined) return;
      this.must({ type: 'buyUpgrade', id: offer.id });
    }
  }

  private grammar(): void {
    for (let n = 0; n < MAX_ACTIONS; n += 1) {
      const offer = this.look().shop.grammar.find((o) => o.affordable);
      if (offer === undefined) return;
      this.must({ type: 'buyGrammarNode', id: offer.id });
    }
  }

  private automation(): void {
    const { opened, enabled, intervalMs, owned } = this.look().shop.pemandu;
    if (!opened) return;
    const fastest = Math.min(...owned);
    if (enabled && intervalMs === fastest) return;
    this.must({ type: 'setAutomation', enabled: true, intervalMs: fastest });
  }

  /** One check: Set Sail if it is available, else buy. */
  private check(): void {
    const { sail } = this.look();
    if (sail.available) {
      this.must({
        type: 'setSail',
        ...(sail.next === undefined && sail.destination !== undefined
          ? { to: sail.destination }
          : {}),
      });
      return;
    }
    this.bootstrap();
    const { buys } = this.persona;
    if (buys.kind === 'random') this.randomBuys();
    else this.paybackBuys(buys.kind === 'capped' ? buys.max : MAX_ACTIONS);
  }

  /** With nothing owned and nothing affordable, tap Listen, as a person would after a sail. */
  private bootstrap(): void {
    for (let n = 0; n < MAX_BOOTSTRAP_TAPS; n += 1) {
      const { encounters } = this.look().shop;
      const ownsNone = encounters.every((o) => o.owned === 0);
      if (!ownsNone || encounters.some((o) => o.affordable)) return;
      this.must({ type: 'listen' }, BOOTSTRAP_TAP_MS);
    }
  }

  private paybackBuys(max: number): void {
    for (let n = 0; n < max; n += 1) {
      const v = this.look();
      const encounter = bestEncounter(v);
      if (picksUp(v, encounter)) this.must({ type: 'pickUpWord' });
      else if (encounter !== undefined)
        this.must({ type: 'buyEncounter', id: encounter.id, count: 1 });
      else return;
    }
  }

  private randomBuys(): void {
    for (let n = 0; n < MAX_ACTIONS; n += 1) {
      const v = this.look();
      const options: Action[] = v.shop.encounters
        .filter((o) => o.affordable)
        .map((o) => ({ type: 'buyEncounter', id: o.id, count: 1 }));
      if (v.shop.pickUp?.affordable === true)
        options.push({ type: 'pickUpWord' });
      if (options.length === 0) return;
      const pick = options[this.streams.int('buys', options.length)];
      if (pick === undefined) throw new RangeError('drew past the options');
      this.must(pick);
    }
  }
}
