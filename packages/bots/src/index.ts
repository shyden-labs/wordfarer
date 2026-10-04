/**
 * @wordfarer/bots: simulated players that play the real core and measure
 * its pacing (M1 design §6, #35).
 */
export {
  CASUAL_SEED,
  PERSONAS,
  persona,
  type BuyStyle,
  type Persona,
} from './personas';
export {
  BOOTSTRAP_TAP_MS,
  offersDecision,
  Player,
  STEP_MS,
  type Action,
  type Watcher,
} from './player';
export {
  insaneValues,
  runPersona,
  type PersonaRun,
  type RunOptions,
  type Sail,
} from './run';
export {
  CALIBRATE_DEFAULTS,
  calibrateGoals,
  threeFiguresDown,
  UNREACHABLE,
  type CalibratedGoal,
  type CalibrateOptions,
  type Measure,
} from './calibrate';
export {
  DAY_MS,
  dayOpens,
  FIRST_SESSION_MS,
  HOUR_MS,
  MIN_OPEN_GAP_MS,
  MINUTE_MS,
  WAKE_MS,
  WAKING_MS,
  type Open,
} from './schedule';
export {
  LATENCY_MEDIAN_MS,
  LATENCY_SIGMA,
  STREAM_NAMES,
  Streams,
  type StreamName,
} from './streams';
