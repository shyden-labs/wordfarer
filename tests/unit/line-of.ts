import ts from 'typescript';

/**
 * The line a guard names (#417): the line an editor, `git grep -n` and
 * GitHub show. TypeScript's own getLineAndCharacterOfPosition also breaks
 * lines at U+2028 and U+2029, which none of them do, so a guard reading it
 * after one names a line too high (`packages/core/test/hash.test.ts` holds
 * two). This is the one home that counts lines; lineReadersIn refuses the
 * TypeScript call anywhere else.
 */

/** The one file that may count lines (#417). */
export const LINE_HOME = 'tests/unit/line-of.ts';

const READER = 'getLineAndCharacterOfPosition';

/** One plus the line feeds before `node` starts, as `git grep -n` counts. */
export function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  const start = node.getStart(sf);
  let line = 1;
  for (
    let feed = sf.text.indexOf('\n');
    feed !== -1 && feed < start;
    feed = sf.text.indexOf('\n', feed + 1)
  )
    line += 1;
  return line;
}

/** What lineReadersIn read: every member access, and the line readers among them. */
export interface LineReading {
  /** Property and element accesses examined, so an empty `readers` shows it looked. */
  readonly accesses: number;
  readonly readers: readonly string[];
}

/**
 * Every place `sf`'s code reaches TypeScript's line reader: a call, an
 * element access by its literal name, or the method handed on. Comments and
 * strings hold no identifiers, so prose naming it is not one.
 */
export function lineReadersIn(sf: ts.SourceFile): LineReading {
  const readers: string[] = [];
  let accesses = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      accesses += 1;
      const name = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : ts.isStringLiteralLike(node.argumentExpression)
          ? node.argumentExpression.text
          : undefined;
      if (name === READER)
        readers.push(
          `${sf.fileName}:${String(lineOf(sf, node))}: ${READER} outside ${LINE_HOME}; use lineOf(sf, node)`,
        );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { accesses, readers };
}
