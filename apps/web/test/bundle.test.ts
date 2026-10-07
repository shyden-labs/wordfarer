import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../../../tests/floors';
import { searched } from '../../../tests/searched';

/**
 * The game's initial-load budget (#123 AC4; Shyden chose option B on #123,
 * 2026-10-06 23:19 UTC). #154 owns the per-app cap, its report and the
 * comparison with develop, which is where a change's byte delta is shown.
 *
 * - Ceiling: everything the first paint fetches (the HTML and the assets it
 *   loads), gzipped at zlib's default level as a stand-in for what Cloudflare
 *   sends, at most 15,000 bytes: about 1.5x the 9,682 this test measured
 *   for #123. A story that outgrows it raises it deliberately.
 * - Floor: proof the check measured the game. The number of assets the shell
 *   loads is recorded in tests/floors/ (a reader that finds none, or fewer,
 *   goes red), and each one must hold bytes. No exact byte figure: the Svelte
 *   runtime is in the bundle, so every Svelte or Vite update would move it,
 *   and CI never records floors.
 *
 * Read from the build on disk (`npm run test` builds first).
 */

const DIST = new URL('../dist/', import.meta.url);
const CEILING_GZIP_BYTES = 15_000;

const shell = (): string =>
  readFileSync(new URL('play/index.html', DIST), 'utf8');

/** Paths the shell fetches before it can run: module scripts, preloads, styles. */
function initialAssets(page: string): string[] {
  const tags = page.match(/<(?:script|link)\b[^>]*>/g) ?? [];
  return tags.flatMap((tag) => {
    const script = /^<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/.exec(
      tag,
    );
    const link =
      /^<link\b[^>]*\brel="(?:modulepreload|stylesheet)"[^>]*\bhref="([^"]+)"/.exec(
        tag,
      );
    const path = script?.[1] ?? link?.[1];
    return path === undefined ? [] : [path];
  });
}

const read = (path: string): Buffer =>
  readFileSync(new URL(path.replace(/^\//, ''), DIST));

describe('the initial-load budget (#123 AC4)', () => {
  it('measures every asset the shell loads, each holding bytes, at the recorded floor', () => {
    const assets = initialAssets(shell());
    const empty = assets.filter((path) => read(path).byteLength === 0);
    expect(
      searched(empty, { of: assets, what: 'assets the shell loads' }),
    ).toEqual([]);
    expect(
      floorBreach('game-bundle/initial-assets', assets.length),
    ).toBeUndefined();
  });

  it(`the first paint fetches at most ${String(CEILING_GZIP_BYTES)} bytes gzipped`, () => {
    const page = shell();
    const bodies = [Buffer.from(page), ...initialAssets(page).map(read)];
    const gzipped = bodies
      .map((body) => gzipSync(body).byteLength)
      .reduce((sum, size) => sum + size, 0);
    expect(gzipped).toBeLessThanOrEqual(CEILING_GZIP_BYTES);
  });
});
