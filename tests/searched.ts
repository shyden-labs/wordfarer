/**
 * The population a finding list was drawn from, proved live (#361).
 *
 * `expect(findings).toEqual([])` is green in two different worlds: the guard
 * ran and found nothing, and the guard was handed nothing to run over.
 *
 *     expect(searched(findings, { of: files, what: 'test files' })).toEqual([]);
 *
 * The population sits INSIDE the assertion's own expression, so a call site
 * cannot forget a control it has nowhere to omit. It returns the findings
 * untouched, so the verdict, and the runner's diff of the offending entries,
 * stays with the caller's own `expect`.
 *
 * Hand it the population ITSELF where there is one: a count is taken on
 * trust, while an array's members are content-checked, because six blank
 * headers are six entries and no content.
 *
 * Refusing an EMPTY population catches a reader blind to everything; a reader
 * blind to PART of its population still passes while one unit is read. So
 * every search also checks its population's recorded floor in the same test
 * (`floorBreach` in `tests/floors.ts`), and `floorless-searches.test.ts`
 * holds that.
 */
export function searched<T>(
  findings: readonly T[],
  population: { of: number | readonly unknown[]; what: string },
): readonly T[] {
  const { of, what } = population;
  const live =
    typeof of === 'number'
      ? Number.isInteger(of)
        ? of
        : 0
      : of.filter(isSubstantive).length;
  if (live <= 0)
    throw new Error(
      `searched no ${what}: an absence assertion over an empty population is ` +
        'green whatever the guard does, and counting entries is not counting ' +
        'content.',
    );
  return findings;
}

/**
 * A member a guard could be searching: not blank, not an empty container,
 * not null. `0` and `false` ARE values, and a guard hunting a zero width or
 * an unset flag would be reading them.
 */
function isSubstantive(member: unknown): boolean {
  if (member === null || member === undefined) return false;
  if (typeof member === 'string') return member.trim() !== '';
  if (Array.isArray(member)) return member.length > 0;
  if (member instanceof Map || member instanceof Set) return member.size > 0;
  if (typeof member === 'object') return Object.keys(member).length > 0;
  return true;
}

/**
 * A search over an input the test leaves empty on purpose, proved live by a
 * positive control (#361, operator decision 2026-10-05: empty input only).
 *
 * `expect(parseLog('')).toEqual([])` checks that nothing in gives nothing
 * out, and a dead parser passes it. `searched` cannot help, since the
 * population is empty by design, so no floor can be recorded on it either:
 *
 *     expect(againstControl(parseLog, { input: '', control: ONE_COMMIT })).toEqual([]);
 *
 * runs `run` on the control, which must find something, then returns what it
 * finds in `input`, which must be empty. A `run` that ignored its argument
 * would return the same thing twice, and one result cannot be both, so that
 * shortcut fails by itself. `floorless-searches.test.ts` holds the rest: the
 * input is an empty literal written in place, and nothing else uses this.
 */
export function againstControl<I, R>(
  run: (input: I) => R,
  { input, control }: { input: I; control: I },
): R {
  if (isSubstantive(input))
    throw new Error(
      'againstControl is for an empty input; a search over a population ' +
        'checks a recorded floor instead',
    );
  if (!isSubstantive(run(control)))
    throw new Error(
      'the control found nothing, so this cannot tell nothing in from a dead ' +
        'function',
    );
  return run(input);
}
