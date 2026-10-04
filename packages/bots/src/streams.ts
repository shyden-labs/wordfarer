/**
 * A persona's seeded randomness (M1 design §6, #35 AC2): open times, recall,
 * latency, prompt types and the Random Buyer's choices each draw from their
 * own stream, so two personas sharing a seed differ only where their
 * behaviour does. Latency is log-normal around a 2.5-second median, built
 * from core's deterministic `ln` and `exp`, so a run is the same on every
 * Node version.
 */

import {
  createStreams,
  drawFrom,
  exp,
  intFrom,
  ln,
  type RngStreams,
} from '@wordfarer/core';

export const STREAM_NAMES = [
  'opens',
  'recall',
  'latency',
  'prompts',
  'buys',
] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

/** The median answer latency, in milliseconds. */
export const LATENCY_MEDIAN_MS = 2_500;
/** The spread of ln(latency): about two thirds of answers take 1.7 to 3.7 s. */
export const LATENCY_SIGMA = 0.4;

const TWO_32 = 2 ** 32;

/** A persona's streams, advanced in place by each draw. */
export class Streams {
  private streams: RngStreams;

  constructor(seed: number) {
    this.streams = createStreams(seed, STREAM_NAMES);
  }

  /** A uniform float in [0, 1) from stream `name`. */
  float(name: StreamName): number {
    const { value, streams } = drawFrom(this.streams, name);
    this.streams = streams;
    return value / TWO_32;
  }

  /** A uniform integer in [0, n) from stream `name`. */
  int(name: StreamName, n: number): number {
    const { value, streams } = intFrom(this.streams, name, n);
    this.streams = streams;
    return value;
  }

  /** Whether a review is answered correctly: true with probability `retrievability`. */
  recalls(retrievability: number): boolean {
    return this.float('recall') < retrievability;
  }

  /**
   * An answer's latency in whole milliseconds: log-normal, median 2.5 s. A
   * standard normal comes from Marsaglia's polar method, which needs only
   * `ln` and a correctly rounded `Math.sqrt`.
   */
  latencyMs(): number {
    for (;;) {
      const u = 2 * this.float('latency') - 1;
      const v = 2 * this.float('latency') - 1;
      const s = u * u + v * v;
      if (s > 0 && s < 1) {
        const z = u * Math.sqrt((-2 * ln(s)) / s);
        return Math.round(LATENCY_MEDIAN_MS * exp(LATENCY_SIGMA * z));
      }
    }
  }
}
