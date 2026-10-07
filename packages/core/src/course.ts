/**
 * CourseData: the typed shape a course must produce for core (M1 design §3),
 * and `Course`, the shape core plays once `resolveCourse` has priced it.
 *
 * A course is data, not code (parent §5.1): core never branches on a language.
 * This type holds only what moves a number; text, translations, audio and the
 * review block stay in the content pack, and M2's Zod schema targets this
 * shape. It is plain, readonly data, so it serialises and deep-compares.
 *
 * Shape: a course has regions (parent §4.4); a region has destinations, each
 * with its lexicon in curriculum order, plus the region's Encounters, culture
 * cards and their sets, and grammar nodes. Tags are shared across the whole
 * course, so words from an earlier region keep paying on later Encounters
 * (parent §3.3).
 *
 * Content places each Encounter on a tier of the ladder; it never prices one.
 * `resolveCourse` gives each its cost and output from `BALANCE.encounters`
 * by tier and region, so every course, synthetic or real, plays on the
 * ladder the pacing bots tuned (#35 AC8, operator 2026-10-04).
 */

import { BALANCE } from './balance';

/**
 * The CEFR levels v1 teaches (parent §5.2: A1 to B1), in order. The one
 * definition: `Cefr` derives from it and content's schema enumerates it
 * (#101 AC5), so a level exists in one place.
 */
export const CEFR_LEVELS = ['A1', 'A2', 'B1'] as const;

export type Cefr = (typeof CEFR_LEVELS)[number];

/** A word or phrase the player can pick up (parent §5.2, the fields core needs). */
export interface LexiconItem {
  readonly id: string;
  readonly tags: readonly string[];
  readonly cefr: Cefr;
  /** The grammar root this item derives from, when a grammar node can attach to it. */
  readonly root?: string;
}

/** An Encounter's rung on `BALANCE.encounters.ladder`. */
export type Tier = 1 | 2 | 3 | 4 | 5 | 6;

/** An Encounter as content gives it: its place on the ladder, no price. */
export interface EncounterData {
  readonly id: string;
  readonly tags: readonly string[];
  readonly tier: Tier;
}

/**
 * An Encounter as core plays it, priced by `resolveCourse` (parent §3.2): the
 * n-th purchase costs c0 x growth^n, output scales with p0.
 */
export interface Encounter {
  readonly id: string;
  readonly tags: readonly string[];
  /** Understanding cost of the first purchase. */
  readonly c0: number;
  /** Understanding per second from one owned, before multipliers. */
  readonly p0: number;
}

/** A wall-clock window [startWallMs, endWallMs) in which a festival is live. */
export interface FestivalWindow {
  readonly startWallMs: number;
  readonly endWallMs: number;
}

/** A culture card a Journey returns (parent §4.2). */
export interface CultureCard {
  readonly id: string;
  readonly setId: string;
  readonly tags: readonly string[];
  /** Permanent production bonus on the card's tags while held. */
  readonly bonus: number;
  /** Words the card adds to the pick-up pool once held (parent §4.2). */
  readonly phrasePack: readonly LexiconItem[];
  /** A real-calendar festival: the card's bonus is raised while a window is live. */
  readonly festival?: { readonly windows: readonly FestivalWindow[] };
}

/** A set of cards; holding every card in it grants the set bonus. */
export interface CardSet {
  readonly id: string;
  readonly bonus: number;
}

/** A grammar node (parent §4.3): multiplies words on its roots and teaches derived words. */
export interface GrammarNode {
  readonly id: string;
  readonly roots: readonly string[];
  /** Words the node adds to the pick-up pool. */
  readonly derived: readonly LexiconItem[];
}

export interface Destination {
  readonly id: string;
  /** Picked up in this order, CEFR A1 first (parent §3.3). */
  readonly lexicon: readonly LexiconItem[];
}

/** A region, its Encounters as content gives them (`E = EncounterData`) or priced. */
export interface RegionOf<E> {
  readonly id: string;
  readonly destinations: readonly Destination[];
  readonly encounters: readonly E[];
  readonly cardSets: readonly CardSet[];
  readonly cultureCards: readonly CultureCard[];
  readonly grammarNodes: readonly GrammarNode[];
}

export interface CourseOf<E> {
  readonly id: string;
  /** Every tag used anywhere in the course. */
  readonly tags: readonly string[];
  readonly regions: readonly RegionOf<E>[];
}

export type RegionData = RegionOf<EncounterData>;
export type Region = RegionOf<Encounter>;
/** A course as content gives it: what M2's schema targets. */
export type CourseData = CourseOf<EncounterData>;
/** A course as core plays it. */
export type Course = CourseOf<Encounter>;

function scaleOf(region: RegionData, index: number): number {
  const scale = BALANCE.encounters.regionScale[index];
  if (scale === undefined) {
    throw new RangeError(
      `region ${region.id} (${String(index)}) has no step in BALANCE.encounters.regionScale`,
    );
  }
  return scale;
}

function rungOf(encounter: EncounterData): { c0: number; p0: number } {
  const tier: number = encounter.tier;
  const rung = Number.isInteger(tier)
    ? BALANCE.encounters.ladder[tier - 1]
    : undefined;
  if (rung === undefined) {
    throw new RangeError(
      `Encounter ${encounter.id} has tier ${String(tier)}, not 1 to 6`,
    );
  }
  return rung;
}

/**
 * Price every Encounter of a course from `BALANCE.encounters`: tier `t` of
 * region `r` costs `ladder[t - 1].c0 x regionScale[r]` and yields
 * `ladder[t - 1].p0 x regionScale[r]`. Everything else is kept as given. A
 * tier off the ladder, or a region with no step, is refused by name.
 */
export function resolveCourse(data: CourseData): Course {
  return {
    ...data,
    regions: data.regions.map((region, index) => {
      const scale = scaleOf(region, index);
      return {
        ...region,
        encounters: region.encounters.map((encounter) => {
          const { c0, p0 } = rungOf(encounter);
          return {
            id: encounter.id,
            tags: encounter.tags,
            c0: c0 * scale,
            p0: p0 * scale,
          };
        }),
      };
    }),
  };
}
