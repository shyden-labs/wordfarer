/**
 * Insight and Passport Stamp upgrades: the two catalogues and their effects
 * (parent spec §3.1, M1 design §5).
 *
 * An upgrade costs `costs[level]` for its next level and is maxed at
 * `costs.length`; every cost comes from `BALANCE`. An upgrade that unlocks a
 * distinct thing (a journey slot, a faster Pemandu interval) is its own id
 * and requires the one before it; one that adds the same step again (the
 * offline cap, the Encounter discount, the journey cut, starting
 * Understanding) is one id with levels. State holds only the levels; every
 * effect is derived from them here, and each capped effect is also clamped,
 * so a level past the last (from an older balance table) cannot exceed it.
 */
import { BALANCE, type InsightUpgradeId, type StampUpgradeId } from './balance';
import type { Course, Encounter } from './course';
import { purchaseCost } from './encounters';
import { Num } from './num';
import { ownedCount, type GameState } from './state';

export type UpgradeCurrency = 'insight' | 'stamps';

export interface Upgrade {
  readonly id: string;
  readonly currency: UpgradeCurrency;
  /** The cost of each level in turn; the upgrade is maxed at `costs.length`. */
  readonly costs: readonly number[];
  /** An upgrade that must be owned before this one can be bought. */
  readonly requires?: string;
  /** The tag a Phrasebook doubles production on. */
  readonly tag?: string;
}

const PEMANDU_TIERS = [
  'pemanduFaster1',
  'pemanduFaster2',
  'pemanduFaster3',
] as const satisfies readonly InsightUpgradeId[];

const SLOT_UPGRADES = [
  'journeySlot2',
  'journeySlot3',
] as const satisfies readonly InsightUpgradeId[];

const STAMP_UPGRADES: readonly StampUpgradeId[] = [
  'startingUnderstanding',
  'encounterDiscount',
  'journeyCut',
  'pemanduEarly',
];

function insight(id: InsightUpgradeId, requires?: InsightUpgradeId): Upgrade {
  const costs = BALANCE.insightUpgrades.costs[id];
  return requires === undefined
    ? { id, currency: 'insight', costs }
    : { id, currency: 'insight', costs, requires };
}

/** The id of the Phrasebook for `tag`. */
export function phrasebookId(tag: string): string {
  return `phrasebook:${tag}`;
}

function build(course: Course): ReadonlyMap<string, Upgrade> {
  const list: Upgrade[] = [
    insight('journeySlot2'),
    insight('journeySlot3', 'journeySlot2'),
    insight('offlineCap'),
    ...course.tags.map((tag): Upgrade => ({
      id: phrasebookId(tag),
      currency: 'insight',
      costs: BALANCE.insightUpgrades.costs.phrasebook,
      tag,
    })),
    insight('pemanduFaster1'),
    insight('pemanduFaster2', 'pemanduFaster1'),
    insight('pemanduFaster3', 'pemanduFaster2'),
    ...STAMP_UPGRADES.map((id): Upgrade => ({
      id,
      currency: 'stamps',
      costs: BALANCE.stamps.costs[id],
    })),
  ];
  return new Map(list.map((u) => [u.id, u]));
}

const catalogues = new WeakMap<Course, ReadonlyMap<string, Upgrade>>();

function catalogueOf(course: Course): ReadonlyMap<string, Upgrade> {
  let found = catalogues.get(course);
  if (found === undefined) {
    found = build(course);
    catalogues.set(course, found);
  }
  return found;
}

/** Every upgrade `course` offers: the Insight ones, then the stamp ones. */
export function upgradeCatalogue(course: Course): readonly Upgrade[] {
  return [...catalogueOf(course).values()];
}

/** The upgrade with id `id`, or `undefined` when the course offers none. */
export function findUpgrade(course: Course, id: string): Upgrade | undefined {
  return catalogueOf(course).get(id);
}

/** The level of upgrade `id` the state owns. Reads own keys only. */
export function upgradeLevel(state: GameState, id: string): number {
  return Object.hasOwn(state.upgrades, id) ? (state.upgrades[id] ?? 0) : 0;
}

/** Offline time credited on a return: 24 h, +24 h per level, at most 72 h. */
export function offlineCapMs(state: GameState): number {
  const { capMs, capStepMs, maxCapMs } = BALANCE.offline;
  return Math.min(
    capMs + upgradeLevel(state, 'offlineCap') * capStepMs,
    maxCapMs,
  );
}

/** What an Encounter purchase costs, as a share of its list price. */
export function encounterCostFactor(state: GameState): number {
  const { costDiscountPerLevel, costDiscountCap } = BALANCE.stamps;
  return (
    1 -
    Math.min(
      upgradeLevel(state, 'encounterDiscount') * costDiscountPerLevel,
      costDiscountCap,
    )
  );
}

/**
 * What `count` more of `encounter` cost the player now: the listed cost at
 * the count owned, with the stamp discount. A purchase by hand and one by
 * Pemandu (#33) pay exactly this.
 */
export function encounterPrice(
  state: GameState,
  encounter: Encounter,
  count: number,
): Num {
  return Num.mul(
    purchaseCost(encounter, ownedCount(state, encounter.id), count),
    Num.from(encounterCostFactor(state)),
  );
}

/** How long a journey takes, as a share of its listed duration. */
export function journeyDurationFactor(state: GameState): number {
  const { journeyCutPerLevel, journeyCutCap } = BALANCE.stamps;
  return (
    1 -
    Math.min(
      upgradeLevel(state, 'journeyCut') * journeyCutPerLevel,
      journeyCutCap,
    )
  );
}

/**
 * Journey slots open: the starting one plus each slot bought. There is one
 * slot upgrade per slot above the first, so this reaches `maxSlots` exactly.
 */
export function journeySlots(state: GameState): number {
  const bought = SLOT_UPGRADES.filter(
    (id) => upgradeLevel(state, id) > 0,
  ).length;
  return BALANCE.journeys.startingSlots + bought;
}

/** The Pemandu intervals the player may choose: the first, then each tier bought. */
export function pemanduIntervalsMs(state: GameState): readonly number[] {
  return BALANCE.automation.intervalsMs.filter((_, i) => {
    if (i === 0) return true;
    const tier = PEMANDU_TIERS[i - 1];
    return tier !== undefined && upgradeLevel(state, tier) > 0;
  });
}

/** Understanding a destination starts with (applied by Set Sail, #31). */
export function startingUnderstanding(state: GameState): number {
  return (
    upgradeLevel(state, 'startingUnderstanding') *
    BALANCE.stamps.startingUnderstandingPerLevel
  );
}

/** The global production multiplier: +10% per stamp ever earned (parent §3.1). */
export function globalMultiplier(state: GameState): number {
  return 1 + state.stampsEarned * BALANCE.stamps.globalBonusPerStamp;
}
