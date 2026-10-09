import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import {
  ALLOWANCES,
  type Allowance,
  judge,
  keyOf,
  linesNaming,
  OLD,
  OLD_NAME,
  readText,
} from './old-name';

const FILE: Allowance = {
  kind: 'history file',
  path: 'docs/old.md',
  reason: 'a record',
};
const SECTION: Allowance = {
  kind: 'history section',
  path: 'docs/spec.md',
  heading: '## 2. Log',
  reason: 'a log',
};
const QUOTE: Allowance = {
  kind: 'quote',
  path: 'docs/spec.md',
  quote: `make the ${OLD} site`,
  reason: 'their words',
};

describe('judge (#356)', () => {
  it('finds the old name in each case form, with its line and column', () => {
    const UPPER = OLD_NAME.toUpperCase();
    const text = [
      `# ${OLD_NAME}`,
      `const ${OLD}Golden = 1;`,
      `${UPPER}_COMMIT=x`,
      `import '@${OLD}/core';`,
      'a clean line',
    ].join('\n');
    expect(judge('src/a.ts', text, [])).toEqual({
      findings: [
        `src/a.ts:1:3: # ${OLD_NAME}`,
        `src/a.ts:2:7: const ${OLD}Golden = 1;`,
        `src/a.ts:3:1: ${UPPER}_COMMIT=x`,
        `src/a.ts:4:10: import '@${OLD}/core';`,
      ],
      allowed: {},
    });
  });

  it('finds each of two occurrences on one line', () => {
    expect(judge('a.md', `${OLD_NAME} and ${OLD}`, [])).toEqual({
      findings: [
        `a.md:1:1: ${OLD_NAME} and ${OLD}`,
        `a.md:1:15: ${OLD_NAME} and ${OLD}`,
      ],
      allowed: {},
    });
  });

  it('allows every occurrence in a history file, and counts them', () => {
    expect(judge('docs/old.md', `${OLD_NAME}\n${OLD}`, [FILE])).toEqual({
      findings: [],
      allowed: { [keyOf(FILE)]: 2 },
    });
  });

  it('allows nothing in another file for a history file', () => {
    expect(judge('docs/new.md', OLD_NAME, [FILE])).toEqual({
      findings: [`docs/new.md:1:1: ${OLD_NAME}`],
      allowed: {},
    });
  });

  it('allows a history section to the next heading of its level, past a fenced one', () => {
    const text = [
      '# Spec',
      '## 1. Intent',
      `${OLD_NAME} intent`,
      '## 2. Log',
      `${OLD_NAME} logged`,
      '### 2.1 Detail',
      `${OLD_NAME} deeper`,
      '```sh',
      '## 3. Fenced',
      '```',
      `${OLD_NAME} after the fence`,
      '## 3. Next',
      `${OLD_NAME} next`,
    ].join('\n');
    expect(judge('docs/spec.md', text, [SECTION])).toEqual({
      findings: [
        `docs/spec.md:3:1: ${OLD_NAME} intent`,
        `docs/spec.md:13:1: ${OLD_NAME} next`,
      ],
      allowed: { [keyOf(SECTION)]: 3 },
    });
  });

  it('ends a history section at a heading of a higher level', () => {
    const text = ['## 2. Log', `${OLD} logged`, '# Top', `${OLD} after`].join(
      '\n',
    );
    expect(judge('docs/spec.md', text, [SECTION])).toEqual({
      findings: [`docs/spec.md:4:1: ${OLD} after`],
      allowed: { [keyOf(SECTION)]: 1 },
    });
  });

  it('allows nothing under the same heading in another file', () => {
    expect(judge('docs/other.md', `## 2. Log\n${OLD}`, [SECTION])).toEqual({
      findings: [`docs/other.md:2:1: ${OLD}`],
      allowed: {},
    });
  });

  it('reads no heading in a file that is not Markdown', () => {
    const notMarkdown: Allowance = { ...SECTION, path: 'docs/spec.ts' };
    expect(judge('docs/spec.ts', `## 2. Log\n${OLD}`, [notMarkdown])).toEqual({
      findings: [`docs/spec.ts:2:1: ${OLD}`],
      allowed: {},
    });
  });

  it('allows a quote only inside the quoted words', () => {
    const line = `They said _"make the ${OLD} site"_ about ${OLD_NAME}.`;
    expect(judge('docs/spec.md', line, [QUOTE])).toEqual({
      findings: [
        `docs/spec.md:1:${String(line.lastIndexOf(OLD_NAME) + 1)}: ${line}`,
      ],
      allowed: { [keyOf(QUOTE)]: 1 },
    });
  });

  it('allows nothing for a quote in another file', () => {
    const line = `make the ${OLD} site`;
    expect(judge('docs/other.md', line, [QUOTE])).toEqual({
      findings: [`docs/other.md:1:10: ${line}`],
      allowed: {},
    });
  });

  it('counts an occurrence once, under the first allowance that covers it', () => {
    const line = `make the ${OLD} site`;
    const quoted: Allowance = {
      kind: 'quote',
      path: 'docs/old.md',
      quote: line,
      reason: 'their words',
    };
    expect(judge('docs/old.md', line, [FILE, quoted])).toEqual({
      findings: [],
      allowed: { [keyOf(FILE)]: 1 },
    });
  });
});

describe('linesNaming (#356)', () => {
  it('counts the lines naming the old name in any case, once each', () => {
    const UPPER = OLD_NAME.toUpperCase();
    expect(
      linesNaming(
        [`${OLD_NAME} ${OLD}`, 'clean', UPPER, `${OLD}Golden`].join('\n'),
      ),
    ).toBe(3);
  });
});

describe('readText (#356)', () => {
  it('returns the text of valid UTF-8', () => {
    expect(readText('a.md', new TextEncoder().encode('café'))).toEqual({
      text: 'café',
    });
  });

  it('refuses a file holding a NUL byte, by name', () => {
    expect(readText('a.bin', Uint8Array.of(0x61, 0, 0x62))).toEqual({
      refused: 'a.bin: holds a NUL byte, so it is not text',
    });
  });

  it('refuses a file that is not valid UTF-8, by name', () => {
    expect(readText('a.txt', Uint8Array.of(0x61, 0xff))).toEqual({
      refused: 'a.txt: is not valid UTF-8',
    });
  });
});

describe('every allowance still covers an occurrence (#356)', () => {
  it('names each allowance once', () => {
    const keys = ALLOWANCES.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
    // An empty list holds no duplicate either: the floor proves it is read.
    expect(floorBreach('old-name/allowances', keys.length)).toBeUndefined();
  });
});
