import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The Worker tests run on the same runtime that deploys.
 *
 * @cloudflare/vitest-pool-workers pins its own wrangler and miniflare, and
 * 0.22.0 pinned versions carrying five high advisories (sharp, undici). The
 * root `overrides` points it at the root wrangler and a patched miniflare.
 * When Dependabot bumps wrangler, the miniflare override goes stale and the
 * lock grows a second copy: the tests would then run on one workerd while
 * `wrangler deploy` ships for another. This fails that bump until the
 * override is updated to the miniflare the new wrangler depends on.
 */

interface PackageLock {
  packages: Record<string, { version?: string }>;
}

const versionsOf = (name: string) => {
  const lock = JSON.parse(
    readFileSync('package-lock.json', 'utf8'),
  ) as PackageLock;
  const suffix = `node_modules/${name}`;
  return [
    ...new Set(
      Object.entries(lock.packages)
        .filter(([path]) => path === suffix || path.endsWith(`/${suffix}`))
        .map(([, entry]) => entry.version ?? '(none)'),
    ),
  ];
};

describe('one Workers runtime in the lock', () => {
  it.each(['wrangler', 'miniflare', 'workerd'])(
    'exactly one version of %s',
    (name) => {
      expect(versionsOf(name)).toHaveLength(1);
    },
  );
});

/**
 * GHSA-wq5f-xc86-pv6w (#444): sharp below 0.35.5 carries a librsvg flaw.
 * astro (`^0.35.4`) and miniflare (exactly `0.35.4`) both pull it in, so the
 * root `overrides` lifts it. When both depend on 0.35.5 or later themselves,
 * remove the override in the Dependabot PR that lifts them, and this test
 * with it.
 */
const PATCHED_SHARP = [0, 35, 5];

const sharpOverride = (): string | undefined =>
  (
    JSON.parse(readFileSync('package.json', 'utf8')) as {
      overrides?: Record<string, unknown>;
    }
  ).overrides?.sharp as string | undefined;

const atLeastPatched = (version: string): boolean => {
  const parts = version.split('.').map(Number);
  for (const [i, want] of PATCHED_SHARP.entries()) {
    const have = parts[i] ?? 0;
    if (have !== want) return have > want;
  }
  return true;
};

describe('sharp is patched (GHSA-wq5f-xc86-pv6w, #444)', () => {
  it('the root overrides sharp to 0.35.5 or later', () => {
    const override = sharpOverride() ?? '(no override)';
    expect(atLeastPatched(override), override).toBe(true);
  });

  it('every sharp in the lock is the overridden version', () => {
    expect(versionsOf('sharp')).toEqual([sharpOverride()]);
  });
});
