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
import { boardProgress, type Gh } from '../../scripts/board-progress';

/**
 * scripts/board-progress.ts (#340), its work in-process with `gh` stood in:
 * a unit test starts no process (global rule, 2026-10-08; #490). The script
 * run under Node with a stand-in `gh` on PATH is in
 * tests/integration/board-progress.test.ts.
 */

const NODE_ID = 'PVT_fixture';
// Not the clock's day: a function that read the clock would give other lines.
const TODAY = '2026-01-15';

/** A `gh` that records each call's arguments and prints the given pages. */
function ghPrinting(pages: unknown[]): { gh: Gh; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    gh: (args) => {
      calls.push([...args]);
      return JSON.stringify(pages);
    },
  };
}

describe('boardProgress (#340, in-process since #490)', () => {
  it('gives the same two lines as a direct module call on the shared fixture', () => {
    const pages = boardPages(TODAY);
    const { gh } = ghPrinting(pages);
    expect(boardProgress([NODE_ID, FIXTURE_TITLE], gh, TODAY)).toEqual(
      formatLines(progress(parseItems(pages), TODAY), TODAY),
    );
  });

  it('asks gh once for every page of the board it was given, slurped into one array', () => {
    const { gh, calls } = ghPrinting(boardPages(TODAY));
    boardProgress([NODE_ID, FIXTURE_TITLE], gh, TODAY);
    expect(calls).toEqual([
      [
        'api',
        'graphql',
        '--paginate',
        '--slurp',
        '-f',
        `query=${BOARD_QUERY}`,
        '-f',
        `id=${NODE_ID}`,
      ],
    ]);
  });

  it('refuses a board with another title, giving no line', () => {
    const { gh } = ghPrinting(boardPages(TODAY));
    expect(() =>
      boardProgress([NODE_ID, 'ShyTalk Stories'], gh, TODAY),
    ).toThrow(
      'the board is "Fixture Stories", not "ShyTalk Stories": nothing read',
    );
  });

  it('refuses to run without a node id and a title, before calling gh', () => {
    // A gh called first would throw its own error, not the usage line.
    const gh: Gh = () => {
      throw new Error('gh was called');
    };
    expect(() => boardProgress([NODE_ID], gh, TODAY)).toThrow(
      'usage: node scripts/board-progress.ts <board-node-id> "<board title>"',
    );
  });

  it('fails, giving no line, when gh fails', () => {
    const gh: Gh = () => {
      throw new Error('gh: HTTP 502');
    };
    expect(() => boardProgress([NODE_ID, FIXTURE_TITLE], gh, TODAY)).toThrow(
      'gh: HTTP 502',
    );
  });
});
