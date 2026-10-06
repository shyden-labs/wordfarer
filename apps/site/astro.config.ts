import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { SITE } from './src/i18n.ts';
import { commitStamp } from './commit-stamp.ts';

/**
 * The coming-soon site (website spec §7, W10): prerendered pages in English
 * at `/…` and Indonesian at `/id/…`, served by worker/index.ts.
 *
 * `build.format: 'preserve'` writes `roadmap.astro` as `roadmap.html` and
 * `id/404.astro` as `id/404.html`. Cloudflare serves the first at `/roadmap`
 * with no redirect, and answers an unknown `/id/…` path with the nearest
 * 404.html, the Indonesian one (both measured in the asset router, #332).
 * The default `directory` format writes `id/404/index.html`, which nothing
 * finds.
 */
export default defineConfig({
  site: SITE,
  output: 'static',
  build: { format: 'preserve' },
  integrations: [svelte(), commitStamp(process.env['YAWELO_IDLE_COMMIT'])],
  i18n: {
    locales: ['en', 'id'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },
});
