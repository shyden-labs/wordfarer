import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import {
  applyVariant,
  LEVERS,
  VARIANTS,
} from '../../scripts/balance-variants.ts';

/**
 * The robustness sweep's variants (#35 AC9), against the real `balance.ts`:
 * each moves only its lever, by its factor, so a reshaped file fails here
 * rather than letting the sweep replay an unchanged balance.
 */

const BALANCE = 'packages/core/src/balance.ts';

/** The indices of the lines of `after` that differ from `before`. */
function changedLines(before: string, after: string): number[] {
  const a = before.split('\n');
  return after.split('\n').flatMap((line, i) => (line === a[i] ? [] : [i]));
}

/** The indices of the lines `pattern` matches in `source`. */
function matchedLines(source: string, pattern: RegExp): Set<number> {
  const lines = new Set<number>();
  // runtime population: the matches the lever's pattern finds.
  for (const m of source.matchAll(pattern)) {
    const first = source.slice(0, m.index).split('\n').length - 1;
    const count = m[0].split('\n').length;
    for (let k = 0; k < count; k += 1) lines.add(first + k);
  }
  return lines;
}

/** The lever variants, written out: a population known before the run. */
const LEVER_VARIANTS = [
  'goals x0.9',
  'goals x1.1',
  'rankBonus x0.9',
  'rankBonus x1.1',
  'floorShare x0.9',
  'floorShare x1.1',
  'duplicateInsight x0.9',
  'duplicateInsight x1.1',
  'phrasebook x0.9',
  'phrasebook x1.1',
  'listen x0.9',
  'listen x1.1',
];

describe('the sweep variants', () => {
  it('are the baseline and every lever at x0.9 and x1.1', () => {
    expect(VARIANTS.map((v) => v.name)).toEqual([
      'baseline',
      ...LEVER_VARIANTS,
    ]);
    expect(LEVERS.map((l) => l.name)).toEqual([
      'goals',
      'rankBonus',
      'floorShare',
      'duplicateInsight',
      'phrasebook',
      'listen',
    ]);
    expect(VARIANTS).toHaveLength(13);
  });

  it('leave the balance unchanged for the baseline', () => {
    const source = readFileSync(BALANCE, 'utf8');
    expect(
      applyVariant(source, { name: 'baseline', lever: undefined, factor: 1 }),
    ).toBe(source);
  });

  it.each(LEVER_VARIANTS)('%s changes only its own lever’s lines', (name) => {
    const variant = VARIANTS.find((v) => v.name === name);
    const lever = LEVERS.find((l) => l.name === variant?.lever);
    if (variant === undefined || lever === undefined) throw new Error(name);
    const source = readFileSync(BALANCE, 'utf8');
    const changed = changedLines(source, applyVariant(source, variant));
    const allowed = matchedLines(source, lever.pattern);
    expect(changed.length).toBeGreaterThan(0);
    const strays = changed.filter((line) => !allowed.has(line));
    expect(searched(strays, { of: changed, what: 'changed lines' })).toEqual(
      [],
    );
    expect(
      floorBreach(`balance-variants/changed-lines/${name}`, changed.length),
    ).toBeUndefined();
  });

  it('scales a value by its factor', () => {
    const scaled = applyVariant('    floorShare: 0.5,\n', {
      name: 'floorShare x1.1',
      lever: 'floorShare',
      factor: 1.1,
    });
    expect(scaled).toBe(`    floorShare: ${String(0.5 * 1.1)},\n`);
  });

  it('scales every value of a list, underscores read', () => {
    const scaled = applyVariant('    goals: [1_000, 2e21],\n', {
      name: 'goals x0.9',
      lever: 'goals',
      factor: 0.9,
    });
    expect(scaled).toBe(
      `    goals: [${String(1000 * 0.9)}, ${String(2e21 * 0.9)}],\n`,
    );
  });

  it('refuses a lever matched the wrong number of times, by name', () => {
    expect(() =>
      applyVariant('const x = 1;', {
        name: 'listen x0.9',
        lever: 'listen',
        factor: 0.9,
      }),
    ).toThrow('listen matched 0 times in balance.ts, not 1');
  });
});
