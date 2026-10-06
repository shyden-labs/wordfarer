/**
 * One line of the site's words and where what it says comes from (#334).
 *
 * The website spec's copy rule (§3): every claim about a mechanic traces to
 * the parent spec, a recorded operator decision or a merged design spec, and a
 * claim with no source is cut, not softened. So every line carries at least
 * one source, the type refuses a line with none, and
 * `tests/unit/site-copy.test.ts` refuses a source that names nothing real.
 * There is no unsourced kind of line: a label that makes no claim still cites
 * the section that asks for it.
 */
export type Source =
  /** A section of `docs/superpowers/specs/2026-10-01-yawelo-idle-design.md`, e.g. `parent §3.4`. */
  | `parent §${string}`
  /** A section of `docs/superpowers/specs/2026-10-04-website-design.md`, e.g. `site §6.1`. */
  | `site §${string}`
  /** An operator decision in the parent spec's table (§2), e.g. `D2`. */
  | `D${number}`
  /** An operator decision in the website spec's table (§2), e.g. `W9`. */
  | `W${number}`
  /** A player-trust requirement in the parent spec's do-not list (§9), e.g. `DN14`. */
  | `DN${number}`
  /** An issue that records operator decisions and that a spec cites, e.g. `#328`. */
  | `#${number}`
  /** A tracked file that states the fact, e.g. `file:TRADEMARKS.md`. */
  | `file:${string}`;

export class CopyLine {
  constructor(
    readonly text: string,
    readonly sources: readonly Source[],
  ) {}
}

/** A line of copy, with at least one source. */
export const line = (
  text: string,
  ...sources: [Source, ...Source[]]
): CopyLine => new CopyLine(text, sources);
