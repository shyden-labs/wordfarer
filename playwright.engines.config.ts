import { defineConfig, devices } from '@playwright/test';

/**
 * The cross-engine determinism check (M1 design §7): the same golden vectors
 * in Node and in each browser engine. One worker, since the check is a few
 * seconds of CPU per engine and the web app's own e2e suite will want the
 * machine.
 */
export default defineConfig({
  testDir: 'tests/engines',
  workers: 1,
  // One limit, at the CI step (#476): none per test.
  timeout: 0,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
