/**
 * The pacing report (#35 AC6): per persona, each Set Sail day, the finale,
 * the first Mastered word, the opens without a decision and the CPU time.
 * CI uploads it, so a balance change is reviewed as numbers.
 */

import type { PersonaRun } from './run';

export interface PersonaReport {
  readonly persona: string;
  /** Whether a CI assertion reads it; the less-efficient buyers are report only. */
  readonly asserted: boolean;
  /** Days from the first open to each Set Sail, by destination sailed to. */
  readonly sails: readonly {
    readonly destination: number;
    readonly day: number;
  }[];
  readonly finaleDay: number | null;
  readonly firstMasteredDay: number | null;
  readonly opens: number;
  readonly opensWithoutDecision: readonly number[];
  readonly returnsJudged: number;
  readonly returnsWithoutDecision: readonly number[];
  /** Returns where only Practice was on offer: allowed (operator, 2026-10-04), shown for review. */
  readonly returnsWithPracticeOnly: readonly number[];
  /** Values on the path that were NaN, negative or infinite: none, in a sound run. */
  readonly insane: readonly string[];
  readonly events: number;
  readonly cpuMs: number;
}

export interface PacingReport {
  readonly format: 1;
  readonly personas: readonly PersonaReport[];
}

const round = (x: number, places: number) => Number(x.toFixed(places));

/** The report for `runs`, days to 3 places and CPU to the millisecond. */
export function pacingReport(
  runs: readonly { readonly run: PersonaRun; readonly asserted: boolean }[],
): PacingReport {
  return {
    format: 1,
    personas: runs.map(({ run, asserted }) => ({
      persona: run.persona,
      asserted,
      sails: run.sails.map((s) => ({
        destination: s.destination,
        day: round(s.day, 3),
      })),
      finaleDay: run.finaleDay === undefined ? null : round(run.finaleDay, 3),
      firstMasteredDay:
        run.firstMasteredDay === undefined
          ? null
          : round(run.firstMasteredDay, 3),
      opens: run.opens,
      opensWithoutDecision: run.undecided.map((d) => round(d, 3)),
      returnsJudged: run.returnsJudged,
      returnsWithoutDecision: run.returnsUndecided.map((d) => round(d, 3)),
      returnsWithPracticeOnly: run.returnsPracticeOnly.map((d) => round(d, 3)),
      insane: run.insane,
      events: run.events,
      cpuMs: Math.round(run.cpuMs),
    })),
  };
}
