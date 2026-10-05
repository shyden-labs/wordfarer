/**
 * Recorded liveness floors, checked for equality (#361).
 *
 * A liveness floor proves a guard read its population: a guard judging
 * nothing because its reader went blind must not look like a clean suite.
 * Written as a literal `toBeGreaterThan(measured - 1)`, a floor is tight only
 * on the day it is measured, because growth never fails it: shyden.co.uk set
 * one to `> 420` against a real 421 and read 424 an hour after it merged, so
 * its reader could have lost three units in silence.
 *
 * So each floor is a figure recorded in `tests/floors.json` and checked for
 * EQUALITY. Fewer than recorded is a reader that lost units, or a corpus that
 * really shrank, which only a person can tell apart, so the figure is lowered
 * by hand with the reason in the commit. More than recorded is a population
 * that grew, and `npm run floors:record` raises it. Neither direction moves
 * on its own, so every floor is exact on every commit.
 *
 * Runner-neutral: it imports no runner and returns the breach as text for
 * the caller's own `expect`, placed AFTER the guard's verdict so a population
 * that grew never hides a finding:
 *
 *     expect(searched(findings, { of: files, what: 'test files' })).toEqual([]);
 *     expect(floorBreach('one-test-per-case/files', files.length)).toBeUndefined();
 *
 * The floor counts the very population the search names in `of:`;
 * `floorless-searches.test.ts` holds that.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOORS_FILE, RECORD_ENV } from '../scripts/record-floors';

export { FLOORS_FILE, RECORD_ENV };

export type Floors = Readonly<Record<string, number>>;

/**
 * The repository root, from this file's own place rather than the working
 * directory: the web gate's suite runs from `apps/web`, where a relative
 * `tests/floors.json` names nothing.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

export const readFloors = (file: string = join(ROOT, FLOORS_FILE)): Floors =>
  JSON.parse(readFileSync(file, 'utf8')) as Floors;

const THIS_FILE = relative(ROOT, fileURLToPath(import.meta.url));

/**
 * The repository-relative `file:line` that called the check: the first stack
 * frame outside this file and outside node_modules. The recorder tells two
 * call sites of one id apart by it.
 */
const callSite = (stack: string): string => {
  for (const line of stack.split('\n').slice(1)) {
    // V8 writes `at name (where:line:column)` or `at where:line:column`, and
    // `where` is a path or a file URL.
    const frame =
      /\((.+):(\d+):\d+\)$/.exec(line) ?? /^\s*at (.+):(\d+):\d+$/.exec(line);
    if (!frame?.[1] || !frame[2]) continue;
    const path = frame[1].startsWith('file:')
      ? fileURLToPath(frame[1])
      : frame[1];
    const file = relative(ROOT, path);
    if (file !== THIS_FILE && !file.includes('node_modules'))
      return `${file}:${frame[2]}`;
  }
  // Refused, never guessed.
  throw new Error(`cannot tell which file called floorBreach:\n${stack}`);
};

export interface FloorOptions {
  /** The recorded figures; read from `FLOORS_FILE` when judging, if absent. */
  readonly floors?: Floors;
  /**
   * Where to record, `null` to judge. Absent means the environment decides
   * (`RECORD_ENV`): a test of this module passes `null`, so a record run
   * never mistakes its fixtures for real floors.
   */
  readonly record?: string | null;
}

/**
 * Nothing when `actual` equals the figure recorded for `id`; otherwise the
 * breach, naming the id, both numbers and what to do. In record mode it
 * appends `{ id, actual, site }` and says nothing, so one run sees every
 * floor. Something that is not a count is refused in both modes.
 */
export function floorBreach(
  id: string,
  actual: number,
  options: FloorOptions = {},
): string | undefined {
  if (!Number.isInteger(actual) || actual < 0)
    return `${id}: ${String(actual)} is not a count`;
  const record =
    options.record === undefined
      ? (process.env[RECORD_ENV] ?? null)
      : options.record;
  if (record !== null) {
    const site = callSite(new Error().stack ?? '');
    appendFileSync(record, JSON.stringify({ id, actual, site }) + '\n');
    return undefined;
  }
  const measured = (options.floors ?? readFloors())[id];
  if (measured === undefined)
    return `${id} is not recorded in ${FLOORS_FILE}: run npm run floors:record`;
  if (actual < measured)
    return (
      `${id}: read ${String(actual)}, recorded ${String(measured)}. The ` +
      `reader lost ${String(measured - actual)}, or the corpus shrank: if it ` +
      `shrank, lower the figure in ${FLOORS_FILE} by hand and say why in the ` +
      `commit.`
    );
  if (actual > measured)
    return (
      `${id}: read ${String(actual)}, recorded ${String(measured)}. The ` +
      `population grew by ${String(actual - measured)}: run npm run ` +
      `floors:record, read what it moved, and commit ${FLOORS_FILE}.`
    );
  return undefined;
}
