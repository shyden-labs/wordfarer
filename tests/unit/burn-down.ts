/**
 * `from` minus `taken`, one occurrence per match, so two identical sites need
 * two entries. A guard's burn-down list compares both ways: sites missing from
 * the list, and entries that no longer match a site.
 */
export const minus = (
  from: readonly string[],
  taken: readonly string[],
): string[] => {
  const left = [...taken];
  return from.filter((item) => {
    const at = left.indexOf(item);
    if (at === -1) return true;
    left.splice(at, 1);
    return false;
  });
};

/** The burn-down key of a scope: `file › test title as written`. */
export const scopeKey = (file: string, label: string): string =>
  `${file} › ${label}`;

/** A site still to be converted, with the file it was read in. */
export interface ListedSite {
  readonly file: string;
  readonly label: string;
}

/** How a guard words its findings against its own list. */
export interface ListWording {
  /** What a site is called in a count: `unproved`. */
  readonly noun: string;
  /** What to do about a site the list does not hold. */
  readonly fix: string;
  /** The list's path, to lower an entry in. */
  readonly list: string;
}

/**
 * Every scope whose sites differ from a burn-down list, both ways, and every
 * entry that is not a whole number of at least one: a new site fails, and so
 * does one converted without the list being lowered, so the list only
 * shrinks.
 */
export function listFindings(
  sites: readonly ListedSite[],
  listed: Readonly<Record<string, number>>,
  wording: ListWording,
): string[] {
  const now = new Map<string, number>();
  for (const { file, label } of sites) {
    const key = scopeKey(file, label);
    now.set(key, (now.get(key) ?? 0) + 1);
  }
  const keys = [...new Set([...now.keys(), ...Object.keys(listed)])].sort();
  return keys.flatMap((key) => {
    const read = now.get(key) ?? 0;
    const entry = listed[key];
    if (entry !== undefined && (!Number.isInteger(entry) || entry < 1))
      return [`${key}: listed as ${String(entry)}, not a count of at least 1`];
    const count = entry ?? 0;
    const counted = `${key}: ${String(read)} ${wording.noun}, ${String(count)} listed.`;
    if (read > count) return [`${counted} ${wording.fix}`];
    if (read < count)
      return [
        `${counted} Lower the entry in ${wording.list}: the list only shrinks.`,
      ];
    return [];
  });
}

/** Paths one list holds and the other does not, both ways. */
export const walkDisagreements = (
  walked: readonly string[],
  known: readonly string[],
): string[] => [
  ...walked
    .filter((path) => !known.includes(path))
    .map((path) => `${path}: walked, not in git's list`),
  ...known
    .filter((path) => !walked.includes(path))
    .map((path) => `${path}: in git's list, not walked`),
];
