import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import type { Rank } from '../src/balance';
import { DAY_MS, wallMs, type WallMs } from '../src/clock';
import {
  insightFor,
  isDue,
  newWordMemory,
  RANKS,
  rankForStability,
  retrievability,
  review,
  reviewQueue,
  wordRetrievability,
  type MemoryCard,
  type WordMemory,
} from '../src/memory';

/**
 * Ranks, FSRS reviews, the review queue and Insight (#28 AC5, AC6, AC7).
 *
 * Cards are built here as plain data, so each test controls the stability a
 * review starts from. The stabilities were chosen from a probe of ts-fsrs
 * 5.4.2 (FSRS-6 defaults, fuzz off) so that a Good answer lands in a known
 * rank band; each test also checks the band it relies on.
 */

const T0: WallMs = wallMs(Date.UTC(2027, 0, 4, 9));
const MINUTE_MS = 60_000;

/** A card in the Review state, last reviewed `stability` days before T0 (R = 0.9). */
function reviewCard(stability: number): MemoryCard {
  return {
    due: T0,
    stability,
    difficulty: 5,
    scheduledDays: Math.round(stability),
    learningSteps: 0,
    reps: 3,
    lapses: 0,
    state: State.Review,
    lastReview: T0 - Math.round(stability * DAY_MS),
  };
}

function word(rank: Rank, stability: number): WordMemory {
  return { rank, card: reviewCard(stability) };
}

describe('ranks', () => {
  it('run Heard, Recognised, Recalled, Fluent, Mastered', () => {
    expect(RANKS).toEqual([
      'heard',
      'recognised',
      'recalled',
      'fluent',
      'mastered',
    ]);
  });

  // Thresholds of 2, 7, 14 and 30 days, each side of each one.
  const thresholds: readonly (readonly [number, Rank])[] = [
    [0.001, 'heard'],
    [1.999999, 'heard'],
    [2, 'recognised'],
    [6.999999, 'recognised'],
    [7, 'recalled'],
    [13.999999, 'recalled'],
    [14, 'fluent'],
    [29.999999, 'fluent'],
    [30, 'mastered'],
    [36_500, 'mastered'],
  ];
  for (const [s, rank] of thresholds)
    it(`put a stability of ${String(s)} d at ${rank}`, () => {
      expect(rankForStability(s)).toBe(rank);
    });
});

describe('a picked-up word', () => {
  it('starts Heard, as a new FSRS card due at once, never reviewed', () => {
    const w = newWordMemory(T0);
    expect(w.rank).toBe('heard');
    expect(w.card.state).toBe(State.New);
    expect(w.card.due).toBe(T0);
    expect(w.card.lastReview).toBeNull();
    expect(w.card.reps).toBe(0);
    expect(isDue(w, T0)).toBe(true);
  });

  it('has R = 0 until its first review, as ts-fsrs gives a new card', () => {
    const w = newWordMemory(T0);
    expect(wordRetrievability(w, T0)).toBe(0);
    expect(wordRetrievability(w, wallMs(T0 + 30 * DAY_MS))).toBe(0);
  });
});

describe('a review (AC5)', () => {
  for (const correct of [true, false])
    it(`schedules a ${correct ? 'correct' : 'wrong'} answer as ${correct ? 'Good' : 'Again'}, fuzz off`, () => {
      const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));
      const w = word('recalled', 8);
      // The reference gets the true elapsed_days (8); core passes 0 because
      // ts-fsrs recomputes it, so equal results also show it is unread.
      const want = scheduler.next(
        {
          due: w.card.due,
          stability: w.card.stability,
          difficulty: w.card.difficulty,
          elapsed_days: 8,
          scheduled_days: w.card.scheduledDays,
          learning_steps: w.card.learningSteps,
          reps: w.card.reps,
          lapses: w.card.lapses,
          state: w.card.state,
          last_review: w.card.lastReview,
        },
        T0,
        correct ? Rating.Good : Rating.Again,
      ).card;
      const got = review(w, T0, correct).card;
      expect(got.stability).toBe(want.stability);
      expect(got.difficulty).toBe(want.difficulty);
      expect(got.due).toBe(want.due.getTime());
      expect(got.state).toBe(want.state);
      expect(got.lastReview).toBe(T0);
    });

  it('follows the learning steps, then intervals in whole days, with no fuzz', () => {
    // Measured with ts-fsrs 5.4.2 defaults: steps of 1 and 10 minutes.
    let w = newWordMemory(T0);
    let now = T0;
    const minutesUntilDue: number[] = [];
    for (let k = 0; k < 3; k++) {
      w = review(w, now, true);
      minutesUntilDue.push((w.card.due - now) / MINUTE_MS);
      now = wallMs(w.card.due);
    }
    expect(minutesUntilDue).toEqual([10, 2 * 24 * 60, 11 * 24 * 60]);
    expect(w.card.stability).toBe(10.97104786);
  });

  it('stores only integers for times, and survives a JSON round trip', () => {
    let w = newWordMemory(T0);
    let now = T0;
    // one scenario: each answer reviews the card the previous one scheduled.
    for (const correct of [true, true, false, true, true, true]) {
      w = review(w, now, correct);
      expect(Number.isSafeInteger(w.card.due)).toBe(true);
      expect(Number.isSafeInteger(w.card.lastReview)).toBe(true);
      expect(JSON.parse(JSON.stringify(w))).toEqual(w);
      now = wallMs(w.card.due + 3 * DAY_MS);
    }
  });

  describe('raises the rank only on a correct answer', () => {
    // [rank before, stability before, band of the new stability, rank after]
    const rises: readonly (readonly [Rank, number, Rank, Rank])[] = [
      ['recognised', 2.5, 'recalled', 'recalled'],
      ['recalled', 8, 'fluent', 'fluent'],
      ['fluent', 20, 'mastered', 'mastered'],
      ['heard', 1.5, 'recalled', 'recalled'],
      ['recognised', 5, 'fluent', 'fluent'],
      ['fluent', 2.5, 'recalled', 'fluent'],
      ['mastered', 40, 'mastered', 'mastered'],
    ];
    for (const [before, s, band, after] of rises) {
      it(`${before} at S = ${String(s)} d becomes ${after}`, () => {
        const next = review(word(before, s), T0, true);
        expect(rankForStability(next.card.stability)).toBe(band);
        expect(next.rank).toBe(after);
      });
    }

    it('heard becomes recognised on the first correct answer (S = 2.3065 d)', () => {
      const next = review(newWordMemory(T0), T0, true);
      expect(next.card.stability).toBe(2.3065);
      expect(next.rank).toBe('recognised');
    });
  });

  describe('drops exactly one step on a wrong answer', () => {
    const lapses: readonly (readonly [Rank, number, Rank])[] = [
      ['mastered', 40, 'fluent'],
      ['fluent', 20, 'recalled'],
      ['recalled', 8, 'recognised'],
      ['recognised', 2.5, 'heard'],
      ['heard', 1.5, 'heard'],
    ];
    for (const [before, s, after] of lapses) {
      it(`${before} becomes ${after}`, () => {
        const next = review(word(before, s), T0, false);
        expect(next.card.stability).toBeLessThan(s);
        expect(next.rank).toBe(after);
      });
    }

    it('a wrong first answer leaves a new word Heard', () => {
      expect(review(newWordMemory(T0), T0, false).rank).toBe('heard');
    });
  });

  it('never lowers a rank on a correct answer, over random review histories', () => {
    let correctSteps = 0;
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            correct: fc.boolean(),
            lateMs: fc.integer({ min: 0, max: 60 * DAY_MS }),
          }),
          { minLength: 5, maxLength: 40, size: 'max' },
        ),
        (steps) => {
          let w = newWordMemory(T0);
          // one scenario: each step reviews the word the step before left.
          for (const step of steps) {
            const now = wallMs(w.card.due + step.lateMs);
            const next = review(w, now, step.correct);
            const before = RANKS.indexOf(w.rank);
            const after = RANKS.indexOf(next.rank);
            if (step.correct) {
              correctSteps++;
              expect(after).toBeGreaterThanOrEqual(before);
              expect(after).toBe(
                Math.max(
                  before,
                  RANKS.indexOf(rankForStability(next.card.stability)),
                ),
              );
            } else {
              expect(after).toBe(Math.max(before - 1, 0));
            }
            w = next;
          }
        },
      ),
      { numRuns: 300 },
    );
    expect(correctSteps).toBeGreaterThan(1000);
  });
});

describe('Insight for a correct due answer (AC7)', () => {
  it('is 1 + 0.5 × rank index, from Heard 1 to Mastered 3', () => {
    expect(RANKS.map(insightFor)).toEqual([1, 1.5, 2, 2.5, 3]);
  });
});

describe('due items', () => {
  it('are due from their due time onwards, not a millisecond before', () => {
    const w = word('recalled', 8);
    expect(isDue(w, wallMs(T0 - 1))).toBe(false);
    expect(isDue(w, T0)).toBe(true);
    expect(isDue(w, wallMs(T0 + 1))).toBe(true);
  });
});

describe('the review queue (AC6)', () => {
  /** Word i was reviewed this many days before T0: a permutation of 1..40 that is not id order. */
  const daysAgo = (i: number): number => 1 + ((7 * i) % 40);

  /** n due words at stability 8 d, ids w00.., word i reviewed daysAgo(i) days before T0. */
  function dueWords(n: number): Record<string, WordMemory> {
    const out: Record<string, WordMemory> = {};
    for (let i = 0; i < n; i++) {
      const id = `w${String(i).padStart(2, '0')}`;
      const card = { ...reviewCard(8), lastReview: T0 - daysAgo(i) * DAY_MS };
      out[id] = { rank: 'recalled', card };
    }
    return out;
  }

  it('holds the 10 most-forgotten due items, lowest R first', () => {
    const words = dueWords(40);
    const queue = reviewQueue(words, T0);
    expect(queue).toHaveLength(10);
    // R falls with time since the review, so the most forgotten are the
    // longest ago: 40, 39, ... 31 days, whose ids are not in id order.
    const longestAgo = Array.from({ length: 40 }, (_, i) => i)
      .sort((a, b) => daysAgo(b) - daysAgo(a))
      .slice(0, 10)
      .map((i) => `w${String(i).padStart(2, '0')}`);
    expect(longestAgo).not.toEqual([...longestAgo].sort());
    expect(queue.map((q) => q.itemId)).toEqual(longestAgo);
    const rs = queue.map((q) => q.retrievability);
    expect(new Set(rs).size, 'ten distinct R values').toBe(10);
    expect(rs).toEqual([...rs].sort((a, b) => a - b));
  });

  it('breaks ties by item id', () => {
    const words: Record<string, WordMemory> = {
      b: newWordMemory(T0),
      a: newWordMemory(T0),
      c: newWordMemory(T0),
    };
    expect(reviewQueue(words, T0).map((q) => q.itemId)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('leaves out items that are not yet due', () => {
    const words: Record<string, WordMemory> = {
      due: word('recalled', 8),
      later: { rank: 'recalled', card: { ...reviewCard(8), due: T0 + 1 } },
    };
    expect(reviewQueue(words, T0).map((q) => q.itemId)).toEqual(['due']);
  });

  it('shows each item’s rank and its R now', () => {
    const words = { x: word('fluent', 20) };
    const [item] = reviewQueue(words, T0);
    expect(item).toEqual({
      itemId: 'x',
      rank: 'fluent',
      retrievability: retrievability(20, 20),
    });
  });

  it('after 30 days away with 50 items due still holds exactly 10', () => {
    const later = wallMs(T0 + 30 * DAY_MS);
    const words = dueWords(50);
    expect(Object.values(words).filter((w) => isDue(w, later))).toHaveLength(
      50,
    );
    expect(reviewQueue(words, later)).toHaveLength(10);
  });

  it('is empty when nothing is due', () => {
    expect(reviewQueue({}, T0)).toEqual([]);
    expect(reviewQueue({ x: word('heard', 2) }, wallMs(T0 - 1))).toEqual([]);
  });
});
