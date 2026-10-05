import { describe, expect, it } from 'vitest';
import { runOf } from './workflow-steps';

/**
 * The guards that read a workflow step's `run:` (#360). YAML gives a value
 * its own type, so `run: true # npm ci` is the boolean true, not a command.
 * A reader that calls `.trim()` on it crashed without a name, and one that
 * hands it to a regex read it as the text "true". runOf refuses it by name.
 */

describe('runOf', () => {
  it('reads a step with no run as no command', () => {
    expect(runOf({ uses: 'actions/checkout@x' })).toBe('');
  });

  it('reads a command as written, trimmed', () => {
    expect(runOf({ name: 'Format', run: 'npm run format:check\n' })).toBe(
      'npm run format:check',
    );
  });

  it.each([
    ['a boolean', true],
    ['a number', 1],
    ['a list', ['npm ci']],
    ['null', null],
  ])('refuses %s by the step’s name', (_what, run) => {
    expect(() => runOf({ name: 'Install', run })).toThrow(
      /step "Install": run is not a string/,
    );
  });

  it('names an unnamed step by its action', () => {
    expect(() => runOf({ uses: 'actions/setup-node@x', run: true })).toThrow(
      /step "actions\/setup-node@x"/,
    );
  });
});
