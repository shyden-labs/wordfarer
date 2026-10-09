import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { committableFiles } from '../unit/tracked-files';

/**
 * The one file walk (#385), in a real repository (#405). During a merge or a
 * rebase, git keeps a conflicted path at three index stages, and the walk
 * must still count it as one file: the floors recorder and every guard read
 * this walk, and a recorder only raises.
 */
const repos: string[] = [];

afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true });
});

/**
 * Every git call carries its own identity: CI's container has none, and a
 * merge without one exits 128 before it reaches the conflict.
 */
const IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];

/** A repository whose `f.txt` is in conflict, beside a tracked and an untracked file. */
const conflicted = (): string => {
  const repo = mkdtempSync(join(tmpdir(), 'walk-conflict-'));
  repos.push(repo);
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', repo, ...IDENTITY, ...args], {
      encoding: 'utf8',
    });
  const write = (path: string, text: string): void => {
    writeFileSync(join(repo, path), text);
  };
  git('init', '-q', '-b', 'main');
  write('f.txt', 'base\n');
  write('keep.txt', 'keep\n');
  git('add', 'f.txt', 'keep.txt');
  git('commit', '-q', '-m', 'base');
  git('switch', '-q', '-c', 'other');
  write('f.txt', 'other\n');
  git('commit', '-q', '-am', 'other');
  git('switch', '-q', 'main');
  write('f.txt', 'main\n');
  git('commit', '-q', '-am', 'main');
  const merge = spawnSync(
    'git',
    ['-C', repo, ...IDENTITY, 'merge', '-q', 'other'],
    { encoding: 'utf8' },
  );
  expect(merge.status, `the merge stops on the conflict: ${merge.stderr}`).toBe(
    1,
  );
  write('new.txt', 'untracked\n');
  return repo;
};

describe('committableFiles', () => {
  it('holds a conflicted path at three index stages (the known positive)', () => {
    const repo = conflicted();
    const stages = execFileSync(
      'git',
      ['-C', repo, 'rev-parse', ':1:f.txt', ':2:f.txt', ':3:f.txt'],
      { encoding: 'utf8' },
    );
    expect(stages.trim().split('\n')).toHaveLength(3);
  });

  it('lists a conflicted path once, beside every tracked and untracked file', () => {
    const repo = conflicted();
    // Sorted, since git lists the untracked file first here: equality still
    // refuses a duplicate.
    expect([...committableFiles([], repo)].sort()).toEqual([
      'f.txt',
      'keep.txt',
      'new.txt',
    ]);
  });
});
