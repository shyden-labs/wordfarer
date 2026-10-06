import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AstroIntegration } from 'astro';
import { stampCommit } from '@yawelo-idle/web/commit-stamp';

/**
 * Stamps the commit a build came from into every built page, so the dev
 * deploy's verify job can read it back off the live site (the game does the
 * same to its index.html). `stampCommit` refuses a page that does not carry
 * the placeholder exactly once, and a value that is not a full SHA.
 */
export function stampPages(dir: string, commit: string | undefined): string[] {
  const pages = readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.html'))
    .sort();
  for (const page of pages) {
    const path = join(dir, page);
    try {
      writeFileSync(path, stampCommit(readFileSync(path, 'utf8'), commit));
    } catch (error) {
      throw new Error(`${page}: ${(error as Error).message}`, { cause: error });
    }
  }
  return pages;
}

export const commitStamp = (commit: string | undefined): AstroIntegration => ({
  name: 'yawelo-idle-commit-stamp',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      const pages = stampPages(dir.pathname, commit);
      logger.info(`stamped ${String(pages.length)} pages`);
    },
  },
});
