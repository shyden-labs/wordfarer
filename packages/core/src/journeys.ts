/**
 * Journeys (parent spec §4.2, M1 design §5, #30): timed outings that bring
 * back a culture card.
 *
 * A Journey's card is drawn when it starts, uniformly over the current
 * region's cards in course order from the state's `cards` stream, with
 * replacement, so a held card can come again (operator, 2026-10-03). Its
 * return time is fixed then too. A return changes no stored quantity: the
 * Journey has returned once `sim >= returnsAt`, so the return falls at the
 * same simulated time however `integrate` is split. Collecting credits the
 * card at that moment: a card not yet held joins the held cards, and a held
 * one pays the repeat reward instead.
 */
import {
  BALANCE,
  JOURNEY_DURATION_IDS,
  type JourneyDurationId,
} from './balance';
import { simMs } from './clock';
import type { Course, CultureCard } from './course';
import { Num } from './num';
import { rateAt } from './production';
import { intFrom } from './rng';
import { currentRegion } from './route';
import { reanchor, type Rejection, type Result } from './sim';
import type { GameState, Journey } from './state';
import { journeyDurationFactor, journeySlots } from './upgrades';

/** What a slot holds: `locked` until bought, then `empty`, `away` or `returned`. */
export type JourneyStatus = 'locked' | 'empty' | 'away' | 'returned';

/** The cards Journeys draw from: the current region's, in course order. */
export function cardPool(
  course: Course,
  state: GameState,
): readonly CultureCard[] {
  return currentRegion(course, state).cultureCards;
}

function durationIndex(durationId: string): number {
  return JOURNEY_DURATION_IDS.findIndex((id) => id === durationId);
}

function table(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`no journey table entry ${String(index)}`);
  }
  return value;
}

/** How long a Journey of `durationId` takes when started from `state`, in whole ms. */
export function journeyDurationMs(
  state: GameState,
  durationId: JourneyDurationId,
): number {
  const listed = table(BALANCE.journeys.durationsMs, durationIndex(durationId));
  return Math.round(listed * journeyDurationFactor(state));
}

function slotRejection(slot: number): Rejection | undefined {
  return Number.isSafeInteger(slot) &&
    slot >= 0 &&
    slot < BALANCE.journeys.maxSlots
    ? undefined
    : { kind: 'unknownSlot', slot };
}

function journeyIn(state: GameState, slot: number): Journey | null {
  return state.journeys[slot] ?? null;
}

/** What slot `slot` holds at the state's simulated time. */
export function journeyStatus(state: GameState, slot: number): JourneyStatus {
  const refused = slotRejection(slot);
  if (refused !== undefined) {
    throw new RangeError(`no journey slot ${String(slot)}`);
  }
  if (slot >= journeySlots(state)) return 'locked';
  const journey = journeyIn(state, slot);
  if (journey === null) return 'empty';
  return state.sim < journey.returnsAt ? 'away' : 'returned';
}

function withSlot(
  state: GameState,
  slot: number,
  journey: Journey | null,
): readonly (Journey | null)[] {
  return state.journeys.map((j, i) => (i === slot ? journey : j));
}

/**
 * Send a Journey of `durationId` out from slot `slot` at the state's
 * simulated time. Refused, in this order, when the slot does not exist, is
 * not yet bought or already holds a Journey (returned or not), the duration
 * is unknown or is the tutorial a second time, or the region has no cards.
 */
export function startJourney(
  course: Course,
  state: GameState,
  slot: number,
  durationId: string,
): Result {
  const refused = slotRejection(slot);
  if (refused !== undefined) return { ok: false, rejection: refused };
  const open = journeySlots(state);
  if (slot >= open) {
    return { ok: false, rejection: { kind: 'slotLocked', slot, open } };
  }
  if (journeyIn(state, slot) !== null) {
    return { ok: false, rejection: { kind: 'slotBusy', slot } };
  }
  const id = JOURNEY_DURATION_IDS.find((d) => d === durationId);
  if (id === undefined) {
    return { ok: false, rejection: { kind: 'unknownDuration', durationId } };
  }
  if (id === 'tutorial' && state.tutorialJourneyUsed) {
    return { ok: false, rejection: { kind: 'tutorialUsed' } };
  }
  const pool = cardPool(course, state);
  if (pool.length === 0) {
    return { ok: false, rejection: { kind: 'noCards' } };
  }
  const draw = intFrom(state.rng, 'cards', pool.length);
  const card = pool[draw.value];
  if (card === undefined) {
    throw new RangeError(
      `drew card ${String(draw.value)} of ${String(pool.length)}`,
    );
  }
  const journey: Journey = {
    durationId: id,
    returnsAt: simMs(state.sim + journeyDurationMs(state, id)),
    cardId: card.id,
  };
  return {
    ok: true,
    state: {
      ...state,
      rng: draw.streams,
      journeys: withSlot(state, slot, journey),
      tutorialJourneyUsed: state.tutorialJourneyUsed || id === 'tutorial',
    },
  };
}

/**
 * Collect the Journey in slot `slot` at the state's simulated time. Refused
 * when the slot does not exist or is empty, or the Journey has not returned.
 * A card not yet held joins the held cards, so its bonus and phrase pack
 * count from now on. A held card pays the repeat reward instead: Insight by
 * duration, and Understanding equal to the rate now times that duration's
 * reward time. Either way production up to now is banked first.
 */
export function collectJourney(
  course: Course,
  state: GameState,
  slot: number,
): Result {
  const refused = slotRejection(slot);
  if (refused !== undefined) return { ok: false, rejection: refused };
  const journey = journeyIn(state, slot);
  if (journey === null) {
    return { ok: false, rejection: { kind: 'slotEmpty', slot } };
  }
  if (state.sim < journey.returnsAt) {
    return {
      ok: false,
      rejection: { kind: 'notReturned', slot, returnsAt: journey.returnsAt },
    };
  }
  const anchored = reanchor(course, state);
  const emptied = { ...anchored, journeys: withSlot(anchored, slot, null) };
  if (!anchored.cards.includes(journey.cardId)) {
    return {
      ok: true,
      state: { ...emptied, cards: [...anchored.cards, journey.cardId] },
    };
  }
  const index = durationIndex(journey.durationId);
  const { duplicateInsight, duplicateUnderstandingMs } = BALANCE.journeys;
  const understanding = Num.add(
    Num.fromTuple(anchored.anchor.understanding),
    Num.div(
      Num.mul(
        rateAt(course, anchored, anchored.sim),
        Num.from(table(duplicateUnderstandingMs, index)),
      ),
      Num.from(1000),
    ),
  );
  const insight = Num.add(
    Num.fromTuple(anchored.insight),
    Num.from(table(duplicateInsight, index)),
  );
  return {
    ok: true,
    state: {
      ...emptied,
      anchor: { ...emptied.anchor, understanding: Num.toTuple(understanding) },
      insight: Num.toTuple(insight),
    },
  };
}
