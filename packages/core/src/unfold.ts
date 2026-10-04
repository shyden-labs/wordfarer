/**
 * Unfolding (parent §4.1, DN7, M1 design §5, #31): which features the
 * player has been shown, derived from state alone, so a save carries no
 * reveal flags of its own and a replay reveals the same.
 *
 * Each flag reads evidence that never goes away, so once a flag is on it
 * stays on: Understanding earned this run only grows until a sail, and a
 * sail leaves `reached` above 0; words, reviews, upgrade levels, stamps
 * earned and cards are never taken away; a word stays due until it is
 * reviewed. The flags are not a chain: a player who never reviews sees the
 * Upgrades tab only with the first stamp (D1), and sees Journeys, Culture
 * and the goal before it.
 */
import { BALANCE } from './balance';
import type { Course } from './course';
import { isDue } from './memory';
import { Num } from './num';
import { goalMet, runUnderstanding } from './sail';
import type { GameState } from './state';

/** The reveal flags, in parent §4.1's order. */
export const UNFOLD_FLAGS = [
  'listen',
  'encounters',
  'words',
  'review',
  'upgrades',
  'journeys',
  'culture',
  'goal',
] as const;
export type UnfoldFlag = (typeof UNFOLD_FLAGS)[number];
export type Unfold = Readonly<Record<UnfoldFlag, boolean>>;

/** Whether the player has ever set sail: a sail always moves `reached` on. */
function hasSailed(state: GameState): boolean {
  return state.reached > 0;
}

/** Step 4: a held word is due, or one has been reviewed. */
function reviewShown(state: GameState): boolean {
  return Object.values(state.words).some(
    (word) => word.card.reps > 0 || isDue(word, state.wall),
  );
}

/** Step 6: a card is held, or a Journey out has returned. */
function cultureShown(state: GameState): boolean {
  return (
    state.cards.length > 0 ||
    state.journeys.some((j) => j !== null && j.returnsAt <= state.sim)
  );
}

/** The reveal flags for `state` (AC6). */
export function unfold(course: Course, state: GameState): Unfold {
  const review = reviewShown(state);
  const culture = cultureShown(state);
  return {
    listen: true,
    encounters:
      hasSailed(state) ||
      Num.cmp(
        runUnderstanding(course, state),
        Num.from(BALANCE.encounters.firstAtUnderstanding),
      ) >= 0,
    words: Object.keys(state.words).length > 0,
    review,
    upgrades:
      Num.cmp(Num.fromTuple(state.insight), Num.from(0)) > 0 ||
      Object.values(state.upgrades).some((level) => level > 0) ||
      state.stampsEarned > 0,
    // Journeys unfold with Review (operator, 2026-10-03).
    journeys: review,
    culture,
    // The goal unfolds with Culture, or once it can be met (operator, 2026-10-03).
    goal: culture || hasSailed(state) || goalMet(course, state),
  };
}
