import { describe, expect, it } from 'vitest';
import { pacingReport } from '../src/report';
import type { PersonaRun } from '../src/run';

/** The pacing report's shape (#35 AC6), from runs written out here. */

const run: PersonaRun = {
  persona: 'casual',
  sails: [
    { destination: 1, day: 0.031250004, reachedDay: 0.0302 },
    { destination: 2, day: 2.18749, reachedDay: 2.04161 },
  ],
  finaleDay: undefined,
  firstMasteredDay: 17.33333,
  opens: 9,
  undecided: [4.0004],
  returnsJudged: 8,
  returnsUndecided: [4.0109],
  returnsPracticeOnly: [8.40249],
  insane: ['rate'],
  events: 1234,
  cpuMs: 4567.89,
};

describe('pacingReport', () => {
  it('records each persona’s sails and when each goal was reached, finale, first Mastered word, opens, 15-minute returns (Practice-only ones apart) and CPU time', () => {
    expect(pacingReport([{ run, asserted: true }])).toEqual({
      format: 1,
      personas: [
        {
          persona: 'casual',
          asserted: true,
          sails: [
            { destination: 1, day: 0.031, reachedDay: 0.03 },
            { destination: 2, day: 2.187, reachedDay: 2.042 },
          ],
          finaleDay: null,
          firstMasteredDay: 17.333,
          opens: 9,
          opensWithoutDecision: [4],
          returnsJudged: 8,
          returnsWithoutDecision: [4.011],
          returnsWithPracticeOnly: [8.402],
          insane: ['rate'],
          events: 1234,
          cpuMs: 4568,
        },
      ],
    });
  });

  it('records a finale reached', () => {
    const [persona] = pacingReport([
      { run: { ...run, finaleDay: 24.1234 }, asserted: false },
    ]).personas;
    expect(persona?.finaleDay).toBe(24.123);
    expect(persona?.asserted).toBe(false);
  });

  it('keeps the personas in the order given', () => {
    const names = pacingReport([
      { run: { ...run, persona: 'idler' }, asserted: true },
      { run, asserted: true },
    ]).personas.map((p) => p.persona);
    expect(names).toEqual(['idler', 'casual']);
  });
});
