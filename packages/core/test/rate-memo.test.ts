import { describe, expect, it } from 'vitest';
import { lateGameReturn } from '../fixtures/pemandu-returns';
import { syntheticCourse } from '../fixtures/synthetic-course';
import { bestPayback, nextPurchaseTick } from '../src/automation';
import { heldCards, nextFestivalEdge } from '../src/cards';
import { HOUR_MS, simMs, wallMs, type SimMs } from '../src/clock';
import type { Course } from '../src/course';
import { Num } from '../src/num';
import { rateAt, rateGain } from '../src/production';
import { regionsReached, route } from '../src/route';
import type { GameState } from '../src/state';
import { encounterPrice } from '../src/upgrades';

/**
 * What makes a Pemandu catch-up fast never serves a stale answer (#297 AC5):
 * each memo #297 adds (the rate book and its contexts, the prices, the held
 * cards, the sorted words and their matches, the route) is keyed by every
 * input it reads, one test per key part, as #33's bucket memo is. Each test
 * reads a state once to fill the memos, changes one key part, and reads
 * again: the answers must be the ones a cold read gives, from state objects
 * no memo has seen, and must differ from the first, so the part matters.
 */

let built: { readonly one: Course; readonly two: Course } | undefined;

/** Two courses with the same ids, built on first use inside a test (#97). */
function courses(): { readonly one: Course; readonly two: Course } {
  built ??= { one: syntheticCourse(1), two: syntheticCourse(2) };
  return built;
}

const SKEW_SHIFT = 30 * 60_000;

/**
 * The late-game player with its wall clock half an hour on, so the course's
 * festival edges, which fall on wall-clock hours, fall inside a bucket of the
 * simulated clock and a festival span is not also an hour.
 */
function late(): GameState {
  const s = lateGameReturn(courses().one);
  return { ...s, wall: wallMs(s.wall + SKEW_SHIFT) };
}

/**
 * Every answer the memos stand behind, read for `s` at `t`, taken in the
 * order given: a cold read takes them backwards, so an entry one answer left
 * behind under a key part a memo dropped is read by another and shows.
 */
function reading(
  c: Course,
  s: GameState,
  t: SimMs,
  backwards = false,
): Readonly<Record<string, unknown>> {
  const encounters = c.regions.flatMap((region) => region.encounters);
  // From nothing held, when the cheapest Encounter reached is first paid
  // for: which regions are reached decides which prices count.
  const broke: GameState = {
    ...s,
    anchor: { sim: s.sim, understanding: Num.toTuple(Num.from(0)) },
  };
  const tickOf = (
    found: ReturnType<typeof nextPurchaseTick>['next'],
  ): unknown => found && [found.tick, Num.toTuple(found.understanding)];
  const answers: readonly (readonly [string, () => unknown])[] = [
    ['rate', () => Num.toTuple(rateAt(c, s, t))],
    [
      'gains',
      () => {
        const gain = rateGain(c, s, t);
        return encounters.map((e) => Num.toTuple(gain(e)));
      },
    ],
    ['one', () => encounters.map((e) => Num.toTuple(encounterPrice(s, e, 1)))],
    ['two', () => encounters.map((e) => Num.toTuple(encounterPrice(s, e, 2)))],
    ['held', () => heldCards(c, s).map((card) => card.id)],
    ['next', () => tickOf(nextPurchaseTick(c, s, simMs(s.sim + HOUR_MS)).next)],
    [
      'first',
      () => tickOf(nextPurchaseTick(c, broke, simMs(s.sim + 86_400_000)).next),
    ],
    [
      'soon',
      () => {
        // From nothing held on a millisecond grid, when the cheapest
        // Encounter reached is first paid for: the production is so fast
        // that only this grid lets a price move the tick.
        const fine: GameState = {
          ...s,
          anchor: { sim: s.sim, understanding: Num.toTuple(Num.from(0)) },
          automation: { ...s.automation, intervalMs: 1 },
        };
        return tickOf(nextPurchaseTick(c, fine, simMs(s.sim + HOUR_MS)).next);
      },
    ],
    ['best', () => bestPayback(c, s)],
    ['route', () => route(c).map((stop) => stop.region)],
  ];
  // Backwards, with the 2-count prices first: every other answer prices one.
  const ordered = backwards
    ? [
        ...answers.filter(([name]) => name === 'two'),
        ...[...answers].reverse().filter(([name]) => name !== 'two'),
      ]
    : answers;
  return Object.fromEntries(ordered.map(([name, read]) => [name, read()]));
}

/** `s` rebuilt from objects no memo has seen. */
function cold(s: GameState): GameState {
  return {
    ...s,
    words: { ...s.words },
    cards: [...s.cards],
    upgrades: { ...s.upgrades },
    grammar: [...s.grammar],
    owned: { ...s.owned },
  };
}

/** The sim time of the first festival edge ahead of `s`'s wall clock. */
function edgeAhead(c: Course, s: GameState): SimMs {
  const edge = nextFestivalEdge(heldCards(c, s), s.wall);
  if (edge === undefined) throw new Error('no festival edge ahead');
  return simMs(edge - (s.wall - s.sim));
}

type Change = (
  c: Course,
  s: GameState,
) => {
  readonly course?: Course;
  /** The same course built afresh, for the cold read, when not by seed. */
  readonly afresh?: () => Course;
  /** The state read first, when not the late-game player itself. */
  readonly from?: GameState;
  readonly state: GameState;
  /** When to read before the change, and after it. */
  readonly at?: readonly [SimMs, SimMs];
};

describe('the memos behind a fast catch-up are keyed by every part they read (AC5)', () => {
  it.each<readonly [string, Change]>([
    [
      'the words held',
      (_c, s) => {
        const [, ...rest] = Object.entries(s.words);
        return { state: { ...s, words: Object.fromEntries(rest) } };
      },
    ],
    [
      'the cards held',
      (_c, s) => ({ state: { ...s, cards: s.cards.slice(1) } }),
    ],
    [
      'a Phrasebook owned',
      (c, s) => {
        const tag = c.regions[0]?.encounters[0]?.tags[0] ?? '';
        return {
          state: {
            ...s,
            upgrades: { ...s.upgrades, [`phrasebook:${tag}`]: 1 },
          },
        };
      },
    ],
    [
      'the stamp discount',
      (_c, s) => ({
        state: { ...s, upgrades: { ...s.upgrades, encounterDiscount: 1 } },
      }),
    ],
    [
      'a grammar node owned',
      (c, s) => ({
        state: { ...s, grammar: [c.regions[0]?.grammarNodes[0]?.id ?? ''] },
      }),
    ],
    [
      'memorySince moves',
      (_c, s) => ({ state: { ...s, memorySince: simMs(s.sim + 600_000) } }),
    ],
    [
      'the skew moves',
      (_c, s) => ({ state: { ...s, wall: wallMs(s.wall + 86_400_000) } }),
    ],
    [
      'a stamp earned',
      (_c, s) => ({ state: { ...s, stampsEarned: s.stampsEarned + 1 } }),
    ],
    [
      'the next hour',
      (_c, s) => ({
        state: s,
        at: [simMs(s.sim + 1_234), simMs(s.sim + 1_234 + HOUR_MS)],
      }),
    ],
    [
      'across a festival edge, inside one hour',
      (c, s) => {
        const edge = edgeAhead(c, s);
        return { state: s, at: [simMs(edge - 1), edge] };
      },
    ],
    [
      'one more of an Encounter owned',
      (c, s) => {
        // The cheapest reached, so when Pemandu can first buy moves too.
        const reached = c.regions
          .slice(0, regionsReached(c, s))
          .flatMap((region) => region.encounters);
        const [first, ...rest] = reached;
        if (first === undefined) throw new Error('no Encounter is reached');
        const { id } = rest.reduce(
          (low, e) =>
            Num.cmp(encounterPrice(s, e, 1), encounterPrice(s, low, 1)) < 0
              ? e
              : low,
          first,
        );
        return {
          state: { ...s, owned: { ...s.owned, [id]: (s.owned[id] ?? 0) + 1 } },
        };
      },
    ],
    [
      'fewer regions reached',
      (c, s) => {
        // Region 1's Encounters owned in thousands cost more than any later
        // one, so which regions are reached moves the cheapest price.
        const dear: GameState = {
          ...s,
          owned: {
            ...s.owned,
            ...Object.fromEntries(
              (c.regions[0]?.encounters ?? []).map((e) => [e.id, 2_000]),
            ),
          },
        };
        return { from: dear, state: { ...dear, reached: 0, destination: 0 } };
      },
    ],
    [
      'a course with fewer regions',
      (c, s) => {
        const shorter = (whole: Course): Course => ({
          ...whole,
          regions: whole.regions.slice(0, 2),
        });
        const kept = shorter(c);
        const ids = new Set(
          kept.regions.flatMap((region) =>
            region.destinations.flatMap((d) => d.lexicon.map((i) => i.id)),
          ),
        );
        const cards = new Set(
          kept.regions.flatMap((region) =>
            region.cultureCards.map((card) => card.id),
          ),
        );
        return {
          course: kept,
          afresh: () => shorter(syntheticCourse(1)),
          state: {
            ...s,
            words: Object.fromEntries(
              Object.entries(s.words).filter(([id]) => ids.has(id)),
            ),
            cards: s.cards.filter((id) => cards.has(id)),
            reached: 7,
            destination: 7,
          },
        };
      },
    ],
    [
      'another course with the same ids',
      (_c, s) => ({ course: courses().two, state: s }),
    ],
  ])('%s', (_label, change) => {
    const c = courses().one;
    const s0 = late();
    const changed = change(c, s0);
    const [t0, t1] = changed.at ?? [
      simMs(s0.sim + 1_234),
      simMs(s0.sim + 1_234),
    ];
    const c1 = changed.course ?? c;
    const before = reading(c, changed.from ?? s0, t0);
    const warm = reading(c1, changed.state, t1);
    // Cold: a course built afresh, so no memo keyed by its objects has an
    // entry, and state objects no memo has seen, read backwards.
    const fresh = reading(
      changed.afresh?.() ?? syntheticCourse(c1 === courses().two ? 2 : 1),
      cold(changed.state),
      t1,
      true,
    );
    expect(warm).toEqual(fresh);
    // Each stop's region, counted from the course itself: a route memo that
    // served another course's route would be the same in both reads.
    expect(warm['route']).toEqual(
      c1.regions.flatMap((region, r) => region.destinations.map(() => r)),
    );
    expect(fresh).not.toEqual(before);
  });
});
