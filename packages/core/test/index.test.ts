import { describe, expect, expectTypeOf, it } from 'vitest';
import * as core from '../src/index';

/**
 * The words and memory API (#28), the upgrades API (#29), the route (#31),
 * grammar (#32), Pemandu (#33) and the view with its shop (#35) are reachable
 * from the package entry point, which is all the UI and the pacing bots
 * import.
 */
describe('the package entry point', () => {
  for (const name of [
    'pickUpWord',
    'buyGrammarNode',
    'findGrammarNode',
    'grammarNodeCost',
    'ownedGrammarNodes',
    'answerReview',
    'answerPractice',
    'pickUpCost',
    'pickedWord',
    'rateAt',
    'wordMultiplier',
    'buyUpgrade',
    'upgradeCatalogue',
    'findUpgrade',
    'upgradeLevel',
    'phrasebookId',
    'offlineCapMs',
    'encounterCostFactor',
    'journeyDurationFactor',
    'journeySlots',
    'pemanduIntervalsMs',
    'startingUnderstanding',
    'globalMultiplier',
    'rateBreakdown',
    'totalRate',
    'milestoneFactor',
    'route',
    'currentDestination',
    'currentRegion',
    'regionsReached',
    'setSail',
    'sailGoal',
    'sailPreview',
    'goalMet',
    'runUnderstanding',
    'stampGain',
    'wordsHeld',
    'understandingNow',
    'unfold',
    'setAutomation',
    'automationOpensAt',
    'automationUnlocked',
    'bestPayback',
    'nextPurchaseTick',
    'rateGain',
    'encounterPrice',
    'view',
    'nextPickUp',
    'resolveCourse',
  ] as const)
    it(`exports ${name}`, () => {
      expect(core[name]).toBeTypeOf('function');
    });

  it('exports the five ranks in order', () => {
    expect(core.RANKS).toEqual([
      'heard',
      'recognised',
      'recalled',
      'fluent',
      'mastered',
    ]);
  });

  it('exports the three CEFR levels in order, the one definition content’s schema reads (#101 AC5)', () => {
    expect(core.CEFR_LEVELS).toEqual(['A1', 'A2', 'B1']);
  });

  it('keeps Cefr equal to CEFR_LEVELS’ members, so the two cannot disagree (#101 AC5)', () => {
    expectTypeOf<core.Cefr>().toEqualTypeOf<
      (typeof core.CEFR_LEVELS)[number]
    >();
    expectTypeOf(core.CEFR_LEVELS).toEqualTypeOf<readonly ['A1', 'A2', 'B1']>();
  });
});
