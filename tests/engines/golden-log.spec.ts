import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import {
  readGolden,
  type GoldenReplay,
} from '../../packages/core/fixtures/golden-log';

/**
 * The golden event log replays to the same state hash in every browser
 * engine (#34 AC5, M1 design §7). The fixture's header records the hash the
 * live run reached, and the unit suite checks Node reaches it too, so all
 * four engines are held to one value. Core is bundled as a shipped build
 * would bundle it, and the page reads the fixture through `parseEvent` as
 * any untrusted log would be read.
 */

interface GoldenGlobal {
  wordfarerGoldenLog: { replayGolden(text: string): GoldenReplay };
}

const text = readFileSync('packages/core/fixtures/golden-log.jsonl', 'utf8');
let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: "export { replayGolden } from './golden-log';",
      resolveDir: 'packages/core/fixtures',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'wordfarerGoldenLog',
    platform: 'browser',
    mainFields: ['module', 'main'],
    logLevel: 'error',
  });
  bundle = result.outputFiles[0]?.text ?? '';
  // Liveness: esbuild produced the global the page will call.
  expect(bundle).toContain('wordfarerGoldenLog');
});

test('the golden log replays to its recorded hash', async ({
  page,
  browserName,
}) => {
  // About 4 s of CPU in Node; an engine may take several times that.
  test.setTimeout(300_000);
  const { header } = readGolden(text);
  await page.setContent('<!doctype html><title>golden log</title>');
  await page.addScriptTag({ content: bundle });
  const replayed = await page.evaluate(
    (log) =>
      (globalThis as unknown as GoldenGlobal).wordfarerGoldenLog.replayGolden(
        log,
      ),
    text,
  );
  // Liveness: the page replayed every event, refusals included.
  expect(replayed.events, browserName).toBe(header.events);
  expect(replayed.refused, browserName).toBeGreaterThan(0);
  expect(replayed.hash, `${browserName}: the golden log's state hash`).toBe(
    header.liveHash,
  );
});
