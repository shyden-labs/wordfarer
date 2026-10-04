import { describe, expect, it } from 'vitest';
import { HOUR_MS, simMs, wallMs, type WallMs } from '../src/clock';
import type {
  Course,
  CultureCard,
  Destination,
  Encounter,
  Region,
} from '../src/course';
import { collectJourney, startJourney } from '../src/journeys';
import { newWordMemory, type WordMemory } from '../src/memory';
import { Num, type NumTuple } from '../src/num';
import { understandingNow } from '../src/production';
import {
  goalMet,
  runUnderstanding,
  sailGoal,
  setSail,
  stampGain,
  wordsHeld,
} from '../src/sail';
import { integrate, type Rejection, type Result } from '../src/sim';
import { view } from '../src/view';
import { initialState, type GameState } from '../src/state';

/**
 * Set Sail (#31 AC1 to AC5): the goal, the stamps it pays, the preview, what
 * a sail resets and keeps, the order destinations unlock in, the finale and
 * Mastery mode.
 *
 * The course is declared here, so it is checked against the `Course`
 * contract rather than sharing it. The goal curve is written out as literals
 * (U_goal(i) = 10,000 x 10^i, words(i) = 8 + 2i, k = 3, x 1.5 per replay),
 * so a change to `BALANCE.sail` fails here as well as in its own pin.
 */

const START: WallMs = wallMs(Date.UTC(2027, 0, 4));
/** Words in each destination's lexicon: enough for words(11) = 30. */
const LEXICON_SIZE = 30;

function destination(r: number, d: number): Destination {
  return {
    id: `r${String(r)}-d${String(d)}`,
    lexicon: Array.from({ length: LEXICON_SIZE }, (_, k) => ({
      id: `r${String(r)}d${String(d)}w${String(k)}`,
      tags: ['food'],
      cefr: 'A1' as const,
    })),
  };
}

function encounter(r: number): Encounter {
  return { id: `e${String(r)}`, tags: ['food'], c0: 10, p0: 1 };
}

function card(r: number): CultureCard {
  return {
    id: `c${String(r)}`,
    setId: `s${String(r)}`,
    tags: ['food'],
    bonus: 0.05,
    phrasePack: [{ id: `c${String(r)}p`, tags: ['food'], cefr: 'A1' as const }],
  };
}

function region(r: number): Region {
  return {
    id: `r${String(r)}`,
    destinations: [0, 1, 2, 3].map((d) => destination(r, d)),
    encounters: [encounter(r)],
    cardSets: [{ id: `s${String(r)}`, bonus: 0.1 }],
    cultureCards: [card(r)],
    // A node on a root no word has: owning it changes no rate (#32).
    grammarNodes: [{ id: `g${String(r)}`, roots: ['none'], derived: [] }],
  };
}

const course: Course = {
  id: 'sail-course',
  tags: ['food'],
  regions: [region(0), region(1), region(2)],
};

/** Destination ids by number, written out (region by region, course order). */
const IDS = [
  'r0-d0',
  'r0-d1',
  'r0-d2',
  'r0-d3',
  'r1-d0',
  'r1-d1',
  'r1-d2',
  'r1-d3',
  'r2-d0',
  'r2-d1',
  'r2-d2',
  'r2-d3',
] as const;
const LAST = 11;

/** U_goal(i) = 10,000 x 10^i, written out. */
const goalU = (i: number): number => 10_000 * 10 ** i;
/** words(i) = 8 + 2i, written out. */
const goalWords = (i: number): number => 8 + 2 * i;

function tuple(x: number): NumTuple {
  return Num.toTuple(Num.from(x));
}

function n(x: Num): number {
  return Num.toNumber(x);
}

/** The first `count` words of destination `i`'s lexicon, picked up at START. */
function lexiconWords(i: number, count: number): Record<string, WordMemory> {
  const id = IDS[i] ?? '';
  const [r, d] = id.slice(1).split('-d').map(Number);
  return Object.fromEntries(
    Array.from({ length: count }, (_, k) => [
      `r${String(r)}d${String(d)}w${String(k)}`,
      newWordMemory(START),
    ]),
  );
}

interface At {
  /** Understanding held now. */
  readonly held?: number;
  /** Understanding this run has spent. */
  readonly spent?: number;
  /** Words of the destination's own lexicon held. */
  readonly words?: number;
  readonly reached?: number;
  readonly finale?: boolean;
  readonly replays?: Readonly<Record<string, number>>;
  readonly playableRegions?: number;
}

/** A game at destination `i`, by default holding exactly its goal. */
function at(i: number, opts: At = {}): GameState {
  const base = initialState(START, 1, opts.playableRegions ?? 3);
  return {
    ...base,
    anchor: { sim: simMs(0), understanding: tuple(opts.held ?? goalU(i)) },
    runSpent: tuple(opts.spent ?? 0),
    words: lexiconWords(i, opts.words ?? goalWords(i)),
    destination: i,
    reached: opts.reached ?? i,
    finale: opts.finale ?? false,
    replays: opts.replays ?? {},
  };
}

function ok(result: Result): GameState {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
  return result.state;
}

function refused(result: Result): Rejection {
  if (result.ok) throw new Error('expected a rejection');
  return result.rejection;
}

describe('the goal (AC1)', () => {
  for (const i of IDS.keys())
    it(`destination ${String(i)} needs 10,000 x 10^${String(i)} Understanding and ${String(goalWords(i))} words`, () => {
      const goal = sailGoal(course, at(i));
      expect(n(goal.understanding)).toBe(goalU(i));
      expect(goal.words).toBe(goalWords(i));
    });

  it('is met when both the Understanding and the words reach it exactly', () => {
    expect(goalMet(course, at(3))).toBe(true);
  });

  it('is not met one Understanding short', () => {
    expect(goalMet(course, at(3, { held: goalU(3) - 1 }))).toBe(false);
  });

  it('is not met one word short', () => {
    expect(goalMet(course, at(3, { words: goalWords(3) - 1 }))).toBe(false);
  });

  it('counts Understanding this run has spent, so buying never delays it', () => {
    const s = at(3, { held: 0, spent: goalU(3) });
    expect(n(runUnderstanding(course, s))).toBe(goalU(3));
    expect(goalMet(course, s)).toBe(true);
  });

  it('counts Understanding produced since the anchor', () => {
    // One Encounter at 1/s, raised a little by the held words' bonus, makes
    // at least 3,600 in an hour.
    const owning = {
      ...at(0, { held: goalU(0) - 3_600 }),
      owned: { e0: 1 },
    };
    const later = integrate(course, owning, HOUR_MS);
    expect(goalMet(course, owning)).toBe(false);
    expect(n(runUnderstanding(course, later))).toBeGreaterThanOrEqual(goalU(0));
    expect(goalMet(course, later)).toBe(true);
  });

  it("counts only the current destination's own words", () => {
    const s = {
      ...at(5, { words: 0 }),
      words: { ...lexiconWords(4, 30), ...lexiconWords(6, 30) },
    };
    expect(wordsHeld(course, s)).toBe(0);
    expect(goalMet(course, s)).toBe(false);
  });

  it('never needs a review: unreviewed words and no Insight still sail (D1)', () => {
    const s = at(0);
    expect(Object.values(s.words).every((w) => w.card.reps === 0)).toBe(true);
    expect(s.insight).toEqual([0, 0]);
    expect(ok(setSail(course, s)).destination).toBe(1);
  });

  it('refuses a sail one word short, the Understanding met', () => {
    expect(
      refused(setSail(course, at(2, { words: goalWords(2) - 1 }))),
    ).toEqual({
      kind: 'sailGoalUnmet',
      understanding: tuple(goalU(2)),
      goal: tuple(goalU(2)),
      words: goalWords(2) - 1,
      wordsGoal: goalWords(2),
    });
  });

  it('refuses a sail one Understanding short, the words met', () => {
    expect(
      refused(setSail(course, at(2, { held: goalU(2) - 1 }))),
    ).toMatchObject({ kind: 'sailGoalUnmet', words: goalWords(2) });
  });

  it('refuses a sail before the goal is met, saying how far off it is', () => {
    expect(refused(setSail(course, at(2, { held: 50, words: 3 })))).toEqual({
      kind: 'sailGoalUnmet',
      understanding: tuple(50),
      goal: tuple(goalU(2)),
      words: 3,
      wordsGoal: goalWords(2),
    });
  });
});

describe('the stamps a sail pays (AC2)', () => {
  it.each([
    [1, 3],
    [2, 4],
    [4, 6],
    [100, 30],
  ])('U_run = %s x goal pays floor(3 x sqrt) = %s stamps', (ratio, stamps) => {
    expect(stampGain(Num.from(goalU(2) * ratio), Num.from(goalU(2)))).toBe(
      stamps,
    );
    expect(ok(setSail(course, at(2, { held: goalU(2) * ratio }))).stamps).toBe(
      stamps,
    );
  });

  it('adds to the stamps held and to those ever earned', () => {
    const s = { ...at(2), stamps: 1, stampsEarned: 5 };
    const after = ok(setSail(course, s));
    expect(after.stamps).toBe(4);
    expect(after.stampsEarned).toBe(8);
  });
});

describe('the preview (AC2, DN3)', () => {
  // Spent and held differ, and the levels add to more than the upgrades
  // owned, so a preview reading the wrong one is caught. Built per test, so
  // a throwing setup fails each test by name, never the file (#97).
  const before = (): GameState => ({
    ...at(2, { held: goalU(2) * 4, spent: 77 }),
    owned: { e0: 3 },
    stamps: 2,
    stampsEarned: 2,
    cards: ['c0'],
    upgrades: { startingUnderstanding: 2, journeySlot2: 1 },
    grammar: ['g0', 'g1'],
  });
  // Computed per test, so a failing sail fails each test, not the file.
  const preview = () => view(course, before(), before().wall).sail;
  const after = () => ok(setSail(course, before()));

  it('names the destination and the next one', () => {
    expect(preview().destination).toBe('r0-d2');
    expect(preview().next).toBe('r0-d3');
    expect(preview().available).toBe(true);
  });

  it('shows the goal and the progress towards it', () => {
    expect(n(preview().goal.understanding)).toBe(goalU(2));
    expect(preview().goal.words).toBe(goalWords(2));
    expect(n(preview().progress.understanding)).toBe(
      n(runUnderstanding(course, before())),
    );
    expect(preview().progress.words).toBe(goalWords(2));
  });

  it('resets exactly the Encounters owned and the Understanding held', () => {
    expect(preview().resets.encounters).toEqual({ e0: 3 });
    expect(n(preview().resets.understanding)).toBe(
      n(understandingNow(course, before())),
    );
    expect(after().owned).toEqual({});
  });

  it('says what Understanding the next run starts with', () => {
    expect(preview().resets.startingUnderstanding).toBe(200);
    expect(n(understandingNow(course, after()))).toBe(200);
  });

  it('pays exactly the stamps the sail adds', () => {
    expect(preview().gains.stamps).toBe(6);
    expect(after().stampsEarned - before().stampsEarned).toBe(
      preview().gains.stamps,
    );
  });

  it('keeps exactly the words, cards, upgrades, grammar and stamps the state keeps', () => {
    expect(preview().keeps).toEqual({
      words: Object.keys(after().words).length,
      cards: after().cards.length,
      upgradeLevels: 3,
      grammarNodes: after().grammar.length,
      stamps: after().stamps,
    });
    expect(preview().keeps.stamps).toBe(8);
    expect(preview().keeps.grammarNodes).toBe(2);
  });

  it('is unavailable before the goal is met, and still shows the goal', () => {
    const short = at(2, { held: 10 });
    const p = view(course, short, short.wall).sail;
    expect(p.available).toBe(false);
    expect(n(p.goal.understanding)).toBe(goalU(2));
    expect(n(p.progress.understanding)).toBe(10);
  });

  it('in Mastery mode names no next destination, and is available once the goal is met', () => {
    const s = at(6, { reached: LAST, finale: true });
    const p = view(course, s, s.wall).sail;
    expect(p.destination).toBe('r1-d2');
    expect(p.next).toBeUndefined();
    expect(p.available).toBe(true);
  });

  it('at the last destination names no next one: the player chooses', () => {
    const p = view(course, at(LAST), at(LAST).wall).sail;
    expect(p.next).toBeUndefined();
    expect(p.available).toBe(true);
  });

  it("is taken at the view's own time, production included", () => {
    const s = { ...at(0, { held: goalU(0) - 100 }), owned: { e0: 1 } };
    expect(view(course, s, s.wall).sail.available).toBe(false);
    expect(view(course, s, wallMs(s.wall + HOUR_MS)).sail.available).toBe(true);
  });

  it('is unavailable when the next region is not playable', () => {
    const s = at(3, { playableRegions: 1 });
    const p = view(course, s, s.wall).sail;
    expect(goalMet(course, s)).toBe(true);
    expect(p.available).toBe(false);
  });
});

describe('a sail resets only Encounters and Understanding (AC3, DN3)', () => {
  // Built per test, so a throwing setup fails each test by name, never the
  // file (#97).
  const before = (): GameState => ({
    ...at(2, { held: goalU(2) * 4, spent: 77 }),
    owned: { e0: 3 },
    insight: tuple(12),
    stamps: 2,
    stampsEarned: 2,
    upgrades: { journeySlot2: 1, startingUnderstanding: 2 },
    cards: ['c0'],
    tutorialJourneyUsed: true,
    grammar: ['g0'],
  });
  const out = () => ok(startJourney(course, before(), 0, '2h'));
  // Computed per test, so a failing sail fails each test, not the file.
  const after = () => ok(setSail(course, out()));

  /** The keys a sail is allowed to change: the reset, the gain and the position. */
  const CHANGED = [
    'anchor',
    'owned',
    'runSpent',
    'stamps',
    'stampsEarned',
    'destination',
    'reached',
  ];

  it('changes nothing else: every other key is deep-equal', () => {
    // Read from the state itself, so a key added later is covered.
    const kept = Object.keys(out()).filter((k) => !CHANGED.includes(k));
    expect(kept.length).toBeGreaterThan(12);
    expect(
      Object.fromEntries(kept.map((k) => [k, after()[k as keyof GameState]])),
    ).toEqual(
      Object.fromEntries(kept.map((k) => [k, out()[k as keyof GameState]])),
    );
  });

  it('keeps the words, their ranks and their FSRS memory', () => {
    expect(after().words).toEqual(out().words);
    expect(Object.keys(after().words)).toHaveLength(goalWords(2));
  });

  it('keeps the grammar nodes (#32 AC4)', () => {
    expect(after().grammar).toEqual(['g0']);
  });

  it('keeps the cards, upgrades and Insight', () => {
    expect(after().cards).toEqual(['c0']);
    expect(after().upgrades).toEqual(out().upgrades);
    expect(after().insight).toEqual(tuple(12));
  });

  it('owns no Encounters and holds only the starting grant, with nothing spent', () => {
    expect(after().owned).toEqual({});
    expect(after().anchor).toEqual({
      sim: out().sim,
      understanding: tuple(200),
    });
    expect(after().runSpent).toEqual([0, 0]);
  });

  it('keeps a Journey still out', () => {
    expect(out().journeys[0]).not.toBeNull();
    expect(after().journeys).toEqual(out().journeys);
  });

  it('a Journey out across a sail into the next region brings back the card it drew', () => {
    const away = ok(startJourney(course, at(3), 0, '2h'));
    expect(away.journeys[0]?.cardId).toBe('c0');
    const sailed = ok(setSail(course, away));
    expect(sailed.destination).toBe(4);
    const collected = ok(
      collectJourney(course, integrate(course, sailed, 2 * HOUR_MS), 0),
    );
    expect(collected.cards).toEqual(['c0']);
  });
});

describe('destinations unlock in order (AC4)', () => {
  for (const i of IDS.keys())
    if (i < LAST)
      it(`a sail from destination ${String(i)} goes to ${IDS[i + 1] ?? ''}`, () => {
        const after = ok(setSail(course, at(i)));
        expect(after.destination).toBe(i + 1);
        expect(after.reached).toBe(i + 1);
        expect(after.finale).toBe(false);
        expect(after.replays).toEqual({});
      });

  it('accepts the next destination named', () => {
    expect(ok(setSail(course, at(4), 'r1-d1')).destination).toBe(5);
  });

  it('refuses any other destination named before the finale', () => {
    expect(refused(setSail(course, at(4), 'r1-d2'))).toEqual({
      kind: 'sailTargetInvalid',
      to: 'r1-d2',
    });
    expect(refused(setSail(course, at(4), 'r0-d0'))).toEqual({
      kind: 'sailTargetInvalid',
      to: 'r0-d0',
    });
  });

  it('cannot sail into a region outside the playable ones', () => {
    expect(refused(setSail(course, at(3, { playableRegions: 1 })))).toEqual({
      kind: 'regionNotPlayable',
      destination: 'r1-d0',
      region: 1,
      playable: 1,
    });
  });

  it('sails within the playable regions', () => {
    expect(ok(setSail(course, at(3, { playableRegions: 2 }))).destination).toBe(
      4,
    );
    expect(refused(setSail(course, at(7, { playableRegions: 2 })))).toEqual({
      kind: 'regionNotPlayable',
      destination: 'r2-d0',
      region: 2,
      playable: 2,
    });
  });

  it('refuses a sail on a course with no destinations', () => {
    const bare: Course = {
      ...course,
      regions: [{ ...region(0), destinations: [] }],
    };
    expect(refused(setSail(bare, at(0)))).toEqual({ kind: 'noDestination' });
  });
});

describe('the finale and Mastery mode (AC5)', () => {
  it("completing the course's last destination sets the finale flag", () => {
    const after = ok(setSail(course, at(LAST), 'r1-d2'));
    expect(after.finale).toBe(true);
    expect(after.destination).toBe(6);
    expect(after.reached).toBe(LAST);
  });

  it('the finale sail names the destination to replay', () => {
    expect(refused(setSail(course, at(LAST)))).toEqual({
      kind: 'sailTargetRequired',
    });
  });

  it('a replay counts towards that destination', () => {
    const after = ok(setSail(course, at(LAST), 'r1-d2'));
    expect(after.replays).toEqual({ 'r1-d2': 1 });
  });

  it('replaying the furthest destination counts as a replay too', () => {
    const s = at(6, { reached: LAST, finale: true, held: 1e13 });
    expect(ok(setSail(course, s, 'r2-d3')).replays).toEqual({ 'r2-d3': 1 });
  });

  it('a second replay counts again', () => {
    const s = at(6, {
      reached: LAST,
      finale: true,
      replays: { 'r1-d2': 1 },
      held: 1e13,
    });
    const after = ok(setSail(course, s, 'r1-d2'));
    expect(after.replays).toEqual({ 'r1-d2': 2 });
    expect(after.finale).toBe(true);
  });

  it.each([
    [1, 1.5],
    [2, 2.25],
    [3, 3.375],
  ])(
    'a destination replayed %s times needs its goal x %s',
    (replays, factor) => {
      const s = at(6, {
        reached: LAST,
        finale: true,
        replays: { 'r1-d2': replays },
      });
      expect(
        n(sailGoal(course, s).understanding) / (goalU(6) * factor),
      ).toBeCloseTo(1, 12);
      expect(sailGoal(course, s).words).toBe(goalWords(6));
    },
  );

  it("a replay's words goal is already met by its first visit", () => {
    const s = at(6, {
      reached: LAST,
      finale: true,
      replays: { 'r1-d2': 1 },
      held: goalU(6) * 1.5,
    });
    expect(goalMet(course, s)).toBe(true);
  });

  it('Mastery mode replays any visited destination', () => {
    const s = at(6, { reached: LAST, finale: true, held: 1e13 });
    expect(ok(setSail(course, s, 'r0-d0')).destination).toBe(0);
    expect(ok(setSail(course, s, 'r2-d3')).destination).toBe(LAST);
  });

  it('Mastery mode refuses a destination the course does not have', () => {
    const s = at(6, { reached: LAST, finale: true, held: 1e13 });
    expect(refused(setSail(course, s, 'atlantis'))).toEqual({
      kind: 'sailTargetInvalid',
      to: 'atlantis',
    });
  });

  it('a replayed run still pays stamps by its own goal', () => {
    const s = at(6, {
      reached: LAST,
      finale: true,
      replays: { 'r1-d2': 1 },
      held: goalU(6) * 1.5 * 4,
    });
    expect(ok(setSail(course, s, 'r0-d1')).stamps).toBe(6);
  });
});
