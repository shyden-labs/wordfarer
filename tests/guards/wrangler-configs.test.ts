import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WRANGLER_CONFIGS,
  wranglerConfigsOnDisk,
} from '../unit/wrangler-configs';

/**
 * The four deploy configs dev-config.test.ts reads by name are every wrangler
 * config in the repo. Finding them walks the tree, so this runs here (#530;
 * the walk moved out of the unit suite with its real run kept).
 */

describe('the dev deploy configs (#530)', () => {
  it('finds the three dev Workers and the hostname adapter on disk, and no other', () => {
    expect(
      wranglerConfigsOnDisk('.')
        .map((path) => relative('.', path))
        .sort(),
    ).toEqual([...WRANGLER_CONFIGS]);
  });
});
