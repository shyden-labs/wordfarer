import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stampPages } from './commit-stamp';

const SHA = 'd547bd669678987eb85b5807d1a26ea55eaeb987';
const PAGE =
  '<meta name="yawelo-idle-commit" content="%YAWELO_IDLE_COMMIT%" />';

/** A built site in a fresh directory: two pages, one nested, and a script. */
function built(): string {
  const dir = mkdtempSync(join(tmpdir(), 'site-stamp-'));
  mkdirSync(join(dir, 'id'));
  writeFileSync(join(dir, 'index.html'), PAGE);
  writeFileSync(join(dir, 'id', '404.html'), PAGE);
  writeFileSync(join(dir, 'app.js'), '"%YAWELO_IDLE_COMMIT%"');
  return dir;
}

describe('stampPages (#332)', () => {
  it('names every built page it stamps, nested ones too', () => {
    expect(stampPages(built(), SHA)).toEqual(['id/404.html', 'index.html']);
  });

  it.each(['index.html', 'id/404.html'])('stamps %s', (page) => {
    const dir = built();
    stampPages(dir, SHA);
    expect(readFileSync(join(dir, page), 'utf8')).toContain(`content="${SHA}"`);
  });

  it('leaves files that are not pages alone', () => {
    const dir = built();
    stampPages(dir, SHA);
    expect(readFileSync(join(dir, 'app.js'), 'utf8')).toBe(
      '"%YAWELO_IDLE_COMMIT%"',
    );
  });

  it('stamps "local" when no commit is given', () => {
    const dir = built();
    stampPages(dir, undefined);
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain(
      'content="local"',
    );
  });

  it('refuses a page without the placeholder', () => {
    const dir = built();
    writeFileSync(join(dir, 'privacy.html'), '<p>no stamp</p>');
    expect(() => stampPages(dir, SHA)).toThrow(
      'privacy.html: a page must carry %YAWELO_IDLE_COMMIT% exactly once, found 0',
    );
  });

  it('refuses a commit that is not a full SHA', () => {
    expect(() => stampPages(built(), 'abc123')).toThrow(
      'id/404.html: YAWELO_IDLE_COMMIT must be a full 40-hex SHA, got "abc123"',
    );
  });
});
