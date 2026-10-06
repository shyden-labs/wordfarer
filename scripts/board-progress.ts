/**
 * Prints the two close-out lines for a project board: by tickets, then by
 * effort (#340). Every session close-out quotes them, then adds the outside
 * waits the pace cannot know.
 *
 * Usage: node scripts/board-progress.ts <board-node-id> "<board title>" [owner/repo]
 *
 * Only the repository's own issues count: a draft, a pull request or another
 * repository's issue on the board is refused by name (#341), so the close-out
 * and the roadmap Worker count the same stories. The repository defaults to
 * this one.
 *
 * A thin wrapper: it reads the board through `gh` (the agent's App, by the
 * router), takes today from the clock and prints what packages/progress
 * gives, which is the same module the roadmap Worker reads (#341). The title
 * is asserted on every page before anything is printed.
 */
import { execFileSync } from 'node:child_process';
import { BOARD_QUERY, closeOutLines } from '../packages/progress/src/index.ts';

const REPO = 'shyden-labs/yawelo-idle';

if (import.meta.main) {
  const [id, title, repo = REPO] = process.argv.slice(2);
  if (id === undefined || title === undefined) {
    throw new Error(
      'usage: node scripts/board-progress.ts <board-node-id> "<board title>" [owner/repo]',
    );
  }
  const out = execFileSync(
    'gh',
    [
      'api',
      'graphql',
      '--paginate',
      '--slurp',
      '-f',
      `query=${BOARD_QUERY}`,
      '-f',
      `id=${id}`,
    ],
    { encoding: 'utf8' },
  );
  const today = new Date().toISOString().slice(0, 10);
  const lines = closeOutLines(JSON.parse(out) as unknown[], title, repo, today);
  process.stdout.write(`${lines.join('\n')}\n`);
}
