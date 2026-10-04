import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOAL_ANCHOR, GOAL_HOOK, hookGoals } from '../../scripts/goal-hook.ts';

/**
 * `npm run pacing:calibrate` hooks one line of `sail.ts` at bundle time
 * (#35 AC10). These tests read the real `sail.ts`, so a refactor that moves
 * the line fails CI here rather than the tool at its next run.
 */

const SAIL = 'packages/core/src/sail.ts';

describe('the goal hook', () => {
  it('finds its anchor in sail.ts exactly once', () => {
    expect(readFileSync(SAIL, 'utf8').split(GOAL_ANCHOR)).toHaveLength(2);
  });

  it('turns the anchor into the hook and changes nothing else', () => {
    const source = readFileSync(SAIL, 'utf8');
    const hooked = hookGoals(source);
    expect(hooked.split(GOAL_HOOK)).toHaveLength(2);
    expect(hooked.replace(GOAL_HOOK, GOAL_ANCHOR)).toBe(source);
  });

  it('refuses a source without the anchor, naming the count', () => {
    expect(() => hookGoals('const x = 1;')).toThrow(
      'holds the goal anchor 0 times, not once',
    );
  });

  it('refuses a source holding the anchor twice', () => {
    expect(() => hookGoals(`${GOAL_ANCHOR}\n${GOAL_ANCHOR}`)).toThrow(
      'holds the goal anchor 2 times, not once',
    );
  });
});
