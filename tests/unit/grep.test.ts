import { describe, expect, it } from 'vitest';
import { grepLines } from './grep';

/**
 * Lines holding a fixed string, found in-process as `git grep -n -F` finds
 * them (#491), so no unit test starts git to grep. The same reads are
 * compared with git grep itself in tests/integration/grep.test.ts.
 */
describe('grepLines', () => {
  it.each([
    [
      'each line holding the needle, numbered from 1',
      'a\nxb\nc x\n',
      ['x'],
      {},
      [
        { line: 2, text: 'xb' },
        { line: 3, text: 'c x' },
      ],
    ],
    [
      'a line holding any of several needles once',
      'ab\nb\nc\n',
      ['a', 'b'],
      {},
      [
        { line: 1, text: 'ab' },
        { line: 2, text: 'b' },
      ],
    ],
    ['no line when nothing holds the needle', 'a\nb\n', ['z'], {}, []],
    [
      'the needle as text, not a pattern',
      'a.c\nabc\n',
      ['a.c'],
      {},
      [{ line: 1, text: 'a.c' }],
    ],
    [
      'a last line with no newline',
      'a\nx',
      ['x'],
      {},
      [{ line: 2, text: 'x' }],
    ],
    [
      'a carriage return as part of its line',
      'x\r\ny\n',
      ['x'],
      {},
      [{ line: 1, text: 'x\r' }],
    ],
    [
      'no other case without ignoreCase',
      'X\nx\n',
      ['x'],
      {},
      [{ line: 2, text: 'x' }],
    ],
    [
      'any case with ignoreCase',
      'X\nx\ny\n',
      ['x'],
      { ignoreCase: true },
      [
        { line: 1, text: 'X' },
        { line: 2, text: 'x' },
      ],
    ],
  ] as const)('finds %s', (_what, text, needles, options, expected) => {
    expect(grepLines(text, needles, options)).toEqual(expected);
  });

  it('refuses an empty needle, which git grep matches on every line', () => {
    expect(() => grepLines('a\n', [''])).toThrow('empty needle');
  });

  it('refuses no needles at all', () => {
    expect(() => grepLines('a\n', [])).toThrow('no needle');
  });
});
