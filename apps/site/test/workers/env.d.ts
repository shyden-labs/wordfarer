/**
 * The bindings vitest.workers.config.ts gives the workerd tests (#341) that
 * `wrangler types` cannot see: the Worker's secrets, which the deploy uploads
 * (#357), and the test-only PKCS#8 copy of the generated App key. Declared
 * for this test program only; the Worker declares its own in worker/.
 */
declare namespace Cloudflare {
  interface Env {
    DEV_PASSWORD: string;
    ROADMAP_APP_ID: string;
    ROADMAP_APP_KEY: string;
    ROADMAP_WEBHOOK_SECRET: string;
    ROADMAP_BOARD_ID: string;
    ROADMAP_BOARD_TITLE: string;
    ROADMAP_REPO: string;
    TEST_APP_KEY_PKCS8: string;
  }
}
