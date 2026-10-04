import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/balance';
import {
  resolveCourse,
  type CourseData,
  type EncounterData,
  type RegionData,
} from '../src/course';

/**
 * The Encounter ladder (#35 AC8): content places each Encounter on a tier,
 * and `balance.ts` prices it, so every course, synthetic or real, plays on
 * the ladder the pacing bots tuned. The course is declared here rather than
 * generated, so it is checked against the `CourseData` contract.
 */

function region(id: string, encounters: readonly EncounterData[]): RegionData {
  return {
    id,
    destinations: [
      {
        id: `${id}-d0`,
        lexicon: [{ id: `${id}-w0`, tags: ['food'], cefr: 'A1' }],
      },
    ],
    encounters,
    cardSets: [{ id: `${id}-set`, bonus: 0.25 }],
    cultureCards: [],
    grammarNodes: [],
  };
}

function course(regions: readonly RegionData[]): CourseData {
  return { id: 'ladder-course', tags: ['food'], regions };
}

const threeRegions = (): CourseData =>
  course([
    region('r0', [
      { id: 'tea', tags: ['food'], tier: 1 },
      { id: 'palace', tags: ['food'], tier: 6 },
    ]),
    region('r1', [{ id: 'inn', tags: ['food'], tier: 2 }]),
    region('r2', [{ id: 'port', tags: ['food'], tier: 6 }]),
  ]);

describe('the ladder in balance.ts', () => {
  it('prices the six tiers 12x apart and yields them 8x apart', () => {
    expect(BALANCE.encounters.ladder).toEqual([
      { c0: 10, p0: 0.5 },
      { c0: 120, p0: 4 },
      { c0: 1_440, p0: 32 },
      { c0: 17_280, p0: 256 },
      { c0: 207_360, p0: 2_048 },
      { c0: 2_488_320, p0: 16_384 },
    ]);
  });

  it('steps each region 1000x above the one before', () => {
    expect(BALANCE.encounters.regionScale).toEqual([1, 1_000, 1_000_000]);
  });
});

describe('resolveCourse prices each Encounter from its tier and region', () => {
  it('gives region 0’s tier 1 the ladder’s first rung', () => {
    expect(resolveCourse(threeRegions()).regions[0]?.encounters[0]).toEqual({
      id: 'tea',
      tags: ['food'],
      c0: 10,
      p0: 0.5,
    });
  });

  it('gives region 0’s tier 6 the ladder’s last rung', () => {
    expect(resolveCourse(threeRegions()).regions[0]?.encounters[1]).toEqual({
      id: 'palace',
      tags: ['food'],
      c0: 2_488_320,
      p0: 16_384,
    });
  });

  it('scales region 1’s tier 2 by 1000', () => {
    expect(resolveCourse(threeRegions()).regions[1]?.encounters[0]).toEqual({
      id: 'inn',
      tags: ['food'],
      c0: 120_000,
      p0: 4_000,
    });
  });

  it('scales region 2’s tier 6 by a million', () => {
    expect(resolveCourse(threeRegions()).regions[2]?.encounters[0]).toEqual({
      id: 'port',
      tags: ['food'],
      c0: 2_488_320_000_000,
      p0: 16_384_000_000,
    });
  });

  it('keeps everything else as content gives it', () => {
    const data = threeRegions();
    const resolved = resolveCourse(data);
    const withoutEncounters = (c: { readonly regions: readonly object[] }) =>
      c.regions.map((r) => ({ ...r, encounters: undefined }));
    expect(resolved.id).toBe('ladder-course');
    expect(resolved.tags).toEqual(['food']);
    expect(withoutEncounters(resolved)).toEqual(withoutEncounters(data));
  });

  it('carries no tier into the course core plays', () => {
    const keys = resolveCourse(threeRegions()).regions.flatMap((r) =>
      r.encounters.flatMap((e) => Object.keys(e)),
    );
    expect(keys.filter((k) => k === 'tier')).toEqual([]);
    expect(keys.filter((k) => k === 'c0')).toHaveLength(4);
  });
});

describe('resolveCourse refuses what the ladder cannot price, by name', () => {
  it.each([0, 7, 1.5, -1, Number.NaN, Infinity])('refuses tier %s', (tier) => {
    const data = course([
      region('r0', [{ id: 'odd', tags: ['food'], tier } as EncounterData]),
    ]);
    expect(() => resolveCourse(data)).toThrow(
      /Encounter odd has tier .*, not 1 to 6/,
    );
  });

  it('refuses a fourth region, which the ladder has no step for', () => {
    const data = course([
      ...threeRegions().regions,
      region('r3', [{ id: 'far', tags: ['food'], tier: 1 }]),
    ]);
    expect(() => resolveCourse(data)).toThrow(
      /region r3 \(3\) has no step in BALANCE\.encounters\.regionScale/,
    );
  });
});
