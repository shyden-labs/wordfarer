import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import semver from 'semver';

/**
 * The toolchain runs on one Node line, and `engines` holds the floor (#501).
 *
 * `.nvmrc` names the line: CI's setup-node and nvm both resolve it to that
 * line's newest release. `engines.node` (with `.npmrc` `engine-strict=true`)
 * refuses what the line must not run: eslint-plugin-astro and
 * astro-eslint-parser need `^22.22.3 || ^24.16.0 || >=26.3.0`, so Node 26.0
 * to 26.2 are out.
 *
 * `engines` still admits the 24 line, deliberately: Dependabot's npm updater
 * installs on Node 24 (`ARG NODEJS_VERSION=24` in dependabot-core's
 * npm_and_yarn/Dockerfile, read 2026-10-08), and with engine-strict a
 * 26-only range would refuse its installs.
 */

const engines = (): string =>
  (
    JSON.parse(readFileSync('package.json', 'utf8')) as {
      engines?: { node?: string };
    }
  ).engines?.node ?? '(no engines.node)';

describe('the Node line', () => {
  it('.nvmrc names the 26 line', () => {
    expect(readFileSync('.nvmrc', 'utf8')).toBe('26\n');
  });

  it('engines.node admits 26.3.0, the first 26 the astro lint packages take', () => {
    expect(semver.satisfies('26.3.0', engines())).toBe(true);
  });

  it.each(['26.0.0', '26.1.0', '26.2.0', '26.2.99'])(
    'engines.node refuses %s (the astro lint packages refuse it)',
    (version) => {
      expect(semver.satisfies(version, engines())).toBe(false);
    },
  );

  it("engines.node admits 24.16.0 (Dependabot's Node line)", () => {
    expect(semver.satisfies('24.16.0', engines())).toBe(true);
  });

  it('the README names the .nvmrc line beside npm ci', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain(
      'npm ci                # Node 26.3 or later (see .nvmrc); engine-strict is on',
    );
  });
});
