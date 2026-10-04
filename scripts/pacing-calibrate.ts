import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hookGoals } from './goal-hook.ts';

/**
 * `npm run pacing:calibrate` (#35 AC10): re-derives `BALANCE.sail.goals`
 * from the Casual Learner, as `packages/bots/README.md` describes. It
 * bundles `pacing-calibrate-main.ts` with `sail.ts` hooked so the goal table
 * can be tried without a goal parameter in core, then runs the bundle.
 * Arguments pass through: `-- --gap-days 2.2 --first-minutes 45`.
 */

const OUT = 'node_modules/.cache/wordfarer/pacing-calibrate.mjs';

await build({
  entryPoints: ['scripts/pacing-calibrate-main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: OUT,
  logLevel: 'warning',
  plugins: [
    {
      name: 'goal-hook',
      setup(b) {
        b.onLoad(
          { filter: /packages[\\/]core[\\/]src[\\/]sail\.ts$/ },
          (args) => ({
            contents: hookGoals(readFileSync(args.path, 'utf8')),
            loader: 'ts',
          }),
        );
      },
    },
  ],
});
await import(pathToFileURL(OUT).href);
