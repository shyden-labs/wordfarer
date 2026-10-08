import { describe, expect, it } from 'vitest';
import {
  digest,
  FUNCTIONS,
  VECTORS_PER_FUNCTION,
  type GoldenFunction,
} from './golden-vectors';

/**
 * The golden vectors' Node digests (#26 AC10, #28): det-math measured
 * 2026-10-01, meanR and review 2026-10-02.
 *
 * tests/engines proves each browser engine gives Node's bits; this pin proves
 * Node's bits have not moved. A det-math change that alters any result, such
 * as swapping in Math.pow, moves a digest, so it is seen here first, on
 * every engine, before the cross-engine comparison runs.
 */

const PINNED: Record<GoldenFunction, string> = {
  pow: '3d7063d7ea64de4e',
  exp: '282e82fba82afd4e',
  ln: 'c42cd90d8c5957cf',
  log10: '7975fd2b8f7c506e',
  expm1: '2c1250daae88b5ac',
  log1p: '2b1b9cb3cddb4cb2',
  meanR: 'ec29edb532f4e19d',
  // The first 30,000 review vectors: see PINNED_VECTORS.
  review: '49fa93b3f25a97ab',
};

/**
 * How many vectors each pin hashes. Review runs every vector through
 * ts-fsrs, and all 100,000 took 0.5 s of CPU, so its pin reads the first
 * 1,200 cards (#474); tests/engines still compares all 100,000 in every
 * engine against Node's bits. The full review digest is 1856bc56fcfef272.
 */
const PINNED_VECTORS: Record<GoldenFunction, number> = {
  pow: VECTORS_PER_FUNCTION,
  exp: VECTORS_PER_FUNCTION,
  ln: VECTORS_PER_FUNCTION,
  log10: VECTORS_PER_FUNCTION,
  expm1: VECTORS_PER_FUNCTION,
  log1p: VECTORS_PER_FUNCTION,
  meanR: VECTORS_PER_FUNCTION,
  review: 30_000,
};

describe('golden vectors', () => {
  it('cover 100,000 vectors for each of the eight functions', () => {
    expect(VECTORS_PER_FUNCTION).toBe(100_000);
    expect([...FUNCTIONS].sort()).toEqual([
      'exp',
      'expm1',
      'ln',
      'log10',
      'log1p',
      'meanR',
      'pow',
      'review',
    ]);
  });

  for (const fn of FUNCTIONS)
    it(`${fn} hashes to its pinned digest under Node`, () => {
      expect(digest(fn, PINNED_VECTORS[fn])).toBe(PINNED[fn]);
    });
});
