/**
 * The state hash (M1 design §4, #34): SHA-256 of a canonical serialisation,
 * computed synchronously with the pure-JS `@noble/hashes`, so M5 can replay a
 * player's log on the server and compare.
 *
 * The canonical form is a stored format, so it is fixed here: object keys in
 * code-unit order, strings as JSON writes them, and every number as the 16
 * hex digits of its IEEE-754 bits. ECMAScript leaves the last digit of
 * `Number.prototype.toString` to the engine, and the bits are what must
 * agree, so `0` and `-0` are written apart. Anything that is not plain data
 * is refused by its path, so it can never hash as something else.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { isPlainObject } from './events';
import type { GameState } from './state';

/** A finite number's IEEE-754 bits, big-endian, as 16 hex digits after `0x`. */
function bits(value: number, path: string): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${path} is ${String(value)}: not a finite number`);
  }
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const high = view.getUint32(0).toString(16).padStart(8, '0');
  const low = view.getUint32(4).toString(16).padStart(8, '0');
  return `0x${high}${low}`;
}

/**
 * The canonical serialisation of plain data: `null`, booleans, strings,
 * finite numbers, dense arrays and plain objects. `path` names the value in
 * any refusal.
 */
export function canonical(value: unknown, path = 'state'): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      return bits(value, path);
    case 'object':
      break;
    default:
      throw new TypeError(`${path} is of type ${typeof value}: not plain data`);
  }
  if (Array.isArray(value)) {
    const items: string[] = [];
    // A hole reads as `undefined`, which is refused below by its index.
    for (let index = 0; index < value.length; index += 1) {
      items.push(canonical(value[index], `${path}[${String(index)}]`));
    }
    return `[${items.join(',')}]`;
  }
  if (!isPlainObject(value)) {
    throw new TypeError(`${path} is a class instance: not plain data`);
  }
  const entries = Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonical(value[key], `${path}.${key}`)}`,
    );
  return `{${entries.join(',')}}`;
}

/** SHA-256 of the state's canonical form, as 64 lowercase hex digits. */
export function stateHash(state: GameState): string {
  return bytesToHex(sha256(utf8ToBytes(canonical(state))));
}
