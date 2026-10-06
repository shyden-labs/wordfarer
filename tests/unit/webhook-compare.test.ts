import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';

/**
 * The webhook verifier compares digests in constant time (#341, website spec
 * §8): `crypto.subtle.timingSafeEqual`, never `===`. A timing property is not
 * something a unit test can measure, so this reads `verifySignature`'s parse
 * tree instead: exactly one `timingSafeEqual` call, and every equality
 * operator in it judged. One is allowed only where neither side can be a
 * digest: a `.length`/`.byteLength`, a literal, or `undefined`.
 *
 * The comparisons are counted twice: by the parse tree, and by TypeScript's
 * scanner over the function's text (which skips comments), so a reader blind
 * to one operator, or one form of comparison, is caught by the other count.
 */
const ROOT = new URL('../..', import.meta.url).pathname;
const FILE = 'apps/site/worker/webhook.ts';
const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

interface Reading {
  /** The function's text, from its first token to its end. */
  text: string;
  /** Every equality comparison, as written. */
  comparisons: ts.BinaryExpression[];
  /** Calls to crypto.subtle.timingSafeEqual. */
  constantTime: number;
}

/** `verifySignature` in `source`, read; refused by name when it is not one function. */
function readVerifier(source: string): Reading {
  const file = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true);
  const functions = file.statements.filter(
    (s): s is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(s) && s.name?.text === 'verifySignature',
  );
  const verifier = functions[0];
  if (functions.length !== 1 || verifier?.body === undefined)
    throw new Error(
      `${FILE} declares verifySignature ${String(functions.length)} times with a body; expected once`,
    );
  const comparisons: ts.BinaryExpression[] = [];
  let constantTime = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && EQUALITY.has(node.operatorToken.kind))
      comparisons.push(node);
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === 'crypto.subtle.timingSafeEqual'
    )
      constantTime += 1;
    ts.forEachChild(node, visit);
  };
  visit(verifier.body);
  return {
    text: source.slice(verifier.getStart(file), verifier.end),
    comparisons,
    constantTime,
  };
}

/** Equality tokens in `text` by TypeScript's scanner, comments skipped. */
function scannedEqualities(text: string): number {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true);
  scanner.setText(text);
  let count = 0;
  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  )
    if (EQUALITY.has(token)) count += 1;
  return count;
}

/** A side that cannot be a digest: a length, a literal, or `undefined`. */
function harmless(side: ts.Expression): boolean {
  return (
    (ts.isPropertyAccessExpression(side) &&
      ['length', 'byteLength'].includes(side.name.text)) ||
    ts.isLiteralExpression(side) ||
    side.kind === ts.SyntaxKind.NullKeyword ||
    side.kind === ts.SyntaxKind.TrueKeyword ||
    side.kind === ts.SyntaxKind.FalseKeyword ||
    (ts.isIdentifier(side) && side.text === 'undefined')
  );
}

/** The comparisons that could be comparing digests, as written. */
function unsafeComparisons(reading: Reading): string[] {
  return reading.comparisons
    .filter((c) => !harmless(c.left) && !harmless(c.right))
    .map((c) => c.getText());
}

describe('the webhook verifier compares digests in constant time (#341)', () => {
  const source = readFileSync(`${ROOT}${FILE}`, 'utf8');

  it('calls crypto.subtle.timingSafeEqual exactly once', () => {
    expect(readVerifier(source).constantTime).toBe(1);
  });

  it('counts the same comparisons by parse tree and by scanner', () => {
    const reading = readVerifier(source);
    expect(reading.comparisons).toHaveLength(scannedEqualities(reading.text));
  });

  it('compares nothing that could be a digest with an equality operator, at the recorded floor', () => {
    const reading = readVerifier(source);
    const compared = reading.comparisons.map((c) => c.getText());
    expect(
      searched(unsafeComparisons(reading), {
        of: compared,
        what: 'comparisons in verifySignature',
      }),
    ).toEqual([]);
    expect(
      floorBreach('webhook-compare/comparisons', compared.length),
    ).toBeUndefined();
  });
});

describe('the reader itself (#341)', () => {
  const wrap = (body: string) =>
    `export async function verifySignature(a: string, b: string) {\n${body}\n}\n`;

  it('finds a digest compared with ===', () => {
    expect(unsafeComparisons(readVerifier(wrap('  return a === b;')))).toEqual([
      'a === b',
    ]);
  });

  it('finds a digest compared with != inside a nested arrow', () => {
    expect(
      unsafeComparisons(
        readVerifier(wrap('  return [a].some((x) => x != b);')),
      ),
    ).toEqual(['x != b']);
  });

  it('allows a length, a literal and undefined, at the recorded floor', () => {
    const reading = readVerifier(
      wrap("  if (a.length === 0 || b === undefined || a !== 'x') return;"),
    );
    const compared = reading.comparisons.map((c) => c.getText());
    expect(
      searched(unsafeComparisons(reading), {
        of: compared,
        what: 'comparisons in the written verifier',
      }),
    ).toEqual([]);
    expect(
      floorBreach('webhook-compare/allowed-forms', compared.length),
    ).toBeUndefined();
  });

  it('does not count an operator inside a comment, by either reading', () => {
    const reading = readVerifier(
      wrap('  // a === b\n  return a.length === 1;'),
    );
    expect(reading.comparisons).toHaveLength(1);
    expect(scannedEqualities(reading.text)).toBe(1);
  });

  it('refuses a file with no verifySignature, by name', () => {
    expect(() => readVerifier('export const x = 1;')).toThrow(
      'apps/site/worker/webhook.ts declares verifySignature 0 times with a body; expected once',
    );
  });
});
