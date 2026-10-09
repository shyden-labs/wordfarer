import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  renderNotices,
  type Lockfile,
} from '../../scripts/third-party-notices';

/**
 * THIRD-PARTY-NOTICES.md is exactly what the generator renders (#26 AC11).
 * Rendering reads every bundled package's folder under node_modules, a walk
 * of the whole install, so it runs here (#530); the per-package checks stay
 * in tests/unit/third-party-notices.test.ts.
 */

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as Lockfile;
const listing = readFileSync('THIRD-PARTY-NOTICES.md', 'utf8');

describe('THIRD-PARTY-NOTICES.md', () => {
  it('is exactly what the generator renders from the lockfile (npm run notices)', () => {
    expect(listing).toBe(renderNotices(lock, '.'));
  });
});
