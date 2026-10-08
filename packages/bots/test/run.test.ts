import { describe, expect, it } from 'vitest';
import {
  initialState,
  Num,
  view,
  wallMs,
  type Course,
  type View,
} from '@yawelo-idle/core';
import {
  BOT_EPOCH_WALL_MS,
  syntheticCourse,
} from '@yawelo-idle/core/fixtures/synthetic-course';
import { persona } from '../src/personas';
import {
  insaneValues,
  reachedAt,
  runPersona,
  SailLog,
  type PersonaRun,
} from '../src/run';
import { QUICK_RETURN_MS } from '../src/schedule';

/** A run, measured (#35 AC4 (h), AC6). */

let built: Course | undefined;
function course(): Course {
  built ??= syntheticCourse(1);
  return built;
}

/** A Num holding raw parts the Num API would refuse: what a bug could leave. */
function forged(mantissa: number, exponent: number): Num {
  return Object.assign(
    Object.create(Object.getPrototypeOf(Num.from(1)) as object),
    {
      mantissa,
      exponent,
    },
  ) as Num;
}

function cleanView(): View {
  const s = initialState(wallMs(BOT_EPOCH_WALL_MS), 35);
  return view(course(), s, s.wall);
}

describe('insaneValues', () => {
  it('finds nothing in a new game’s view', () => {
    const v = cleanView();
    expect(insaneValues(v)).toEqual([]);
    expect(v.shop.encounters).toHaveLength(6);
  });

  it('names a NaN Understanding', () => {
    expect(
      insaneValues({ ...cleanView(), understanding: forged(NaN, 0) }),
    ).toEqual(['understanding']);
  });

  it('names a negative rate', () => {
    expect(insaneValues({ ...cleanView(), rate: Num.from(-1) })).toEqual([
      'rate',
    ]);
  });

  it('names an Insight with an infinite exponent', () => {
    expect(
      insaneValues({ ...cleanView(), insight: forged(1, Infinity) }),
    ).toEqual(['insight']);
  });

  it('names an Encounter’s negative price', () => {
    const v = cleanView();
    const [first, ...rest] = v.shop.encounters;
    if (first === undefined) throw new Error('no Encounter offered');
    const bad = {
      ...v,
      shop: {
        ...v.shop,
        encounters: [{ ...first, price: Num.from(-5) }, ...rest],
      },
    };
    expect(insaneValues(bad)).toEqual([`price.${first.id}`]);
  });

  it('names a retrievability that is not a number', () => {
    const v = {
      ...cleanView(),
      queue: [{ itemId: 'w', rank: 'heard' as const, retrievability: NaN }],
    };
    expect(insaneValues(v)).toEqual(['R.w']);
  });
});

describe('runPersona', () => {
  // The run's bookkeeping is the same for every persona, so these tests play
  // the cheapest one that reaches each case: the Capped buyer's first day
  // (3 opens, a sail at its second, about 130 ms of CPU cold) is played once
  // and shared (#475). Which personas meet the pacing targets is the pacing
  // suite's question.
  let cappedDay: PersonaRun | undefined;
  function cappedFirstDay(): PersonaRun {
    cappedDay ??= runPersona(course(), persona('capped'), BOT_EPOCH_WALL_MS, 1);
    return cappedDay;
  }

  it('plays the Capped buyer’s first day: 3 opens, sails timed from the first open', () => {
    const run = cappedFirstDay();
    expect(run.persona).toBe('capped');
    expect(run.openDays).toHaveLength(3);
    expect(run.openDays[0]).toBe(0);
    expect(run.openDays).toEqual([...run.openDays].sort((a, b) => a - b));
    expect(run.openDays.filter((d) => d < 0 || d >= 1)).toEqual([]);
    expect(run.events).toBeGreaterThan(100);
    expect(run.cpuMs).toBeGreaterThan(0);
    expect(run.insane).toEqual([]);
    expect(run.sails.length).toBeGreaterThan(0);
    const days = run.sails.map((s) => s.day);
    expect(days.filter((d) => d <= 0 || d >= 1)).toEqual([]);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(run.sails.map((s) => s.destination)).toEqual(
      run.sails.map((_, i) => i + 1),
    );
  });

  it('ends after the open in which the asked-for sails landed', () => {
    const full = cappedFirstDay();
    const stopped = runPersona(
      course(),
      persona('capped'),
      BOT_EPOCH_WALL_MS,
      1,
      { stopAfterSails: 1 },
    );
    const [sail] = stopped.sails;
    if (sail === undefined) throw new Error('the stopped run never sailed');
    expect(stopped.sails).toEqual(full.sails.slice(0, stopped.sails.length));
    expect(stopped.openDays).toEqual(
      full.openDays.slice(0, stopped.openDays.length),
    );
    // The last open played is the one the sail landed in: it began before the
    // sail, and the full run's next open begins after it.
    const last = stopped.openDays.length - 1;
    expect(stopped.openDays[last]).toBeLessThanOrEqual(sail.day);
    expect(full.openDays[last + 1]).toBeGreaterThan(sail.day);
  });

  it('judges a return 15 minutes after each of the first day’s 3 opens', () => {
    const run = cappedFirstDay();
    expect(run.returnsJudged).toBe(3);
    expect(run.returnsUndecided).toEqual([]);
    expect(run.returnsPracticeOnly).toEqual([]);
  });

  it('times a goal from when the Understanding earned that run reached it: no later than its sail, and hours before an open lets the Capped buyer sail', () => {
    // A second sail costs over 0.3 s of CPU in every persona (measured, #475),
    // so the clock's restart at each sail is SailLog's test below.
    const { sails } = cappedFirstDay();
    expect(sails.filter((s) => !Number.isFinite(s.reachedDay))).toEqual([]);
    const outOfOrder = sails.filter(
      (s) => s.reachedDay > s.day || s.reachedDay <= 0,
    );
    expect(outOfOrder).toEqual([]);
    const waitedHours = sails.map((s) => (s.day - s.reachedDay) * 24);
    expect(Math.max(...waitedHours)).toBeGreaterThan(1);
  });

  it('waits 15 minutes for a quick return (operator, 2026-10-04)', () => {
    expect(QUICK_RETURN_MS).toBe(900_000);
  });

  it('records no finale when the run ends first', () => {
    expect(cappedFirstDay().finaleDay).toBeUndefined();
  });
});

describe('reachedAt', () => {
  /** A stand-in state: Understanding earned `u` at `wall`, growing 1 a second. */
  interface Toy {
    readonly u: number;
    readonly wall: number;
  }
  const GOAL = 50;
  const meets = (s: Toy, atMs: number) => s.u + (atMs - s.wall) / 1_000 >= GOAL;
  const seen = (u: number, wall: number) => ({
    state: { u, wall },
    wallMs: wall,
  });

  it('finds the second production meets the goal between two actions', () => {
    const at = reachedAt([seen(0, 0), seen(10, 100_000)], 500_000, meets);
    expect(at).toBeGreaterThanOrEqual(140_000);
    expect(at).toBeLessThan(141_000);
  });

  it('gives an action’s moment when the action itself meets the goal', () => {
    expect(reachedAt([seen(0, 0), seen(60, 5_000)], 9_000, meets)).toBe(5_000);
  });

  it('gives the leg’s first moment when its first state already meets the goal', () => {
    expect(reachedAt([seen(70, 2_000), seen(80, 3_000)], 9_000, meets)).toBe(
      2_000,
    );
  });

  it('looks between the last action and the sail when no action meets the goal', () => {
    const at = reachedAt([seen(0, 0)], 80_000, meets);
    expect(at).toBeGreaterThanOrEqual(50_000);
    expect(at).toBeLessThan(51_000);
  });

  it('asks about few states: a 1,024-state leg in under 40 questions', () => {
    let asked = 0;
    // An action every second, each recording what production had earned.
    const leg = Array.from({ length: 1_024 }, (_, k) => seen(k, k * 1_000));
    const at = reachedAt(leg, 2_000_000, (s: Toy, t: number) => {
      asked += 1;
      return meets(s, t);
    });
    expect(at).toBe(50_000);
    expect(asked).toBeGreaterThan(0);
    expect(asked).toBeLessThan(40);
  });
});

describe('SailLog', () => {
  /** A stand-in state: `u` earned at `wall`, growing 1 a second, toward its own sail's `goal`. */
  interface Toy {
    readonly u: number;
    readonly wall: number;
    readonly goal: number;
  }
  const meets = (s: Toy, atMs: number) =>
    s.u + (atMs - s.wall) / 1_000 >= s.goal;
  const toy = (u: number, wall: number, goal: number): Toy => ({
    u,
    wall,
    goal,
  });
  /** Days in seconds, so the times read as the wall times fed. */
  const seconds = (ms: number) => ms / 1_000;

  it('restarts each goal’s clock at the sail before: the states the last run left are not searched', () => {
    const log = new SailLog(
      { state: toy(0, 0, 50), wallMs: 0 },
      meets,
      seconds,
    );
    // The first run meets its goal of 50 by 10 s and sails at 20 s.
    log.reached(toy(60, 10_000, 50), 10_000);
    log.reached(toy(70, 15_000, 50), 15_000);
    log.reached(toy(0, 20_000, 90), 20_000, 2);
    // The second earns from nothing toward 90: met at 90 s, sailed at 100 s,
    // found to the second by bisection (90.156 s). Searched with the first
    // run's states, whose own goal they met, it would answer 10 s.
    log.reached(toy(30, 30_000, 90), 30_000);
    log.reached(toy(0, 100_000, 140), 100_000, 3);
    expect(log.sails).toEqual([
      { destination: 2, day: 20, reachedDay: 10 },
      { destination: 3, day: 100, reachedDay: 90.156 },
    ]);
  });
});
