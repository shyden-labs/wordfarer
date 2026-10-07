import { defineConfig, devices } from '@playwright/test';

/**
 * The web app's smoke suite (#123 AC3): the BUILT game, served by its own
 * Worker in local workerd (`wrangler dev`), loaded in each browser engine.
 * `npm run test:web` builds first, because the Worker serves ./dist.
 *
 * Locally the game runs alone, without the site Worker in front: local
 * workerd serves static assets for one Worker per process (measured with
 * wrangler 4.145.0, #332), so the forwarding is proved by the site harness
 * and by verify-dev on dev.
 */
const PORT = 8791;

export default defineConfig({
  testDir: 'tests/web',
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${String(PORT)}` },
  webServer: {
    command: `npx wrangler dev --config apps/web/wrangler.jsonc --ip 127.0.0.1 --port ${String(PORT)}`,
    url: `http://127.0.0.1:${String(PORT)}/play/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
