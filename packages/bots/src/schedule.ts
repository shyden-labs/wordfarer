/**
 * When a persona opens the game (M1 design §6): each day its opens fall at
 * seeded times in waking hours, 08:00 to 22:00 on the simulated wall clock,
 * and day 0 starts with the first session at 08:00, 60 minutes long. Waking
 * hours are split into one equal slot per open, and each open falls in its
 * own slot at least an hour before the next slot starts, so two opens are
 * never closer than an hour: drawn independently, opens landed minutes
 * apart, or overlapped, which no player would call two visits (#35).
 */

import type { Persona } from './personas';
import type { Streams } from './streams';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
/** Waking hours start at 08:00, when the first session opens. */
export const WAKE_MS = 8 * HOUR_MS;
/** Opens fall in the 14 waking hours, 08:00 to 22:00. */
export const WAKING_MS = 14 * HOUR_MS;
export const FIRST_SESSION_MS = 60 * MINUTE_MS;
/** The least time between the starts of two opens. */
export const MIN_OPEN_GAP_MS = HOUR_MS;

export interface Open {
  readonly startMs: number;
  readonly lengthMs: number;
}

/**
 * Day `day`'s opens, in time order, from the `opens` stream: the i-th at a
 * whole second of its slot of waking hours, at least `MIN_OPEN_GAP_MS`
 * before the next slot. Day 0's first is the 60-minute first session at
 * 08:00.
 */
export function dayOpens(
  persona: Persona,
  epochMs: number,
  day: number,
  streams: Streams,
): readonly Open[] {
  const base = epochMs + day * DAY_MS;
  const slotMs = WAKING_MS / persona.opensPerDay;
  const spanS = Math.floor((slotMs - MIN_OPEN_GAP_MS) / 1_000) + 1;
  const starts = Array.from(
    { length: persona.opensPerDay },
    (_, i) =>
      base +
      WAKE_MS +
      Math.ceil(i * slotMs) +
      streams.int('opens', spanS) * 1_000,
  );
  if (day === 0) starts[0] = base + WAKE_MS;
  return starts.map((startMs, i) => ({
    startMs,
    lengthMs:
      day === 0 && i === 0 ? FIRST_SESSION_MS : persona.openMinutes * MINUTE_MS,
  }));
}
