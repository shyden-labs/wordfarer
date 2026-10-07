import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from '@playwright/test';

/**
 * The web app's smoke suite (#123 AC3): the BUILT game, loaded in each
 * browser engine.
 *
 * `npm run test:web` builds first and serves the game through its own Worker
 * in local workerd (`wrangler dev`). Locally the game runs alone, without the
 * site Worker in front: local workerd serves static assets for one Worker per
 * process (measured with wrangler 4.145.0, #332), so the forwarding is proved
 * by the site harness and by verify-dev on dev.
 *
 * `npm run test:web:dev` runs the same tests against the address in
 * `WEB_SMOKE_URL` (deploy-dev sets it to dev, after verify has seen this
 * commit served there; #123 DoD). It builds and starts nothing, and sends the
 * dev password on every request, since a 401 challenge answered later would
 * show in the console as a failed load.
 */
const PORT = 8791;

/** The site's dev gate checks the password alone; any username passes. */
const USERNAME = 'smoke';

export function webSmokeConfig(
  env: Readonly<Record<string, string | undefined>>,
): ReturnType<typeof defineConfig> {
  const shared: PlaywrightTestConfig = {
    testDir: 'tests/web',
    workers: 1,
    forbidOnly: true,
    retries: 0,
    reporter: 'list',
    projects: [
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
  };
  const target = env['WEB_SMOKE_URL'];
  if (target === undefined) {
    const local = `http://127.0.0.1:${String(PORT)}`;
    return defineConfig({
      ...shared,
      use: { baseURL: local },
      webServer: {
        command: `npx wrangler dev --config apps/web/wrangler.jsonc --ip 127.0.0.1 --port ${String(PORT)}`,
        url: `${local}/play/`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
    });
  }
  const password = env['DEV_BASIC_AUTH_PASSWORD'];
  if (password === undefined)
    throw new Error(
      'WEB_SMOKE_URL is set but DEV_BASIC_AUTH_PASSWORD is not: dev answers every request with its password gate',
    );
  return defineConfig({
    ...shared,
    use: {
      baseURL: target,
      httpCredentials: { username: USERNAME, password, send: 'always' },
    },
  });
}

export default webSmokeConfig(process.env);
