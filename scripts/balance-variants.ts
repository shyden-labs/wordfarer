/**
 * The robustness sweep's variants (#35 AC9): each moves one tuned lever of
 * `balance.ts` by a factor, at bundle time, so the pacing suite can be
 * replayed on it. Every pattern must match exactly as many times as the
 * lever has values; anything else is refused by name, so a reshaped
 * `balance.ts` breaks the sweep loudly instead of sweeping nothing.
 */

export interface Lever {
  readonly name: string;
  /** Matches each value of the lever; group 1 is the number or list. */
  readonly pattern: RegExp;
  /** How many matches the lever has. */
  readonly matches: number;
}

export const LEVERS: readonly Lever[] = [
  { name: 'goals', pattern: /goals: \[([^\]]*)\]/g, matches: 1 },
  { name: 'rankBonus', pattern: /rankBonus: \{([^}]*)\}/g, matches: 1 },
  { name: 'floorShare', pattern: /floorShare: ([0-9.]+),/g, matches: 1 },
  {
    name: 'duplicateInsight',
    pattern: /duplicateInsight: \[([^\]]*)\]/g,
    matches: 1,
  },
  { name: 'phrasebook', pattern: /phrasebook: \[([^\]]*)\]/g, matches: 1 },
  { name: 'listen', pattern: /understandingPerTap: ([0-9.]+)/g, matches: 1 },
];

export interface Variant {
  readonly name: string;
  readonly lever: string | undefined;
  readonly factor: number;
}

/** The baseline, then every lever at x0.9 and x1.1. */
export const VARIANTS: readonly Variant[] = [
  { name: 'baseline', lever: undefined, factor: 1 },
  ...LEVERS.flatMap(({ name }) =>
    [0.9, 1.1].map((factor) => ({
      name: `${name} x${String(factor)}`,
      lever: name,
      factor,
    })),
  ),
];

const scale = (text: string, factor: number) =>
  text.replace(/[0-9][0-9_.e+]*/g, (n) =>
    String(Number(n.replaceAll('_', '')) * factor),
  );

/** `source` with `variant`'s lever scaled; the baseline is returned unchanged. */
export function applyVariant(source: string, variant: Variant): string {
  if (variant.lever === undefined) return source;
  const lever = LEVERS.find((l) => l.name === variant.lever);
  if (lever === undefined) throw new Error(`no lever named ${variant.lever}`);
  const found = [...source.matchAll(lever.pattern)].length;
  if (found !== lever.matches) {
    throw new Error(
      `pacing:sweep: ${lever.name} matched ${String(found)} times in balance.ts, not ${String(lever.matches)}`,
    );
  }
  return source.replace(lever.pattern, (whole: string, value: string) =>
    whole.replace(value, scale(value, variant.factor)),
  );
}
