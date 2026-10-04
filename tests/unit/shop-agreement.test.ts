import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  goldenStart,
  readGolden,
} from '../../packages/core/fixtures/golden-log';
import { BALANCE, JOURNEY_DURATION_IDS } from '../../packages/core/src/balance';
import type { Course } from '../../packages/core/src/course';
import type { GameEvent } from '../../packages/core/src/events';
import { apply } from '../../packages/core/src/log';
import { advance } from '../../packages/core/src/sim';
import type { GameState } from '../../packages/core/src/state';
import { view, type Shop } from '../../packages/core/src/view';

/**
 * The shop can never disagree with `apply` (#35 AC3). Along the golden log,
 * before every open and every purchase, each offer's `affordable` is judged
 * against `apply` itself: the matching event at the same wall time. The state
 * is advanced to that time once (`view` and `apply` both call `advance`), and
 * `apply` judges it as advanced, not re-anchored, while the shop reads it
 * re-anchored. Both answers are counted, so a walk that judged nothing, or
 * only one side, fails its floor.
 */

const FIXTURE = 'packages/core/fixtures/golden-log.jsonl';

const KINDS = [
  'encounters',
  'pickUp',
  'upgrades',
  'grammar',
  'journeys',
  'pemandu',
  'practice',
] as const;
type Kind = (typeof KINDS)[number];

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

interface Tally {
  accepted: number;
  refused: number;
  disagreements: string[];
}

/**
 * Judgements measured on #35's tuned golden log (2026-10-04), each floor the
 * measured figure less one, which the count must exceed. Regenerating the
 * golden log moves them, deliberately.
 */
const FLOORS: Readonly<Record<Kind, { accepted: number; refused: number }>> = {
  encounters: { accepted: 13337, refused: 4481 },
  pickUp: { accepted: 976, refused: 1562 },
  upgrades: { accepted: 325, refused: 50473 },
  grammar: { accepted: 217, refused: 27311 },
  journeys: { accepted: 1545, refused: 11153 },
  pemandu: { accepted: 1447, refused: 8711 },
  practice: { accepted: 2524, refused: 14 },
};

type Action = GameEvent extends infer E
  ? E extends GameEvent
    ? Omit<E, 'seq' | 'wallMs'>
    : never
  : never;

function judge(
  course: Course,
  state: GameState,
  wallMs: GameEvent['wallMs'],
  tally: Tally,
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
  tallies: Record<Kind, Tally>,
): void {
  const at = (kind: Kind, action: Action, shown: boolean): void => {
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
  for (const o of shop.grammar) {
    at('grammar', { type: 'buyGrammarNode', id: o.id }, o.affordable);
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

let walked: Record<Kind, Tally> | undefined;

/** The golden log walked once, on first use rather than at collection (#97). */
function walk(): Record<Kind, Tally> {
  if (walked === undefined) {
    const { header, events } = readGolden(readFileSync(FIXTURE, 'utf8'));
    const { course, initial } = goldenStart(header);
    const tally = (): Tally => ({ accepted: 0, refused: 0, disagreements: [] });
    const tallies: Record<Kind, Tally> = {
      encounters: tally(),
      pickUp: tally(),
      upgrades: tally(),
      grammar: tally(),
      journeys: tally(),
      pemandu: tally(),
      practice: tally(),
    };
    let state = initial;
    for (const event of events) {
      if (READ_BEFORE.has(event.type)) {
        const at = advance(course, state, event.wallMs).state;
        const { shop } = view(course, at, event.wallMs);
        judgeShop(course, at, event.wallMs, shop, tallies);
      }
      const result = apply(course, state, event);
      if (result.ok) state = result.state;
    }
    walked = tallies;
  }
  return walked;
}

describe(
  'the shop agrees with apply along the golden log (AC3)',
  { timeout: 600_000 },
  () => {
    it.each(KINDS)('every %s offer’s affordable is apply’s answer', (kind) => {
      expect(walk()[kind].disagreements).toEqual([]);
    });

    it.each(KINDS)(
      'judged %s offers apply accepted, at least the floor',
      (kind) => {
        expect(walk()[kind].accepted).toBeGreaterThan(FLOORS[kind].accepted);
      },
    );

    it.each(KINDS)(
      'judged %s offers apply refused, at least the floor',
      (kind) => {
        expect(walk()[kind].refused).toBeGreaterThan(FLOORS[kind].refused);
      },
    );
  },
);
