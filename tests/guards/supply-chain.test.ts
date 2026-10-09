import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { committableFiles } from '../unit/tracked-files';
import { floorBreach } from '../floors';
import { searched } from '../searched';

/**
 * The supply-chain checks whose population is every committable file: composite actions, workspaces and node_modules (#82, #332).
 * It reads the whole repository, a cost that grows with the tree, so it runs
 * in the guards suite (#515). The reader's tests on planted fixtures are unit
 * tests (tests/unit/supply-chain.test.ts).
 */

describe('the CI supply chain is pinned', () => {
  it('reads every file that can hold a uses: line (Refs #82)', () => {
    const tracked = committableFiles();
    expect(tracked, 'positive control').toContain('.github/workflows/ci.yml');
    const composites = tracked.filter((path) =>
      /(^|\/)action\.ya?ml$/.test(path),
    );
    expect(
      searched(composites, { of: tracked, what: 'committable files' }),
      'a composite action’s steps sit outside .github/workflows, unscanned',
    ).toEqual([]);
    expect(
      floorBreach('supply-chain/action-file-walk', tracked.length),
    ).toBeUndefined();
  });
});

describe('the install is reproducible', () => {
  it('every package.json below the root is a workspace, so the root npm entry covers it (#332)', () => {
    // Dependabot's one npm entry reads the root manifest and its lock file,
    // which hold every workspace's dependencies. A manifest outside the
    // workspaces would have its own dependencies and nothing to update them.
    // Two readings: git's files, and the workspaces the root lock file links,
    // which is what that npm entry reads. Read from the file, not `npm query`:
    // starting npm took 1.0-1.4 s, and timed this test out under load (#432).
    const manifests = committableFiles()
      .filter((path) => /(^|\/)package\.json$/.test(path))
      .filter((path) => path !== 'package.json')
      .map((path) => dirname(path))
      .sort();
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
      packages: Record<string, { link?: boolean; resolved?: string }>;
    };
    const workspaces = Object.values(lock.packages)
      .filter(({ link }) => link === true)
      .map(({ resolved }) => resolved ?? '')
      .sort();
    expect(workspaces, 'positive control: the site is one').toContain(
      'apps/site',
    );
    expect(manifests).toEqual(workspaces);
  });

  it('nothing under node_modules is tracked or committable', () => {
    const tracked = committableFiles();
    expect(tracked, 'positive control: the walk sees this repo').toContain(
      'package.json',
    );
    const installed = tracked.filter((path) =>
      /(^|\/)node_modules\//.test(path),
    );
    expect(
      searched(installed, { of: tracked, what: 'committable files' }),
    ).toEqual([]);
    expect(
      floorBreach('supply-chain/node-modules-walk', tracked.length),
    ).toBeUndefined();
  });
});
