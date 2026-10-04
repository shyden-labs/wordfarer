import {
  BOT_EPOCH_WALL_MS,
  syntheticCourse,
} from '../packages/core/fixtures/synthetic-course';
import {
  CALIBRATE_DEFAULTS,
  calibrateGoals,
  persona,
  runPersona,
  type Measure,
} from '../packages/bots/src/index';

/**
 * The calibration itself, bundled by `scripts/pacing-calibrate.ts` with
 * `sail.ts` hooked to read its goals from `globalThis.__WORDFARER_GOALS`.
 * Options: `--first-minutes N` and `--gap-days N`. Prints each goal as it is
 * fitted, then the table to paste into `BALANCE.sail.goals`.
 */

function option(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = Number(process.argv[at + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `--${name} needs a positive number, got ${String(process.argv[at + 1])}`,
    );
  }
  return value;
}

const hook = globalThis as { __WORDFARER_GOALS?: readonly number[] };
const course = syntheticCourse(1);
const casual = persona('casual');

const measure: Measure = (goals, destination, untilDay) => {
  hook.__WORDFARER_GOALS = goals;
  const run = runPersona(course, casual, BOT_EPOCH_WALL_MS, untilDay, {
    stopAfterSails: destination + 1,
  });
  return run.sails[destination]?.day;
};

const options = {
  ...CALIBRATE_DEFAULTS,
  firstMinutes: option('first-minutes', CALIBRATE_DEFAULTS.firstMinutes),
  gapDays: option('gap-days', CALIBRATE_DEFAULTS.gapDays),
};
const before = process.cpuUsage();
const fitted = calibrateGoals(measure, options, (g) => {
  console.error(
    `destination ${String(g.destination)}: goal ${g.goal.toExponential(2)}, aimed at day ${g.target.toFixed(3)}, landed ${g.day === undefined ? 'never' : `day ${g.day.toFixed(3)}`}`,
  );
});
const used = process.cpuUsage(before);
console.error(
  `${String(Math.round((used.user + used.system) / 1000))} ms of CPU`,
);
console.log(`    goals: [${fitted.map((g) => String(g.goal)).join(', ')}],`);
