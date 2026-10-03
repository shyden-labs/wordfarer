import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonical, stateHash } from '../../packages/core/src/hash';
import { wallMs } from '../../packages/core/src/clock';
import { initialState, type GameState } from '../../packages/core/src/state';

/**
 * `stateHash` is SHA-256 of the canonical form (#34 AC4), checked against
 * Node's own SHA-256 rather than the `@noble/hashes` it is built on. Core's
 * tests see ECMAScript alone, so this check lives with the Node-side guards.
 */

const START = wallMs(Date.UTC(2027, 0, 4, 8));

/** A long id makes the canonical form span many 64-byte SHA-256 blocks. */
const LONG_ID = 'é'.repeat(300);

const CASES: readonly (readonly [string, () => GameState])[] = [
  ['a new game', () => initialState(START, 1)],
  ['another seed', () => initialState(START, 2)],
  [
    'a state with a long non-ASCII key',
    () => ({ ...initialState(START, 1), owned: { [LONG_ID]: 3 } }),
  ],
];

describe('stateHash against Node’s SHA-256 (AC4)', () => {
  it.each(CASES)('%s', (_name, make) => {
    const state = make();
    expect(stateHash(state)).toBe(
      createHash('sha256').update(canonical(state), 'utf8').digest('hex'),
    );
  });

  it('the long key spans more than one SHA-256 block', () => {
    const state = { ...initialState(START, 1), owned: { [LONG_ID]: 3 } };
    expect(Buffer.byteLength(canonical(state), 'utf8')).toBeGreaterThan(64 * 4);
  });
});
