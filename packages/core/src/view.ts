/**
 * What a player sees at a wall time (M1 design §4): `view` derives every
 * "now" value without changing state, and its `shop` lists every offer a UI
 * shows (#35 AC3), which is all the pacing bots read. Each offer's
 * `affordable` is whether the real action would be accepted at that moment,
 * so the shop can never disagree with `apply`. It sits above `sim` and
 * `journeys` because it asks both.
 */

import { automationUnlocked } from './automation';
import {
  BALANCE,
  JOURNEY_DURATION_IDS,
  type JourneyDurationId,
} from './balance';
import type { WallMs } from './clock';
import type { Course } from './course';
import { grammarNodeCost } from './grammar';
import {
  journeyDurationMs,
  journeyStatus,
  startJourney,
  type JourneyStatus,
} from './journeys';
import { reviewQueue, type QueueItem } from './memory';
import { Num } from './num';
import {
  rateAt,
  rateBreakdown,
  rateGain,
  totalRate,
  understandingNow,
  type EncounterRate,
} from './production';
import { regionsReached } from './route';
import { sailPreview, type SailPreview } from './sail';
import {
  advance,
  buyEncounter,
  buyGrammarNode,
  buyUpgrade,
  nextPickUp,
  pickUpWord,
  reanchor,
} from './sim';
import { ownedCount, type GameState } from './state';
import { unfold, type Unfold } from './unfold';
import {
  encounterPrice,
  pemanduIntervalsMs,
  upgradeCatalogue,
  upgradeLevel,
  type UpgradeCurrency,
} from './upgrades';

/** One more of an Encounter of a region reached. */
export interface EncounterOffer {
  readonly id: string;
  readonly region: number;
  readonly owned: number;
  /** The price of one more. */
  readonly price: Num;
  /** How much one more would raise the rate, every multiplier included. */
  readonly gain: Num;
  readonly affordable: boolean;
}

/** The next word of the pick-up pool. */
export interface PickUpOffer {
  readonly cost: Num;
  /** How much picking it up would raise the rate. */
  readonly gain: Num;
  readonly affordable: boolean;
}

/** The next level of an upgrade of the catalogue. */
export interface UpgradeOffer {
  readonly id: string;
  readonly currency: UpgradeCurrency;
  /** Levels owned. */
  readonly level: number;
  /** The next level's cost; `undefined` once the last level is owned. */
  readonly cost: Num | undefined;
  readonly affordable: boolean;
}

/** A grammar node not yet owned. */
export interface GrammarOffer {
  readonly id: string;
  readonly region: number;
  readonly cost: Num;
  readonly affordable: boolean;
}

/** A Journey that can start now, and how long it would take. */
export interface JourneyOffer {
  readonly durationId: JourneyDurationId;
  readonly durationMs: number;
}

export interface Shop {
  readonly encounters: readonly EncounterOffer[];
  /** `undefined` once the pick-up pool is empty. */
  readonly pickUp: PickUpOffer | undefined;
  readonly upgrades: readonly UpgradeOffer[];
  readonly grammar: readonly GrammarOffer[];
  readonly journeys: {
    /** Every slot, bought or not. */
    readonly slots: readonly JourneyStatus[];
    /** The durations that can start in the first empty slot, in table order. */
    readonly startable: readonly JourneyOffer[];
  };
  readonly pemandu: {
    readonly opened: boolean;
    readonly enabled: boolean;
    readonly intervalMs: number;
    /** The intervals the player may choose. */
    readonly owned: readonly number[];
  };
}

export interface View {
  readonly understanding: Num;
  /** Understanding per second, every multiplier included: the breakdown's rates, added. */
  readonly rate: Num;
  /** Each owned Encounter's rate as the product of its named multipliers (DN6). */
  readonly breakdown: readonly EncounterRate[];
  readonly insight: Num;
  /** At most 10 due items; how many more are due is never shown (DN23). */
  readonly queue: readonly QueueItem[];
  /** The run's goal and exactly what Set Sail would reset, keep and pay (DN3, #31). */
  readonly sail: SailPreview;
  /** Which features have unfolded (parent §4.1, DN7, #31). */
  readonly unfold: Unfold;
  /** Every offer a UI shows (#35 AC3). */
  readonly shop: Shop;
}

function encounterOffers(
  course: Course,
  state: GameState,
): readonly EncounterOffer[] {
  const gainOf = rateGain(course, state, state.sim);
  return course.regions
    .slice(0, regionsReached(course, state))
    .flatMap(({ encounters }, region) =>
      encounters.map((encounter) => ({
        id: encounter.id,
        region,
        owned: ownedCount(state, encounter.id),
        price: encounterPrice(state, encounter, 1),
        gain: gainOf(encounter),
        affordable: buyEncounter(course, state, encounter.id, 1).ok,
      })),
    );
}

function pickUpOffer(
  course: Course,
  state: GameState,
): PickUpOffer | undefined {
  const next = nextPickUp(course, state);
  if (next === undefined) return undefined;
  const holding: GameState = { ...state, words: next.words };
  return {
    cost: next.cost,
    gain: Num.sub(
      rateAt(course, holding, state.sim),
      rateAt(course, state, state.sim),
    ),
    affordable: pickUpWord(course, state).ok,
  };
}

function upgradeOffers(
  course: Course,
  state: GameState,
): readonly UpgradeOffer[] {
  return upgradeCatalogue(course).map(({ id, currency, costs }) => {
    const level = upgradeLevel(state, id);
    const cost = costs[level];
    return {
      id,
      currency,
      level,
      cost: cost === undefined ? undefined : Num.from(cost),
      affordable: buyUpgrade(course, state, id).ok,
    };
  });
}

function grammarOffers(
  course: Course,
  state: GameState,
): readonly GrammarOffer[] {
  const cost = grammarNodeCost(state.grammar.length);
  return course.regions.flatMap(({ grammarNodes }, region) =>
    grammarNodes
      .filter(({ id }) => !state.grammar.includes(id))
      .map(({ id }) => ({
        id,
        region,
        cost,
        affordable: buyGrammarNode(course, state, id).ok,
      })),
  );
}

function journeyOffers(course: Course, state: GameState): Shop['journeys'] {
  const slots = Array.from({ length: BALANCE.journeys.maxSlots }, (_, slot) =>
    journeyStatus(state, slot),
  );
  const free = slots.indexOf('empty');
  const startable =
    free === -1
      ? []
      : JOURNEY_DURATION_IDS.filter(
          (id) => startJourney(course, state, free, id).ok,
        ).map((durationId) => ({
          durationId,
          durationMs: journeyDurationMs(state, durationId),
        }));
  return { slots, startable };
}

function shop(course: Course, state: GameState): Shop {
  return {
    encounters: encounterOffers(course, state),
    pickUp: pickUpOffer(course, state),
    upgrades: upgradeOffers(course, state),
    grammar: grammarOffers(course, state),
    journeys: journeyOffers(course, state),
    pemandu: {
      opened: automationUnlocked(course, state),
      enabled: state.automation.enabled,
      intervalMs: state.automation.intervalMs,
      owned: pemanduIntervalsMs(state),
    },
  };
}

/** The values at wall time `now`, derived without changing `state`. */
export function view(course: Course, state: GameState, now: WallMs): View {
  const at = advance(course, state, now).state;
  const breakdown = rateBreakdown(course, at, at.sim);
  return {
    understanding: understandingNow(course, at),
    rate: totalRate(breakdown),
    breakdown,
    insight: Num.fromTuple(at.insight),
    queue: reviewQueue(at.words, at.wall),
    sail: sailPreview(course, at),
    unfold: unfold(course, at),
    // Anchored once at `now`, so each action the shop asks banks nothing
    // further: the same acceptance as on `at`, without a walk per offer.
    shop: shop(course, reanchor(course, at)),
  };
}
