import {
  BOT_EPOCH_WALL_MS,
  syntheticCourse,
} from '@yawelo-idle/core/fixtures/synthetic-course';
import { persona } from '../src/personas';
import { runPersona } from '../src/run';

/**
 * One persona's run in its own process, so the pacing suite plays every
 * persona at once on the runner's cores (#35 AC7). Bundled and spawned by
 * `pacing.test.ts`: `node play.mjs <persona> <maxDays>` prints its
 * `PersonaRun` as JSON.
 */

const [name, days] = process.argv.slice(2);
if (name === undefined || days === undefined) {
  throw new Error('usage: play.mjs <persona> <maxDays>');
}
const run = runPersona(
  syntheticCourse(1),
  persona(name),
  BOT_EPOCH_WALL_MS,
  Number(days),
);
process.stdout.write(JSON.stringify(run));
