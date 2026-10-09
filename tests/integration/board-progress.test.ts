import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOARD_QUERY,
  formatLines,
  parseItems,
  progress,
} from '../../packages/progress/src/index';
import {
  boardPages,
  FIXTURE_TITLE,
} from '../../packages/progress/test/board-fixture';

/**
 * scripts/board-progress.ts is a thin wrapper (#340): it reads the board
 * through `gh` and prints the lines packages/progress gives, so the
 * operator's close-out and the roadmap Worker cannot disagree.
 *
 * Each test runs the real script under Node, the way a session runs it, with
 * a stand-in `gh` first on PATH that records its arguments and prints a
 * fixture. The stand-in is the one thing not real: CI holds no token that can
 * read an organisation's board. The live run against the real board is in
 * #340's PR (AC4).
 *
 * Moved out of the unit suite by #490: a unit test starts no process. The
 * wrapper's work, `boardProgress`, is tested in-process in
 * tests/unit/board-progress.test.ts; these keep the real run under Node.
 */
const ROOT = new URL('../..', import.meta.url).pathname;
const SCRIPT = join(ROOT, 'scripts/board-progress.ts');
const NODE_ID = 'PVT_fixture';

const FAKE_GH = `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.FAKE_GH_ARGS, JSON.stringify(process.argv.slice(2)));
if (process.env.FAKE_GH_FAIL === '1') {
  process.stderr.write('gh: HTTP 502\\n');
  process.exit(1);
}
process.stdout.write(fs.readFileSync(process.env.FAKE_GH_PAGES, 'utf8'));
`;

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  ghArgs: () => unknown;
}

function runWrapper(
  args: string[],
  { pages = [] as unknown[], fail = false } = {},
): Run {
  const dir = mkdtempSync(join(tmpdir(), 'board-progress-'));
  const gh = join(dir, 'gh');
  writeFileSync(gh, FAKE_GH);
  chmodSync(gh, 0o755);
  writeFileSync(join(dir, 'pages.json'), JSON.stringify(pages));
  const run = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env['PATH'] ?? ''}`,
      FAKE_GH_ARGS: join(dir, 'args.json'),
      FAKE_GH_PAGES: join(dir, 'pages.json'),
      FAKE_GH_FAIL: fail ? '1' : '0',
    },
  });
  return {
    status: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    ghArgs: (): unknown =>
      JSON.parse(readFileSync(join(dir, 'args.json'), 'utf8')) as unknown,
  };
}

const utcDay = () => new Date().toISOString().slice(0, 10);

describe('scripts/board-progress.ts (#340)', () => {
  it('prints the same two lines as a direct module call on the shared fixture', () => {
    const before = utcDay();
    const pages = boardPages(before);
    const run = runWrapper([NODE_ID, FIXTURE_TITLE], { pages });
    const after = utcDay();
    // The script reads the clock itself, so a run that crosses midnight UTC
    // may print either day's lines; both are computed the direct way.
    const direct = (today: string) =>
      `${formatLines(progress(parseItems(pages), today), today).join('\n')}\n`;
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect([direct(before), direct(after)]).toContain(run.stdout);
  });

  it('asks gh for every page of the board it was given, slurped into one array', () => {
    const run = runWrapper([NODE_ID, FIXTURE_TITLE], {
      pages: boardPages(utcDay()),
    });
    expect(run.status).toBe(0);
    expect(run.ghArgs()).toEqual([
      'api',
      'graphql',
      '--paginate',
      '--slurp',
      '-f',
      `query=${BOARD_QUERY}`,
      '-f',
      `id=${NODE_ID}`,
    ]);
  });

  it('refuses a board with another title and prints no line', () => {
    const run = runWrapper([NODE_ID, 'ShyTalk Stories'], {
      pages: boardPages(utcDay()),
    });
    expect(run.status).not.toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain(
      'the board is "Fixture Stories", not "ShyTalk Stories": nothing read',
    );
  });

  it('refuses to run without a node id and a title, before calling gh', () => {
    const run = runWrapper([NODE_ID]);
    expect(run.status).not.toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain(
      'usage: node scripts/board-progress.ts <board-node-id> "<board title>"',
    );
    expect(run.ghArgs).toThrow('ENOENT');
  });

  it('fails, printing no line, when gh fails', () => {
    const run = runWrapper([NODE_ID, FIXTURE_TITLE], { fail: true });
    expect(run.status).not.toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('gh: HTTP 502');
  });
});
