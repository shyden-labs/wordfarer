import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { grepLines } from './grep';
import { LINE_HOME, lineOf, lineReadersIn } from './line-of';
import { committableFiles } from './tracked-files';

/**
 * Guards name the line an editor, `git grep -n` and GitHub show (#417).
 * TypeScript's own getLineAndCharacterOfPosition also breaks lines at U+2028
 * and U+2029, so a guard reading it after one names a line too high.
 */

// Built in code, never typed as escapes: these bytes are what is tested.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const FIXTURE =
  [
    `const a = 'x${LS}y';`,
    `const b = 'x${PS}y';`,
    `const c = 'x${LS}${PS}y';`,
    'const d = 1;',
  ].join('\r\n') + '\r\n';

const parse = (path: string, text: string): ts.SourceFile =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);

/** The statement declaring `name`. */
const declared = (sf: ts.SourceFile, name: string): ts.Statement => {
  const found = sf.statements.find(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) && declaration.name.text === name,
      ),
  );
  if (found === undefined) throw new Error(`the fixture declares no ${name}`);
  return found;
};

describe('lineOf: the line git grep -n gives (#417 AC2)', () => {
  it('reads a fixture holding U+2028, U+2029 and CRLF line ends', () => {
    expect(FIXTURE.split(LS)).toHaveLength(3);
    expect(FIXTURE.split(PS)).toHaveLength(3);
    expect(FIXTURE.split('\r\n')).toHaveLength(5);
  });

  it.each([
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
  ] as const)('puts %s on line %i', (name, line) => {
    const sf = parse('fixture.ts', FIXTURE);
    expect(lineOf(sf, declared(sf, name))).toBe(line);
  });
});

describe('lineOf over a real file whose strings hold U+2028 (#417 AC2)', () => {
  it('names every test call in hash.test.ts on the line git grep -n gives', () => {
    const path = 'packages/core/test/hash.test.ts';
    const sf = parse(path, readFileSync(path, 'utf8'));
    const calls: ts.CallExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'it'
      )
        calls.push(node);
      ts.forEachChild(node, visit);
    };
    visit(sf);
    // Each call's first line names its test. A fixed-string grep finds them
    // all in-process, numbering lines as git grep -n does, at \n alone
    // (#491; tests/integration/grep.test.ts compares it with git grep).
    const firsts = calls.map((call) => call.getText(sf).split('\n')[0] ?? '');
    const hits = grepLines(sf.text, firsts);
    const differ = calls.flatMap((call, index) => {
      const first = firsts[index] ?? '';
      const lines = hits
        .filter(({ text }) => text.includes(first))
        .map(({ line }) => line);
      const line = lineOf(sf, call);
      return lines.length === 1 && lines[0] === line
        ? []
        : [
            `${first}: grep -n says ${lines.join(', ')}, lineOf ${String(line)}`,
          ];
    });
    expect(
      searched(differ, { of: calls, what: 'test calls in hash.test.ts' }),
    ).toEqual([]);
    expect(
      floorBreach('line-of/hash-test-calls', calls.length),
    ).toBeUndefined();
    // Liveness: past the first U+2028 is where TypeScript's own count differs.
    const after = calls.filter(
      (call) => call.getStart(sf) > sf.text.indexOf(LS),
    );
    expect(
      floorBreach('line-of/hash-test-calls-after-u2028', after.length),
    ).toBeUndefined();
  });
});

describe('no guard asks TypeScript for a line outside the one home (#417 AC1)', () => {
  const REFUSAL = `getLineAndCharacterOfPosition outside ${LINE_HOME}; use lineOf(sf, node)`;

  it.each([
    ['a method call', 'sf.getLineAndCharacterOfPosition(0);'],
    ["TypeScript's own function", 'ts.getLineAndCharacterOfPosition(sf, 0);'],
    ['an element access', "sf['getLineAndCharacterOfPosition'](0);"],
    ['the method handed on', 'const at = sf.getLineAndCharacterOfPosition;'],
  ])('refuses %s', (_what, source) => {
    expect(lineReadersIn(parse('tests/unit/x.ts', source))).toEqual({
      accesses: 1,
      readers: [`tests/unit/x.ts:1: ${REFUSAL}`],
    });
  });

  it.each([
    [
      'the name in a comment',
      '// getLineAndCharacterOfPosition counts U+2028',
      0,
    ],
    ['the name in a string', "const s = 'getLineAndCharacterOfPosition';", 0],
    ['another member', 'sf.getStart();', 1],
  ] as const)('reads %s as no reader', (_what, source, accesses) => {
    expect(lineReadersIn(parse('tests/unit/x.ts', source))).toEqual({
      accesses,
      readers: [],
    });
  });

  it('finds none in any TypeScript file git has', () => {
    const files = committableFiles(['*.ts', '*.mts', '*.cts', '*.tsx']).filter(
      (path) => existsSync(path),
    );
    const readings = files
      .filter((path) => path !== LINE_HOME)
      .map((path) => lineReadersIn(parse(path, readFileSync(path, 'utf8'))));
    const findings = readings.flatMap(({ readers }) => readers);
    expect(
      searched(findings, { of: files, what: 'TypeScript files git has' }),
    ).toEqual([]);
    expect(
      floorBreach('line-of/typescript-files', files.length),
    ).toBeUndefined();
    // Liveness: a reader blind to member access would read none.
    const accesses = readings.reduce(
      (sum, reading) => sum + reading.accesses,
      0,
    );
    expect(floorBreach('line-of/accesses', accesses)).toBeUndefined();
  });
});
