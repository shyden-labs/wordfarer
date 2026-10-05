/**
 * The cross-check on `floorless-searches.ts`, read from text (#361).
 *
 * The reader walks the parse tree; this counts the same constructs in a
 * file's code with every literal and comment removed (`codeWithoutLiterals`),
 * by balancing brackets, and shares no helper with it. A form the reader
 * stops seeing still shows here, so a file whose two counts differ is a
 * finding. Its lists are its own on purpose: a list shared with the reader
 * would go blind with it.
 */

/** Run modifiers and table forms of `it`/`test` that still declare a test. */
const MODIFIERS = new Set([
  'only',
  'skip',
  'fails',
  'concurrent',
  'fixme',
  'fail',
  'slow',
]);
const TABLES = new Set(['each', 'for']);

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);

/** The index of the bracket closing the one at `open`, or -1. */
export function closing(code: string, open: number): number {
  let depth = 0;
  for (let at = open; at < code.length; at += 1) {
    const char = code[at] as string;
    if (char in OPENERS) depth += 1;
    else if (CLOSERS.has(char)) {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

/** The index of the bracket opening the one at `close`, or -1. */
function opening(code: string, close: number): number {
  let depth = 0;
  for (let at = close; at >= 0; at -= 1) {
    const char = code[at] as string;
    if (CLOSERS.has(char)) depth += 1;
    else if (char in OPENERS) {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

/** `text` split at the commas outside any bracket, each part trimmed, empties dropped. */
export function topLevelArguments(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] as string;
    if (char in OPENERS) depth += 1;
    else if (CLOSERS.has(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(from, at));
      from = at + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/** The text between the bracket at `open` and its closer, or undefined. */
const inside = (code: string, open: number): string | undefined => {
  const close = closing(code, open);
  return close === -1 ? undefined : code.slice(open + 1, close);
};

/** Whether `text` ends with a call of `.name(…)`. */
function endsWithCallOf(text: string, name: string): boolean {
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith(')')) return false;
  const open = opening(trimmed, trimmed.length - 1);
  return (
    open > 0 &&
    new RegExp(`\\.\\s*${name}\\s*(?:<[^()]*>)?\\s*$`).test(
      trimmed.slice(0, open),
    )
  );
}

/**
 * The index of the `(` that calls what ends just before `at`, past any type
 * arguments, or -1. Type arguments may hold parentheses and arrows,
 * `<[string, () => Course]>`, so they are skipped by balancing `<` and `>`,
 * where the `>` of an arrow `=>` closes nothing.
 */
export function callOpening(code: string, at: number): number {
  let index = at;
  const skipSpace = (): void => {
    while (/\s/.test(code[index] ?? '')) index += 1;
  };
  skipSpace();
  if (code[index] === '<') {
    let depth = 0;
    for (; index < code.length; index += 1) {
      const char = code[index];
      if (char === '<') depth += 1;
      else if (char === '>' && code[index - 1] !== '=') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) return -1;
    index += 1;
    skipSpace();
  }
  return code[index] === '(' ? index : -1;
}

/**
 * Whether `subject` starts with a `searched(…)` or `againstControl(…)` call,
 * whatever is read from it after: `againstControl(…).size`.
 */
function startsWithWrapper(subject: string): boolean {
  const name = /^(?:searched|againstControl)(?![\w$])/.exec(subject);
  return name !== null && callOpening(subject, name[0].length) !== -1;
}

/** Whether an `expect(subject)…name(argument)` assertion is a bare absence form. */
function isBareAbsence(
  subject: string,
  negated: boolean,
  name: string,
  argument: string,
): boolean {
  if (startsWithWrapper(subject)) return false;
  if (negated) return ['toContain', 'toContainEqual', 'toMatch'].includes(name);
  const equality = name === 'toEqual' || name === 'toStrictEqual';
  if (equality && /^(\[\s*\]|\{\s*\})$/.test(argument)) return true;
  if (name === 'toHaveLength' && argument === '0') return true;
  if (
    (name === 'toBe' || equality) &&
    argument === '0' &&
    /\.\s*(length|size)$/.test(subject)
  )
    return true;
  if (name !== 'toBe') return false;
  return (
    (argument === 'false' && endsWithCallOf(subject, 'some')) ||
    (argument === 'true' && endsWithCallOf(subject, 'every'))
  );
}

const EXPECT = /(?<![\w$.])expect\s*(?:\.\s*soft\s*)?\(/g;
const MATCHER = /^\s*(\.\s*not\s*)?\.\s*(\w+)\s*\(/;

/** How many bare absence assertions `code` writes (literals and comments already removed). */
export function bareAbsencesWritten(code: string): number {
  let count = 0;
  for (const match of code.matchAll(EXPECT)) {
    const open = match.index + match[0].length - 1;
    const close = closing(code, open);
    if (close === -1) continue;
    const [subject = ''] = topLevelArguments(code.slice(open + 1, close));
    const after = code.slice(close + 1);
    const matcher = MATCHER.exec(after);
    if (!matcher) continue;
    const argumentOpen = close + 1 + matcher[0].length - 1;
    const [argument = ''] = topLevelArguments(inside(code, argumentOpen) ?? '');
    if (
      isBareAbsence(
        subject,
        matcher[1] !== undefined,
        matcher[2] as string,
        argument,
      )
    )
      count += 1;
  }
  return count;
}

/**
 * How many `searched` and `againstControl` calls `code` writes: after
 * anything but a name character or a property dot, so `[...searched(` counts
 * and `obj.searched(` does not. A definition, `function searched<T>(`, is no
 * call.
 */
export function searchesWritten(code: string): number {
  const calls = code.replace(
    /(?<![\w$])function\s+(?:searched|againstControl)(?![\w$])/g,
    'function _',
  );
  return [
    ...calls.matchAll(
      /(?<![\w$])(?<!(?<!\.\.)\.)(?:searched|againstControl)(?![\w$])/g,
    ),
  ].filter((match) => callOpening(calls, match.index + match[0].length) !== -1)
    .length;
}

/** Every absence site `code` writes: searches plus bare forms. */
export const absencesWritten = (code: string): number =>
  searchesWritten(code) + bareAbsencesWritten(code);

/** `toBe(0)`, `toEqual(0)` or `toStrictEqual(0)`, as the code spells it. */
const ZERO_TEXT = /\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*0\s*\)/g;

/**
 * How many zero assertions `code` writes, negated or not (#367): the text
 * count the reader's `zeroAssertions` is checked against.
 */
export const zerosWritten = (code: string): number =>
  code.match(ZERO_TEXT)?.length ?? 0;

const FUNCTION_TEXT =
  /^(?:async\s*)?(?:function\b|(?:\([\s\S]*?\)|[\w$]+)\s*(?::[^=]+)?=>)/;

const TEST_NAME = /(?<![\w$.])(?:it|test)((?:\s*\.\s*[\w$]+)*)(?![\w$])/g;

/**
 * How many tests `code` declares with a body: `it`/`test`, their run
 * modifiers, and a table form's second call. An annotation, `test.skip(cond,
 * why)`, has no body, or a predicate first, and declares none.
 */
export function testsWritten(code: string): number {
  let count = 0;
  for (const match of code.matchAll(TEST_NAME)) {
    const members = (match[1] ?? '')
      .split('.')
      .map((member) => member.trim())
      .filter((member) => member !== '');
    const last = members.at(-1);
    const table = last !== undefined && TABLES.has(last);
    const modifiers = table ? members.slice(0, -1) : members;
    if (!modifiers.every((member) => MODIFIERS.has(member))) continue;
    let open = callOpening(code, match.index + match[0].length);
    if (open === -1) continue;
    if (table) {
      const tableClose = closing(code, open);
      const next = /^\s*\(/.exec(code.slice(tableClose + 1));
      if (tableClose === -1 || !next) continue;
      open = tableClose + next[0].length;
    }
    const args = topLevelArguments(inside(code, open) ?? '');
    const [first = ''] = args;
    if (
      !FUNCTION_TEXT.test(first) &&
      args.some((arg) => FUNCTION_TEXT.test(arg))
    )
      count += 1;
  }
  return count;
}
