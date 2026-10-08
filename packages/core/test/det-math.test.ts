import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';
import { exp, expm1, ln, log10, log1p, pow } from '../src/det-math';

/**
 * det-math against a high-precision reference (M1 design §2.1, #26 AC2).
 *
 * Every result must lie within 2 ulp of the true value rounded to a double.
 * The reference is decimal.js at 60+ significant digits, fed the input's
 * EXACT value: `new Decimal(1.15)` would read the shortest string "1.15",
 * which is 7.7e-17 away from the double, and pow(1.15, 5000) multiplies that
 * gap into thousands of ulp. `toPrecision(40)` is correctly rounded by
 * ECMAScript, so 40 digits carry the double exactly enough.
 */

type Unary = 'exp' | 'ln' | 'log10' | 'expm1' | 'log1p';

const bits = new Float64Array(1);
const words = new BigInt64Array(bits.buffer);

/** Maps a double to an integer whose order matches the doubles' order. */
function ordered(x: number): bigint {
  bits[0] = x;
  const raw = words[0] ?? 0n;
  return raw < 0n ? -(raw & 0x7fffffffffffffffn) : raw;
}

function ulps(a: number, b: number): bigint {
  const d = ordered(a) - ordered(b);
  return d < 0n ? -d : d;
}

/**
 * Significant digits for the reference. 1 + x and e^x - 1 near x = 0 need
 * one more digit per decade of smallness, or they cancel to nothing; the
 * other functions need no more than 60, and asking for 383 digits makes
 * decimal.js's ln take 27 ms a call (measured).
 */
function digitsFor(fn: Unary, x: number): number {
  if ((fn !== 'expm1' && fn !== 'log1p') || x === 0) return 60;
  return 60 + Math.max(0, Math.floor(-Math.log10(Math.abs(x))));
}

function exact(D: typeof Decimal, x: number): Decimal {
  return new D(x.toPrecision(40));
}

function reference(fn: Unary, x: number): number {
  const D = Decimal.clone({
    precision: digitsFor(fn, x),
    rounding: Decimal.ROUND_HALF_EVEN,
  });
  const v = exact(D, x);
  const r = {
    exp: () => D.exp(v),
    ln: () => D.ln(v),
    log10: () => D.log10(v),
    expm1: () => D.exp(v).minus(1),
    log1p: () => D.ln(new D(1).plus(v)),
  }[fn]();
  return Number(r.toString());
}

function referencePow(base: number, exponent: number): number {
  const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_EVEN });
  return Number(D.pow(exact(D, base), exact(D, exponent)).toString());
}

const UNARY = { exp, ln, log10, expm1, log1p } as const;

/** Finite-result domains, and boundary inputs at each domain's edges. */
const DOMAIN: Record<Unary, { min: number; max: number; edges: number[] }> = {
  exp: {
    min: -745,
    max: 709.78,
    edges: [-745, -744.44, -708.4, -1e-300, 5e-324, 1e-16, 1, 2, 709.78],
  },
  ln: {
    min: Number.MIN_VALUE,
    max: Number.MAX_VALUE,
    edges: [
      5e-324,
      2.2250738585072014e-308,
      0.9999999999999999,
      1.0000000000000002,
      2,
      10,
      Number.MAX_VALUE,
    ],
  },
  log10: {
    min: Number.MIN_VALUE,
    max: Number.MAX_VALUE,
    edges: [
      5e-324,
      1e-300,
      0.1,
      9.999999999999998,
      10,
      1e22,
      1e23,
      Number.MAX_VALUE,
    ],
  },
  expm1: {
    min: -50,
    max: 709.78,
    edges: [-50, -1e-300, -5e-324, 5e-324, 1e-300, 1e-10, 0.5, 1, 709.78],
  },
  log1p: {
    min: -0.9999999999999999,
    max: Number.MAX_VALUE,
    edges: [
      -0.9999999999999999,
      -0.5,
      -1e-300,
      5e-324,
      1e-300,
      1e-10,
      1,
      Number.MAX_VALUE,
    ],
  },
};

// Each random input costs one decimal.js reference at 60 digits or more,
// 0.24 ms (ln) to 0.31 ms (pow) measured alone, and more in the full suite;
// 300 a function keeps each test under 0.3 s of CPU there (#474: 2,000 took
// up to 1.6 s). Every run draws 300 new inputs.
const RANDOM_INPUTS = 300;

describe('det-math is within 2 ulp of a 60-digit reference', () => {
  for (const name of Object.keys(UNARY) as Unary[]) {
    const fn = UNARY[name];
    const { min, max, edges } = DOMAIN[name];

    for (const x of edges)
      it(`${name}(${String(x)}), at its domain edge`, () => {
        expect(
          ulps(fn(x), reference(name, x)),
          `${name}(${String(x)})`,
        ).toBeLessThanOrEqual(2n);
      });

    it(`${name} on ${String(RANDOM_INPUTS)} random inputs`, () => {
      fc.assert(
        fc.property(fc.double({ min, max, noNaN: true }), (x) => {
          expect(
            ulps(fn(x), reference(name, x)),
            `${name}(${String(x)})`,
          ).toBeLessThanOrEqual(2n);
        }),
        { numRuns: RANDOM_INPUTS },
      );
    });
  }

  it('pow(1.15, n) for every n in 0..5000, the Encounter cost curve', () => {
    // The reference walks the curve one multiplication a step instead of a
    // full pow for each n (#474: 14 ms against 326 ms, the same 5,001
    // doubles). Each step rounds to 60 digits, so 5,000 steps drift by
    // under 1e-55 relative, far inside an ulp.
    const D = Decimal.clone({
      precision: 60,
      rounding: Decimal.ROUND_HALF_EVEN,
    });
    const base = exact(D, 1.15);
    let want = new D(1);
    let worst = 0n;
    for (let n = 0; n <= 5000; n++) {
      const d = ulps(pow(1.15, n), Number(want.toString()));
      if (d > worst) worst = d;
      want = want.times(base);
    }
    expect(worst).toBeLessThanOrEqual(2n);
  });

  it(`pow on ${String(RANDOM_INPUTS)} random positive bases and real exponents`, () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1e-3, max: 1e3, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (base, exponent) => {
          expect(
            ulps(pow(base, exponent), referencePow(base, exponent)),
            `pow(${String(base)}, ${String(exponent)})`,
          ).toBeLessThanOrEqual(2n);
        },
      ),
      { numRuns: RANDOM_INPUTS },
    );
  });
});

describe('det-math special values follow ECMAScript exactly', () => {
  // Literal expectations, never `**` or Math.*: a fixture computed by the
  // engine under test cannot disagree with it.
  const cases: [string, () => number, number][] = [
    ['exp(NaN)', () => exp(NaN), NaN],
    ['exp(-0)', () => exp(-0), 1],
    ['exp(Infinity)', () => exp(Infinity), Infinity],
    ['exp(-Infinity)', () => exp(-Infinity), 0],
    ['exp(1000)', () => exp(1000), Infinity],
    ['exp(-1000)', () => exp(-1000), 0],
    ['ln(0)', () => ln(0), -Infinity],
    ['ln(-0)', () => ln(-0), -Infinity],
    ['ln(-1)', () => ln(-1), NaN],
    ['ln(1)', () => ln(1), 0],
    ['ln(Infinity)', () => ln(Infinity), Infinity],
    ['log10(0)', () => log10(0), -Infinity],
    ['log10(-1)', () => log10(-1), NaN],
    ['log10(1)', () => log10(1), 0],
    ['expm1(-0)', () => expm1(-0), -0],
    ['expm1(-Infinity)', () => expm1(-Infinity), -1],
    ['expm1(NaN)', () => expm1(NaN), NaN],
    ['log1p(-1)', () => log1p(-1), -Infinity],
    ['log1p(-2)', () => log1p(-2), NaN],
    ['log1p(-0)', () => log1p(-0), -0],
    ['pow(NaN, 0)', () => pow(NaN, 0), 1],
    ['pow(1, NaN)', () => pow(1, NaN), NaN],
    ['pow(1, Infinity)', () => pow(1, Infinity), NaN],
    ['pow(1, -Infinity)', () => pow(1, -Infinity), NaN],
    ['pow(-1, Infinity)', () => pow(-1, Infinity), NaN],
    ['pow(NaN, -0)', () => pow(NaN, -0), 1],
    ['pow(0, -1)', () => pow(0, -1), Infinity],
    ['pow(-0, -1)', () => pow(-0, -1), -Infinity],
    ['pow(-0, -2)', () => pow(-0, -2), Infinity],
    ['pow(-8, 1/3)', () => pow(-8, 1 / 3), NaN],
    ['pow(-2, 3)', () => pow(-2, 3), -8],
    ['pow(2, 1024)', () => pow(2, 1024), Infinity],
    ['pow(2, -1074)', () => pow(2, -1074), 5e-324],
  ];
  for (const [label, actual, expected] of cases) {
    it(label, () => {
      const value = actual();
      expect(Object.is(value, expected), `${label} = ${String(value)}`).toBe(
        true,
      );
    });
  }
});
