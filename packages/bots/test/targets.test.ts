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
    opens: 72,
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
