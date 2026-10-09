import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { againstControl } from '../searched';
import { indexPaths } from './git-index';

/**
 * git's index read in-process (#491): the guards' file list comes from
 * `.git/index` with no `git ls-files`, so no unit test starts git. Each index
 * here is built byte by byte from git's format document
 * (Documentation/gitformat-index.txt); tests/integration/tracked-files.test.ts
 * compares the reader with real git.
 */

interface Entry {
  readonly path: string;
  readonly stage?: number;
  readonly mode?: number;
  /** v3 and later: the second flags word, which sets the extended bit. */
  readonly extended?: number;
  /** Overrides the 12-bit name length git writes. */
  readonly nameLength?: number;
}

interface Built {
  readonly version?: number;
  readonly entries: readonly Entry[];
  readonly extensions?: readonly { signature: string; data: Uint8Array }[];
  readonly count?: number;
  readonly trailer?: 'sha1' | 'zero' | 'wrong';
}

const u32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
};

const u16 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value);
  return bytes;
};

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/** One entry as git writes it at versions 2 and 3: padded to 8 bytes with 1 to 8 NULs. */
const entry = ({
  path,
  stage = 0,
  mode = 0o100644,
  extended,
  nameLength,
}: Entry): Uint8Array => {
  const name = new TextEncoder().encode(path);
  const flags =
    (extended === undefined ? 0 : 0x4000) |
    (stage << 12) |
    (nameLength ?? Math.min(name.length, 0xfff));
  const head = concat(
    new Uint8Array(24), // ctime, mtime, dev, ino
    u32(mode),
    new Uint8Array(12), // uid, gid, size
    new Uint8Array(20), // object id
    u16(flags),
    extended === undefined ? new Uint8Array(0) : u16(extended),
    name,
  );
  return concat(head, new Uint8Array(8 - (head.length % 8)));
};

const built = ({
  version = 2,
  entries,
  extensions = [],
  count = entries.length,
  trailer = 'sha1',
}: Built): Uint8Array => {
  const body = concat(
    new TextEncoder().encode('DIRC'),
    u32(version),
    u32(count),
    ...entries.map(entry),
    ...extensions.flatMap(({ signature, data }) => [
      new TextEncoder().encode(signature),
      u32(data.length),
      data,
    ]),
  );
  const sum =
    trailer === 'zero'
      ? new Uint8Array(20)
      : new Uint8Array(createHash('sha1').update(body).digest());
  if (trailer === 'wrong') sum[0] = (sum[0] ?? 0) ^ 0xff;
  return concat(body, sum);
};

describe('indexPaths', () => {
  it('reads every path of a version 2 index, in index order', () => {
    expect(
      indexPaths(
        built({
          entries: [{ path: 'a.ts' }, { path: 'dir/b.ts' }, { path: 'z' }],
        }),
      ),
    ).toEqual(['a.ts', 'dir/b.ts', 'z']);
  });

  it('reads an index holding no entries', () => {
    const read = (entries: readonly Entry[]) => indexPaths(built({ entries }));
    expect(
      againstControl(read, { input: [], control: [{ path: 'a' }] }),
    ).toEqual([]);
  });

  it('pads a path whose entry already ends on 8 bytes with 8 NULs', () => {
    // 62 fixed bytes + 2 = 64: git still writes a full 8 bytes of NUL.
    expect(
      indexPaths(built({ entries: [{ path: 'ab' }, { path: 'next' }] })),
    ).toEqual(['ab', 'next']);
  });

  it('lists a conflicted path once, though the index holds it at three stages (#405)', () => {
    expect(
      indexPaths(
        built({
          entries: [
            { path: 'f.txt', stage: 1 },
            { path: 'f.txt', stage: 2 },
            { path: 'f.txt', stage: 3 },
            { path: 'keep.txt' },
          ],
        }),
      ),
    ).toEqual(['f.txt', 'keep.txt']);
  });

  it('reads a non-ASCII path as UTF-8', () => {
    expect(
      indexPaths(built({ entries: [{ path: 'kata/sāmpel é.txt' }] })),
    ).toEqual(['kata/sāmpel é.txt']);
  });

  it('reads a path of 4,095 bytes or more, whose length field is full', () => {
    const long = `${'d/'.repeat(2100)}f`;
    expect(indexPaths(built({ entries: [{ path: long }] }))).toEqual([long]);
  });

  it('reads a submodule entry as its path, as git ls-files lists it', () => {
    expect(
      indexPaths(built({ entries: [{ path: 'vendor/lib', mode: 0o160000 }] })),
    ).toEqual(['vendor/lib']);
  });

  it('reads a version 3 entry without extended flags', () => {
    expect(
      indexPaths(
        built({ version: 3, entries: [{ path: 'a' }, { path: 'b' }] }),
      ),
    ).toEqual(['a', 'b']);
  });

  it('lists a version 3 intent-to-add entry, as git ls-files --cached does', () => {
    expect(
      indexPaths(
        built({ version: 3, entries: [{ path: 'added', extended: 0x2000 }] }),
      ),
    ).toEqual(['added']);
  });

  it.each(['TREE', 'REUC', 'UNTR', 'FSMN', 'EOIE', 'IEOT'])(
    'passes over the optional %s extension',
    (signature) => {
      expect(
        indexPaths(
          built({
            entries: [{ path: 'a' }],
            extensions: [{ signature, data: new Uint8Array([1, 2, 3]) }],
          }),
        ),
      ).toEqual(['a']);
    },
  );

  it.each([
    [
      'a version 4 index, whose paths are prefix-compressed',
      { version: 4, entries: [] },
      'index version 4',
    ],
    ['a version 1 index', { version: 1, entries: [] }, 'index version 1'],
    [
      'a split index (the link extension)',
      {
        entries: [],
        extensions: [{ signature: 'link', data: new Uint8Array(20) }],
      },
      'extension "link"',
    ],
    [
      'a sparse index (the sdir extension)',
      {
        entries: [],
        extensions: [{ signature: 'sdir', data: new Uint8Array(0) }],
      },
      'extension "sdir"',
    ],
    [
      'an extension it does not know',
      {
        entries: [],
        extensions: [{ signature: 'ZZZZ', data: new Uint8Array(0) }],
      },
      'extension "ZZZZ"',
    ],
    [
      'a skip-worktree entry',
      { version: 3, entries: [{ path: 'hidden', extended: 0x4000 }] },
      'skip-worktree',
    ],
    [
      'an extended flag no version defines',
      { version: 3, entries: [{ path: 'odd', extended: 0x0001 }] },
      'extended flags 0x1',
    ],
    [
      'the extended bit at version 2',
      { version: 2, entries: [{ path: 'odd', extended: 0 }] },
      'extended flags at version 2',
    ],
    [
      'a sparse directory entry',
      { version: 3, entries: [{ path: 'dir/', mode: 0o040000 }] },
      'sparse directory entry "dir/"',
    ],
    [
      'a name length that disagrees with the path',
      { entries: [{ path: 'abc', nameLength: 2 }] },
      'name length 2',
    ],
    [
      'more entries counted than present',
      { entries: [{ path: 'a' }], count: 2 },
      'truncated',
    ],
    [
      'a checksum that does not match',
      { entries: [{ path: 'a' }], trailer: 'wrong' },
      'checksum',
    ],
    [
      'a checksum git skipped (index.skipHash)',
      { entries: [{ path: 'a' }], trailer: 'zero' },
      'index.skipHash',
    ],
  ] as const)('refuses %s, naming it', (_what, index: Built, named) => {
    expect(() => indexPaths(built(index))).toThrow(named);
  });

  it('refuses a file that does not open with DIRC', () => {
    const bytes = built({ entries: [] });
    bytes[0] = 0x58;
    expect(() => indexPaths(bytes)).toThrow('not a git index');
  });

  it('refuses a file too short to hold a header and checksum', () => {
    expect(() => indexPaths(new Uint8Array(16))).toThrow('truncated');
  });

  it('refuses a path that is not UTF-8', () => {
    const bytes = built({ entries: [{ path: 'ab' }] });
    // The path's first byte sits after the 62 fixed bytes of the first entry.
    bytes[12 + 62] = 0xff;
    const resummed = new Uint8Array(
      createHash('sha1')
        .update(bytes.subarray(0, bytes.length - 20))
        .digest(),
    );
    bytes.set(resummed, bytes.length - 20);
    expect(() => indexPaths(bytes)).toThrow('not UTF-8');
  });
});
