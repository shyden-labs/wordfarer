import { createHash } from 'node:crypto';

/**
 * The paths in git's index, read in-process from its bytes (#491), so a guard
 * lists git's files without starting git. Each path once, in index order:
 * mid-merge a conflicted path sits at stages 1 to 3, and git ls-files
 * --cached once inflated a floors recording by two files that way (#405).
 *
 * Read to git's format document (Documentation/gitformat-index.txt) and no
 * further: versions 2 and 3, the optional extensions named in `OPTIONAL`.
 * Anything else stops with an error naming it, never a guess: version 4's
 * prefix-compressed paths, a split index (`link`), a sparse index (`sdir` and
 * its directory entries), skip-worktree entries (sparse checkout), an
 * unknown extension, a checksum that does not match or that git skipped.
 */
export function indexPaths(bytes: Uint8Array): string[] {
  const SUM = 20;
  if (bytes.length < 12 + SUM)
    throw new Error(`git index: truncated at ${String(bytes.length)} bytes`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const body = bytes.length - SUM;
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== 'DIRC')
    throw new Error('git index: not a git index (no DIRC signature)');
  const trailer = bytes.subarray(body);
  if (trailer.every((byte) => byte === 0))
    throw new Error(
      'git index: the checksum is all zeros (index.skipHash), so the file cannot be checked',
    );
  const sum = createHash('sha1').update(bytes.subarray(0, body)).digest();
  if (!trailer.every((byte, i) => byte === sum[i]))
    throw new Error('git index: the checksum does not match its contents');
  const version = view.getUint32(4);
  if (version !== 2 && version !== 3)
    throw new Error(
      `git index: index version ${String(version)} is not read (only 2 and 3)`,
    );
  const count = view.getUint32(8);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const paths: string[] = [];
  let at = 12;
  for (let n = 0; n < count; n++) {
    const fixed = at + 62;
    if (fixed > body)
      throw new Error(`git index: truncated in entry ${String(n + 1)}`);
    const mode = view.getUint32(at + 24);
    const flags = view.getUint16(at + 60);
    let nameAt = fixed;
    if ((flags & 0x4000) !== 0) {
      if (version === 2)
        throw new Error(
          `git index: entry ${String(n + 1)} sets extended flags at version 2`,
        );
      if (fixed + 2 > body)
        throw new Error(`git index: truncated in entry ${String(n + 1)}`);
      const extended = view.getUint16(fixed);
      nameAt = fixed + 2;
      if ((extended & 0x4000) !== 0)
        throw new Error(
          `git index: entry ${String(n + 1)} is skip-worktree (a sparse checkout), which is not read`,
        );
      // Intent-to-add (0x2000) is listed, as git ls-files --cached lists it.
      if ((extended & ~0x2000) !== 0)
        throw new Error(
          `git index: entry ${String(n + 1)} has extended flags 0x${(extended & ~0x2000).toString(16)}, which are not read`,
        );
    }
    const end = bytes.indexOf(0, nameAt);
    if (end === -1 || end >= body)
      throw new Error(`git index: truncated in entry ${String(n + 1)}`);
    const length = flags & 0xfff;
    if (length !== Math.min(end - nameAt, 0xfff))
      throw new Error(
        `git index: entry ${String(n + 1)} gives name length ${String(length)} for a ${String(end - nameAt)}-byte path`,
      );
    let path: string;
    try {
      path = decoder.decode(bytes.subarray(nameAt, end));
    } catch {
      throw new Error(`git index: entry ${String(n + 1)}'s path is not UTF-8`);
    }
    if ((mode & 0o170000) === 0o040000)
      throw new Error(
        `git index: sparse directory entry ${JSON.stringify(path)} (a sparse index), which is not read`,
      );
    // Padded with 1 to 8 NULs to a multiple of 8 bytes from the entry's start.
    at += (nameAt - at + (end - nameAt) + 8) & ~7;
    if (at > body)
      throw new Error(`git index: truncated in entry ${String(n + 1)}`);
    // Stages of one path are adjacent: the index is sorted by path, then stage.
    if (paths.at(-1) !== path) paths.push(path);
  }
  while (at < body) {
    if (at + 8 > body) throw new Error('git index: truncated in an extension');
    const signature = new TextDecoder().decode(bytes.subarray(at, at + 4));
    if (!OPTIONAL.has(signature))
      throw new Error(
        `git index: extension ${JSON.stringify(signature)} is not read`,
      );
    at += 8 + view.getUint32(at + 4);
  }
  if (at !== body) throw new Error('git index: truncated in an extension');
  return paths;
}

/**
 * Extensions a reader of paths may pass over: the cached tree, resolve-undo,
 * the untracked cache, the fsmonitor token, and the two offset tables.
 */
const OPTIONAL: ReadonlySet<string> = new Set([
  'TREE',
  'REUC',
  'UNTR',
  'FSMN',
  'EOIE',
  'IEOT',
]);
