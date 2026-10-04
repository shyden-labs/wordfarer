/**
 * The one change `npm run pacing:calibrate` makes to core, at bundle time
 * only (#35 AC10): `sailGoal` reads its goal from a table the tool sets on
 * `globalThis`, so the tool can try goals without a goal parameter in core.
 * The anchor must match exactly once; anything else is refused by name, so
 * a refactor of `sail.ts` breaks the tool loudly rather than calibrating
 * the real table in silence.
 */

export const GOAL_ANCHOR = '  const base = goals[i];';
export const GOAL_HOOK =
  '  const base = ((globalThis as { __WORDFARER_GOALS?: readonly number[] }).__WORDFARER_GOALS ?? goals)[i];';

export function hookGoals(source: string): string {
  const found = source.split(GOAL_ANCHOR).length - 1;
  if (found !== 1) {
    throw new Error(
      `pacing:calibrate: sail.ts holds the goal anchor ${String(found)} times, not once: ${JSON.stringify(GOAL_ANCHOR)}`,
    );
  }
  return source.replace(GOAL_ANCHOR, GOAL_HOOK);
}
