import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { withoutYamlComments, withoutYamlQuotes } from './source-text';
import { committableFiles } from './tracked-files';
import { isRecord } from './workflow-secrets';

/**
 * The CI supply chain is pinned, and something keeps it current.
 *
 * Two failure modes, and they pull in opposite directions:
 *
 * 1. A MUTABLE TAG is not a version. `actions/checkout@v4` resolves to
 *    whatever the tag points at today, and a tag can be repointed by anyone
 *    who can push to that repo. A compromised or coerced maintainer moves the
 *    tag and every workflow in this repo runs their code, with our secrets,
 *    on the next push. Pinning to a full commit SHA is the only form of this
 *    reference that cannot be changed underneath us.
 *
 * 2. A PIN THAT NOBODY BUMPS rots. shyden.co.uk sat three majors behind on
 *    both of its actions with no mechanism to notice. So the SHA is only half
 *    the control — Dependabot is the other half, and the version comment
 *    beside each SHA is what makes a bump reviewable by a human instead of an
 *    opaque hex swap.
 *
 * The `uses:` and Dependabot checks read SOURCE TEXT, stripped of comments
 * where it matters. The container-image checks PARSE the workflows (`yaml`),
 * since `container:` is either a string or a mapping and a comment must not
 * count as an image.
 */

const WORKFLOWS = '.github/workflows';
const DEPENDABOT = '.github/dependabot.yml';

const workflowFiles = () =>
  readdirSync(WORKFLOWS).filter(
    (f) => f.endsWith('.yml') || f.endsWith('.yaml'),
  );

/**
 * Every `uses:` naming a THIRD-PARTY action.
 *
 * Local references (`./.github/actions/x`, `./.github/workflows/y.yml`) are
 * excluded deliberately: they are this repo's own code, already reviewed at
 * the commit that introduced them, and have no upstream SHA to pin.
 */
const externalUses = () =>
  workflowFiles().flatMap((file) =>
    readFileSync(join(WORKFLOWS, file), 'utf8')
      .split('\n')
      .map((text, i) => ({
        where: `${file}:${String(i + 1)}`,
        text: text.trim(),
      }))
      .filter(({ text }) => /^(-\s*)?uses:\s*[^.\s]/.test(text)),
  );

const dependabot = () =>
  existsSync(DEPENDABOT) ? readFileSync(DEPENDABOT, 'utf8') : '';

/**
 * The config with its YAML comments removed. ASSERT ON THIS, never on the
 * raw text.
 *
 * These checks read source text, and this file DOCUMENTS the very patterns it
 * is checked for — the sub-path note spells out `patterns: ["actions/cache*"]`
 * verbatim. Matched against the raw text, that prose SATISFIES the sub-path
 * guard on its own: the repo could reference `actions/cache` at three
 * sub-paths with no group whatsoever and still go green, and the position of
 * the comment (above the groups) makes the ordering check pass too. Caught by
 * mutation while adding that ordering check.
 */
const configBody = () => withoutYamlComments(dependabot());

/**
 * The config split into one text block per `package-ecosystem:` entry, so a
 * group's position is judged against the catch-all of ITS OWN ecosystem
 * rather than whichever one happens to appear first in the file.
 */
const ecosystemBlocks = () =>
  configBody()
    .split(/(?=^\s*-\s*package-ecosystem:)/m)
    .filter((block) => /package-ecosystem:/.test(block));

/**
 * Every external `uses` value in the PARSED workflows, job calls and steps
 * alike. Read independently of the line reader above, so a `uses:` written in
 * a form that reader cannot see is caught by the difference (Refs #82).
 */
const parsedUses = (): string[] =>
  workflowFiles().flatMap((file) => {
    const doc: unknown = parse(readFileSync(join(WORKFLOWS, file), 'utf8'));
    const jobs =
      isRecord(doc) && isRecord(doc.jobs) ? Object.values(doc.jobs) : [];
    return jobs.flatMap((job) => {
      if (!isRecord(job)) return [];
      const steps: unknown[] = Array.isArray(job.steps) ? job.steps : [];
      return [
        job.uses,
        ...steps.map((step) => (isRecord(step) ? step.uses : undefined)),
      ]
        .filter((uses): uses is string => typeof uses === 'string')
        .filter((uses) => !uses.startsWith('./'));
    });
  });

/** Every `owner/repo` the workflows reference, with the distinct refs seen for each. */
const actionRepos = (): [string, Set<string>][] => {
  const refs = new Map<string, Set<string>>();
  for (const { text } of externalUses()) {
    const ref = text.match(/uses:\s*([^@\s]+)@/)?.[1];
    if (!ref) continue;
    const [owner = '', repo = ''] = ref.split('/');
    const key = `${owner}/${repo}`;
    const seen = refs.get(key) ?? new Set<string>();
    seen.add(ref);
    refs.set(key, seen);
  }
  return [...refs.entries()];
};

/**
 * Every `owner/repo` referenced at MORE THAN ONE sub-path — the ones
 * Dependabot would otherwise bump one sub-path at a time, leaving the
 * siblings behind.
 */
const subPathRepos = (): [string, Set<string>][] =>
  actionRepos().filter(([, seen]) => seen.size > 1);

describe('the CI supply chain is pinned', () => {
  it('there is something to check', () => {
    // Measured 6 at b2a6f3f (#82). Lower it only in the commit that removes one.
    expect(externalUses().length).toBeGreaterThan(5);
  });

  it('the line reader sees every uses: the parsed workflows hold (Refs #82)', () => {
    const read = externalUses().map(
      ({ text }) => text.match(/uses:\s*["']?([^\s"']+)/)?.[1] ?? text,
    );
    expect(read.sort()).toEqual(parsedUses().sort());
  });

  it('reads every file that can hold a uses: line (Refs #82)', () => {
    const tracked = committableFiles();
    expect(tracked, 'positive control').toContain('.github/workflows/ci.yml');
    expect(
      tracked.filter((path) => /(^|\/)action\.ya?ml$/.test(path)),
      'a composite action’s steps sit outside .github/workflows, unscanned',
    ).toEqual([]);
  });

  it('every third-party action is pinned to a full commit SHA', () => {
    const unpinned = externalUses()
      .filter(({ text }) => !/@[0-9a-f]{40}(?=\s|$)/.test(text))
      .map(({ where, text }) => `${where} ${text}`);

    expect(unpinned, 'a mutable tag can be repointed under us').toEqual([]);
  });

  it('every pinned action names the version its SHA resolves to', () => {
    const opaque = externalUses()
      .filter(({ text }) => !/@[0-9a-f]{40}\s+#\s*v\d/.test(text))
      .map(({ where, text }) => `${where} ${text}`);

    expect(opaque, 'a bare SHA bump is unreviewable by a human').toEqual([]);
  });
});

/** Every container and service image a workflow job runs, by job. */
const containerImages = () =>
  workflowFiles().flatMap((file) => {
    const doc: unknown = parse(readFileSync(join(WORKFLOWS, file), 'utf8'));
    const jobs = isRecord(doc) && isRecord(doc.jobs) ? doc.jobs : {};
    return Object.entries(jobs).flatMap(([id, job]) => {
      if (!isRecord(job)) return [];
      const services = isRecord(job.services)
        ? Object.values(job.services)
        : [];
      return [job.container, ...services]
        .map((c) => (isRecord(c) ? c.image : c))
        .filter((image): image is string => typeof image === 'string')
        .map((image) => ({ where: `${file}: jobs.${id}`, image }));
    });
  });

const lockedVersion = (name: string): unknown => {
  const lock: unknown = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const packages =
    isRecord(lock) && isRecord(lock.packages) ? lock.packages : {};
  const entry = packages[`node_modules/${name}`];
  return isRecord(entry) ? entry.version : undefined;
};

describe('the browser image is pinned and matches the test runner (#44)', () => {
  it('there is an image to check: CI gets its browsers from one', () => {
    expect(
      containerImages().filter(({ image }) =>
        image.startsWith('mcr.microsoft.com/playwright:'),
      ),
    ).toHaveLength(1);
  });

  it('every container image is pinned to a digest, not just a tag', () => {
    const unpinned = containerImages()
      .filter(({ image }) => !/@sha256:[0-9a-f]{64}$/.test(image))
      .map(({ where, image }) => `${where} ${image}`);
    expect(unpinned, 'a tag can be re-pushed under us').toEqual([]);
  });

  it('the Playwright image is the version of @playwright/test the lockfile installs', () => {
    const version = lockedVersion('@playwright/test');
    expect(version, 'positive control: the lockfile names it').toMatch(
      /^\d+\.\d+\.\d+$/,
    );
    const stale = containerImages()
      .filter(({ image }) => image.startsWith('mcr.microsoft.com/playwright:'))
      .filter(
        ({ image }) =>
          !image.startsWith(
            `mcr.microsoft.com/playwright:v${String(version)}-`,
          ),
      )
      .map(({ where, image }) => `${where} ${image}`);
    expect(
      stale,
      `a browser build the runner was not made for fails to launch; move the tag to v${String(version)}-noble and re-read its digest from https://mcr.microsoft.com/v2/playwright/manifests/v${String(version)}-noble`,
    ).toEqual([]);
  });
});

describe('Dependabot keeps the pins from rotting', () => {
  /**
   * ShyTalk shipped this bug, so it is guarded here before it can happen.
   *
   * Dependabot treats `actions/cache`, `actions/cache/restore` and
   * `actions/cache/save` as three SEPARATE dependencies. Ungrouped, they
   * arrive as three PRs, each moving one sub-path's SHA while its siblings
   * lag — a one-SHA-per-repo violation by construction, and for codeql-action
   * a runtime version mismatch ("Loaded a configuration file for version
   * '4.36.3', but running version '4.37.1'"). ShyTalk's SHY-0226.
   *
   * Dormant today: this repo uses no sub-path actions. It fails the moment
   * one is added without a matching Dependabot group. Verified by mutation,
   * not by watching it pass.
   */
  it('reads every action repo the workflows use (Refs #82)', () => {
    // Measured 2 at b2a6f3f (#82): actions/checkout and actions/setup-node.
    expect(actionRepos().length).toBeGreaterThan(1);
  });

  it('an action repo used at more than one sub-path is grouped into one PR', () => {
    const config = configBody();
    const ungrouped = subPathRepos()
      .filter(([key]) => !withoutYamlQuotes(config).includes(`${key}*`))
      .map(
        ([key, refs]) =>
          `${key} used at ${String(refs.size)} sub-paths, ungrouped`,
      );

    expect(
      ungrouped,
      'separate PRs per sub-path break the one-SHA-per-repo invariant',
    ).toEqual([]);
  });

  /**
   * Declaring the group is not enough — it has to WIN.
   *
   * Dependabot assigns a dependency to the FIRST group whose patterns match
   * and then stops looking. `patch-updates` is a catch-all keyed on
   * update-type, so it swallows a patch bump of `actions/cache/restore`
   * before an `actions/cache*` group declared BELOW it is ever consulted.
   * The group is present, the config reads correct, and the sub-paths still
   * arrive in separate PRs — SHY-0226 all over again. Order is the control,
   * not presence, so the presence test above cannot stand alone.
   *
   * Dormant today (this repo uses no sub-path actions) and verified by
   * mutation, not by watching it pass.
   */
  it('a sub-path group is declared before the catch-all that would swallow it', () => {
    const misordered = subPathRepos().flatMap(([key]) =>
      ecosystemBlocks()
        .filter((block) => withoutYamlQuotes(block).includes(`${key}*`))
        .filter((block) => {
          const catchAll = block.indexOf('patch-updates:');
          return (
            catchAll !== -1 &&
            catchAll < withoutYamlQuotes(block).indexOf(`${key}*`)
          );
        })
        .map(() => `${key} grouped after patch-updates`),
    );

    expect(
      misordered,
      'Dependabot assigns to the FIRST matching group and stops',
    ).toEqual([]);
  });

  it('a Dependabot config exists', () => {
    expect(existsSync(DEPENDABOT)).toBe(true);
  });

  it('watches npm AND the GitHub Actions themselves', () => {
    const config = configBody();

    expect(config, 'npm dependencies unwatched').toMatch(
      /package-ecosystem:\s*["']?npm["']?/,
    );
    expect(config, 'the actions that run CI are unwatched').toMatch(
      /package-ecosystem:\s*["']?github-actions["']?/,
    );
  });

  it('opens every PR against develop, never straight at main', () => {
    const config = configBody();
    const ecosystems = (config.match(/package-ecosystem:/g) ?? []).length;
    const onDevelop = config.match(/target-branch:\s*["']?develop["']?/g) ?? [];

    // Measured 2 at b2a6f3f (#82): npm and github-actions.
    expect(ecosystems, 'ecosystems declared').toBeGreaterThan(1);
    expect(
      onDevelop.length,
      'an ecosystem defaults to the default branch, bypassing the develop gate',
    ).toBe(ecosystems);
    expect(config).not.toMatch(/target-branch:\s*["']?main["']?/);
  });
});

/**
 * The install is reproducible (Refs #1).
 *
 * The first CI run on develop died in `actions/setup-node` before a single
 * test ran: `cache: 'npm'` needs a lock file, and the template shipped none.
 * Without one, `npm ci` refuses too, and every install would resolve the
 * ranges afresh. The template also tracked a Vitest cache under
 * `node_modules/`, so a clean checkout carried build state.
 */
interface PackageJson {
  name: string;
  devDependencies: Record<string, string>;
}

interface PackageLock {
  lockfileVersion: number;
  name: string;
  packages: Record<string, { devDependencies?: Record<string, string> }>;
}

describe('the install is reproducible', () => {
  const pkg = () =>
    JSON.parse(readFileSync('package.json', 'utf8')) as PackageJson;

  it('the package is named for this repo, not the template', () => {
    expect(pkg().name).toBe('yawelo-idle');
  });

  it('a lock file is committed and agrees with package.json', () => {
    expect(
      existsSync('package-lock.json'),
      'npm ci and the CI cache need it',
    ).toBe(true);
    const lock = JSON.parse(
      readFileSync('package-lock.json', 'utf8'),
    ) as PackageLock;
    expect(lock.lockfileVersion).toBe(3);
    expect(lock.name).toBe(pkg().name);
    expect(lock.packages['']?.devDependencies).toEqual(pkg().devDependencies);
  });

  it('nothing under node_modules is tracked or committable', () => {
    const tracked = committableFiles();
    expect(tracked, 'positive control: the walk sees this repo').toContain(
      'package.json',
    );
    expect(tracked.filter((path) => /(^|\/)node_modules\//.test(path))).toEqual(
      [],
    );
  });
});
