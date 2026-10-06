import type { Plugin } from 'vite';

/**
 * Stamps the commit a build came from into index.html, so the dev deploy's
 * verify job can prove the bytes it serves are the bytes this commit built.
 *
 * `wrangler pages deploy` exiting 0 only says an upload happened. A verify that
 * reads this stamp back off the live URL and compares it to `github.sha` is
 * the only check that the live site is THIS commit, not the previous one.
 */

const PLACEHOLDER = '%YAWELO_IDLE_COMMIT%';
const LOCAL = 'local';

export function stampCommit(html: string, commit: string | undefined): string {
  const value = commit === undefined || commit === '' ? LOCAL : commit;
  if (value !== LOCAL && !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(
      `YAWELO_IDLE_COMMIT must be a full 40-hex SHA, got ${JSON.stringify(value)}`,
    );
  }
  const occurrences = html.split(PLACEHOLDER).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `a page must carry ${PLACEHOLDER} exactly once, found ${String(occurrences)}`,
    );
  }
  return html.replace(PLACEHOLDER, value);
}

export const commitStamp = (commit: string | undefined): Plugin => ({
  name: 'yawelo-idle-commit-stamp',
  transformIndexHtml: (html) => stampCommit(html, commit),
});
