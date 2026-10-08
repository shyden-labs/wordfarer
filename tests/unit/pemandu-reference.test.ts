import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BOT_EPOCH_WALL_MS,
  syntheticCourse,
} from '../../packages/core/fixtures/synthetic-course';
import {
  bestPayback,
  nextPurchaseTick,
} from '../../packages/core/src/automation';
import {
  DAY_MS,
  bucketStart,
  simMs,
  wallMs,
} from '../../packages/core/src/clock';
import { heldCards } from '../../packages/core/src/cards';
import type { Course, CultureCard } from '../../packages/core/src/course';
import { stateHash } from '../../packages/core/src/hash';
import {
  newWordMemory,
  review,
  type WordMemory,
} from '../../packages/core/src/memory';
import { Num } from '../../packages/core/src/num';
import { integrate } from '../../packages/core/src/sim';
import { initialState, type GameState } from '../../packages/core/src/state';
import { phrasebookId } from '../../packages/core/src/upgrades';
import { floorBreach } from '../floors';
import { refIntegrate } from './pemandu-reference';

/**
 * #297 AC2: every Pemandu purchase is the one core made before #297, the
 * same Encounter at the same tick with the same stored bits. The reference
 * (`pemandu-reference.ts`) is the pre-#297 code; each generated state is
 * played by both, and at each of the reference's purchases core's
 * `nextPurchaseTick` must find that tick and Understanding, `bestPayback`
 * that Encounter, and `integrate` must end where the reference ends. The
 * states cover the whole synthetic course: any destination, any Encounter
 * counts, words, cards (and their festivals across the year), Phrasebooks,
 * the stamp discount and bonus, grammar, and each Pemandu interval.
 */

let built: Course | undefined;

/** The synthetic course, built on first use inside a test (#97). */
function course(): Course {
  built ??= syntheticCourse(1);
  return built;
}

const generated = fc.record({
  reached: fc.integer({ min: 0, max: 11 }),
  owned: fc.array(fc.integer({ min: 0, max: 60 }), {
    minLength: 18,
    maxLength: 18,
  }),
  words: fc.integer({ min: 0, max: 450 }),
  cards: fc.integer({ min: 0, max: 36 }),
  phrasebooks: fc.integer({ min: 0, max: 1023 }),
  discount: fc.integer({ min: 0, max: 2 }),
  stamps: fc.integer({ min: 0, max: 12 }),
  grammar: fc.integer({ min: 0, max: 12 }),
  held: fc.integer({ min: 0, max: 12 }),
  interval: fc.constantFrom(10_000, 5_000, 2_000, 1_000),
  day: fc.integer({ min: 0, max: 365 }),
  hour: fc.integer({ min: 0, max: 23 }),
  // Where the play starts: anywhere in its hour, in the hour's last ten
  // seconds so it crosses into the next bucket, or up to ten seconds before
  // one of its held cards' festival edges so it crosses that.
  start: fc.oneof(
    fc.record({
      kind: fc.constant('any' as const),
      at: fc.integer({ min: 0, max: 3_599_999 }),
    }),
    fc.record({
      kind: fc.constant('hourEnd' as const),
      at: fc.integer({ min: 3_590_000, max: 3_599_999 }),
    }),
    fc.record({
      kind: fc.constant('festivalEdge' as const),
      edge: fc.nat(),
      before: fc.integer({ min: 1, max: 10_000 }),
    }),
  ),
  ticks: fc.integer({ min: 0, max: 30 }),
});
type Generated = typeof generated extends fc.Arbitrary<infer T> ? T : never;

/** The state a record describes, its words reviewed before it begins. */
/** The held cards' festival edges, in order: where a play may start before. */
function edgesOf(cards: readonly CultureCard[]): readonly number[] {
  return [
    ...new Set(
      cards.flatMap((card) =>
        (card.festival?.windows ?? []).flatMap((w) => [
          w.startWallMs,
          w.endWallMs,
        ]),
      ),
    ),
  ].sort((a, b) => a - b);
}

function stateOf(r: Generated): GameState {
  const c = course();
  const held = c.regions
    .flatMap((region) => region.cultureCards)
    .slice(0, r.cards);
  const edges = edgesOf(held);
  const edge =
    r.start.kind === 'festivalEdge' && edges.length > 0
      ? edges[r.start.edge % edges.length]
      : undefined;
  const offset = r.start.kind === 'festivalEdge' ? 0 : r.start.at;
  const start = wallMs(
    edge !== undefined && r.start.kind === 'festivalEdge'
      ? edge - r.start.before
      : BOT_EPOCH_WALL_MS + r.day * DAY_MS + r.hour * 3_600_000 + offset,
  );
  const lexicon = c.regions.flatMap((region) =>
    region.destinations.flatMap((d) => d.lexicon.map((item) => item.id)),
  );
  const words: Record<string, WordMemory> = Object.fromEntries(
    lexicon.slice(0, r.words).map((id, k) => {
      const first = wallMs(start - 20 * DAY_MS + k * 1_800_000);
      const second = wallMs(first + ((k % 7) + 1) * DAY_MS);
      return [
        id,
        review(review(newWordMemory(first), first, true), second, k % 5 !== 0),
      ];
    }),
  );
  const encounters = c.regions.flatMap((region) => region.encounters);
  const tags = [...new Set(encounters.flatMap((e) => e.tags))].sort();
  const sim = simMs(40 * DAY_MS + offset);
  return {
    ...initialState(start, 1),
    sim,
    anchor: {
      sim,
      understanding: Num.toTuple(Num.from(10 ** r.held)),
    },
    words,
    memorySince: sim,
    owned: Object.fromEntries(
      encounters
        .map((e, k) => [e.id, r.owned[k] ?? 0] as const)
        .filter(([, n]) => n > 0),
    ),
    cards: held.map((card) => card.id),
    grammar: c.regions
      .flatMap((region) => region.grammarNodes.map((node) => node.id))
      .slice(0, r.grammar),
    upgrades: {
      ...Object.fromEntries(
        tags
          .filter((_, k) => (r.phrasebooks >> k) % 2 === 1)
          .map((tag) => [phrasebookId(tag), 1]),
      ),
      ...(r.discount > 0 ? { encounterDiscount: r.discount } : {}),
    },
    stampsEarned: r.stamps,
    destination: r.reached,
    reached: r.reached,
    automation: { enabled: true, intervalMs: r.interval },
  };
}

/**
 * Play `r` with the reference and with core; returns how many purchases were
 * held, and whether the play crossed an hour bucket or a held festival edge.
 */
function agrees(r: Generated): {
  readonly held: number;
  readonly crossed: boolean;
} {
  const c = course();
  const s = stateOf(r);
  const elapsed = r.ticks * r.interval;
  const until = simMs(s.sim + elapsed);
  const edge = edgesOf(heldCards(c, s)).find((e) => e > s.wall);
  const crossed =
    bucketStart(until) !== bucketStart(s.sim) ||
    (edge !== undefined && edge <= s.wall + elapsed);
  const { purchases, end } = refIntegrate(c, s, elapsed);
  let current = s;
  for (const p of purchases) {
    const found = nextPurchaseTick(c, current, until).next;
    expect(found?.tick).toBe(p.tick);
    expect(found && Num.toTuple(found.understanding)).toEqual(
      Num.toTuple(p.understanding),
    );
    const at: GameState = {
      ...current,
      sim: p.tick,
      wall: wallMs(current.wall + p.tick - current.sim),
      anchor: { sim: p.tick, understanding: Num.toTuple(p.understanding) },
    };
    expect(bestPayback(c, at)).toBe(p.id);
    current = p.after;
  }
  expect(nextPurchaseTick(c, current, until).next).toBeUndefined();
  const got = integrate(c, s, elapsed);
  expect(got).toEqual(end);
  expect(stateHash(got)).toBe(stateHash(end));
  return { held: purchases.length, crossed };
}

describe('Pemandu buys as it did before #297, purchase by purchase (AC2)', () => {
  it.each(Array.from({ length: 30 }, (_, k) => k + 1))(
    'over 10 generated states, seed %i',
    (seed) => {
      let held = 0;
      let crossed = 0;
      fc.assert(
        fc.property(generated, (r) => {
          const played = agrees(r);
          held += played.held;
          if (played.crossed) crossed += 1;
        }),
        { numRuns: 10, seed },
      );
      expect(
        floorBreach(`pemandu-reference/purchases-seed-${String(seed)}`, held),
      ).toBeUndefined();
      expect(
        floorBreach(
          `pemandu-reference/crossings-seed-${String(seed)}`,
          crossed,
        ),
      ).toBeUndefined();
    },
  );
});
