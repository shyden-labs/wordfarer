import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The dev deploy configs: three Workers and the Pages hostname adapter.
 * dev-config.test.ts reads these four by name; that they are every wrangler
 * config in the repo is a walk of the tree, held by the guards suite
 * (tests/guards/wrangler-configs.test.ts, #530).
 */
export const WRANGLER_CONFIGS = [
  'apps/dev-hosts/wrangler.jsonc',
  'apps/site/wrangler.jsonc',
  'apps/sync-worker/wrangler.jsonc',
  'apps/web/wrangler.jsonc',
] as const;

/** Every wrangler config under `dir`, found on disk rather than listed. */
export function wranglerConfigsOnDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return wranglerConfigsOnDisk(path);
    return /^wrangler\.(jsonc?|toml)$/.test(entry.name) ? [path] : [];
  });
}
