import { describe, expect, it } from 'vitest';
import { persona } from '../src/personas';
import {
  dayOpens,
  DAY_MS,
  FIRST_SESSION_MS,
  MIN_OPEN_GAP_MS,
  WAKE_MS,
  WAKING_MS,
} from '../src/schedule';
import { LATENCY_MEDIAN_MS, Streams } from '../src/streams';

/**
 * A persona's randomness (#35 AC2) and its open times (M1 design §6). The
 * statistical checks draw 20,000 values; each bound is several standard
 * errors wide, and the streams are seeded, so the result never varies.
 */

const DRAWS = 20_000;
const EPOCH = Date.UTC(2027, 0, 4);

function draws<T>(n: number, draw: () => T): T[] {
  return Array.from({ length: n }, draw);
}

describe('the streams', () => {
  it('give the same draws for the same seed', () => {
    const a = new Streams(35);
    const b = new Streams(35);
    expect(draws(50, () => a.float('opens'))).toEqual(
      draws(50, () => b.float('opens')),
    );
  });

  it('give different draws for another seed', () => {
    const a = new Streams(35);
    const b = new Streams(36);
    expect(draws(50, () => a.float('opens'))).not.toEqual(
      draws(50, () => b.float('opens')),
    );
  });

  it('keep each stream apart: drawing recall, latency, prompts and buys leaves the opens unchanged', () => {
    const quiet = new Streams(35);
    const busy = new Streams(35);
    busy.recalls(0.5);
    busy.latencyMs();
    busy.int('prompts', 3);
    busy.int('buys', 7);
    expect(draws(50, () => busy.float('opens'))).toEqual(
      draws(50, () => quiet.float('opens')),
    );
  });

  it('draw floats in [0, 1)', () => {
    const s = new Streams(35);
    const xs = draws(DRAWS, () => s.float('buys'));
    expect(xs.filter((x) => x < 0 || x >= 1)).toEqual([]);
    expect(Math.min(...xs)).toBeLessThan(0.001);
    expect(Math.max(...xs)).toBeGreaterThan(0.999);
  });
});

describe('recall', () => {
  it('is correct with probability R', () => {
    const s = new Streams(35);
    const correct = draws(DRAWS, () => s.recalls(0.3)).filter(Boolean).length;
    expect(Math.abs(correct / DRAWS - 0.3)).toBeLessThan(0.015);
  });

  it('is never correct at R = 0', () => {
    const s = new Streams(35);
    expect(draws(1_000, () => s.recalls(0)).filter(Boolean)).toEqual([]);
  });

  it('is always correct at R = 1', () => {
    const s = new Streams(35);
    expect(draws(1_000, () => s.recalls(1)).filter((x) => !x)).toEqual([]);
  });
});

describe('latency', () => {
  it('is a whole, positive number of milliseconds', () => {
    const s = new Streams(35);
    const xs = draws(DRAWS, () => s.latencyMs());
    expect(xs.filter((x) => !Number.isSafeInteger(x) || x <= 0)).toEqual([]);
    expect(xs).toHaveLength(DRAWS);
  });

  it('has a median of 2.5 s', () => {
    const s = new Streams(35);
    const xs = draws(DRAWS, () => s.latencyMs()).sort((a, b) => a - b);
    const median = xs[DRAWS / 2] ?? 0;
    expect(Math.abs(median / LATENCY_MEDIAN_MS - 1)).toBeLessThan(0.02);
  });

  it('is log-normal with a spread of 0.4 in ln(latency)', () => {
    const s = new Streams(35);
    const logs = draws(DRAWS, () =>
      Math.log(s.latencyMs() / LATENCY_MEDIAN_MS),
    );
    const mean = logs.reduce((a, b) => a + b, 0) / DRAWS;
    const sd = Math.sqrt(
      logs.reduce((a, b) => a + (b - mean) ** 2, 0) / (DRAWS - 1),
    );
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(Math.abs(sd - 0.4)).toBeLessThan(0.01);
  });
});

describe('the open schedule', () => {
  it('starts day 0 with the 60-minute first session at 08:00', () => {
    const [first] = dayOpens(persona('casual'), EPOCH, 0, new Streams(35));
    expect(first).toEqual({
      startMs: EPOCH + WAKE_MS,
      lengthMs: FIRST_SESSION_MS,
    });
  });

  it('gives the Casual Learner 3 opens a day', () => {
    expect(dayOpens(persona('casual'), EPOCH, 5, new Streams(35))).toHaveLength(
      3,
    );
  });

  it('gives the Diligent Learner 5 opens a day of 8 minutes', () => {
    const opens = dayOpens(persona('diligent'), EPOCH, 5, new Streams(37));
    expect(opens.map((o) => o.lengthMs)).toEqual(Array(5).fill(8 * 60_000));
  });

  it('places later opens at whole seconds of waking hours, in order', () => {
    const s = new Streams(35);
    const days = Array.from({ length: 30 }, (_, d) => d + 1);
    const starts = days.flatMap((day) =>
      dayOpens(persona('casual'), EPOCH, day, s).map((o) => ({
        day,
        offset: o.startMs - EPOCH - day * DAY_MS,
      })),
    );
    expect(starts).toHaveLength(90);
    expect(
      starts.filter(
        ({ offset }) =>
          offset < WAKE_MS ||
          offset >= WAKE_MS + WAKING_MS ||
          offset % 1_000 !== 0,
      ),
    ).toEqual([]);
    expect(Math.min(...starts.map((s) => s.offset))).toBeLessThan(
      WAKE_MS + 3_600_000,
    );
    expect(Math.max(...starts.map((s) => s.offset))).toBeGreaterThan(
      WAKE_MS + WAKING_MS - 2 * 3_600_000,
    );
  });

  it('keeps opens at least an hour apart, from one day to the next too', () => {
    const s = new Streams(37);
    const starts = Array.from({ length: 30 }, (_, d) => d).flatMap((day) =>
      dayOpens(persona('diligent'), EPOCH, day, s).map((o) => o.startMs),
    );
    const gaps = starts.slice(1).map((t, i) => t - (starts[i] ?? 0));
    expect(gaps).toHaveLength(149);
    expect(gaps.filter((g) => g < MIN_OPEN_GAP_MS)).toEqual([]);
    expect(Math.min(...gaps)).toBeLessThan(MIN_OPEN_GAP_MS + 15 * 60_000);
  });

  it('places each open in its own slot of waking hours', () => {
    const s = new Streams(35);
    const slotMs = WAKING_MS / 3;
    const offsets = Array.from({ length: 30 }, (_, d) => d + 1).flatMap((day) =>
      dayOpens(persona('casual'), EPOCH, day, s).map(
        (o, i) => o.startMs - EPOCH - day * DAY_MS - WAKE_MS - i * slotMs,
      ),
    );
    expect(offsets).toHaveLength(90);
    expect(
      offsets.filter((x) => x < 0 || x > slotMs - MIN_OPEN_GAP_MS),
    ).toEqual([]);
  });

  it('orders a day’s opens by time', () => {
    const opens = dayOpens(persona('diligent'), EPOCH, 3, new Streams(37));
    const starts = opens.map((o) => o.startMs);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});
