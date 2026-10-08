import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Decimal } from 'decimal.js';
import { Num, type NumTuple } from '../src/num';

/**
 * Num: break_infinity values held to a canonical, serialisable form (#26 AC4).
 *
 * State stores a Num as a [mantissa, exponent] tuple, so one value must have
 * one tuple: 1 <= |mantissa| < 10 with a safe-integer exponent, or exactly
 * [0, 0]. break_infinity normalises with Math.floor(Math.log10(|m|)) and its
 * add() leaves m < 1 for the integer mantissas 999999999999999 and
 * 999999999999998 (measured on V8 and JavaScriptCore alike), so Num
 * renormalises every result.
 */

const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_EVEN });

function canonical([m, e]: NumTuple): boolean {
  if (m === 0) return Object.is(m, 0) && e === 0;
  return (
    Number.isFinite(m) &&
    Math.abs(m) >= 1 &&
    Math.abs(m) < 10 &&
    Number.isSafeInteger(e)
  );
}

function sameTuple(a: NumTuple, b: NumTuple): boolean {
  return Object.is(a[0], b[0]) && Object.is(a[1], b[1]);
}

/** The exact value of a tuple, as a 60-digit decimal. */
function exact([m, e]: NumTuple): Decimal {
  return new D(m.toPrecision(40)).times(D.pow(10, e));
}

function relativeError(actual: NumTuple, expected: Decimal): number {
  if (expected.isZero()) return actual[0] === 0 ? 0 : Infinity;
  return exact(actual).minus(expected).abs().div(expected.abs()).toNumber();
}

const mantissa = fc
  .tuple(
    fc.double({ min: 1, max: 10, maxExcluded: true, noNaN: true }),
    fc.boolean(),
  )
  .map(([m, negative]) => (negative ? -m : m));
const tupleArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant<NumTuple>([0, 0]) },
  {
    weight: 20,
    arbitrary: fc
      .tuple(mantissa, fc.integer({ min: -1000, max: 1000 }))
      .map((t): NumTuple => t),
  },
);
const positiveTuple = fc
  .tuple(
    fc.double({ min: 1, max: 10, maxExcluded: true, noNaN: true }),
    fc.integer({ min: -1000, max: 1000 }),
  )
  .map((t): NumTuple => t);

describe('the serialised form', () => {
  it('round-trips every canonical tuple exactly, through JSON too', () => {
    fc.assert(
      fc.property(tupleArb, (t) => {
        const out = Num.toTuple(Num.fromTuple(t));
        expect(sameTuple(out, t), JSON.stringify(t)).toBe(true);
        const viaJson = JSON.parse(JSON.stringify(out)) as NumTuple;
        expect(sameTuple(Num.toTuple(Num.fromTuple(viaJson)), t)).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  it.each<[string, NumTuple]>([
    ['a mantissa of 10', [10, 0]],
    ['a mantissa below 1', [0.5, 3]],
    ['a negative zero', [-0, 0]],
    ['zero with an exponent', [0, 3]],
    ['a NaN mantissa', [NaN, 0]],
    ['an infinite mantissa', [Infinity, 0]],
    ['a fractional exponent', [1, 0.5]],
    ['an unsafe exponent', [1, 2 ** 53]],
  ])('refuses %s', (_label, t) => {
    expect(() => Num.fromTuple(t)).toThrow(RangeError);
  });
});

describe('Num.from', () => {
  it.each([NaN, Infinity, -Infinity])('refuses %s', (x) => {
    expect(() => Num.from(x)).toThrow(RangeError);
  });

  it('maps both zeros to [0, 0]', () => {
    expect(sameTuple(Num.toTuple(Num.from(0)), [0, 0])).toBe(true);
    expect(sameTuple(Num.toTuple(Num.from(-0)), [0, 0])).toBe(true);
  });

  it('gives a canonical tuple within 2 parts in 2^52 of the input', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (x) => {
        const t = Num.toTuple(Num.from(x));
        expect(canonical(t), String(x)).toBe(true);
        expect(relativeError(t, new D(x.toPrecision(40)))).toBeLessThanOrEqual(
          2 * Number.EPSILON,
        );
      }),
      { numRuns: 2000 },
    );
  });
});

describe('arithmetic stays canonical and accurate', () => {
  it('renormalises the add() mantissa break_infinity leaves below 1', () => {
    // 5e14 + 4.99999999999999e14 = 999999999999999: break_infinity returns
    // [0.999999999999999, 15].
    const t = Num.toTuple(
      Num.add(Num.fromTuple([5, 14]), Num.fromTuple([4.99999999999999, 14])),
    );
    expect(canonical(t), JSON.stringify(t)).toBe(true);
    expect(t[1]).toBe(14);
    expect(relativeError(t, new D('999999999999999'))).toBeLessThanOrEqual(
      2 * Number.EPSILON,
    );
  });

  const OPS = [
    ['add', Num.add, (a: Decimal, b: Decimal) => a.plus(b)],
    ['sub', Num.sub, (a: Decimal, b: Decimal) => a.minus(b)],
    ['mul', Num.mul, (a: Decimal, b: Decimal) => a.times(b)],
  ] as const;

  for (const [name, op, ref] of OPS) {
    it(`${name} is canonical and within 1e-14 of the larger operand`, () => {
      fc.assert(
        fc.property(tupleArb, tupleArb, (a, b) => {
          const t = Num.toTuple(op(Num.fromTuple(a), Num.fromTuple(b)));
          expect(
            canonical(t),
            `${name}(${JSON.stringify(a)}, ${JSON.stringify(b)})`,
          ).toBe(true);
          const want = ref(exact(a), exact(b));
          // break_infinity adds at 15 significant digits, and a sum's error
          // is bounded by its larger operand, not by the (possibly tiny) sum.
          const scale =
            name === 'mul' ? want.abs() : D.max(exact(a).abs(), exact(b).abs());
          if (scale.isZero()) return;
          const err = exact(t).minus(want).abs().div(scale).toNumber();
          expect(err).toBeLessThanOrEqual(1e-14);
        }),
        { numRuns: 2000 },
      );
    });
  }

  it('div is canonical and within 1e-15, and refuses a zero divisor', () => {
    fc.assert(
      fc.property(tupleArb, positiveTuple, (a, b) => {
        const t = Num.toTuple(Num.div(Num.fromTuple(a), Num.fromTuple(b)));
        expect(canonical(t)).toBe(true);
        expect(relativeError(t, exact(a).div(exact(b)))).toBeLessThanOrEqual(
          1e-15,
        );
      }),
      { numRuns: 2000 },
    );
    expect(() => Num.div(Num.from(1), Num.from(0))).toThrow(RangeError);
  });
});

describe('Num.pow, built from det-math', () => {
  it('is canonical and within the derived bound 6e-16 x (|p| + |log10 result| + 2)', () => {
    // 200 random cases a run, each against 60-digit decimal.js (#474: 1,000
    // took 0.8 s of CPU), and every run draws 200 new ones.
    // Num.pow computes l = (e + log10 m) x p. log10 m carries up to 2 ulp
    // (2.2e-16) of absolute error, which p multiplies; rounding l adds half
    // an ulp of l; 10^frac adds 2 ulp. So the relative error is at most
    // ln 10 x 2.2e-16 x (|p| + |l|) + 6.6e-16 <= 6e-16 x (|p| + |l| + 2).
    // Measured over 60,000 random cases (2026-10-01): worst 0.79 of this
    // bound. A guessed (|l| + 1) x 1e-15 was exceeded (1.04 of it).
    fc.assert(
      fc.property(
        positiveTuple,
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        (a, p) => {
          const t = Num.toTuple(Num.pow(Num.fromTuple(a), p));
          expect(canonical(t)).toBe(true);
          const want = exact(a).pow(new D(p.toPrecision(40)));
          const l = Math.abs(want.log(10).toNumber());
          const bound = 6e-16 * (Math.abs(p) + l + 2);
          expect(relativeError(t, want)).toBeLessThanOrEqual(bound);
        },
      ),
      { numRuns: 200 },
    );
  });

  for (const k of [0, 1, 7, 300, 4000, -300])
    it(`gives 10^${String(k)} exactly`, () => {
      expect(Num.toTuple(Num.pow(Num.from(10), k))).toEqual([1, k]);
    });

  it('pins the bits of the cost curve far past 1e308', () => {
    // Golden values, measured 2026-10-01 and within the accuracy bound above
    // of decimal.js (3.0846206955449946e303, 6.0818451891827873e6069). Any
    // change to how Num.pow computes (Decimal.pow, Math.pow, another
    // det-math) moves these bits.
    expect(Num.toTuple(Num.pow(Num.from(1.15), 5000))).toEqual([
      3.0846206955449995, 303,
    ]);
    expect(Num.toTuple(Num.pow(Num.from(1.15), 100000))).toEqual([
      6.081845189176603, 6069,
    ]);
  });

  it('handles zero and refuses what has no real answer', () => {
    expect(Num.toTuple(Num.pow(Num.from(0), 3))).toEqual([0, 0]);
    expect(Num.toTuple(Num.pow(Num.from(0), 0))).toEqual([1, 0]);
    expect(Num.toTuple(Num.pow(Num.from(7), 0))).toEqual([1, 0]);
    expect(() => Num.pow(Num.from(0), -1)).toThrow(RangeError);
    expect(() => Num.pow(Num.from(-2), 2)).toThrow(RangeError);
    expect(() => Num.pow(Num.from(2), NaN)).toThrow(RangeError);
    expect(() => Num.pow(Num.from(2), Infinity)).toThrow(RangeError);
  });
});

describe('comparison and reading back', () => {
  it('cmp orders like the exact values', () => {
    fc.assert(
      fc.property(tupleArb, tupleArb, (a, b) => {
        expect(Num.cmp(Num.fromTuple(a), Num.fromTuple(b))).toBe(
          exact(a).cmp(exact(b)),
        );
      }),
      { numRuns: 2000 },
    );
  });

  it('log10 is the exponent plus det-math log10 of the mantissa', () => {
    expect(Num.log10(Num.fromTuple([1, 4000]))).toBe(4000);
    expect(Num.log10(Num.fromTuple([5, -3]))).toBeCloseTo(-2.30103, 5);
    expect(() => Num.log10(Num.from(0))).toThrow(RangeError);
    expect(() => Num.log10(Num.from(-1))).toThrow(RangeError);
  });

  it('toNumber reads back in range and saturates outside it', () => {
    expect(Num.toNumber(Num.fromTuple([1.5, 3]))).toBe(1500);
    expect(Num.toNumber(Num.fromTuple([1, 400]))).toBe(Infinity);
    expect(Num.toNumber(Num.fromTuple([1, -400]))).toBe(0);
  });
});
