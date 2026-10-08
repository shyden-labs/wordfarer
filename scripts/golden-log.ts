import { writeFileSync } from 'node:fs';
import { syntheticCourse } from '../packages/core/fixtures/synthetic-course';
import {
  GOLDEN,
  playGolden,
  writeGolden,
  writeGoldenDays,
} from '../packages/core/fixtures/golden-log';

/**
 * Writes the golden event log (#34, M1 design §7) to
 * `packages/core/fixtures/golden-log.jsonl`. Run `npm run golden-log` after a
 * change to any rule or dependency moves the replay's hash: the unit test
 * that replays the fixture names this command when the hash differs.
 * Prints the event count and the CPU time the play took.
 */

const OUT = 'packages/core/fixtures/golden-log.jsonl';
/** Where each day of the play starts, beside the log (#473). */
const DAYS_OUT = 'packages/core/fixtures/golden-days.jsonl';

const before = process.cpuUsage();
const run = playGolden(syntheticCourse(GOLDEN.courseSeed));
const used = process.cpuUsage(before);
writeFileSync(OUT, writeGolden(run));
writeFileSync(DAYS_OUT, writeGoldenDays(run));
console.log(
  `${OUT}: ${String(run.events.length)} events, ${String(Math.round((used.user + used.system) / 1000))} ms of CPU`,
);
