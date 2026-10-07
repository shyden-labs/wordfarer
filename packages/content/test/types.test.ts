import { describe, expectTypeOf, it } from 'vitest';
import type { Cefr, LexiconItem } from '@yawelo-idle/core';
import type { LexiconEntry } from '../src/index';

/**
 * The schema and core cannot drift (#101 AC5). Core holds the one list of
 * levels (`CEFR_LEVELS`) and the schema enumerates it. These assertions are
 * types: `npm run typecheck` reads this file (content's tsconfig includes
 * `test/`), and a drift fails it with TS2344. At run time they do nothing.
 *
 * Proved red by the two drifts they exist for: the schema keeping its own
 * level list, and core's `LexiconItem` gaining a field the schema lacks
 * (`.superpowers/sdd/101/plan.md`, pass 8).
 */
describe('the content schema and core agree (#101 AC5)', () => {
  it('gives cefr exactly core’s Cefr', () => {
    expectTypeOf<LexiconEntry['cefr']>().toEqualTypeOf<Cefr>();
  });

  it('loads a lexicon entry that core can play as a LexiconItem', () => {
    expectTypeOf<LexiconEntry>().toExtend<LexiconItem>();
  });
});
