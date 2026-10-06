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
 *
 * A figure the game defines is never typed into a line (#443): it is a
 * `Figure` read from the game's own tables (`figures.ts`), placed with the `t`
 * template, so a balance change reaches the site by itself or turns CI red.
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

/** A figure the copy shows, read from a game table (#443). */
export interface Figure {
  /** Where the value lives, e.g. `BALANCE.memory.queueSize`. */
  readonly key: string;
  /** What the line shows for it. */
  readonly text: string;
  /**
   * Set when the value has no approved words: what changed and what to do.
   * The copy guard refuses it by the line's path.
   */
  readonly missing?: string;
}

/** A line's words with the figures in it, made by the `t` template. */
export class Template {
  constructor(readonly parts: readonly (string | Figure)[]) {}
}

/** `t\`never more than ${digits('BALANCE.memory.queueSize')} reviews\`` */
export const t = (
  strings: TemplateStringsArray,
  ...figures: Figure[]
): Template =>
  new Template(
    strings.flatMap((text, i) => {
      const figure = figures[i];
      return figure === undefined ? [text] : [text, figure];
    }),
  );

/**
 * What stands where a figure was in `unbound`: not a letter, digit or
 * sentence mark, so the checks neither read it as a word nor see a new
 * sentence start after it.
 */
const FIGURE_MARK = '·';

export class CopyLine {
  /** What the line shows. */
  readonly text: string;
  /** The figures read from the game, in order. */
  readonly figures: readonly Figure[];
  /** The text with every figure taken out: what the source checks read. */
  readonly unbound: string;

  constructor(
    content: string | Template,
    readonly sources: readonly Source[],
  ) {
    if (typeof content === 'string') {
      this.text = content;
      this.figures = [];
      this.unbound = content;
    } else {
      const { parts } = content;
      this.text = parts
        .map((p) => (typeof p === 'string' ? p : p.text))
        .join('');
      this.figures = parts.filter((p): p is Figure => typeof p !== 'string');
      this.unbound = parts
        .map((p) => (typeof p === 'string' ? p : FIGURE_MARK))
        .join('');
    }
  }
}

/** A line of copy, with at least one source. */
export const line = (
  content: string | Template,
  ...sources: [Source, ...Source[]]
): CopyLine => new CopyLine(content, sources);
