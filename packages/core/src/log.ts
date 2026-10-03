/**
 * The event log (M1 design §4, #34): `apply` is the only way the live state
 * changes, and `replay` folds a log through it, so the server replays exactly
 * what the client lived.
 *
 * `apply` checks `seq` first, then advances to the event's wall time (an
 * earlier time is clamped, never refused, DN21), then dispatches to the
 * action the event names. A refusal returns no state: the caller keeps the
 * state it passed, unadvanced, so a refused event is as if it was never
 * sent. `advance`'s own result is for `view` and is never stored, because
 * advancing and then applying differs from applying alone when the offline
 * cap clips.
 */
import type { CourseData } from './course';
import type { GameEvent } from './events';
import { collectJourney, startJourney } from './journeys';
import { setSail } from './sail';
import {
  advance,
  answerPractice,
  answerReview,
  buyEncounter,
  buyGrammarNode,
  buyUpgrade,
  listen,
  pickUpWord,
  setAutomation,
  type Rejection,
  type Result,
} from './sim';
import type { GameState } from './state';

/** A refused event of a replayed log: its `seq` and why. */
export interface Refusal {
  readonly seq: number;
  readonly rejection: Rejection;
}

export interface Replayed {
  readonly state: GameState;
  /** Every refused event, in log order. */
  readonly refused: readonly Refusal[];
}

/** The action `event` names, at the state already advanced to its wall time. */
function dispatch(course: CourseData, at: GameState, event: GameEvent): Result {
  switch (event.type) {
    case 'resume':
      return { ok: true, state: at };
    case 'listen':
      return { ok: true, state: listen(course, at) };
    case 'buyEncounter':
      return buyEncounter(course, at, event.id, event.count);
    case 'pickUpWord':
      return pickUpWord(course, at);
    case 'answerReview':
      return answerReview(course, at, event.itemId, event.correct);
    case 'answerPractice':
      return answerPractice(at, event.itemId);
    case 'buyUpgrade':
      return buyUpgrade(course, at, event.id);
    case 'startJourney':
      return startJourney(course, at, event.slot, event.durationId);
    case 'collectJourney':
      return collectJourney(course, at, event.slot);
    case 'setSail':
      return setSail(course, at, event.to);
    case 'buyGrammarNode':
      return buyGrammarNode(course, at, event.id);
    case 'setAutomation':
      return setAutomation(course, at, event.enabled, event.intervalMs);
  }
}

/**
 * Apply one event: refused as `staleSeq` unless its `seq` is above the
 * state's, then advanced to and dispatched. An accepted event's `seq`
 * becomes the state's.
 */
export function apply(
  course: CourseData,
  state: GameState,
  event: GameEvent,
): Result {
  if (event.seq <= state.seq) {
    return {
      ok: false,
      rejection: { kind: 'staleSeq', seq: event.seq, last: state.seq },
    };
  }
  const result = dispatch(
    course,
    advance(course, state, event.wallMs).state,
    event,
  );
  return result.ok
    ? { ok: true, state: { ...result.state, seq: event.seq } }
    : result;
}

/** Apply a log in order from `state`, keeping each refusal with its `seq`. */
export function replay(
  course: CourseData,
  state: GameState,
  events: readonly GameEvent[],
): Replayed {
  let current = state;
  const refused: Refusal[] = [];
  for (const event of events) {
    const result = apply(course, current, event);
    if (result.ok) current = result.state;
    else refused.push({ seq: event.seq, rejection: result.rejection });
  }
  return { state: current, refused };
}
