import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import {
  FIXTURE_REPO,
  FIXTURE_TITLE,
} from '../../packages/progress/test/board-fixture';
import { FAKE_APP_ID, FAKE_BOARD_ID } from './test/github-fake/contract';
import { fakeGitHub } from './test/github-fake/fake-github';

/**
 * The site Worker's roadmap tests (#341), INSIDE workerd with the bindings
 * from the real wrangler.jsonc (the Durable Object, its SQLite migration, the
 * cron). Every outbound fetch goes to test/github-fake/fake-github.ts, which
 * checks what GitHub would; the App key is generated per run by
 * test/github-fake/global-setup.ts. The board is the shared fixture's, so the
 * Worker's lines can be compared with the close-out script's.
 *
 * Files run one at a time: the fake keeps one state for the whole run.
 */
export default defineConfig({
  plugins: [
    cloudflareTest(({ inject }) => ({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          DEV_PASSWORD: 'test-only-password',
          ROADMAP_APP_ID: FAKE_APP_ID,
          ROADMAP_APP_KEY: inject('appKeyPkcs1'),
          ROADMAP_WEBHOOK_SECRET: 'test-webhook-secret',
          ROADMAP_BOARD_ID: FAKE_BOARD_ID,
          ROADMAP_BOARD_TITLE: FIXTURE_TITLE,
          ROADMAP_REPO: FIXTURE_REPO,
          TEST_APP_KEY_PKCS8: inject('appKeyPkcs8'),
        },
        serviceBindings: {
          GAME: () => new Response('the game is not part of these tests'),
        },
        outboundService: fakeGitHub(inject('appPublicKey')),
      },
    })),
  ],
  test: {
    include: ['test/workers/**/*.test.ts'],
    globalSetup: ['test/github-fake/global-setup.ts'],
    fileParallelism: false,
  },
});
