import { describe, expect, it } from 'vitest';
import {
  lateGameReturn,
  regionOneReturn,
  returnsAt,
} from '../fixtures/pemandu-returns';
import { syntheticCourse } from '../fixtures/synthetic-course';
import { DAY_MS, HOUR_MS, simMs, wallMs } from '../src/clock';
import type { Course } from '../src/course';
import { rateBreakdown } from '../src/production';
import { advance } from '../src/sim';
import type { GameState } from '../src/state';

/**
 * A 72 h offline return with Pemandu at 1 s over the synthetic course
 * (#33 AC5): under 1,000 ms, and the time it took is printed.
 *
 * The bound is on the CPU time of the vitest worker, a forked process that
 * runs this file alone, not on the wall clock: the suite runs its files in
 * parallel, and under that load the same return measured 335 ms alone and
 * 1,403 ms and 1,670 ms of wall time beside the rest (#33), a figure for
 * the machine's load rather than for this code. Wall time is printed too.
 *
 * The player (`regionOneReturn`) has finished region 1 and stands at
 * region 2's first
 * destination: every word of region 1 and of that destination held, each
 * reviewed twice at its own time over the last 20 days, every Encounter of
 * region 1 owned and a few of region 2's. 259,200 ticks fall in the return.
 */

// Core's tsconfig sees ECMAScript alone, no DOM and no Node types, so the
// host APIs this timing uses under vitest are declared here as Node has
// them, rather than widening what every core file may name.
declare const performance: { now(): number };
declare const console: { log(message: string): void };
declare const process: {
  /** Microseconds of CPU this process has used, since `previous` if given. */
  cpuUsage(previous?: { user: number; system: number }): {
    user: number;
    system: number;
  };
  /** The same for this thread alone: no compiler or GC helper threads. */
  threadCpuUsage(previous?: { user: number; system: number }): {
    user: number;
    system: number;
  };
};

let builtCourse: Course | undefined;

/**
 * The synthetic course, built on first use inside a test and kept, so every
 * test reads the same object (the bucket memo is keyed by it) and a throwing
 * build fails each test that needs it by name, never the file (#97).
 */
function course(): Course {
  builtCourse ??= syntheticCourse(1);
  return builtCourse;
}
function units(state: GameState): number {
  return Object.values(state.owned).reduce((a, b) => a + b, 0);
}

describe('a 72 h return with Pemandu at 1 s (AC5)', () => {
  it('is credited in full and buys on the way, in under 1,000 ms', () => {
    const s = regionOneReturn(course());
    const wallStart = performance.now();
    const cpuStart = process.cpuUsage();
    const { state, summary } = advance(
      course(),
      s,
      wallMs(s.wall + 72 * HOUR_MS),
    );
    const cpu = process.cpuUsage(cpuStart);
    const ms = (cpu.user + cpu.system) / 1000;
    const wall = performance.now() - wallStart;
    const bought = units(state) - units(s);
    console.log(
      `#33 AC5: a 72 h return at 1 s took ${ms.toFixed(1)} ms of CPU (${wall.toFixed(1)} ms of wall time) and bought ${String(bought)} units`,
    );
    expect(summary.creditedMs).toBe(72 * HOUR_MS);
    expect(summary.clipped).toBe(false);
    // Measured 1,638 units on #35's tuned balance (1,683 on #33's), less
    // one: the return really buys.
    expect(bought).toBeGreaterThan(1_637);
    expect(ms).toBeLessThan(1_000);
  });
});

/**
 * A late-game player's 1 h catch-up (#297 AC3): every region reached, all
 * 450 words held, Understanding banked, so Pemandu buys densely. Before
 * #297 it cost 75.0 / 74.9 µs of CPU a purchase (AC1, `npm run
 * bench:pemandu`, load about 5). AC3's tenth is measured there, beside the
 * old code, and recorded on #297; this test guards a slide back
 * (operator, 2026-10-08: "Generous CI ceiling", then "40 µs in the runner").
 *
 * Inside vitest the same code runs about 2.5x slower than bundled, and the
 * process's CPU counts V8's compiler and GC threads, busy in a fresh worker
 * (measured: 15 to 89 µs a purchase by process, 15 to 41 by this thread).
 * So the figure is this thread's CPU, the fastest of a few catch-ups, each
 * on a fresh course so no memo carries. Measured 2026-10-08 at load 4: about
 * 15 µs; the code before #297, about 119 µs. The ceiling sits between.
 */
const CATCH_UPS = 6;
const CEILING_US = 40;

describe('a late-game catch-up with Pemandu at 1 s (#297 AC3)', () => {
  it(`buys at under ${String(CEILING_US)} µs of CPU a purchase, the fastest of ${String(CATCH_UPS)}`, () => {
    const costs: number[] = [];
    // one scenario: the fastest of a few runs of one catch-up, for the
    // machine's load, not a population of cases.
    for (let run = 0; run < CATCH_UPS; run += 1) {
      const fresh = syntheticCourse(1);
      const from = lateGameReturn(fresh);
      const cpuStart = process.threadCpuUsage();
      const { state } = advance(fresh, from, returnsAt(from, 1));
      const cpu = process.threadCpuUsage(cpuStart);
      const bought = units(state) - units(from);
      // The catch-up the figures were measured on.
      expect(bought).toBe(428);
      costs.push((cpu.user + cpu.system) / bought);
    }
    const fastest = Math.min(...costs);
    console.log(
      `#297 AC3: a late-game 1 h catch-up took ${fastest.toFixed(2)} µs of this thread's CPU a purchase at its fastest of ${String(CATCH_UPS)} (${costs.map((c) => c.toFixed(1)).join(', ')})`,
    );
    expect(fastest).toBeLessThan(CEILING_US);
  });
});

/**
 * What makes the return fast never serves a stale bucket: the memo of each
 * bucket's word factors is keyed by everything they are built from, so a
 * state that shares its words object but differs in any one of them gets
 * the breakdown a cold memo gives.
 */
describe('the bucket memo behind a fast return', () => {
  const node = (): string => course().regions[0]?.grammarNodes[0]?.id ?? '';
  let builtOther: Course | undefined;
  /** A second course with the same word ids, built on first use like course(). */
  function other(): Course {
    builtOther ??= syntheticCourse(2);
    return builtOther;
  }
  // Each change is a function of the state, so no core code runs while the
  // file is collected: a core change that throws then fails these tests by
  // name rather than dropping them from the count.
  type Change = (s: GameState) => Partial<GameState>;

  it.each<readonly [string, () => Course, Change, number]>([
    [
      'memorySince moves, as a review moves it',
      course,
      (s) => ({ memorySince: simMs(s.sim + 600_000) }),
      0,
    ],
    [
      'the skew moves, as a clipped return moves it',
      course,
      (s) => ({ wall: wallMs(s.wall + DAY_MS) }),
      0,
    ],
    ['a grammar node is owned', course, () => ({ grammar: [node()] }), 0],
    ['the next hour', course, () => ({}), HOUR_MS],
    ['another course with the same word ids', other, () => ({}), 0],
  ])('%s', (_label, courseOf, change, later) => {
    const c = courseOf();
    const s0 = regionOneReturn(course());
    const t0 = simMs(s0.sim + 1_234);
    const t = simMs(t0 + later);
    rateBreakdown(course(), s0, t0);
    const s1: GameState = { ...s0, ...change(s0) };
    const cold = rateBreakdown(c, { ...s1, words: { ...s1.words } }, t);
    expect(rateBreakdown(c, s1, t)).toEqual(cold);
    expect(cold).not.toEqual(rateBreakdown(course(), s0, t0));
  });
});
