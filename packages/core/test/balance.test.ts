import { describe, expect, it } from 'vitest';
import { BALANCE, JOURNEY_DURATION_IDS, type Balance } from '../src/balance';

/**
 * balance.ts: one frozen table of every tunable number (#26 AC7).
 *
 * The values are pinned as literals against the spec section each comes from.
 * A pin derived from BALANCE itself would move with it and guard nothing.
 */

function walk(
  value: unknown,
  path: string,
  visit: (path: string, value: unknown) => void,
): void {
  visit(path, value);
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value))
      walk(child, `${path}.${key}`, visit);
  }
}

describe('BALANCE', () => {
  it('is frozen all the way down', () => {
    const containers: string[] = [];
    walk(BALANCE, 'BALANCE', (path, value) => {
      if (typeof value === 'object' && value !== null) {
        containers.push(path);
        expect(Object.isFrozen(value), path).toBe(true);
      }
    });
    // Liveness: the walk reached the nested tables and arrays. Measured 33
    // with #30's two journey tables (31 at b2a6f3f, #82); raise it with
    // BALANCE, lower it only when BALANCE shrinks.
    expect(containers.length).toBeGreaterThan(32);
    expect(() => {
      (BALANCE.encounters as { costGrowth: number }).costGrowth = 2;
    }).toThrow(TypeError);
    expect(() => {
      (BALANCE.journeys.durationsMs as number[]).push(1);
    }).toThrow(TypeError);
  });

  it('holds only finite, non-negative numbers', () => {
    const leaves: string[] = [];
    walk(BALANCE, 'BALANCE', (path, value) => {
      if (typeof value !== 'object' || value === null) {
        leaves.push(path);
        expect(typeof value, path).toBe('number');
        expect(Number.isFinite(value) && (value as number) >= 0, path).toBe(
          true,
        );
      }
    });
    // Measured 93 with #32's grammar costs (90 with #31's Set Sail table,
    // 84 with #30's journey tables, 74 at b2a6f3f, #82); raise it with
    // BALANCE, lower it only when BALANCE shrinks.
    expect(leaves.length).toBeGreaterThan(92);
  });

  it.each<[string, (b: Balance) => unknown, unknown]>([
    ['parent §3.2: cost growth 1.15', (b) => b.encounters.costGrowth, 1.15],
    [
      'parent §3.2: milestones at 10, 25, 50, 100, then every 100',
      (b) => [b.encounters.milestones, b.encounters.milestoneEvery],
      [[10, 25, 50, 100], 100],
    ],
    [
      'parent §3.2: each milestone doubles output',
      (b) => b.encounters.milestoneMultiplier,
      2,
    ],
    [
      'parent §4.1: first Encounter at 10 Understanding',
      (b) => b.encounters.firstAtUnderstanding,
      10,
    ],
    [
      'parent §3.3 (#35): rank bonuses, Mastered 4x Heard',
      (b) => b.words.rankBonus,
      {
        heard: 0.04,
        recognised: 0.06,
        recalled: 0.09,
        fluent: 0.12,
        mastered: 0.16,
      },
    ],
    [
      'parent §3.3 (#35): the floor is four fifths of the rank bonus',
      (b) => b.words.floorShare,
      0.8,
    ],
    [
      'design §5: the n-th pick-up in a destination costs 20 x 1.15^n',
      (b) => [b.words.pickUpC0, b.words.pickUpGrowth],
      [20, 1.15],
    ],
    [
      'parent §3.4: rank stability thresholds in days',
      (b) => b.memory.rankStabilityDays,
      { recognised: 2, recalled: 7, fluent: 14, mastered: 30 },
    ],
    ['parent §3.4: queue of 10', (b) => b.memory.queueSize, 10],
    [
      'parent §3.4: Insight 1 + 0.5 x rankIndex',
      (b) => [b.memory.insightBase, b.memory.insightPerRank],
      [1, 0.5],
    ],
    [
      'parent §4.1: tutorial word due after 4 minutes',
      (b) => b.memory.tutorialDueMs,
      240_000,
    ],
    [
      'parent §4.2: journeys of 30 min, 2 h, 4 h, 8 h, 24 h',
      (b) => b.journeys.durationsMs,
      [1_800_000, 7_200_000, 14_400_000, 28_800_000, 86_400_000],
    ],
    [
      'design §5 (#30, #35): a repeat card pays 40, 80, 120, 200 and 400 Insight',
      (b) => b.journeys.duplicateInsight,
      [40, 80, 120, 200, 400],
    ],
    [
      'design §5 (#30): a repeat card pays a quarter of its duration in Understanding',
      (b) => b.journeys.duplicateUnderstandingMs,
      [450_000, 1_800_000, 3_600_000, 7_200_000, 21_600_000],
    ],
    [
      'parent §4.2: 1 slot, upgradable to 3',
      (b) => [b.journeys.startingSlots, b.journeys.maxSlots],
      [1, 3],
    ],
    [
      'parent §3.1: +10% production per stamp',
      (b) => b.stamps.globalBonusPerStamp,
      0.1,
    ],
    [
      'design §5: cost -5% per level, capped at -40%',
      (b) => [b.stamps.costDiscountPerLevel, b.stamps.costDiscountCap],
      [0.05, 0.4],
    ],
    [
      'design §5: journeys -10% per level, capped at -30%',
      (b) => [b.stamps.journeyCutPerLevel, b.stamps.journeyCutCap],
      [0.1, 0.3],
    ],
    [
      'design §5 (#35): a tap gives 0.25',
      (b) => b.listen.understandingPerTap,
      0.25,
    ],
    [
      'design §5: Phrasebook x2 for one tag',
      (b) => b.insightUpgrades.phrasebookMultiplier,
      2,
    ],
    [
      'design §5: offline cap 24 h, +24 h twice, to 72 h',
      (b) => b.offline,
      { capMs: 86_400_000, capStepMs: 86_400_000, maxCapMs: 259_200_000 },
    ],
    [
      'design §5: grammar g = 0.5; a node costs 50 x 1.5^n Insight from region 2 (#32)',
      (b) => b.grammar,
      { rootGain: 0.5, costC0: 50, costGrowth: 1.5, opensAtRegion: 2 },
    ],
    [
      'design §5: Pemandu 10 s, then 5 s, 2 s, 1 s, open from region 2 (#33)',
      (b) => b.automation,
      { intervalsMs: [10_000, 5_000, 2_000, 1_000], opensAtRegion: 2 },
    ],
    [
      'design §5: Mastery goal x 1.5 per replay',
      (b) => b.mastery.goalGrowthPerReplay,
      1.5,
    ],
    ['design §5: in-season bonus x 2', (b) => b.seasons.inSeasonMultiplier, 2],
    [
      'design §5 (#29): Insight upgrade costs, one per level',
      (b) => b.insightUpgrades.costs,
      {
        journeySlot2: [25],
        journeySlot3: [100],
        offlineCap: [40, 120],
        phrasebook: [5],
        pemanduFaster1: [30],
        pemanduFaster2: [90],
        pemanduFaster3: [250],
      },
    ],
    [
      'design §5 (#29): stamp upgrade costs, one per level',
      (b) => b.stamps.costs,
      {
        startingUnderstanding: [1, 2, 3, 5, 8],
        encounterDiscount: [1, 1, 2, 2, 3, 3, 4, 4],
        journeyCut: [2, 3, 5],
        pemanduEarly: [5],
      },
    ],
    [
      'design §5 (#29): 100 starting Understanding per level',
      (b) => b.stamps.startingUnderstandingPerLevel,
      100,
    ],
    [
      'design §5 (#35): U_goal is a table, one goal per destination',
      (b) => b.sail.goals,
      [
        2.12e9, 2.07e13, 1.42e14, 4.73e14, 4.81e17, 1.13e18, 2.49e18, 2.98e18,
        3.18e21, 5.65e21, 8.02e21, 1.35e22,
      ],
    ],
    [
      'design §5 (#31): words(i) = 8 + 2i',
      (b) => [b.sail.wordsBase, b.sail.wordsStep],
      [8, 2],
    ],
    ['design §5 (#31): k = 3 stamps at the goal', (b) => b.sail.stampK, 3],
    [
      'parent §4.5 (#31): 3 playable regions by default',
      (b) => b.sail.playableRegions,
      3,
    ],
  ])('%s', (_source, read, expected) => {
    expect(read(BALANCE)).toEqual(expected);
  });

  it('fails typecheck when a key is missing', () => {
    const withoutGrammar: Omit<Balance, 'grammar'> = BALANCE;
    // @ts-expect-error a Balance without `grammar` is not a Balance
    const incomplete: Balance = withoutGrammar;
    const fourRanks: Omit<Balance['words']['rankBonus'], 'mastered'> =
      BALANCE.words.rankBonus;
    // @ts-expect-error every rank needs a bonus
    const missingRank: Balance['words']['rankBonus'] = fourRanks;
    expect([incomplete, missingRank]).toHaveLength(2);
  });

  it('names the journey durations, the tutorial first', () => {
    expect(JOURNEY_DURATION_IDS).toEqual(['tutorial', '2h', '4h', '8h', '24h']);
  });

  /** Every table indexed by journey duration, one test each. */
  const JOURNEY_TABLES: readonly [string, (b: Balance) => readonly number[]][] =
    [
      ['durationsMs', (b) => b.journeys.durationsMs],
      ['duplicateInsight', (b) => b.journeys.duplicateInsight],
      ['duplicateUnderstandingMs', (b) => b.journeys.duplicateUnderstandingMs],
    ];
  for (const [name, table] of JOURNEY_TABLES)
    it(`journeys.${name} has one entry per duration id`, () => {
      // Two empty lists are equally long: pin the population first.
      expect(JOURNEY_DURATION_IDS).toHaveLength(5);
      expect(table(BALANCE)).toHaveLength(JOURNEY_DURATION_IDS.length);
    });
});
