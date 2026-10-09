import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NON_UNIT_VITEST_CONFIGS } from '../unit/suite-configs';

/**
 * The list of non-unit Vitest configs is every one there is (#476 AC2). It
 * lists the root and every app, a walk of the tree, so it runs here (#530);
 * suite-limits.test.ts holds each listed config to no limit of its own.
 */

describe('the non-unit Vitest configs (#476 AC2, #530)', () => {
  it('covers every Vitest config but the unit suite’s', () => {
    const root = readdirSync('.').filter((f) =>
      /^vitest\..+\.config\.ts$/.test(f),
    );
    const apps = readdirSync('apps').flatMap((app) =>
      readdirSync(`apps/${app}`)
        .filter((f) => /^vitest\..*config\.ts$/.test(f))
        .map((f) => `apps/${app}/${f}`),
    );
    expect([...root, ...apps].sort()).toEqual(
      [...NON_UNIT_VITEST_CONFIGS].sort(),
    );
  });
});
