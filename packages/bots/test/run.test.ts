import { describe, expect, it } from 'vitest';
import {
  initialState,
  Num,
  view,
  wallMs,
  type Course,
  type View,
} from '@wordfarer/core';
import {
  BOT_EPOCH_WALL_MS,
  syntheticCourse,
} from '@wordfarer/core/fixtures/synthetic-course';
import { persona } from '../src/personas';
import { insaneValues, reachedAt, runPersona } from '../src/run';
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
  it(
    'plays the Casual Learner’s first day: 3 opens, sails timed from the first open',
    { timeout: 120_000 },
    () => {
      const run = runPersona(course(), persona('casual'), BOT_EPOCH_WALL_MS, 1);
      expect(run.persona).toBe('casual');
      expect(run.opens).toBe(3);
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
    },
  );

  it(
    'ends after the open in which the asked-for sails landed',
    { timeout: 300_000 },
    () => {
      const full = runPersona(
        course(),
        persona('casual'),
        BOT_EPOCH_WALL_MS,
        3,
      );
      const stopped = runPersona(
        course(),
        persona('casual'),
        BOT_EPOCH_WALL_MS,
        3,
        {
          stopAfterSails: 2,
        },
      );
      expect(stopped.sails.length).toBeGreaterThanOrEqual(2);
      expect(stopped.sails).toEqual(full.sails.slice(0, stopped.sails.length));
      expect(stopped.opens).toBeLessThan(full.opens);
    },
  );

  it(
    'judges a return 15 minutes after each of the first day’s 3 opens',
    { timeout: 120_000 },
    () => {
      const run = runPersona(course(), persona('casual'), BOT_EPOCH_WALL_MS, 1);
      expect(run.returnsJudged).toBe(3);
      expect(run.returnsUndecided).toEqual([]);
      expect(run.returnsPracticeOnly).toEqual([]);
    },
  );

  it(
    'times each goal from when the Understanding earned that run reached it: after the sail before, no later than its own sail, and for the Idler hours before an open lets it sail',
    { timeout: 300_000 },
    () => {
      const run = runPersona(course(), persona('idler'), BOT_EPOCH_WALL_MS, 11);
      expect(run.sails.length).toBeGreaterThan(2);
      expect(run.sails.filter((s) => !Number.isFinite(s.reachedDay))).toEqual(
        [],
      );
      const outOfOrder = run.sails.filter(
        (s, i) =>
          s.reachedDay > s.day || s.reachedDay <= (run.sails[i - 1]?.day ?? 0),
      );
      expect(outOfOrder).toEqual([]);
      const waitedHours = run.sails.map((s) => (s.day - s.reachedDay) * 24);
      expect(Math.max(...waitedHours)).toBeGreaterThan(1);
    },
  );

  it('waits 15 minutes for a quick return (operator, 2026-10-04)', () => {
    expect(QUICK_RETURN_MS).toBe(900_000);
  });

  it('records no finale when the run ends first', { timeout: 120_000 }, () => {
    expect(
      runPersona(course(), persona('idler'), BOT_EPOCH_WALL_MS, 1).finaleDay,
    ).toBeUndefined();
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
