import { readFileSync } from 'node:fs';
import { GOLDEN, replayGolden } from '../packages/core/fixtures/golden-log';
import {
  lateGameReturn,
  regionOneReturn,
  returnsAt,
} from '../packages/core/fixtures/pemandu-returns';
import { syntheticCourse } from '../packages/core/fixtures/synthetic-course';
import type { Course } from '../packages/core/src/course';
import { advance } from '../packages/core/src/sim';
import type { GameState } from '../packages/core/src/state';

/**
 * Pemandu's purchase cost (#297 AC1): `npm run bench:pemandu`. Prints the
 * CPU time (never wall time) of replaying the golden log, whose player runs
 * Pemandu at 1 s, and the CPU per purchase at 1 s of #33's 72 h return for a
 * region-1 player, and of a late-game player's catch-up: a 1 h return with
 * Understanding banked, so Pemandu buys densely, as on the golden log's
 * heavy days, rather than a few an hour, where the hourly word bonuses would
 * be what is measured; the quiet 72 h return is printed beside it, where
 * the hourly work is most of the cost. Each figure is the median of five runs, each on a
 * freshly built course so no memo carries between runs.
 */

const RUNS = 5;
const FIXTURE = 'packages/core/fixtures/golden-log.jsonl';

const cpuMs = (since: NodeJS.CpuUsage): number => {
  const used = process.cpuUsage(since);
  return (used.user + used.system) / 1000;
};

const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};

const units = (state: GameState): number =>
  Object.values(state.owned).reduce((a, b) => a + b, 0);

function perPurchase(
  label: string,
  build: (course: Course) => GameState,
  hours: number,
): void {
  const costs: number[] = [];
  let bought = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const course = syntheticCourse(GOLDEN.courseSeed);
    const from = build(course);
    const start = process.cpuUsage();
    const { state } = advance(course, from, returnsAt(from, hours));
    const ms = cpuMs(start);
    bought = units(state) - units(from);
    costs.push((ms * 1000) / bought);
  }
  console.log(
    `${label}: ${String(bought)} purchases in a ${String(hours)} h return, ${median(costs).toFixed(1)} µs of CPU each (median of ${String(RUNS)})`,
  );
}

const text = readFileSync(FIXTURE, 'utf8');
const replays: number[] = [];
for (let run = 0; run < RUNS; run += 1) {
  const start = process.cpuUsage();
  replayGolden(text);
  replays.push(cpuMs(start));
}
console.log(
  `golden log replay: ${median(replays).toFixed(0)} ms of CPU (median of ${String(RUNS)})`,
);
perPurchase('region 1', regionOneReturn, 72);
perPurchase('late game, catch-up', lateGameReturn, 1);
perPurchase('late game, quiet', lateGameReturn, 72);
