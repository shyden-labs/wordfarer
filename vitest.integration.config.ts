import { defineConfig } from 'vitest/config';

/**
 * The integration suite (#490): tests where a process is the thing tested, a
 * shell script, a git hook, git itself on a fixture repository, a script
 * loading under Node, each suite listing its own files. A unit test starts no
 * process (global rule, 2026-10-08), so these run here, out of the unit suite
 * and its limits.
 *
 * Its one limit is its CI step's `timeout-minutes`, measured (global rule,
 * 2026-10-07; #476): `testTimeout: 0` turns off Vitest's per-test default, and
 * no test inside sets its own.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 0,
  },
});
