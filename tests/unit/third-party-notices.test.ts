import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bundledPackages,
  pickFile,
  SHIPPED_WORKSPACES,
  type Lockfile,
} from '../../scripts/third-party-notices';

/**
 * Third-party notices for everything a shipped build bundles (#26 AC11).
 *
 * Apache-2.0 §4 requires a copy of the licence and every NOTICE text of the
 * works we redistribute, and MIT requires its copyright line. The six direct
 * @stdlib packages pull in 152, several of whose LICENSE files append
 * upstream copyrights (Sun, the Go Authors) to the Apache text, so the listing is
 * derived from the lockfile and the installed files, never kept by hand.
 */

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as Lockfile;
const listing = readFileSync('THIRD-PARTY-NOTICES.md', 'utf8');

/**
 * Direct dependencies per shipped workspace, measured at b2a6f3f (#82) and
 * raised to 9 when #34 added `@noble/hashes`. Each floor sits at measured -
 * 1; lower one only in the commit that removes a dependency. A workspace
 * with no entry fails, so a new one is measured.
 */
const MEASURED_DIRECT: Readonly<Record<string, number>> = {
  'packages/core': 9,
};

function directDependencies(workspace: string): string[] {
  const pkg = JSON.parse(readFileSync(`${workspace}/package.json`, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  return Object.keys(pkg.dependencies ?? {});
}

describe('THIRD-PARTY-NOTICES.md', () => {
  // That the file is exactly what the generator renders reads every bundled
  // package's folder: a guard (#530, tests/guards/third-party-notices.test.ts).

  for (const workspace of SHIPPED_WORKSPACES) {
    // package.json is fixture data, read here so each dependency is its own test.
    const direct = directDependencies(workspace);

    it(`${workspace} has direct dependencies to check`, () => {
      expect(
        direct.length,
        `measure ${workspace} and add it to MEASURED_DIRECT`,
      ).toBeGreaterThan((MEASURED_DIRECT[workspace] ?? Infinity) - 1);
    });

    for (const name of direct)
      it(`the closure of ${workspace} holds its dependency ${name}`, () => {
        expect(bundledPackages(lock).map((p) => p.name)).toContain(name);
      });
  }

  it('names every package of the closure, which is larger than the direct list', () => {
    const names = bundledPackages(lock).map((p) => p.name);
    // The closure is larger than the direct list: @stdlib's six pull in 152.
    // Measured 152 @stdlib and 164 in all at b2a6f3f (#82); floors at measured - 1.
    expect(
      names.filter((n) => n.startsWith('@stdlib/')).length,
    ).toBeGreaterThan(151);
    expect(names.length).toBeGreaterThan(163);
    // runtime population: the closure bundledPackages computes from the lockfile.
    // Listing it at collection would run the code under test there.
    for (const name of names) {
      expect(listing, name).toContain(`\`${name}\``);
    }
  });

  it('carries every distinct licence text, including the upstream Sun and Go copyrights', () => {
    expect(listing).toContain('Apache License');
    expect(listing).toContain(
      'Copyright (C) 1993-2004 by Sun Microsystems, Inc.',
    );
    expect(listing).toContain('Copyright (c) 2009 The Go Authors.');
    expect(listing).toContain('Copyright (c) 2016-2026 The Stdlib Authors.');
  });
});

describe('pickFile, the same on every filesystem', () => {
  // Pure over a list of names, so Linux's case-sensitive behaviour is tested
  // on any OS. `ms` 2.0.0 ships `license.md`; CI (Linux) failed on it while
  // macOS's case-insensitive lookup found it.
  it.each<[string[], string | undefined]>([
    [['license.md', 'index.js'], 'license.md'],
    [['LICENSE', 'license.md'], 'LICENSE'],
    [['LICENCE.txt'], 'LICENCE.txt'],
    [['license.txt', 'LICENSE.md'], 'LICENSE.md'],
    [['LICENSE.md', 'license.txt'], 'LICENSE.md'],
    // One rank: the name decides, never the listing order.
    [['license', 'LICENSE'], 'LICENSE'],
    [['LICENSE', 'LICENCE'], 'LICENCE'],
    [['README.md', 'package.json'], undefined],
    [['LICENSE-MIT'], undefined],
  ])('picks the licence file from %j', (names, want) => {
    expect(pickFile(names, 'licence')).toBe(want);
  });

  it.each<[string[], string | undefined]>([
    [['NOTICE', 'LICENSE'], 'NOTICE'],
    [['notice.md'], 'notice.md'],
    [['LICENSE'], undefined],
  ])('picks the notice file from %j', (names, want) => {
    expect(pickFile(names, 'notice')).toBe(want);
  });
});

describe('NOTICE', () => {
  const notice = readFileSync('NOTICE', 'utf8');

  // package.json is fixture data, read here so each package is its own test.
  const stdlib = directDependencies('packages/core').filter((n) =>
    n.startsWith('@stdlib/'),
  );

  it('has bundled Apache-2.0 @stdlib packages to name', () => {
    // Measured 6 at b2a6f3f (#82). Lower it only in the commit that removes one.
    expect(stdlib.length).toBeGreaterThan(5);
  });

  for (const name of stdlib)
    it(`names the bundled Apache-2.0 package ${name}`, () => {
      expect(notice, name).toContain(name);
    });

  it('points to the full licence texts', () => {
    expect(notice).toContain('THIRD-PARTY-NOTICES.md');
  });
});
