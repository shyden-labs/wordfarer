import { DAY_MS, HOUR_MS, wallMs } from '../src/clock';
import { exp, expm1, ln, log10, log1p, pow } from '../src/det-math';
import {
  meanRetrievability,
  newWordMemory,
  RANKS,
  review,
  type WordMemory,
} from '../src/memory';
import { nextU32, seedRng, type RngState } from '../src/rng';

/**
 * Golden vectors (#26 AC10, #28): 100,000 per function, generated from a
 * fixed seed, hashed over the exact bits of every result. The six det-math
 * functions, the mean retrievability over a window, and core's FSRS review
 * with the parameters it ships (ts-fsrs defaults, short-term steps on, fuzz
 * off), whose cross-engine bits M1 design §2.1 measured only with short-term
 * steps off.
 *
 * The same module runs under Node (a unit test pins its digests) and, bundled,
 * in Chromium, WebKit and Firefox (tests/engines). Equal digests mean equal
 * bits on every engine. The inputs and the hash use only integer operations,
 * correctly rounded division and little-endian DataView access, which every
 * engine computes alike, so any difference is the function's.
 */

export const VECTORS_PER_FUNCTION = 100_000;

export const FUNCTIONS = [
  'pow',
  'exp',
  'ln',
  'log10',
  'expm1',
  'log1p',
  'meanR',
  'review',
] as const;
export type GoldenFunction = (typeof FUNCTIONS)[number];

/** The review vectors are 4,000 cards of 25 reviews each, from new. */
const REVIEWS_PER_CARD = 25;
const REVIEW_START = wallMs(1_790_000_000_000);

const TWO_POW_32 = 4294967296;

class Inputs {
  private state: RngState;
  private readonly view = new DataView(new ArrayBuffer(8));

  constructor(seed: number) {
    this.state = seedRng(seed);
  }

  u32(): number {
    const r = nextU32(this.state);
    this.state = r.state;
    return r.value;
  }

  /** A uniform float in [0, 1). */
  unit(): number {
    return this.u32() / TWO_POW_32;
  }

  /**
   * A non-negative finite double with a uniformly random exponent field
   * (0 to 2046: subnormals through the largest finite), so every magnitude
   * is drawn.
   */
  anyPositive(): number {
    const exponentField = this.u32() % 2047;
    const hi = ((exponentField << 20) | (this.u32() & 0xfffff)) >>> 0;
    this.view.setUint32(0, this.u32(), true);
    this.view.setUint32(4, hi, true);
    return this.view.getFloat64(0, true);
  }
}

/** cyrb53-style 2 x 32-bit hash over each result's two 32-bit words. */
class BitHash {
  private h1 = 0xdeadbeef;
  private h2 = 0x41c6ce57;
  private readonly view = new DataView(new ArrayBuffer(8));

  add(x: number): void {
    this.view.setFloat64(0, x, true);
    for (const w of [
      this.view.getUint32(0, true),
      this.view.getUint32(4, true),
    ]) {
      this.h1 = Math.imul(this.h1 ^ w, 2654435761);
      this.h2 = Math.imul(this.h2 ^ w, 1597334677);
    }
  }

  hex(): string {
    let h1 = Math.imul(this.h1 ^ (this.h1 >>> 16), 2246822507);
    h1 ^= Math.imul(this.h2 ^ (this.h2 >>> 13), 3266489909);
    let h2 = Math.imul(this.h2 ^ (this.h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (
      (h2 >>> 0).toString(16).padStart(8, '0') +
      (h1 >>> 0).toString(16).padStart(8, '0')
    );
  }
}

/** One input set per function, covering each one's whole finite domain. */
function vector(
  fn: Exclude<GoldenFunction, 'review'>,
  i: Inputs,
  k: number,
): number {
  switch (fn) {
    case 'pow':
      // Three shapes in turn: the cost curve, powers of ten, and general.
      if (k % 3 === 0) return pow(1.15, i.u32() % 100_001);
      if (k % 3 === 1) return pow(10, i.unit() * 600 - 300);
      return pow(i.unit() * 1000, i.unit() * 200 - 100);
    case 'exp':
      return exp(i.unit() * 1454.9 - 745.1);
    case 'ln':
      return ln(i.anyPositive());
    case 'log10':
      return log10(i.anyPositive());
    case 'expm1':
      return expm1(i.unit() * 760 - 50);
    case 'log1p':
      return log1p(k % 2 === 0 ? i.unit() * 2 - 1 : i.anyPositive());
    case 'meanR': {
      // S from 0.01 d to 100 y, a window starting up to 100 y after the
      // review, and a span of up to one bucket or up to 100 y, in turn.
      const s = ((i.u32() % 3_652_500) + 1) / 100;
      const from = (i.u32() % 3_652_500) / 100;
      const span =
        k % 2 === 0
          ? ((i.u32() % HOUR_MS) + 1) / DAY_MS
          : ((i.u32() % 3_652_500) + 1) / 100;
      return meanRetrievability(s, from, span);
    }
  }
}

/**
 * Every field of each card after each review. Answers come at most an hour
 * late and at most 40 days late in turn, so cards pass through the learning
 * steps as well as long intervals; one answer in four is wrong.
 */
function reviewVectors(i: Inputs, hash: BitHash, vectors: number): void {
  let word: WordMemory = newWordMemory(REVIEW_START);
  for (let k = 0; k < vectors; k++) {
    if (k % REVIEWS_PER_CARD === 0) word = newWordMemory(REVIEW_START);
    const late = i.u32() % (k % 2 === 0 ? HOUR_MS : 40 * DAY_MS);
    word = review(word, wallMs(word.card.due + late), i.u32() % 4 !== 0);
    const c = word.card;
    hash.add(c.due);
    hash.add(c.stability);
    hash.add(c.difficulty);
    hash.add(c.scheduledDays);
    hash.add(c.learningSteps);
    hash.add(c.reps);
    hash.add(c.lapses);
    hash.add(c.state);
    hash.add(c.lastReview ?? -1);
    hash.add(RANKS.indexOf(word.rank));
  }
}

/**
 * The digest of one function's golden vectors: all 100,000, or the first
 * `vectors` of them (Node's review pin reads fewer, #474).
 */
export function digest(
  fn: GoldenFunction,
  vectors: number = VECTORS_PER_FUNCTION,
): string {
  const inputs = new Inputs(20261001 + FUNCTIONS.indexOf(fn));
  const hash = new BitHash();
  if (fn === 'review') reviewVectors(inputs, hash, vectors);
  else for (let k = 0; k < vectors; k++) hash.add(vector(fn, inputs, k));
  return hash.hex();
}
