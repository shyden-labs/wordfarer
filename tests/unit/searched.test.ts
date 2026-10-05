import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';

/**
 * `searched` puts the population a finding list was drawn from inside the
 * assertion itself (#361): `expect(findings).toEqual([])` is green both when
 * a guard read everything and found nothing and when it read nothing at all.
 * Each search here checks its population's floor like any other.
 */

describe('searched', () => {
  it('returns the findings it was given, untouched', () => {
    const findings = ['a finding'];
    const units = ['a unit'];
    expect(searched(findings, { of: units, what: 'units' })).toBe(findings);
    expect(floorBreach('searched/untouched', units.length)).toBeUndefined();
  });

  it('passes an empty finding list over a live population', () => {
    const units = ['a unit', 'another'];
    expect(searched([], { of: units, what: 'units' })).toEqual([]);
    expect(floorBreach('searched/live', units.length)).toBeUndefined();
  });

  it('passes a count of at least one', () => {
    const count = 3;
    expect(searched([], { of: count, what: 'units' })).toEqual([]);
    expect(floorBreach('searched/count', count)).toBeUndefined();
  });

  // Members that are values a guard could be hunting, so they count.
  it.each([
    ['zero', 0],
    ['false', false],
    ['a non-blank string', 'x'],
    ['a list holding something', [0]],
    ['an object holding a key', { k: undefined }],
    ['a set holding something', new Set([0])],
    ['a map holding something', new Map([[0, 0]])],
  ])('counts %s as a live member', (_what, member) => {
    const members = [member];
    expect(searched([], { of: members, what: 'units' })).toEqual([]);
    expect(floorBreach('searched/member', members.length)).toBeUndefined();
  });

  it('refuses an empty population, naming it', () => {
    expect(() => searched([], { of: [], what: 'built pages' })).toThrow(
      /searched no built pages/,
    );
  });

  // Six blank headers are six entries and no content (#112 in shyden.co.uk):
  // a population of empties is as dead as an empty one.
  it.each([
    ['a blank string', '  '],
    ['an empty string', ''],
    ['an empty list', []],
    ['an empty object', {}],
    ['an empty set', new Set()],
    ['an empty map', new Map()],
    ['null', null],
    ['undefined', undefined],
  ])('refuses a population whose only member is %s', (_what, member) => {
    expect(() => searched([], { of: [member], what: 'rows' })).toThrow(
      /searched no rows/,
    );
  });

  it.each([
    ['zero', 0],
    ['a negative count', -1],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
  ])('refuses %s as a count', (_what, count) => {
    expect(() => searched([], { of: count, what: 'rows' })).toThrow(
      /searched no rows/,
    );
  });
});
