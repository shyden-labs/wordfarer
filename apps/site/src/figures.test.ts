import { describe, expect, it } from 'vitest';
import { BALANCE, RANKS } from '@yawelo-idle/core';
import { CopyLine, line, t } from './copy-line';
import {
  digits,
  duration,
  rankList,
  rankName,
  valueAt,
  words,
} from './figures';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('valueAt', () => {
  it('reads a value by its dotted key from the game tables', () => {
    expect(valueAt('BALANCE.memory.queueSize')).toBe(BALANCE.memory.queueSize);
  });

  it('reads the last element of an array at -1', () => {
    expect(valueAt('T.list.-1', { T: { list: [1, 2, 3] } })).toBe(3);
  });

  it('refuses a key that names nothing, by the key', () => {
    expect(() => valueAt('BALANCE.memory.queueSise')).toThrow(
      'BALANCE.memory.queueSise names nothing in the game tables',
    );
  });
});

describe('digits: a figure that updates by itself (#443 AC2)', () => {
  it('shows the value as it is today', () => {
    expect(digits('BALANCE.memory.queueSize').text).toBe(
      String(BALANCE.memory.queueSize),
    );
  });

  it('shows a changed value without going red', () => {
    const figure = digits('T.queueSize', { T: { queueSize: 12 } });
    expect([figure.text, figure.missing]).toEqual(['12', undefined]);
  });

  it('refuses a value that is not a whole number', () => {
    expect(() => digits('T.share', { T: { share: 0.8 } })).toThrow(
      'T.share is 0.8, not a whole number to show as digits',
    );
  });
});

describe('duration: digits with a unit', () => {
  it.each<[number, string]>([
    [MINUTE, '1 minute'],
    [30 * MINUTE, '30 minutes'],
    [HOUR, '1 hour'],
    [2 * HOUR, '2 hours'],
    [24 * HOUR, '1 day'],
    [72 * HOUR, '3 days'],
    [90 * MINUTE, '90 minutes'],
  ])('%d ms reads %s', (ms, text) => {
    expect(duration('T.ms', { T: { ms } }).text).toBe(text);
  });

  it('refuses a duration that is not whole minutes', () => {
    expect(() => duration('T.ms', { T: { ms: 1_500 } })).toThrow(
      'T.ms is 1500 ms, not whole minutes',
    );
  });
});

describe('words: a figure that goes red when it changes (#443 AC3)', () => {
  it('shows the approved words for the value', () => {
    const figure = words(
      'T.share',
      { '0.8': 'four fifths' },
      {
        T: { share: 0.8 },
      },
    );
    expect([figure.text, figure.missing]).toEqual(['four fifths', undefined]);
  });

  it('names the key, both values and what to do when the value has no words', () => {
    expect(
      words('T.share', { '0.8': 'four fifths' }, { T: { share: 0.75 } })
        .missing,
    ).toBe(
      'T.share is 0.75, and the copy has words only for 0.8: write the ' +
        'words for 0.75, have Shyden approve them, and update the ' +
        'Indonesian (#338)',
    );
  });

  it('shows the key in the text while it is missing, never stale words', () => {
    expect(
      words('T.share', { '0.8': 'four fifths' }, { T: { share: 0.75 } }).text,
    ).toBe('[T.share = 0.75]');
  });
});

describe('ranks', () => {
  it('names a rank as the site shows it', () => {
    expect(rankName('RANKS.1').text).toBe('Recognised');
  });

  it('lists the ranks in order, joined as a sentence', () => {
    expect(
      rankList('T.ranks', { T: { ranks: ['heard', 'fluent', 'mastered'] } })
        .text,
    ).toBe('Heard, Fluent and Mastered');
  });

  it('lists every rank the game has', () => {
    expect(rankList('RANKS').text.split(/, | and /u)).toHaveLength(
      RANKS.length,
    );
  });
});

describe('t: a line with figures in it', () => {
  it('shows the figures in place', () => {
    const l = line(
      t`never more than ${digits('T.n', { T: { n: 10 } })} reviews`,
      'DN23',
    );
    expect(l.text).toBe('never more than 10 reviews');
  });

  it('keeps the figures, in order', () => {
    const first = digits('T.a', { T: { a: 1 } });
    const second = digits('T.b', { T: { b: 2 } });
    expect(line(t`${first} and ${second}`, 'D1').figures).toEqual([
      first,
      second,
    ]);
  });

  it('takes every figure out of the text the source checks read', () => {
    expect(
      line(t`at most ${digits('T.n', { T: { n: 10 } })} reviews`, 'DN23')
        .unbound,
    ).toBe('at most · reviews');
  });

  it('a plain line has no figures and reads the same unbound', () => {
    const l = new CopyLine('No ads, ever.', ['DN14']);
    expect([l.figures, l.unbound]).toEqual([[], 'No ads, ever.']);
  });
});
