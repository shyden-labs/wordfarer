/**
 * Writes the dev site Worker's secrets file (#357, #341).
 *
 *     DEV_PASSWORD=… ROADMAP_WEBHOOK_SECRET=… ROADMAP_APP_KEY=… \
 *       node scripts/dev-secrets.ts <path>
 *
 * The deploy then runs `wrangler deploy --secrets-file <path>`, which uploads
 * them with the Worker version itself. Each is kept in one place, a `dev`
 * environment secret (SOURCES); nobody types one into Cloudflare, and a
 * Worker created under a new name gets them on its first deploy. A missing
 * or empty one stops the deploy, naming the GitHub secret to set, before
 * anything is written. No value is ever printed.
 *
 * JSON, not .env: a value may hold quotes, `#`, `=` or newlines (the App's
 * PEM key has several), which JSON carries exactly. The file is created
 * owner-only and never overwritten.
 */
import { writeFileSync } from 'node:fs';

/** Each Worker secret, and the `dev` environment secret it comes from. */
const SOURCES = {
  DEV_PASSWORD: 'DEV_BASIC_AUTH_PASSWORD',
  ROADMAP_WEBHOOK_SECRET: 'ROADMAP_WEBHOOK_SECRET',
  ROADMAP_APP_KEY: 'ROADMAP_APP_KEY',
} as const;

type Secret = keyof typeof SOURCES;

export function writeSecretsFile(
  path: string,
  values: Partial<Record<Secret, string>>,
): void {
  const secrets = Object.keys(SOURCES) as Secret[];
  for (const secret of secrets) {
    const value = values[secret];
    if (value === undefined || value === '')
      throw new Error(`${SOURCES[secret]} is not set`);
  }
  writeFileSync(
    path,
    JSON.stringify(
      Object.fromEntries(secrets.map((secret) => [secret, values[secret]])),
    ),
    { mode: 0o600, flag: 'wx' },
  );
}

if (import.meta.main) {
  const path = process.argv[2];
  if (path === undefined || path === '')
    throw new Error('usage: node scripts/dev-secrets.ts <path>');
  writeSecretsFile(path, {
    DEV_PASSWORD: process.env['DEV_PASSWORD'],
    ROADMAP_WEBHOOK_SECRET: process.env['ROADMAP_WEBHOOK_SECRET'],
    ROADMAP_APP_KEY: process.env['ROADMAP_APP_KEY'],
  });
  console.log(`✓ wrote the site's secrets to ${path}`);
}
