/**
 * @wordfarer/core: every rule that moves a number (M1 design §1). Pure
 * TypeScript with no DOM, timers, network or system clock, so the same code
 * runs in browsers, Electron, Capacitor and Workers and replays identically.
 */
export { exp, expm1, ln, log10, log1p, pow } from './det-math';
export { Num, type NumTuple } from './num';
export {
  bucketEnd,
  bucketStart,
  gridTicksBetween,
  HOUR_MS,
  nextGridTick,
  simMs,
  wallMs,
  type SimMs,
  type WallMs,
} from './clock';
export {
  createStreams,
  drawFrom,
  intFrom,
  nextFloat,
  nextInt,
  nextU32,
  seedRng,
  type Draw,
  type RngState,
  type RngStreams,
} from './rng';
export {
  BALANCE,
  JOURNEY_DURATION_IDS,
  type Balance,
  type InsightUpgradeId,
  type JourneyDurationId,
  type Rank,
  type StampUpgradeId,
} from './balance';
export {
  encounterOutput,
  milestoneFactor,
  milestonesReached,
  purchaseCost,
} from './encounters';
export { cultureCard, festivalLive, heldCards } from './cards';
export {
  cardPool,
  collectJourney,
  journeyDurationMs,
  journeyStatus,
  startJourney,
  type JourneyStatus,
} from './journeys';
export {
  encounterRate,
  producedBetween,
  rateAt,
  rateBreakdown,
  rateGain,
  totalRate,
  understandingNow,
  wordMultiplier,
  type EncounterRate,
  type RateLine,
} from './production';
export {
  encounterCostFactor,
  encounterPrice,
  findUpgrade,
  globalMultiplier,
  journeyDurationFactor,
  journeySlots,
  offlineCapMs,
  pemanduIntervalsMs,
  phrasebookId,
  startingUnderstanding,
  upgradeCatalogue,
  upgradeLevel,
  type Upgrade,
  type UpgradeCurrency,
} from './upgrades';
export {
  RANKS,
  type MemoryCard,
  type QueueItem,
  type WordMemory,
} from './memory';
export { findGrammarNode, grammarNodeCost, ownedGrammarNodes } from './grammar';
export {
  automationOpensAt,
  automationUnlocked,
  bestPayback,
  nextPurchaseTick,
} from './automation';
export { pickUpCost, pickUpPool } from './words';
export {
  currentDestination,
  currentRegion,
  regionsReached,
  route,
  type Stop,
} from './route';
export {
  goalMet,
  runUnderstanding,
  sailGoal,
  sailPreview,
  setSail,
  stampGain,
  wordsHeld,
  type SailGoal,
  type SailPreview,
} from './sail';
export { UNFOLD_FLAGS, unfold, type Unfold, type UnfoldFlag } from './unfold';
export {
  EVENT_TYPES,
  parseEvent,
  PROMPT_TYPES,
  type EventError,
  type EventType,
  type GameEvent,
  type ParsedEvent,
  type PromptType,
} from './events';
export {
  advance,
  answerPractice,
  answerReview,
  buyEncounter,
  buyGrammarNode,
  buyUpgrade,
  integrate,
  listen,
  pickUpWord,
  setAutomation,
  view,
  type AdvanceSummary,
  type Rejection,
  type Result,
  type View,
} from './sim';
export {
  initialState,
  ownedCount,
  pickedWord,
  RNG_STREAMS,
  type Anchor,
  type Automation,
  type GameState,
  type Journey,
} from './state';
export type {
  CardSet,
  Cefr,
  CourseData,
  CultureCard,
  Destination,
  Encounter,
  FestivalWindow,
  GrammarNode,
  LexiconItem,
  Region,
} from './course';
