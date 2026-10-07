import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { committableFiles } from './tracked-files';
import { withoutYamlComments } from './source-text';
import { scanSchedule } from './scheduled-workflows';

/**
 * A scheduled workflow never reaches production (#460 AC3). The rule and
 * the reader's limits are in `scheduled-workflows.ts`.
 */

const SCHEDULE = `on:
  schedule:
    - cron: '0 6 * * *'
`;

const noLocal = (path: string): string => {
  throw new Error(`no local workflow expected, asked for ${path}`);
};

describe('scanSchedule', () => {
  it('flags a scheduled job whose environment starts with prod', () => {
    const scan = scanSchedule(
      'daily.yml',
      `${SCHEDULE}jobs:
  check:
    runs-on: ubuntu-24.04
    environment: prod-cron
    steps:
      - run: echo
`,
      noLocal,
    );
    expect(scan.findings).toEqual([
      {
        file: 'daily.yml',
        job: 'check',
        problem:
          'a scheduled workflow names environment "prod-cron": dispatch a separate workflow with --ref main instead',
      },
    ]);
  });

  it('flags the long form, environment: { name: production }', () => {
    const scan = scanSchedule(
      'daily.yml',
      `${SCHEDULE}jobs:
  check:
    runs-on: ubuntu-24.04
    environment:
      name: production
      url: https://example.invalid
    steps:
      - run: echo
`,
      noLocal,
    );
    expect(scan.findings.map((f) => f.problem)).toEqual([
      'a scheduled workflow names environment "production": dispatch a separate workflow with --ref main instead',
    ]);
  });

  it('flags a production name in any case, as GitHub matches environments without case', () => {
    const scan = scanSchedule(
      'daily.yml',
      `${SCHEDULE}jobs:
  check:
    runs-on: ubuntu-24.04
    environment: PROD-cron
    steps:
      - run: echo
`,
      noLocal,
    );
    expect(scan.findings.map((f) => f.job)).toEqual(['check']);
  });

  it('accepts a scheduled job on the dev environment, judging its one job', () => {
    const scan = scanSchedule(
      'daily.yml',
      `${SCHEDULE}jobs:
  check:
    runs-on: ubuntu-24.04
    environment: dev
    steps:
      - run: echo
`,
      noLocal,
    );
    expect(scan).toEqual({ scheduled: true, jobs: 1, findings: [] });
  });

  it('judges no job of a workflow with no schedule, even one naming production', () => {
    const scan = scanSchedule(
      'release.yml',
      `on:
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-24.04
    environment: production
    steps:
      - run: echo
`,
      noLocal,
    );
    expect(scan).toEqual({ scheduled: false, jobs: 0, findings: [] });
  });

  it('reads schedule inside an on: list as scheduled', () => {
    const scan = scanSchedule(
      'daily.yml',
      `on: [schedule, workflow_dispatch]
jobs:
  check:
    runs-on: ubuntu-24.04
    environment: prod-cron
    steps:
      - run: echo
`,
      noLocal,
    );
    expect(scan.scheduled).toBe(true);
    expect(scan.findings.map((f) => f.job)).toEqual(['check']);
  });

  it('refuses an environment chosen by expression, since nothing can check it', () => {
    const scan = scanSchedule(
      'daily.yml',
      `${SCHEDULE}jobs:
  check:
    runs-on: ubuntu-24.04
    environment: \${{ inputs.target }}
    steps:
      - run: echo
`,
      noLocal,
    );
    expect(scan.findings.map((f) => f.problem)).toEqual([
      'a scheduled workflow chooses its environment by expression (${{ inputs.target }}), which no check can read',
    ]);
  });

  it('follows a local reusable workflow and flags the production environment it names', () => {
    const asked: string[] = [];
    const scan = scanSchedule(
      'daily.yml',
      `${SCHEDULE}jobs:
  check:
    uses: ./.github/workflows/release.yml
`,
      (path) => {
        asked.push(path);
        return `on:
  workflow_call:
jobs:
  deploy:
    runs-on: ubuntu-24.04
    environment: production
    steps:
      - run: echo
`;
      },
    );
    expect(asked).toEqual(['./.github/workflows/release.yml']);
    expect(scan.findings).toEqual([
      {
        file: 'daily.yml',
        job: 'check',
        problem:
          'a scheduled workflow names environment "production" through ./.github/workflows/release.yml (job deploy): dispatch a separate workflow with --ref main instead',
      },
    ]);
  });

  it('accepts a local reusable workflow on dev, judging the calling job', () => {
    const scan = scanSchedule(
      'daily.yml',
      `${SCHEDULE}jobs:
  check:
    uses: ./.github/workflows/ci.yml
`,
      () => `on:
  workflow_call:
jobs:
  test:
    runs-on: ubuntu-24.04
    environment: dev
    steps:
      - run: echo
`,
    );
    expect(scan).toEqual({ scheduled: true, jobs: 1, findings: [] });
  });

  it('follows a call inside a called workflow, as deep as the calls go', () => {
    const files: Record<string, string> = {
      './.github/workflows/outer.yml': `on:
  workflow_call:
jobs:
  middle:
    uses: ./.github/workflows/inner.yml
`,
      './.github/workflows/inner.yml': `on:
  workflow_call:
jobs:
  deploy:
    runs-on: ubuntu-24.04
    environment: prod-cron
    steps:
      - run: echo
`,
    };
    const scan = scanSchedule(
      'daily.yml',
      `${SCHEDULE}jobs:
  check:
    uses: ./.github/workflows/outer.yml
`,
      (path) => files[path] ?? '',
    );
    expect(scan.findings.map((f) => f.problem)).toEqual([
      'a scheduled workflow names environment "prod-cron" through ./.github/workflows/inner.yml (job deploy): dispatch a separate workflow with --ref main instead',
    ]);
  });

  it('reads a workflow that calls itself once, and stops', () => {
    let reads = 0;
    const scan = scanSchedule(
      'daily.yml',
      `${SCHEDULE}jobs:
  check:
    uses: ./.github/workflows/loop.yml
`,
      () => {
        reads += 1;
        return `on:
  workflow_call:
jobs:
  again:
    uses: ./.github/workflows/loop.yml
`;
      },
    );
    expect(reads).toBe(1);
    expect(scan).toEqual({ scheduled: true, jobs: 1, findings: [] });
  });

  it('refuses a remote reusable workflow, whose environments it cannot read', () => {
    const scan = scanSchedule(
      'daily.yml',
      `${SCHEDULE}jobs:
  check:
    uses: other-org/repo/.github/workflows/x.yml@0123456789012345678901234567890123456789
`,
      noLocal,
    );
    expect(scan.findings.map((f) => f.problem)).toEqual([
      'a scheduled workflow calls other-org/repo/.github/workflows/x.yml@0123456789012345678901234567890123456789, whose environments no check here can read',
    ]);
  });

  it('refuses an on: it cannot classify, naming the file', () => {
    expect(() =>
      scanSchedule(
        'odd.yml',
        `on: 42
jobs: {}
`,
        noLocal,
      ),
    ).toThrow('odd.yml: cannot classify on: 42');
  });

  it('refuses a scheduled workflow whose jobs are not a mapping, naming the file', () => {
    expect(() =>
      scanSchedule('odd.yml', `${SCHEDULE}jobs: []\n`, noLocal),
    ).toThrow('odd.yml: jobs is not a mapping');
  });
});

describe('this repo’s scheduled workflows stay off production (#460 AC3)', () => {
  /** The guards' one walk (#385), so a new workflow is judged before its commit. */
  const tracked = (): string[] =>
    committableFiles().filter((path) =>
      /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path),
    );
  const readLocal = (path: string): string =>
    readFileSync(path.replace(/^\.\//, ''), 'utf8');
  const scanAll = () =>
    tracked().map((path) => ({
      path,
      scan: scanSchedule(path, readFileSync(path, 'utf8'), readLocal),
    }));

  it('reads as scheduled exactly the workflows whose text names a schedule trigger', () => {
    // Read independently of the parser: the raw text, comments stripped.
    const byText = tracked().map((path) => ({
      path,
      scheduled: /^\s*(?:schedule\s*:|on\s*:\s*\[[^\]]*\bschedule\b)/m.test(
        withoutYamlComments(readFileSync(path, 'utf8')),
      ),
    }));
    expect(
      scanAll().map(({ path, scan }) => ({ path, scheduled: scan.scheduled })),
    ).toEqual(byText);
  });

  it('judges every job of a scheduled workflow, and records how many', () => {
    const jobs = scanAll().reduce((n, { scan }) => n + scan.jobs, 0);
    // Zero today (#460): the first scheduled job is red until recorded.
    expect(
      floorBreach('scheduled-workflows/scheduled-jobs', jobs),
    ).toBeUndefined();
  });

  it('no scheduled workflow names a production environment', () => {
    const workflows = scanAll();
    expect(
      floorBreach('scheduled-workflows/workflows', workflows.length),
    ).toBeUndefined();
    expect(
      searched(
        workflows.flatMap(({ scan }) => scan.findings),
        { of: workflows, what: 'workflows' },
      ),
    ).toEqual([]);
  });
});
