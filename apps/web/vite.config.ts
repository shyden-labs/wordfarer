import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { commitStamp } from './commit-stamp.ts';

export default defineConfig({
  plugins: [svelte(), commitStamp(process.env.YAWELO_IDLE_COMMIT)],
});
