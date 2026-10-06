import { closing, topLevelArguments } from './absence-text';

/**
 * The cross-check on `literal-floors.ts`, read from text (#378).
 *
 * The reader walks the parse tree; this counts the same calls in a file's
 * code with every literal and comment removed (`codeWithoutLiterals`), by
 * balancing brackets, and shares no list with it: a matcher the reader
 * stops seeing still shows here, so a file whose two counts differ is a
 * finding.
 */

/** A comparison matcher called: `.toBeGreaterThan(`, `.not.toBeLessThanOrEqual (`. */
const COMPARISON = /\.\s*toBe(?:Greater|Less)Than(?:OrEqual)?\s*\(/g;

/** A number as written: decimal with separators and exponent, hex, binary, octal, bigint. */
const NUMBER =
  /^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)n?$/;

/** `text` with wrapping parentheses and one leading sign removed, repeatedly. */
function unwrapped(text: string): string {
  let at = text.trim();
  for (;;) {
    if (at.startsWith('(') && closing(at, 0) === at.length - 1)
      at = at.slice(1, -1).trim();
    else if (/^[+-]/.test(at)) at = at.slice(1).trim();
    else return at;
  }
}

/** The arguments of each comparison `code` calls. */
const comparisonArguments = (code: string): string[][] =>
  [...code.matchAll(COMPARISON)].map((match) => {
    const open = match.index + match[0].length - 1;
    const close = closing(code, open);
    return close === -1 ? [] : topLevelArguments(code.slice(open + 1, close));
  });

/** How many comparison matchers `code` calls (literals and comments already removed). */
export const comparisonsWritten = (code: string): number =>
  comparisonArguments(code).length;

/** How many of them take a single number written in place. */
export const literalArgumentsWritten = (code: string): number =>
  comparisonArguments(code).filter(
    (args) => args.length === 1 && NUMBER.test(unwrapped(args[0] as string)),
  ).length;
