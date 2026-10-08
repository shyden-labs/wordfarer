/**
 * Core keeps answers it would otherwise work out again (#33, #473, #297):
 * each memo is keyed by every input its answer reads. `withoutMemos` runs a
 * function with every such memo working its answer out afresh, through the
 * very same code, so a test can hold the kept answers to the fresh ones and
 * any rule change reaches both at once (operator, 2026-10-08: never a frozen
 * copy). A count, not a flag, so a call inside another stays plain.
 */
let plain = 0;

/** Whether memos may keep and serve answers: false inside `withoutMemos`. */
export function memosOn(): boolean {
  return plain === 0;
}

/** `run`'s answer with every memo bypassed, worked out afresh throughout. */
export function withoutMemos<T>(run: () => T): T {
  plain += 1;
  try {
    return run();
  } finally {
    plain -= 1;
  }
}
