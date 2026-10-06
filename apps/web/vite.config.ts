import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { commitStamp } from './commit-stamp.ts';

/**
 * The game is served under `/play/` (website spec §7.2), so its pages and
 * assets are built there: `base` makes every URL in the HTML start
 * `/play/`, and `outDir` puts the files where those URLs point in the
 * Worker's asset directory (./dist).
 */
export default defineConfig({
  base: '/play/',
  build: { outDir: 'dist/play', emptyOutDir: true },
  plugins: [svelte(), commitStamp(process.env.YAWELO_IDLE_COMMIT)],
});
