import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { floorBreach } from '../floors';
import { searched } from '../searched';

/**
 * The Worker tests run on the same runtime that deploys.
 *
 * Every Worker suite drives wrangler's own test harness, which starts the
 * workerd that wrangler itself depends on, so a passing test means the
 * deployed Worker behaves the same. That holds while the lock has one
 * wrangler, one miniflare and one workerd, and while nothing but wrangler
 * brings the runtime in. A test tool that pins its own (as
 * @cloudflare/vitest-pool-workers did, until #506) adds a second runtime the
 * tests run on while `wrangler deploy` ships for another, and its pin holds
 * every wrangler bump red until someone edits it by hand.
 */

type Dependencies = Record<string, string>;

interface LockEntry {
  version?: string;
  dependencies?: Dependencies;
  devDependencies?: Dependencies;
  peerDependencies?: Dependencies;
  optionalDependencies?: Dependencies;
}

interface PackageLock {
  packages: Record<string, LockEntry>;
}

const readLock = (): PackageLock =>
  JSON.parse(readFileSync('package-lock.json', 'utf8')) as PackageLock;

/** The packages that are the Workers runtime, or start it. */
const RUNTIME = ['wrangler', 'miniflare'];

/**
 * Every lock path whose entry names wrangler or miniflare in any kind of
 * dependency, in lock order.
 */
const runtimeConsumers = (lock: PackageLock): string[] =>
  Object.entries(lock.packages)
    .filter(([, entry]) =>
      [
        entry.dependencies,
        entry.devDependencies,
        entry.peerDependencies,
        entry.optionalDependencies,
      ].some((declared) => RUNTIME.some((name) => name in (declared ?? {}))),
    )
    .map(([path]) => path);

/** Our own root, which declares wrangler, and wrangler, which starts miniflare. */
const THROUGH_WRANGLER = ['', 'node_modules/wrangler'];

const versionsOf = (name: string) => {
  const lock = readLock();
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

  it('the runtime enters the lock only through wrangler (#506)', () => {
    const consumers = runtimeConsumers(readLock());
    expect(
      searched(
        consumers.filter((path) => !THROUGH_WRANGLER.includes(path)),
        {
          of: consumers,
          what: 'lock entries depending on wrangler or miniflare',
        },
      ),
      'a package bringing its own Workers runtime: Worker tests on it would ' +
        'not run on the workerd that deploys',
    ).toEqual([]);
    expect(
      floorBreach('worker-runtime/runtime-consumers', consumers.length),
    ).toBeUndefined();
  });
});

describe('runtimeConsumers reads every kind of dependency (#506)', () => {
  it.each([
    ['dependencies', 'wrangler'],
    ['devDependencies', 'wrangler'],
    ['peerDependencies', 'miniflare'],
    ['optionalDependencies', 'miniflare'],
  ])('finds an entry naming the runtime in %s (%s)', (kind, name) => {
    const lock: PackageLock = {
      packages: {
        'node_modules/unrelated': { dependencies: { vitest: '^4.1.0' } },
        'node_modules/brings-a-runtime': { [kind]: { [name]: '*' } },
      },
    };
    expect(runtimeConsumers(lock)).toEqual(['node_modules/brings-a-runtime']);
  });
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
