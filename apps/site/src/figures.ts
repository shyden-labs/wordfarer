import { BALANCE, RANKS } from '@yawelo-idle/core';
import type { Figure } from './copy-line';

/**
 * The site's figures, read from the game's own tables (#443), so the copy
 * cannot state a number the game no longer has. Operator decision,
 * 2026-10-06 17:54 UTC: **digits update by themselves; words go red.** A
 * figure shown as digits (`digits`, `duration`, the rank names) follows the
 * game. A figure shown in words (`words`) carries the words for each value
 * the operator approved, and a value without them is a `missing` figure the
 * copy guard refuses, because "seven tenths" written by a machine is not
 * copy anyone approved.
 */

/** The game tables a figure key may start with. */
export const GAME: Tables = { BALANCE, RANKS };

export type Tables = Readonly<Record<string, unknown>>;

/**
 * The value at a dotted key, e.g. `BALANCE.memory.queueSize`; an array index
 * may be negative, so `-1` is the last element and a longer table still reads
 * its end. A key that names nothing is refused, never read as undefined.
 */
export function valueAt(key: string, tables: Tables = GAME): unknown {
  let value: unknown = tables;
  for (const step of key.split('.')) {
    if (Array.isArray(value) && /^-?\d+$/u.test(step))
      value = value.at(Number(step));
    else if (
      typeof value === 'object' &&
      value !== null &&
      Object.hasOwn(value, step)
    )
      value = (value as Record<string, unknown>)[step];
    else value = undefined;
    if (value === undefined)
      throw new Error(`${key} names nothing in the game tables`);
  }
  return value;
}

/** A whole number, shown as digits: it follows the game by itself. */
export function digits(key: string, tables: Tables = GAME): Figure {
  const value = valueAt(key, tables);
  if (!Number.isInteger(value))
    throw new Error(
      `${key} is ${String(value)}, not a whole number to show as digits`,
    );
  return { key, text: String(value) };
}

const UNITS = [
  { ms: 24 * 60 * 60_000, one: 'day', many: 'days' },
  { ms: 60 * 60_000, one: 'hour', many: 'hours' },
  { ms: 60_000, one: 'minute', many: 'minutes' },
] as const;

/**
 * A duration in milliseconds, shown as digits in the largest unit that
 * divides it: 30 minutes, 2 hours, 1 day, 90 minutes.
 */
export function duration(key: string, tables: Tables = GAME): Figure {
  const ms = valueAt(key, tables);
  const unit =
    typeof ms === 'number' && ms > 0
      ? UNITS.find((u) => ms % u.ms === 0)
      : undefined;
  if (unit === undefined || typeof ms !== 'number')
    throw new Error(`${key} is ${String(ms)} ms, not whole minutes`);
  const count = ms / unit.ms;
  return {
    key,
    text: `${String(count)} ${count === 1 ? unit.one : unit.many}`,
  };
}

/**
 * A figure shown in words, with the words for each approved value. A value
 * without words shows its key, never stale words, and is `missing`.
 */
export function words(
  key: string,
  phrases: Readonly<Record<string, string>>,
  tables: Tables = GAME,
): Figure {
  const value = String(valueAt(key, tables));
  const phrase = phrases[value];
  if (phrase !== undefined) return { key, text: phrase };
  return {
    key,
    text: `[${key} = ${value}]`,
    missing:
      `${key} is ${value}, and the copy has words only for ` +
      `${Object.keys(phrases).join(', ')}: write the words for ${value}, ` +
      'have Shyden approve them, and update the Indonesian (#338)',
  };
}

const rankLabel = (id: unknown, key: string): string => {
  if (typeof id !== 'string' || id === '')
    throw new Error(`${key} holds ${String(id)}, not a rank id`);
  return id.charAt(0).toUpperCase() + id.slice(1);
};

/** One rank's name as the site shows it, e.g. `RANKS.1` reads Recognised. */
export function rankName(key: string, tables: Tables = GAME): Figure {
  return { key, text: rankLabel(valueAt(key, tables), key) };
}

/** Every rank in order, as a sentence: "Heard, Recognised … and Mastered". */
export function rankList(key: string, tables: Tables = GAME): Figure {
  const ids = valueAt(key, tables);
  if (!Array.isArray(ids) || ids.length < 2)
    throw new Error(`${key} is not a list of ranks`);
  const names = ids.map((id) => rankLabel(id, key));
  return {
    key,
    text: `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`,
  };
}
