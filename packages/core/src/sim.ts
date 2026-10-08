/**
 * The time model and the actions (M1 design §2.2, §2.3, §4).
 *
 * `integrate` is the pure, uncapped primitive: it moves both clocks by the
 * same amount and touches nothing else, because every stored quantity is
 * held at the anchor. `advance` is what a returning player gets: elapsed wall
 * time clamped to `[0, offline cap]`; `view` (in `view.ts`) derives "now"
 * values from it without changing state. Actions act at the state's own simulated time; a caller
 * advances to the event's wall time first. Every action that changes a
 * stored quantity re-anchors first, so production up to the action is banked
 * at the rates that held before it.
 */
import {
  automationUnlocked,
  bestPayback,
  nextPurchaseTick,
  type PurchaseTick,
} from './automation';
import { BALANCE } from './balance';
import { heldCards } from './cards';
import { simMs, wallMs, type WallMs } from './clock';
import type { Course, Encounter } from './course';
import { findGrammarNode, grammarNodeCost, ownedGrammarNodes } from './grammar';
import { insightFor, isDue, newWordMemory, review } from './memory';
import { Num, type NumTuple } from './num';
import { understandingNow } from './production';
import { currentDestination, regionsReached } from './route';
import { ownedCount, pickedWord, type GameState } from './state';
import {
  encounterPrice,
  findUpgrade,
  offlineCapMs,
  pemanduIntervalsMs,
  upgradeLevel,
  type UpgradeCurrency,
} from './upgrades';
import { pickUpCost, pickUpPool } from './words';

export type Rejection =
  | { readonly kind: 'staleSeq'; readonly seq: number; readonly last: number }
  | { readonly kind: 'unknownEncounter'; readonly id: string }
  | {
      readonly kind: 'encounterLocked';
      readonly id: string;
      readonly region: number;
    }
  | { readonly kind: 'invalidCount'; readonly count: number }
  | {
      readonly kind: 'unaffordable';
      readonly cost: NumTuple;
      readonly understanding: NumTuple;
    }
  | { readonly kind: 'poolEmpty' }
  | { readonly kind: 'unknownWord'; readonly itemId: string }
  | { readonly kind: 'notDue'; readonly itemId: string; readonly due: number }
  | { readonly kind: 'unknownUpgrade'; readonly id: string }
  | {
      readonly kind: 'upgradeMaxed';
      readonly id: string;
      readonly level: number;
    }
  | {
      readonly kind: 'upgradePrerequisite';
      readonly id: string;
      readonly requires: string;
    }
  | {
      readonly kind: 'upgradeUnaffordable';
      readonly id: string;
      readonly currency: UpgradeCurrency;
      readonly cost: NumTuple;
      readonly held: NumTuple;
    }
  | { readonly kind: 'unknownSlot'; readonly slot: number }
  | {
      readonly kind: 'slotLocked';
      readonly slot: number;
      readonly open: number;
    }
  | { readonly kind: 'slotBusy'; readonly slot: number }
  | { readonly kind: 'unknownDuration'; readonly durationId: string }
  | { readonly kind: 'tutorialUsed' }
  | { readonly kind: 'noCards' }
  | { readonly kind: 'slotEmpty'; readonly slot: number }
  | {
      readonly kind: 'notReturned';
      readonly slot: number;
      readonly returnsAt: number;
    }
  | { readonly kind: 'noDestination' }
  | { readonly kind: 'sailTargetRequired' }
  | { readonly kind: 'sailTargetInvalid'; readonly to: string }
  | {
      readonly kind: 'regionNotPlayable';
      readonly destination: string;
      readonly region: number;
      readonly playable: number;
    }
  | {
      readonly kind: 'sailGoalUnmet';
      readonly understanding: NumTuple;
      readonly goal: NumTuple;
      readonly words: number;
      readonly wordsGoal: number;
    }
  | { readonly kind: 'unknownGrammarNode'; readonly id: string }
  | { readonly kind: 'grammarNodeOwned'; readonly id: string }
  | {
      readonly kind: 'grammarNodeLocked';
      readonly id: string;
      readonly region: number;
      readonly regionsReached: number;
    }
  | {
      readonly kind: 'grammarNodeUnaffordable';
      readonly id: string;
      readonly cost: NumTuple;
      readonly held: NumTuple;
    }
  | { readonly kind: 'automationLocked'; readonly reached: number }
  | {
      readonly kind: 'intervalNotOwned';
      readonly intervalMs: number;
      readonly owned: readonly number[];
    };

export type Result =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly rejection: Rejection };

export interface AdvanceSummary {
  /** Simulated time credited: the elapsed wall time, clamped. */
  readonly creditedMs: number;
  /** Whether the offline cap cut the credit short. */
  readonly clipped: boolean;
  readonly understandingEarned: NumTuple;
  /** Journeys whose return fell in the credited time (#30). */
  readonly journeysReturned: number;
}

/** Move the anchor to the state's simulated time, holding the same values. */
export function reanchor(course: Course, state: GameState): GameState {
  return {
    ...state,
    anchor: {
      sim: state.sim,
      understanding: Num.toTuple(understandingNow(course, state)),
    },
  };
}

/**
 * Move both clocks forward by `elapsedMs`, uncapped (design §2.3). With
 * Pemandu on, each tick of its grid in `(anchor, new sim]` at which a unit
 * is affordable buys one, at that tick, re-anchoring there (#33). Each tick
 * is found from the anchor alone, so splitting the interval makes the same
 * purchases at the same ticks, and stored arithmetic still cannot tell.
 */
export function integrate(
  course: Course,
  state: GameState,
  elapsedMs: number,
): GameState {
  const elapsed = simMs(elapsedMs);
  const until = simMs(state.sim + elapsed);
  let current = state;
  if (state.automation.enabled) {
    let found = nextPurchaseTick(course, current, until).next;
    while (found !== undefined) {
      current = pemanduBuys(course, current, found);
      found = nextPurchaseTick(course, current, until).next;
    }
  }
  return { ...current, sim: until, wall: wallMs(state.wall + elapsed) };
}

/**
 * One Pemandu tick: the state moved to the tick, the skew between its
 * clocks kept, buys one unit of the best payback there, exactly as a
 * purchase by hand would. It is anchored at the tick first with the
 * Understanding `nextPurchaseTick` tested there, the bits `reanchor` would
 * store, so the purchase's own re-anchor walks nothing. That a unit is
 * affordable there is `nextPurchaseTick`'s finding, so a refusal means the
 * two disagree, and that is thrown, never skipped.
 */
function pemanduBuys(
  course: Course,
  state: GameState,
  { tick, understanding }: PurchaseTick,
): GameState {
  const at: GameState = {
    ...state,
    sim: tick,
    wall: wallMs(state.wall + tick - state.sim),
    anchor: { sim: tick, understanding: Num.toTuple(understanding) },
  };
  const id = bestPayback(course, at);
  const bought = id === undefined ? undefined : buyEncounter(course, at, id, 1);
  if (bought === undefined || !bought.ok) {
    throw new Error(
      `Pemandu found a unit affordable at ${String(tick)} but bought none: ${JSON.stringify(bought)}`,
    );
  }
  return bought.state;
}

/** A state brought to a wall time, and what that credited. */
export interface Advanced {
  readonly state: GameState;
  readonly summary: AdvanceSummary;
}

/**
 * Each state's last advance, kept by course, then by the state object, with
 * the wall time it was brought to. State is never mutated, so a state object
 * stands for its contents. A view and the event after it, or every offer of
 * one shop judged at one instant, advance one state to one time (#473); only
 * the last time is kept, so a state viewed at a new time every frame holds
 * one entry, not one per frame.
 */
const advanceMemo = new WeakMap<
  Course,
  WeakMap<GameState, { readonly now: WallMs; readonly advanced: Advanced }>
>();

/**
 * Bring the state to wall time `now` (design §2.3): the elapsed wall time,
 * clamped to `[0, offline cap]`, is credited to both clocks, and the wall
 * clock becomes `max(wall, now)`. When the cap clips, the wall clock runs on
 * past the simulated one; that changes the skew between them, so the state
 * is re-anchored first (the skew only ever changes at an anchor) and every
 * word's hour mean restarts there. Asked again for the same state and time,
 * it returns what it worked out the first time.
 */
export function advance(
  course: Course,
  state: GameState,
  now: WallMs,
): Advanced {
  let byState = advanceMemo.get(course);
  if (byState === undefined) {
    byState = new WeakMap();
    advanceMemo.set(course, byState);
  }
  const last = byState.get(state);
  if (last?.now === now) return last.advanced;
  const advanced = advanceAfresh(course, state, now);
  byState.set(state, { now, advanced });
  return advanced;
}

/** `advance`'s work, done without looking for a kept result. */
function advanceAfresh(
  course: Course,
  state: GameState,
  now: WallMs,
): Advanced {
  const elapsed = now - state.wall;
  const cap = offlineCapMs(state);
  const credited = Math.min(Math.max(elapsed, 0), cap);
  let next = integrate(course, state, credited);
  const clipped = elapsed > cap;
  if (clipped) {
    next = { ...reanchor(course, next), wall: now, memorySince: next.sim };
  }
  // Earned is what was produced: what is held now less what was held, plus
  // what Pemandu spent in between (#33).
  const earned = Num.add(
    Num.sub(understandingNow(course, next), understandingNow(course, state)),
    Num.sub(Num.fromTuple(next.runSpent), Num.fromTuple(state.runSpent)),
  );
  return {
    state: next,
    summary: {
      creditedMs: credited,
      clipped,
      understandingEarned: Num.toTuple(earned),
      journeysReturned: state.journeys.filter(
        (j) => j !== null && state.sim < j.returnsAt && j.returnsAt <= next.sim,
      ).length,
    },
  };
}

/** One Listen tap: +1 Understanding (design §5). */
export function listen(course: Course, state: GameState): GameState {
  const anchored = reanchor(course, state);
  const understanding = Num.add(
    Num.fromTuple(anchored.anchor.understanding),
    Num.from(BALANCE.listen.understandingPerTap),
  );
  return {
    ...anchored,
    anchor: { ...anchored.anchor, understanding: Num.toTuple(understanding) },
  };
}

function findEncounter(
  course: Course,
  id: string,
): { readonly encounter: Encounter; readonly region: number } | undefined {
  for (const [region, { encounters }] of course.regions.entries()) {
    const encounter = encounters.find((e) => e.id === id);
    if (encounter !== undefined) return { encounter, region };
  }
  return undefined;
}

/**
 * Buy `count` of Encounter `id` at the state's simulated time. Encounters
 * come from every region reached so far (operator, 2026-10-03); one from a
 * later region is refused. The cost counts towards this run's spend.
 */
export function buyEncounter(
  course: Course,
  state: GameState,
  id: string,
  count: number,
): Result {
  const found = findEncounter(course, id);
  if (found === undefined) {
    return { ok: false, rejection: { kind: 'unknownEncounter', id } };
  }
  const { encounter, region } = found;
  if (region >= regionsReached(course, state)) {
    return { ok: false, rejection: { kind: 'encounterLocked', id, region } };
  }
  if (!Number.isSafeInteger(count) || count < 1) {
    return { ok: false, rejection: { kind: 'invalidCount', count } };
  }
  const owned = ownedCount(state, id);
  const cost = encounterPrice(state, encounter, count);
  const anchored = reanchor(course, state);
  const understanding = Num.fromTuple(anchored.anchor.understanding);
  if (Num.cmp(understanding, cost) < 0) {
    return {
      ok: false,
      rejection: {
        kind: 'unaffordable',
        cost: Num.toTuple(cost),
        understanding: Num.toTuple(understanding),
      },
    };
  }
  return {
    ok: true,
    state: {
      ...anchored,
      anchor: {
        ...anchored.anchor,
        understanding: Num.toTuple(Num.sub(understanding, cost)),
      },
      owned: { ...anchored.owned, [id]: owned + count },
      runSpent: spent(anchored, cost),
    },
  };
}

/** When a word picked up now falls due: later for the tutorial word, else at once. */
function tutorialDue(state: GameState): WallMs {
  return Object.keys(state.words).length === 0
    ? wallMs(state.wall + BALANCE.memory.tutorialDueMs)
    : state.wall;
}

/** This run's spend after paying `cost`: it stays part of `U_run` (#31). */
function spent(state: GameState, cost: Num): NumTuple {
  return Num.toTuple(Num.add(Num.fromTuple(state.runSpent), cost));
}

/** The next pick-up: what it costs and the words held once it is picked up. */
export interface NextPickUp {
  readonly cost: Num;
  readonly words: GameState['words'];
}

/**
 * The next word of the pick-up pool in curriculum order (see `pickUpWord`),
 * priced, with the words held after picking it up; `undefined` once the pool
 * is empty. Nothing is paid: `view`'s shop reads it too (#35 AC3).
 */
export function nextPickUp(
  course: Course,
  state: GameState,
): NextPickUp | undefined {
  const pool = pickUpPool(
    currentDestination(course, state),
    heldCards(course, state),
    ownedGrammarNodes(course, state),
  );
  const next = pool.find((item) => pickedWord(state, item.id) === undefined);
  if (next === undefined) return undefined;
  const picked = pool.filter(
    (item) => pickedWord(state, item.id) !== undefined,
  );
  return {
    cost: pickUpCost(picked.length),
    words: {
      ...state.words,
      [next.id]: newWordMemory(state.wall, tutorialDue(state)),
    },
  };
}

/**
 * Pick up the next word of the pick-up pool in curriculum order, paying for
 * it from Understanding (parent §3.3): the current destination's lexicon, the
 * held cards' phrase packs (#30) and the owned grammar nodes' derived words
 * (#32). The cost counts towards this run's
 * spend. The first word ever picked up is the tutorial word: it falls due
 * `tutorialDueMs` later, when Review unfolds (parent §4.1); every other word
 * is due at once.
 */
export function pickUpWord(course: Course, state: GameState): Result {
  const next = nextPickUp(course, state);
  if (next === undefined) {
    return { ok: false, rejection: { kind: 'poolEmpty' } };
  }
  const { cost, words } = next;
  const anchored = reanchor(course, state);
  const understanding = Num.fromTuple(anchored.anchor.understanding);
  if (Num.cmp(understanding, cost) < 0) {
    return {
      ok: false,
      rejection: {
        kind: 'unaffordable',
        cost: Num.toTuple(cost),
        understanding: Num.toTuple(understanding),
      },
    };
  }
  return {
    ok: true,
    state: {
      ...anchored,
      anchor: {
        ...anchored.anchor,
        understanding: Num.toTuple(Num.sub(understanding, cost)),
      },
      words,
      runSpent: spent(anchored, cost),
    },
  };
}

/**
 * Answer the due review of word `itemId` at the state's wall time (parent
 * §3.4): a correct answer earns Insight by the rank it was asked at; a wrong
 * one costs nothing. Either way FSRS reschedules the word, and every word's
 * hour mean restarts here.
 */
export function answerReview(
  course: Course,
  state: GameState,
  itemId: string,
  correct: boolean,
): Result {
  const word = pickedWord(state, itemId);
  if (word === undefined) {
    return { ok: false, rejection: { kind: 'unknownWord', itemId } };
  }
  if (!isDue(word, state.wall)) {
    return {
      ok: false,
      rejection: { kind: 'notDue', itemId, due: word.card.due },
    };
  }
  const anchored = reanchor(course, state);
  const insight = correct
    ? Num.add(Num.fromTuple(anchored.insight), Num.from(insightFor(word.rank)))
    : Num.fromTuple(anchored.insight);
  return {
    ok: true,
    state: {
      ...anchored,
      insight: Num.toTuple(insight),
      words: {
        ...anchored.words,
        [itemId]: review(word, state.wall, correct),
      },
      memorySince: state.sim,
    },
  };
}

/**
 * Practise word `itemId`: open at any time, and it changes nothing, so it
 * cannot be ground for currency or rank (DN24).
 */
export function answerPractice(state: GameState, itemId: string): Result {
  if (pickedWord(state, itemId) === undefined) {
    return { ok: false, rejection: { kind: 'unknownWord', itemId } };
  }
  return { ok: true, state };
}

/**
 * Buy the next level of upgrade `id` (design §5), paid in Insight or in
 * Passport Stamps. Refused, in this order, when the course offers no such
 * upgrade, it is already at its last level, its prerequisite is not owned,
 * or the player cannot pay. An upgrade can change a rate, so production up
 * to the purchase is banked first. Spending stamps leaves `stampsEarned`,
 * and so the global bonus, alone.
 */
export function buyUpgrade(
  course: Course,
  state: GameState,
  id: string,
): Result {
  const upgrade = findUpgrade(course, id);
  if (upgrade === undefined) {
    return { ok: false, rejection: { kind: 'unknownUpgrade', id } };
  }
  const level = upgradeLevel(state, id);
  const cost = upgrade.costs[level];
  if (cost === undefined) {
    return { ok: false, rejection: { kind: 'upgradeMaxed', id, level } };
  }
  const { requires } = upgrade;
  if (requires !== undefined && upgradeLevel(state, requires) === 0) {
    return {
      ok: false,
      rejection: { kind: 'upgradePrerequisite', id, requires },
    };
  }
  const held =
    upgrade.currency === 'insight'
      ? Num.fromTuple(state.insight)
      : Num.from(state.stamps);
  if (Num.cmp(held, Num.from(cost)) < 0) {
    return {
      ok: false,
      rejection: {
        kind: 'upgradeUnaffordable',
        id,
        currency: upgrade.currency,
        cost: Num.toTuple(Num.from(cost)),
        held: Num.toTuple(held),
      },
    };
  }
  const anchored = reanchor(course, state);
  const upgrades = { ...anchored.upgrades, [id]: level + 1 };
  return {
    ok: true,
    state:
      upgrade.currency === 'insight'
        ? {
            ...anchored,
            insight: Num.toTuple(Num.sub(held, Num.from(cost))),
            upgrades,
          }
        : { ...anchored, stamps: anchored.stamps - cost, upgrades },
  };
}

/**
 * Buy grammar node `id` at the state's simulated time, paid in Insight.
 * Refused, in this order, when the course has no such node, it is already
 * owned, grammar has not opened or the node's region is not reached, or the
 * player cannot pay. A node changes rates, so production up to the purchase
 * is banked first.
 */
export function buyGrammarNode(
  course: Course,
  state: GameState,
  id: string,
): Result {
  const found = findGrammarNode(course, id);
  if (found === undefined) {
    return { ok: false, rejection: { kind: 'unknownGrammarNode', id } };
  }
  if (state.grammar.includes(id)) {
    return { ok: false, rejection: { kind: 'grammarNodeOwned', id } };
  }
  const reached = regionsReached(course, state);
  if (reached < BALANCE.grammar.opensAtRegion || found.region >= reached) {
    return {
      ok: false,
      rejection: {
        kind: 'grammarNodeLocked',
        id,
        region: found.region,
        regionsReached: reached,
      },
    };
  }
  const cost = grammarNodeCost(state.grammar.length);
  const held = Num.fromTuple(state.insight);
  if (Num.cmp(held, cost) < 0) {
    return {
      ok: false,
      rejection: {
        kind: 'grammarNodeUnaffordable',
        id,
        cost: Num.toTuple(cost),
        held: Num.toTuple(held),
      },
    };
  }
  const anchored = reanchor(course, state);
  return {
    ok: true,
    state: {
      ...anchored,
      insight: Num.toTuple(Num.sub(held, cost)),
      grammar: [...anchored.grammar, id],
    },
  };
}

/**
 * Turn Pemandu on or off at interval `intervalMs` (design §5, #33). Refused,
 * in this order, before Pemandu opens, or at an interval the player does not
 * own; both are judged when turning it off too, so every setting accepted is
 * one the player could choose. Production up to now is banked first, so the
 * ticks of the new setting start after it.
 */
export function setAutomation(
  course: Course,
  state: GameState,
  enabled: boolean,
  intervalMs: number,
): Result {
  if (!automationUnlocked(course, state)) {
    return {
      ok: false,
      rejection: { kind: 'automationLocked', reached: state.reached },
    };
  }
  const owned = pemanduIntervalsMs(state);
  if (!owned.includes(intervalMs)) {
    return {
      ok: false,
      rejection: { kind: 'intervalNotOwned', intervalMs, owned },
    };
  }
  return {
    ok: true,
    state: { ...reanchor(course, state), automation: { enabled, intervalMs } },
  };
}
