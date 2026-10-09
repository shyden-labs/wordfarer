/**
 * Every Vitest config but the unit suite's (#476 AC2). suite-limits.test.ts
 * holds each to no per-test or per-hook limit; the guard that lists the root
 * and every app to find them reads the tree, so it runs in the guards suite
 * (tests/guards/suite-configs.test.ts, #530).
 */
export const NON_UNIT_VITEST_CONFIGS = [
  'vitest.guards.config.ts',
  'vitest.integration.config.ts',
  'vitest.pacing.config.ts',
  'apps/dev-hosts/vitest.harness.config.ts',
  'apps/site/vitest.harness.config.ts',
  'apps/sync-worker/vitest.harness.config.ts',
  'apps/web/vitest.harness.config.ts',
] as const;
