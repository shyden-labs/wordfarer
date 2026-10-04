import {
  resolveCourse,
  type Cefr,
  type Course,
  type CourseData,
  type CultureCard,
  type Destination,
  type EncounterData,
  type GrammarNode,
  type LexiconItem,
  type RegionData,
  type Tier,
} from '../src/course';
import { createStreams, nextInt, type RngStreams } from '../src/rng';

/**
 * A generated course sized like v1 (parent §5.6, M1 design §6): the content
 * the pacing bots play until M2's real courses exist.
 *
 * Per region: 4 destinations holding 150 lexicon items, 6 Encounters, 3 sets
 * of 4 culture cards with a 3-word phrase pack each, and 4 grammar nodes with 2 roots and 3 derived words
 * each. 10 tags are shared across the course. Coverage is built in, not
 * hoped for: item i's first tag cycles through every tag, the Encounters of
 * each region cover every tag, and every root has items. The seed varies the
 * rest (second tags, card tags, derived words' tags).
 *
 * Each region's Encounters stand on tiers 1 to 6 of the ladder in
 * `balance.ts`, which prices them (#35 AC8). Festival windows hang off the bots' wall-clock start, 2027-01-04
 * 00:00 UTC (M1 design §2.3), so they fall on the same simulated days in
 * every run.
 */

export const TAGS = [
  'food',
  'transport',
  'greetings',
  'market',
  'family',
  'numbers',
  'ceremony',
  'weather',
  'work',
  'travel',
] as const;

/** 2027-01-04 00:00 UTC, the pacing bots' wall-clock start. */
export const BOT_EPOCH_WALL_MS = 1_799_020_800_000;

const DAY_MS = 86_400_000;
const REGIONS = 3;
const DESTINATION_SIZES = [38, 38, 37, 37] as const;
const ROOTS_PER_REGION = 8;
const SETS = 3;
const CARDS_PER_SET = 4;
const GRAMMAR_NODES = 4;
const DERIVED_PER_NODE = 3;
/** A card's phrase pack: one word at each CEFR level, on the card's tags. */
const PACK_CEFR: readonly Cefr[] = ['A1', 'A2', 'B1'];

/** Each region's Encounters, one on each tier of the ladder. */
const TIERS: readonly Tier[] = [1, 2, 3, 4, 5, 6];

const STREAMS = ['second-tags', 'card-tags', 'derived-tags'];

function tag(index: number): string {
  const t = TAGS[index % TAGS.length];
  if (t === undefined) throw new RangeError(`no tag ${String(index)}`);
  return t;
}

/** Draws a uniform integer in [0, n) from one named stream. */
function drawer(seed: number): (stream: string, n: number) => number {
  let streams: RngStreams = createStreams(seed, STREAMS);
  return (stream, n) => {
    const state = streams[stream];
    if (state === undefined) throw new RangeError(`no stream ${stream}`);
    const r = nextInt(state, n);
    streams = { ...streams, [stream]: r.state };
    return r.value;
  };
}

function cefrAt(position: number, size: number): Cefr {
  if (position * 3 < size) return 'A1';
  if (position * 3 < size * 2) return 'A2';
  return 'B1';
}

function region(
  r: number,
  draw: (stream: string, n: number) => number,
): RegionData {
  const roots = Array.from(
    { length: ROOTS_PER_REGION },
    (_, k) => `r${String(r)}-root-${String(k)}`,
  );

  let i = 0;
  const destinations: Destination[] = DESTINATION_SIZES.map((size, d) => {
    const lexicon: LexiconItem[] = [];
    for (let p = 0; p < size; p++, i++) {
      const first = tag(i + r);
      const second =
        draw('second-tags', 2) === 0
          ? undefined
          : tag(i + r + 1 + draw('second-tags', TAGS.length - 1));
      const root = i % 5 === 0 ? roots[(i / 5) % ROOTS_PER_REGION] : undefined;
      lexicon.push({
        id: `r${String(r)}-d${String(d)}-w${String(p)}`,
        tags: second === undefined ? [first] : [first, second],
        cefr: cefrAt(p, size),
        ...(root === undefined ? {} : { root }),
      });
    }
    return { id: `r${String(r)}-d${String(d)}`, lexicon };
  });

  const encounters: EncounterData[] = TIERS.map((tier, k) => ({
    id: `r${String(r)}-e${String(k)}`,
    tags: [tag(2 * k + r), tag(2 * k + 1 + r)],
    tier,
  }));

  const cardSets = Array.from({ length: SETS }, (_, s) => ({
    id: `r${String(r)}-set-${String(s)}`,
    bonus: 0.25,
  }));
  const cultureCards: CultureCard[] = [];
  for (let s = 0; s < SETS; s++) {
    for (let c = 0; c < CARDS_PER_SET; c++) {
      const id = `r${String(r)}-card-${String(s)}-${String(c)}`;
      const tags = [tag(draw('card-tags', TAGS.length))];
      const card: CultureCard = {
        id,
        setId: `r${String(r)}-set-${String(s)}`,
        tags,
        bonus: 0.05,
        phrasePack: PACK_CEFR.map((cefr, j) => ({
          id: `${id}-w${String(j)}`,
          tags,
          cefr,
        })),
      };
      if (s === 0 && c === 0) {
        // One festival card per region, live for a week this year and next.
        const start = BOT_EPOCH_WALL_MS + (14 + 28 * r) * DAY_MS;
        cultureCards.push({
          ...card,
          festival: {
            windows: [
              { startWallMs: start, endWallMs: start + 7 * DAY_MS },
              {
                startWallMs: start + 364 * DAY_MS,
                endWallMs: start + 371 * DAY_MS,
              },
            ],
          },
        });
      } else {
        cultureCards.push(card);
      }
    }
  }

  const grammarNodes: GrammarNode[] = Array.from(
    { length: GRAMMAR_NODES },
    (_, g) => {
      const nodeRoots = [roots[2 * g], roots[2 * g + 1]].filter(
        (x): x is string => x !== undefined,
      );
      return {
        id: `r${String(r)}-gram-${String(g)}`,
        roots: nodeRoots,
        derived: Array.from(
          { length: DERIVED_PER_NODE },
          (_, j): LexiconItem => {
            const root = nodeRoots[j % nodeRoots.length];
            return {
              id: `r${String(r)}-gram-${String(g)}-w${String(j)}`,
              tags: [tag(draw('derived-tags', TAGS.length))],
              cefr: 'A2',
              ...(root === undefined ? {} : { root }),
            };
          },
        ),
      };
    },
  );

  return {
    id: `r${String(r)}`,
    destinations,
    encounters,
    cardSets,
    cultureCards,
    grammarNodes,
  };
}

/** The synthetic course for a seed, as content. The same seed always gives a deep-equal course. */
export function syntheticCourseData(seed: number): CourseData {
  const draw = drawer(seed);
  return {
    id: `synthetic-${String(seed)}`,
    tags: [...TAGS],
    regions: Array.from({ length: REGIONS }, (_, r) => region(r, draw)),
  };
}

/** The synthetic course for a seed, priced by the ladder: what the bots play. */
export function syntheticCourse(seed: number): Course {
  return resolveCourse(syntheticCourseData(seed));
}
