/**
 * The pacing personas (M1 design §6, #35 AC1): who opens the game, how often
 * and for how long, whether they review, and how they buy. Every persona
 * starts with one 60-minute first session.
 */

/** How a persona spends Understanding at each check of an open. */
export type BuyStyle =
  /** One unit at a time by best payback, until nothing is affordable. */
  | { readonly kind: 'greedy' }
  /** By best payback, at most `max` purchases per check (the Capped Buyer). */
  | { readonly kind: 'capped'; readonly max: number }
  /** Uniformly among the affordable offers, from its own stream (the Random Buyer). */
  | { readonly kind: 'random' };

export interface Persona {
  readonly name: string;
  /** Opens per day after the first session. */
  readonly opensPerDay: number;
  readonly openMinutes: number;
  /** Whether it answers every due review. */
  readonly reviews: boolean;
  /** Listen taps a second throughout each open (the Clicker). */
  readonly tapsPerSecond: number;
  readonly buys: BuyStyle;
  /** How often an open checks to buy and to sail, in milliseconds. */
  readonly checkMs: number;
  /** Seeds the game and the persona's streams; shared to isolate one difference. */
  readonly seed: number;
  /** Whether a CI assertion reads it (report-only personas are not). */
  readonly asserted: boolean;
}

/** The Casual Learner's seed, shared by every persona compared against it. */
export const CASUAL_SEED = 35;

const SECOND_MS = 1_000;

const casual: Persona = {
  name: 'casual',
  opensPerDay: 3,
  openMinutes: 5,
  reviews: true,
  tapsPerSecond: 0,
  buys: { kind: 'greedy' },
  checkMs: 30 * SECOND_MS,
  seed: CASUAL_SEED,
  asserted: true,
};

export const PERSONAS: readonly Persona[] = [
  {
    ...casual,
    name: 'idler',
    opensPerDay: 2,
    openMinutes: 2,
    reviews: false,
    seed: 36,
  },
  casual,
  { ...casual, name: 'diligent', opensPerDay: 5, openMinutes: 8, seed: 37 },
  { ...casual, name: 'clicker', tapsPerSecond: 10 },
  { ...casual, name: 'nonlearner', reviews: false },
  {
    ...casual,
    name: 'capped',
    buys: { kind: 'capped', max: 5 },
    checkMs: 120 * SECOND_MS,
    asserted: false,
  },
  { ...casual, name: 'random', buys: { kind: 'random' }, asserted: false },
];

/** The persona named `name`; an unknown name is refused by name. */
export function persona(name: string): Persona {
  const found = PERSONAS.find((p) => p.name === name);
  if (found === undefined) throw new RangeError(`no persona named ${name}`);
  return found;
}
