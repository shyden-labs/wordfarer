import { BALANCE, JOURNEY_DURATION_IDS } from '../src/balance';
import type { Course } from '../src/course';
import type { GameEvent } from '../src/events';
import { apply } from '../src/log';
import { advance } from '../src/sim';
import type { GameState } from '../src/state';
import { view, type Shop } from '../src/view';

/**
 * The shop judged against `apply` (#35 AC3), one stretch of the golden log
 * at a time (#479). Before every open and every purchase, each offer's
 * `affordable` is judged against `apply` itself: the matching event at the
 * same wall time. The state is advanced to that time once (`view` and `apply`
 * both call `advance`), and `apply` judges it as advanced, not re-anchored,
 * while the shop reads it re-anchored. Both answers are counted, so a walk
 * that judged nothing, or only one side, fails its floor.
 */

export const SHOP_KINDS = [
  'encounters',
  'pickUp',
  'upgrades',
  'grammar',
  'journeys',
  'pemandu',
  'practice',
] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];

/** How many offers of a kind `apply` accepted and refused. */
export interface ShopCount {
  readonly accepted: number;
  readonly refused: number;
}

/** A kind's count, and each offer whose shop answer was not `apply`'s. */
export interface ShopTally {
  accepted: number;
  refused: number;
  readonly disagreements: string[];
}

/** The events before which the shop is read: every open and every purchase. */
const READ_BEFORE: ReadonlySet<GameEvent['type']> = new Set([
  'resume',
  'buyEncounter',
  'pickUpWord',
  'buyUpgrade',
  'buyGrammarNode',
  'startJourney',
  'setAutomation',
]);

type Action = GameEvent extends infer E
  ? E extends GameEvent
    ? Omit<E, 'seq' | 'wallMs'>
    : never
  : never;

function judge(
  course: Course,
  state: GameState,
  wallMs: GameEvent['wallMs'],
  tally: ShopTally,
  action: Action,
  shown: boolean,
): void {
  const event: GameEvent = { ...action, seq: state.seq + 1, wallMs };
  const ok = apply(course, state, event).ok;
  if (ok) tally.accepted += 1;
  else tally.refused += 1;
  if (ok !== shown) {
    tally.disagreements.push(
      `${JSON.stringify(event)}: shop says ${String(shown)}, apply says ${String(ok)}`,
    );
  }
}

function judgeShop(
  course: Course,
  state: GameState,
  wallMs: GameEvent['wallMs'],
  shop: Shop,
  tallies: Record<ShopKind, ShopTally>,
): void {
  const at = (kind: ShopKind, action: Action, shown: boolean): void => {
    judge(course, state, wallMs, tallies[kind], action, shown);
  };
  // runtime population: the offers this state's shop lists.
  for (const o of shop.encounters) {
    at(
      'encounters',
      { type: 'buyEncounter', id: o.id, count: 1 },
      o.affordable,
    );
  }
  at('pickUp', { type: 'pickUpWord' }, shop.pickUp?.affordable ?? false);
  for (const o of shop.upgrades) {
    at('upgrades', { type: 'buyUpgrade', id: o.id }, o.affordable);
  }
  // Every node of the course, listed or not (#483): one the shop leaves out,
  // owned or out of reach, must be refused, as a journey not offered is.
  const listed = new Map(shop.grammar.map((o) => [o.id, o.affordable]));
  for (const { grammarNodes } of course.regions) {
    for (const { id } of grammarNodes) {
      at('grammar', { type: 'buyGrammarNode', id }, listed.get(id) ?? false);
    }
  }
  const free = shop.journeys.slots.indexOf('empty');
  const startable = new Set(shop.journeys.startable.map((o) => o.durationId));
  for (const durationId of JOURNEY_DURATION_IDS) {
    // With no empty slot, the shop offers nothing: slot 0 must refuse too.
    const slot = free === -1 ? 0 : free;
    at(
      'journeys',
      { type: 'startJourney', slot, durationId },
      startable.has(durationId),
    );
  }
  for (const intervalMs of BALANCE.automation.intervalsMs) {
    const shown =
      shop.pemandu.opened && shop.pemandu.owned.includes(intervalMs);
    at('pemandu', { type: 'setAutomation', enabled: true, intervalMs }, shown);
  }
  // A word the player holds, or one no course has when nothing is held.
  const [held] = Object.keys(state.words);
  at(
    'practice',
    { type: 'answerPractice', itemId: held ?? 'no-word-held' },
    shop.practice.available,
  );
}

/**
 * Walk `events` from `start` with `apply`, judging the shop before each open
 * and purchase: one golden day, from its recorded start, in the tests and
 * when `npm run golden-log` records the day's counts.
 */
export function judgeShopAlong(
  course: Course,
  start: GameState,
  events: readonly GameEvent[],
): Record<ShopKind, ShopTally> {
  const tally = (): ShopTally => ({
    accepted: 0,
    refused: 0,
    disagreements: [],
  });
  const tallies: Record<ShopKind, ShopTally> = {
    encounters: tally(),
    pickUp: tally(),
    upgrades: tally(),
    grammar: tally(),
    journeys: tally(),
    pemandu: tally(),
    practice: tally(),
  };
  let state = start;
  for (const event of events) {
    if (READ_BEFORE.has(event.type)) {
      const at = advance(course, state, event.wallMs).state;
      const { shop } = view(course, at, event.wallMs);
      judgeShop(course, at, event.wallMs, shop, tallies);
    }
    const result = apply(course, state, event);
    if (result.ok) state = result.state;
  }
  return tallies;
}

/** Each kind's accepted and refused counts, without the disagreements. */
export function shopCounts(
  tallies: Readonly<Record<ShopKind, ShopTally>>,
): Record<ShopKind, ShopCount> {
  const count = (kind: ShopKind): ShopCount => ({
    accepted: tallies[kind].accepted,
    refused: tallies[kind].refused,
  });
  return {
    encounters: count('encounters'),
    pickUp: count('pickUp'),
    upgrades: count('upgrades'),
    grammar: count('grammar'),
    journeys: count('journeys'),
    pemandu: count('pemandu'),
    practice: count('practice'),
  };
}
