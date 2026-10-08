import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN,
  goldenStart,
  readGolden,
  readGoldenDays,
  type GoldenDay,
} from '../../packages/core/fixtures/golden-log';
import {
  judgeShopAlong,
  SHOP_KINDS,
  shopCounts,
  type ShopCount,
  type ShopKind,
  type ShopTally,
} from '../../packages/core/fixtures/shop-agreement';
import type { GameEvent } from '../../packages/core/src/events';
import { floorBreach } from '../floors';
import { searched } from '../searched';

/**
 * The shop can never disagree with `apply` (#35 AC3), judged along the golden
 * log one day at a time (#479): each day from its recorded start (#473), so
 * no test walks the whole log. Each day's tests prove the day's counts that
 * `npm run golden-log` recorded, and the whole log's counts are those added
 * up.
 */

const FIXTURE = 'packages/core/fixtures/golden-log.jsonl';
const DAYS_FIXTURE = 'packages/core/fixtures/golden-days.jsonl';
const REGENERATE = 'regenerate with `npm run golden-log`';

/**
 * Judgements measured on #35's tuned golden log (2026-10-04), each floor the
 * measured figure less one, which the count must exceed. Regenerating the
 * golden log moves them, deliberately.
 */
const FLOORS: Readonly<Record<ShopKind, ShopCount>> = {
  encounters: { accepted: 13337, refused: 4481 },
  pickUp: { accepted: 976, refused: 1562 },
  upgrades: { accepted: 325, refused: 50473 },
  grammar: { accepted: 217, refused: 27311 },
  journeys: { accepted: 1545, refused: 11153 },
  pemandu: { accepted: 1447, refused: 8711 },
  practice: { accepted: 2524, refused: 14 },
};

/** The kinds `judgeShopAlong` judges, listed here so collection calls nothing (#97). */
const KINDS = [
  'encounters',
  'pickUp',
  'upgrades',
  'grammar',
  'journeys',
  'pemandu',
  'practice',
] as const satisfies readonly ShopKind[];

/** The days the golden policy plays, known before the run. */
const DAYS = Array.from({ length: GOLDEN.days }, (_, day) => day);
/**
 * The days that begin with every grammar node owned, so the shop lists none
 * and there is no grammar offer to judge (measured on the golden log,
 * 2026-10-08). Their own test proves why.
 */
const GRAMMAR_OWNED_DAYS: readonly number[] = [33, 34];
/** Every day with every kind it offers: one test each. */
const DAY_KINDS = DAYS.flatMap((day) =>
  KINDS.filter(
    (kind) => kind !== 'grammar' || !GRAMMAR_OWNED_DAYS.includes(day),
  ).map((kind) => [day, kind] as const),
);

let read:
  | {
      readonly events: readonly GameEvent[];
      readonly days: readonly GoldenDay[];
      readonly course: ReturnType<typeof goldenStart>['course'];
    }
  | undefined;

/** Both fixtures, read on first use rather than at collection (#97): no replay. */
function fixtures(): NonNullable<typeof read> {
  if (read === undefined) {
    const { header, events } = readGolden(readFileSync(FIXTURE, 'utf8'));
    const { course } = goldenStart(header);
    const days = readGoldenDays(readFileSync(DAYS_FIXTURE, 'utf8'));
    read = { events, days, course };
  }
  return read;
}

/** Day `n` as recorded; throws for a day the fixture does not hold. */
function dayOf(n: number): GoldenDay {
  const day = fixtures().days[n];
  if (day === undefined)
    throw new Error(`${DAYS_FIXTURE} has no day ${String(n)}`);
  return day;
}

const judged = new Map<number, Record<ShopKind, ShopTally>>();

/** Day `n` judged from its recorded start, once for all its kinds' tests. */
function judgedDay(n: number): Record<ShopKind, ShopTally> {
  let tallies = judged.get(n);
  if (tallies === undefined) {
    const { events, course } = fixtures();
    const day = dayOf(n);
    const to = fixtures().days[n + 1]?.from ?? events.length;
    tallies = judgeShopAlong(
      course,
      day.start.state,
      events.slice(day.from, to),
    );
    judged.set(n, tallies);
  }
  return tallies;
}

/** A kind's recorded counts over every day: each day's own test proves its figure. */
function total(kind: ShopKind): ShopCount {
  let accepted = 0;
  let refused = 0;
  for (const n of DAYS) {
    const count = dayOf(n).shop[kind];
    accepted += count.accepted;
    refused += count.refused;
  }
  return { accepted, refused };
}

describe('the shop agrees with apply along the golden log, day by day (AC3, #479)', () => {
  it.each(DAY_KINDS)(
    'day %i: every %s offer’s affordable is apply’s answer',
    (n, kind) => {
      const tally = judgedDay(n)[kind];
      const offers = tally.accepted + tally.refused;
      expect(
        searched(tally.disagreements, {
          of: offers,
          what: `day ${String(n)}'s judged ${kind} offers`,
        }),
      ).toEqual([]);
      expect(shopCounts(judgedDay(n))[kind], REGENERATE).toEqual(
        dayOf(n).shop[kind],
      );
      expect(
        floorBreach(`shop-agreement/day ${String(n)}/${kind}`, offers),
      ).toBeUndefined();
    },
  );

  it.each(GRAMMAR_OWNED_DAYS)(
    'day %i: the shop lists no grammar offer, every node owned before the day',
    (n) => {
      const nodes = fixtures().course.regions.flatMap(({ grammarNodes }) =>
        grammarNodes.map(({ id }) => id),
      );
      expect([...dayOf(n).start.state.grammar].sort()).toEqual(nodes.sort());
      const { accepted, refused } = judgedDay(n).grammar;
      expect({ accepted, refused }).toEqual({ accepted: 0, refused: 0 });
      expect(dayOf(n).shop.grammar, REGENERATE).toEqual({
        accepted: 0,
        refused: 0,
      });
    },
  );

  it('judges the kinds the shop is judged by', () => {
    expect(KINDS).toEqual(SHOP_KINDS);
  });

  it.each(KINDS)(
    'the days judge, between them, the %s offers the whole log did',
    (kind) => {
      const { accepted, refused } = total(kind);
      expect(
        floorBreach(`shop-agreement/judged/${kind}`, accepted + refused),
      ).toBeUndefined();
    },
  );

  it.each(KINDS)(
    'judged %s offers apply accepted, at least the floor',
    (kind) => {
      expect(total(kind).accepted).toBeGreaterThan(FLOORS[kind].accepted);
    },
  );

  it.each(KINDS)(
    'judged %s offers apply refused, at least the floor',
    (kind) => {
      expect(total(kind).refused).toBeGreaterThan(FLOORS[kind].refused);
    },
  );
});
