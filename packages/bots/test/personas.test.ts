import { describe, expect, it } from 'vitest';
import { CASUAL_SEED, PERSONAS, persona } from '../src/personas';

/** The personas (#35 AC1, M1 design §6), each fact written out. */

describe('the personas', () => {
  it('are the five asserted and the two report-only buyers, in order', () => {
    expect(PERSONAS.map((p) => `${p.name}:${String(p.asserted)}`)).toEqual([
      'idler:true',
      'casual:true',
      'diligent:true',
      'clicker:true',
      'nonlearner:true',
      'capped:false',
      'random:false',
    ]);
  });

  it('the Idler opens twice a day for 2 minutes and never reviews', () => {
    expect(persona('idler')).toMatchObject({
      opensPerDay: 2,
      openMinutes: 2,
      reviews: false,
      tapsPerSecond: 0,
      buys: { kind: 'greedy' },
    });
  });

  it('the Casual Learner opens 3 times a day for 5 minutes and reviews', () => {
    expect(persona('casual')).toMatchObject({
      opensPerDay: 3,
      openMinutes: 5,
      reviews: true,
      tapsPerSecond: 0,
      buys: { kind: 'greedy' },
      checkMs: 30_000,
      seed: CASUAL_SEED,
    });
  });

  it('the Diligent Learner opens 5 times a day for 8 minutes and reviews', () => {
    expect(persona('diligent')).toMatchObject({
      opensPerDay: 5,
      openMinutes: 8,
      reviews: true,
      tapsPerSecond: 0,
    });
  });

  it('the Clicker is the Casual Learner tapping Listen 10 times a second', () => {
    expect(persona('clicker')).toEqual({
      ...persona('casual'),
      name: 'clicker',
      tapsPerSecond: 10,
    });
  });

  it('the Non-learner is the Casual Learner never reviewing', () => {
    expect(persona('nonlearner')).toEqual({
      ...persona('casual'),
      name: 'nonlearner',
      reviews: false,
    });
  });

  it('the Capped Buyer is the Casual Learner making at most 5 purchases per 2-minute check', () => {
    expect(persona('capped')).toEqual({
      ...persona('casual'),
      name: 'capped',
      buys: { kind: 'capped', max: 5 },
      checkMs: 120_000,
      asserted: false,
    });
  });

  it('the Random Buyer is the Casual Learner buying at random', () => {
    expect(persona('random')).toEqual({
      ...persona('casual'),
      name: 'random',
      buys: { kind: 'random' },
      asserted: false,
    });
  });

  it('gives the Idler and the Diligent Learner seeds of their own', () => {
    const seeds = PERSONAS.map((p) => p.seed);
    expect(seeds.filter((s) => s === CASUAL_SEED)).toHaveLength(5);
    expect(persona('idler').seed).not.toBe(CASUAL_SEED);
    expect(persona('diligent').seed).not.toBe(CASUAL_SEED);
  });

  it('refuses an unknown persona by name', () => {
    expect(() => persona('nobody')).toThrow('no persona named nobody');
  });
});
