import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import {
  digest,
  FUNCTIONS,
  type GoldenFunction,
} from '../../packages/core/test/golden-vectors';

/**
 * Cross-engine determinism of det-math, the mean retrievability and the FSRS
 * review (M1 design §2.1 and §7, #26 AC10, #28).
 *
 * The golden vectors are bundled exactly as a shipped build would bundle
 * core, run in each browser engine, and their bit digests compared with the
 * ones Node computes. Measured on 2026-10-01: Math.pow(1.15, n) differs
 * between V8 and JavaScriptCore in 49% of results, so swapping det-math for
 * Math turns the WebKit comparison red.
 */

interface GoldenGlobal {
  yaweloIdleGolden: { digest(fn: GoldenFunction): string };
}

let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: "export { digest } from './golden-vectors';",
      resolveDir: 'packages/core/test',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'yaweloIdleGolden',
    platform: 'browser',
    mainFields: ['module', 'main'],
    logLevel: 'error',
  });
  bundle = result.outputFiles[0]?.text ?? '';
  // Liveness: esbuild produced the global the page will call.
  expect(bundle).toContain('yaweloIdleGolden');
});

for (const fn of FUNCTIONS)
  test(`${fn} gives the same bits as Node on 100,000 vectors`, async ({
    page,
    browserName,
  }) => {
    await page.setContent('<!doctype html><title>golden vectors</title>');
    await page.addScriptTag({ content: bundle });
    const engine = await page.evaluate(
      (name) =>
        (globalThis as unknown as GoldenGlobal).yaweloIdleGolden.digest(name),
      fn,
    );
    expect(engine, `${browserName}: ${fn}`).toBe(digest(fn));
  });
