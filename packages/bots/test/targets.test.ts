import { describe, expect, it } from 'vitest';
import type { PersonaRun } from '../src/run';
import {
  CI_BOUNDS,
  clickingNeverWins,
  decisions,
  finale,
  firstSail,
  gaps,
  idlerFinishes,
  learnersOrder,
  learningPays,
  largestShift,
  longWaits,
  sailTiming,
  sanity,
  TUNING_TARGETS,
} from '../src/targets';

/**
 * The pacing checks (#35 AC4, AC9), each against runs written out here: one
 * that holds and the edge that breaks it, so a bound off by one direction
 * shows.
 */

/**
 * A run sailing first at `firstDay`, then every `gap` days to the finale,
 * each goal reached at the moment of its sail.
 */
function run(
  persona: string,
  firstDay: number,
  gap: number,
  extra: Partial<PersonaRun> = {},
): PersonaRun {
  const sails = Array.from({ length: 12 }, (_, i) => ({
    destination: i + 1,
    day: firstDay + i * gap,
    reachedDay: firstDay + i * gap,
  }));
  return {
    persona,
    sails,
    finaleDay: sails.at(-1)?.day,
    firstMasteredDay: undefined,
    openDays: Array.from({ length: 72 }, (_, i) => i / 3),
    undecided: [],
    returnsJudged: 71,
    returnsUndecided: [],
    returnsPracticeOnly: [],
    insane: [],
    events: 5_000,
    cpuMs: 1,
    ...extra,
  };
}

const MIN = 1 / 1_440;

describe('the bounds', () => {
  it('are the spec’s in CI', () => {
    expect(CI_BOUNDS).toEqual({
      firstMinutes: [30, 60],
      gapDays: [1, 3],
      finaleDays: [21, 35],
      idlerFinaleBy: 70,
      learningPays: 0.2,
      clickerShare: 0.95,
    });
  });

  it('are tighter for the tuning, gaps and finale as loosened on 2026-10-04', () => {
    expect(TUNING_TARGETS).toEqual({
      firstMinutes: [38, 52],
      gapDays: [1.4, 2.8],
      finaleDays: [23, 32],
      idlerFinaleBy: 63,
      learningPays: 0.35,
      clickerShare: 0.97,
    });
  });
});

describe('(a) firstSail', () => {
  it('holds just inside 30 and 60 minutes', () => {
    expect(firstSail(run('casual', 30.1 * MIN, 2), CI_BOUNDS)).toEqual([]);
    expect(firstSail(run('casual', 59.9 * MIN, 2), CI_BOUNDS)).toEqual([]);
  });

  it('breaks just under 30 minutes', () => {
    expect(firstSail(run('casual', 29.9 * MIN, 2), CI_BOUNDS)).toEqual([
      'casual first set sail after 29.9 min',
    ]);
  });

  it('breaks just over 60 minutes', () => {
    expect(firstSail(run('casual', 60.1 * MIN, 2), CI_BOUNDS)).toHaveLength(1);
  });

  it('breaks when the persona never sets sail', () => {
    expect(firstSail(run('idler', 1, 1, { sails: [] }), CI_BOUNDS)).toEqual([
      'idler never set sail',
    ]);
  });
});

describe('(b) gaps', () => {
  it('holds at gaps just inside 1 and 3 days', () => {
    expect(gaps(run('casual', 0.03, 1.001), CI_BOUNDS)).toEqual([]);
    expect(gaps(run('casual', 0.03, 2.999), CI_BOUNDS)).toEqual([]);
  });

  it('names each gap over 3 days', () => {
    expect(gaps(run('casual', 0.03, 3.01), CI_BOUNDS)).toHaveLength(11);
  });

  it('names one short gap', () => {
    const r = run('casual', 0.03, 2);
    const sails = r.sails.map((s) =>
      s.destination === 5 ? { ...s, day: s.day - 1.5 } : s,
    );
    expect(gaps({ ...r, sails }, CI_BOUNDS)).toEqual([
      'destination 5 came 0.500 days after the one before',
      'destination 6 came 3.500 days after the one before',
    ]);
  });

  /** Sails every 2.5 days from day 1, one moved to `day`, opens every 6 hours. */
  function moved(index: number, day: number): PersonaRun {
    const r = run('casual', 1, 2.5, {
      openDays: Array.from({ length: 160 }, (_, i) => i / 4),
    });
    return {
      ...r,
      sails: r.sails.map((s, i) => (i === index ? { ...s, day } : s)),
    };
  }

  it('lets a variant cross by one open: a sail one open sooner would have kept within 3 days (operator, 2026-10-04)', () => {
    expect(gaps(moved(4, 11.6), CI_BOUNDS)).toEqual([
      'destination 5 came 3.100 days after the one before',
    ]);
    expect(gaps(moved(4, 11.6), CI_BOUNDS, 1)).toEqual([]);
  });

  it('still names a gap that one open sooner would not bring within 3 days', () => {
    expect(gaps(moved(4, 12.1), CI_BOUNDS, 1)).toEqual([
      'destination 5 came 3.600 days after the one before',
    ]);
  });

  it('lets a short gap through when a sail one open later would have been a day after', () => {
    expect(gaps(moved(4, 9.45), CI_BOUNDS)).toEqual([
      'destination 5 came 0.950 days after the one before',
      'destination 6 came 4.050 days after the one before',
    ]);
    expect(gaps(moved(4, 9.45), CI_BOUNDS, 1)).toEqual([
      'destination 6 came 4.050 days after the one before',
    ]);
  });

  it('gives no slack to a sail in no recorded open', () => {
    const r = moved(4, 11.6);
    expect(gaps({ ...r, openDays: [] }, CI_BOUNDS, 1)).toEqual([
      'destination 5 came 3.100 days after the one before',
    ]);
  });

  it('breaks when the run stops short of the finale', () => {
    const r = run('casual', 0.03, 2);
    expect(gaps({ ...r, sails: r.sails.slice(0, 9) }, CI_BOUNDS)).toEqual([
      'casual reached 9 of 12 destinations',
    ]);
  });
});

describe('(c) finale', () => {
  it('holds just inside day 21 and day 35', () => {
    expect(finale(run('casual', 0, 21.01 / 11), CI_BOUNDS)).toEqual([]);
    expect(finale(run('casual', 0, 34.99 / 11), CI_BOUNDS)).toEqual([]);
  });

  it('breaks before day 21', () => {
    expect(finale(run('casual', 0, 20.9 / 11), CI_BOUNDS)).toEqual([
      'casual reached the finale on day 20.900',
    ]);
  });

  it('breaks after day 35', () => {
    expect(finale(run('casual', 0, 35.1 / 11), CI_BOUNDS)).toHaveLength(1);
  });

  it('breaks without a finale', () => {
    expect(
      finale(run('casual', 0, 2, { finaleDay: undefined }), CI_BOUNDS),
    ).toEqual(['casual did not reach the finale']);
  });
});

describe('(d) idlerFinishes', () => {
  it('holds just before day 70', () => {
    expect(idlerFinishes(run('idler', 0, 69.99 / 11), CI_BOUNDS)).toEqual([]);
  });

  it('breaks after day 70', () => {
    expect(idlerFinishes(run('idler', 0, 70.1 / 11), CI_BOUNDS)).toHaveLength(
      1,
    );
  });

  it('breaks without a finale', () => {
    expect(
      idlerFinishes(run('idler', 0, 2, { finaleDay: undefined }), CI_BOUNDS),
    ).toHaveLength(1);
  });
});

describe('(e) decisions', () => {
  it('holds when every open offered one', () => {
    expect(decisions(run('casual', 0, 2))).toEqual([]);
  });

  it('names each open that offered none', () => {
    expect(decisions(run('casual', 0, 2, { undecided: [3.25, 9.5] }))).toEqual([
      "casual's open on day 3.250 offered no decision",
      "casual's open on day 9.500 offered no decision",
    ]);
  });

  it('names each 15-minute return that offered none', () => {
    expect(
      decisions(run('casual', 0, 2, { returnsUndecided: [8.2706] })),
    ).toEqual([
      "casual's return on day 8.271, 15 minutes after an open, offered no decision",
    ]);
  });

  it('accepts a 15-minute return where only Practice is on offer (operator, 2026-10-04)', () => {
    expect(
      decisions(run('casual', 0, 2, { returnsPracticeOnly: [8.2706] })),
    ).toEqual([]);
  });

  it('judges a return after every open when no finale ends the run', () => {
    expect(
      decisions(
        run('casual', 0, 2, { finaleDay: undefined, returnsJudged: 72 }),
      ),
    ).toEqual([]);
  });

  it('breaks when a return went unjudged', () => {
    expect(decisions(run('casual', 0, 2, { returnsJudged: 70 }))).toEqual([
      'casual judged 70 15-minute returns after 72 opens, not 71',
    ]);
  });
});

describe('(f) learningPays', () => {
  it('holds when the Casual Learner finishes just over 20% sooner', () => {
    expect(
      learningPays(run('casual', 0, 2.39), run('nonlearner', 0, 3), CI_BOUNDS),
    ).toEqual([]);
  });

  it('breaks at 19% sooner', () => {
    expect(
      learningPays(run('casual', 0, 2.43), run('nonlearner', 0, 3), CI_BOUNDS),
    ).toHaveLength(1);
  });

  it('breaks without a finale', () => {
    expect(
      learningPays(
        run('casual', 0, 2),
        run('nonlearner', 0, 3, { finaleDay: undefined }),
        CI_BOUNDS,
      ),
    ).toEqual(['a finale was not reached']);
  });
});

describe('(f) learnersOrder', () => {
  it('holds when Diligent ≤ Casual ≤ Idler, ties included', () => {
    expect(
      learnersOrder(
        run('diligent', 0, 2),
        run('casual', 0, 2),
        run('idler', 0, 3),
      ),
    ).toEqual([]);
  });

  it('breaks when the Diligent Learner finishes after the Casual Learner', () => {
    expect(
      learnersOrder(
        run('diligent', 0, 2.1),
        run('casual', 0, 2),
        run('idler', 0, 3),
      ),
    ).toHaveLength(1);
  });

  it('breaks when the Idler finishes before the Casual Learner', () => {
    expect(
      learnersOrder(
        run('diligent', 0, 2),
        run('casual', 0, 2),
        run('idler', 0, 1.9),
      ),
    ).toHaveLength(1);
  });
});

describe('(g) clickingNeverWins', () => {
  it('holds just over 95% of the Casual Learner’s time', () => {
    expect(
      clickingNeverWins(
        run('clicker', 0.951, 1.902),
        run('casual', 1, 2),
        CI_BOUNDS,
      ),
    ).toEqual([]);
  });

  it('names a goal reached sooner than 95%', () => {
    const casual = run('casual', 1, 2);
    const clicker = run('clicker', 0.94, 2);
    expect(clickingNeverWins(clicker, casual, CI_BOUNDS)).toEqual([
      "the Clicker reached destination 1's goal at 94.0% of the Casual Learner's time",
    ]);
  });

  it('judges when each goal was reached, not the open the sail waited for (operator, 2026-10-04)', () => {
    const casual = run('casual', 1, 2);
    const sailedSooner = run('clicker', 0.9, 1.8);
    const clicker = {
      ...sailedSooner,
      sails: casual.sails.map((s, i) => ({
        ...s,
        day: sailedSooner.sails[i]?.day ?? s.day,
        reachedDay: 0.96 * s.reachedDay,
      })),
    };
    expect(clickingNeverWins(clicker, casual, CI_BOUNDS)).toEqual([]);
  });

  it('breaks on a goal reached sooner than 95% though both sail on the same open', () => {
    const casual = run('casual', 1, 2);
    const clicker = {
      ...casual,
      persona: 'clicker',
      sails: casual.sails.map((s, i) =>
        i === 3 ? { ...s, reachedDay: 0.94 * s.reachedDay } : s,
      ),
    };
    expect(clickingNeverWins(clicker, casual, CI_BOUNDS)).toEqual([
      "the Clicker reached destination 4's goal at 94.0% of the Casual Learner's time",
    ]);
  });

  it('breaks when a run did not reach every destination', () => {
    const casual = run('casual', 1, 2);
    expect(
      clickingNeverWins(
        { ...casual, sails: casual.sails.slice(0, 5) },
        casual,
        CI_BOUNDS,
      ),
    ).toHaveLength(1);
  });
});

describe('(h) sanity', () => {
  it('holds with no insane value', () => {
    expect(sanity(run('casual', 0, 2))).toEqual([]);
  });

  it('names each insane value', () => {
    expect(
      sanity(run('casual', 0, 2, { insane: ['rate', 'price.r0-e1'] })),
    ).toEqual(['casual: rate', 'casual: price.r0-e1']);
  });
});

/** `base` with sail `i`'s goal met on `reachedDay` instead. */
function goalMetOn(
  base: PersonaRun,
  i: number,
  reachedDay: number,
): PersonaRun {
  return {
    ...base,
    sails: base.sails.map((s, k) => (k === i ? { ...s, reachedDay } : s)),
  };
}

describe('(h) sailTiming', () => {
  // Sails on days 0.5, 2.5, 4.5, ...
  const held = run('idler', 0.5, 2);

  it('names a goal met at the sail before, and passes one met a minute after it', () => {
    const run = goalMetOn(goalMetOn(held, 3, 4.5 + MIN), 5, 8.5);
    expect(sailTiming(run)).toEqual([
      'idler: destination 6’s goal met on day 8.500, outside (8.500, 10.500]',
    ]);
  });

  it('names a goal met after its own sail', () => {
    expect(sailTiming(goalMetOn(held, 3, 6.5 + MIN))).toEqual([
      'idler: destination 4’s goal met on day 6.501, outside (4.500, 6.500]',
    ]);
  });

  it('names a first goal met before the run began', () => {
    expect(sailTiming(goalMetOn(held, 0, 0))).toEqual([
      'idler: destination 1’s goal met on day 0.000, outside (0.000, 0.500]',
    ]);
  });

  it('names a goal met at no finite moment', () => {
    expect(sailTiming(goalMetOn(held, 5, NaN))).toEqual([
      'idler: destination 6’s goal met on day NaN, outside (8.500, 10.500]',
    ]);
  });
});

describe('(h) longWaits', () => {
  const HOUR = 1 / 24;

  // A minute either side of the hour: a day count holds no exact hour.
  it('finds each sail whose goal was met over an hour before it, and not one met within the hour', () => {
    // Sails on days 0.5, 2.5, ..., 14.5, 16.5, ...
    const sailed = run('idler', 0.5, 2);
    const waited = goalMetOn(
      goalMetOn(sailed, 7, 14.5 - HOUR - MIN),
      8,
      16.5 - HOUR + MIN,
    );
    expect(longWaits(waited)).toEqual([
      { destination: 8, day: 14.5, reachedDay: 14.5 - HOUR - MIN },
    ]);
  });
});

describe('largestShift (the sweep’s inert levers)', () => {
  const baseline = new Map([
    ['casual', run('casual', 0.03, 2)],
    ['idler', run('idler', 0.03, 4)],
  ]);

  it('is 0 for a variant whose every run sails exactly as the baseline’s', () => {
    expect(largestShift(new Map(baseline), baseline)).toBe(0);
  });

  it('is a goal moment’s move as a share of that moment: one second sooner on day 14.03', () => {
    const casual = run('casual', 0.03, 2);
    const moved = {
      ...casual,
      sails: casual.sails.map((s, i) =>
        i === 7 ? { ...s, reachedDay: s.reachedDay - 1 / 86_400 } : s,
      ),
    };
    expect(
      largestShift(new Map([...baseline, ['casual', moved]]), baseline),
    ).toBeCloseTo(1 / 86_400 / 14.03, 12);
  });

  it('weighs each move against its own figure: half a day on day 4.03 outweighs 1.25 days on the day-44 finale', () => {
    const casual = run('casual', 0.03, 2);
    const sailed = {
      ...casual,
      sails: casual.sails.map((s, i) =>
        i === 2 ? { ...s, day: s.day + 0.5 } : s,
      ),
    };
    const idler = { ...run('idler', 0.03, 4), finaleDay: 44.03 + 1.25 };
    expect(
      largestShift(
        new Map<string, PersonaRun>([
          ['casual', sailed],
          ['idler', idler],
        ]),
        baseline,
      ),
    ).toBeCloseTo(0.5 / 4.03, 9);
  });

  it('sees a finale moved alone', () => {
    const idler = { ...run('idler', 0.03, 4), finaleDay: 44.03 + 1.25 };
    expect(
      largestShift(new Map([...baseline, ['idler', idler]]), baseline),
    ).toBeCloseTo(1.25 / 44.03, 9);
  });

  it('is infinite when a run reaches fewer destinations or no finale', () => {
    const casual = run('casual', 0.03, 2);
    expect(
      largestShift(
        new Map([
          ...baseline,
          ['casual', { ...casual, sails: casual.sails.slice(0, 11) }],
        ]),
        baseline,
      ),
    ).toBe(Infinity);
    expect(
      largestShift(
        new Map([...baseline, ['casual', { ...casual, finaleDay: undefined }]]),
        baseline,
      ),
    ).toBe(Infinity);
  });

  it('refuses runs of different personas rather than compare them', () => {
    expect(() =>
      largestShift(new Map([['casual', run('casual', 0.03, 2)]]), baseline),
    ).toThrow('the variant played casual, the baseline casual, idler');
  });
});
