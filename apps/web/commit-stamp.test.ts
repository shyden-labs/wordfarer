import { describe, it, expect } from 'vitest';
import { stampCommit } from './commit-stamp';

const SHA = 'd547bd669678987eb85b5807d1a26ea55eaeb987';
const page =
  '<meta name="yawelo-idle-commit" content="%YAWELO_IDLE_COMMIT%" />';

describe('stampCommit', () => {
  it('writes a full SHA into the placeholder', () => {
    expect(stampCommit(page, SHA)).toBe(
      `<meta name="yawelo-idle-commit" content="${SHA}" />`,
    );
  });

  it('marks a build with no commit as local, never as a SHA', () => {
    expect(stampCommit(page, undefined)).toContain('content="local"');
    expect(stampCommit(page, '')).toContain('content="local"');
  });

  it.each([
    ['a short SHA', SHA.slice(0, 7)],
    ['an uppercase SHA', SHA.toUpperCase()],
    ['41 characters', `${SHA}0`],
    ['a branch name', 'develop'],
  ])('refuses %s', (_label, commit) => {
    expect(() => stampCommit(page, commit)).toThrow(/full 40-hex SHA/);
  });

  it('refuses a page with no placeholder, so a renamed meta tag cannot ship unstamped', () => {
    expect(() => stampCommit('<title>x</title>', SHA)).toThrow(/exactly once/);
  });

  it('refuses a page with two placeholders', () => {
    expect(() => stampCommit(page + page, SHA)).toThrow(/found 2/);
  });
});
