/**
 * Writes the dev web Worker's secrets file (#357).
 *
 *     DEV_PASSWORD=… node scripts/dev-secrets.ts <path>
 *
 * The deploy then runs `wrangler deploy --secrets-file <path>`, which uploads
 * `DEV_PASSWORD` with the Worker version itself. The password is kept in one
 * place, the `dev` environment secret `DEV_BASIC_AUTH_PASSWORD`, which the
 * verify already reads; nobody types it into Cloudflare, and a Worker created
 * under a new name gets it on its first deploy. The value is never printed.
 *
 * JSON, not .env: the password may hold quotes, `#`, `=` or a newline, which
 * JSON carries exactly. The file is created owner-only and never overwritten.
 */
import { writeFileSync } from 'node:fs';

export function writeSecretsFile(
  path: string,
  password: string | undefined,
): void {
  if (password === undefined || password === '')
    throw new Error('DEV_BASIC_AUTH_PASSWORD is not set');
  writeFileSync(path, JSON.stringify({ DEV_PASSWORD: password }), {
    mode: 0o600,
    flag: 'wx',
  });
}

if (import.meta.main) {
  const path = process.argv[2];
  if (path === undefined || path === '')
    throw new Error('usage: node scripts/dev-secrets.ts <path>');
  writeSecretsFile(path, process.env['DEV_PASSWORD']);
  console.log(`✓ wrote DEV_PASSWORD to ${path}`);
}
