import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { withoutYamlComments } from './source-text';
import { scanRunners } from './workflow-runners';

/**
 * Every job names a fixed runner image (#400): GitHub moves `ubuntu-latest`
 * to Ubuntu 26.04 from 2026-10-19 (actions/runner-images#14748), and a moving
 * label changes CI and the deploy under us with no commit saying so.
 */

const workflow = (jobs: string) => `name: x\non:\n  push:\njobs:\n${jobs}`;
const job = (id: string, runsOn: string) =>
  `  ${id}:\n    runs-on: ${runsOn}\n    steps:\n      - run: echo\n`;

describe('scanRunners', () => {
  it('accepts a fixed image', () => {
    expect(scanRunners('w.yml', workflow(job('a', 'ubuntu-24.04')))).toEqual({
      labels: ['w.yml: jobs.a: ubuntu-24.04'],
      findings: [],
    });
  });

  it('refuses ubuntu-latest, naming the job', () => {
    expect(
      scanRunners('w.yml', workflow(job('a', 'ubuntu-latest'))).findings,
    ).toEqual([
      'w.yml: jobs.a: runs-on ubuntu-latest moves with GitHub; name a fixed image such as ubuntu-24.04',
    ]);
  });

  it('refuses any other moving label', () => {
    expect(
      scanRunners('w.yml', workflow(job('a', 'windows-latest'))).findings,
    ).toEqual([
      'w.yml: jobs.a: runs-on windows-latest moves with GitHub; name a fixed image such as ubuntu-24.04',
    ]);
  });

  it('judges each label of a list', () => {
    expect(
      scanRunners('w.yml', workflow(job('a', '[self-hosted, ubuntu-latest]'))),
    ).toEqual({
      labels: ['w.yml: jobs.a: self-hosted', 'w.yml: jobs.a: ubuntu-latest'],
      findings: [
        'w.yml: jobs.a: runs-on ubuntu-latest moves with GitHub; name a fixed image such as ubuntu-24.04',
      ],
    });
  });

  it('refuses an expression, which no guard can read', () => {
    expect(
      scanRunners('w.yml', workflow(job('a', '${{ matrix.os }}'))).findings,
    ).toEqual([
      'w.yml: jobs.a: runs-on ${{ matrix.os }} is chosen at run time; name a fixed image',
    ]);
  });

  it('refuses a job with no runs-on that calls no workflow', () => {
    expect(
      scanRunners('w.yml', workflow('  a:\n    steps:\n      - run: echo\n'))
        .findings,
    ).toEqual(['w.yml: jobs.a: no runs-on, and no workflow it calls']);
  });

  it('leaves a reusable-workflow call to the workflow it calls', () => {
    expect(
      scanRunners(
        'w.yml',
        workflow('  a:\n    uses: ./.github/workflows/ci.yml\n'),
      ),
    ).toEqual({ labels: [], findings: [] });
  });

  it('is not satisfied or tripped by a comment', () => {
    expect(
      scanRunners(
        'w.yml',
        workflow(
          '  a:\n    # runs-on: ubuntu-latest\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo\n',
        ),
      ),
    ).toEqual({ labels: ['w.yml: jobs.a: ubuntu-24.04'], findings: [] });
  });
});

describe('this repo’s workflows name a fixed runner image (#400)', () => {
  const dir = '.github/workflows';
  const files = () => readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  const scanAll = () =>
    files().map((file) => {
      const source = readFileSync(join(dir, file), 'utf8');
      return { file, source, scan: scanRunners(file, source) };
    });

  it('every job runs on a fixed image', () => {
    const scans = scanAll();
    const labels = scans.flatMap(({ scan }) => scan.labels);
    const findings = scans.flatMap(({ scan }) => scan.findings);
    expect(
      searched(findings, { of: labels, what: 'runner labels' }),
      findings.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('workflow-runners/labels', labels.length),
    ).toBeUndefined();
  });

  it('reads as many runs-on lines in each workflow as its text holds', () => {
    const scans = scanAll();
    // Independent of the parser: the runs-on keys left once comments are
    // removed, against the jobs the scanner read a label for.
    const misread = scans.flatMap(({ file, source, scan }) => {
      const written = (
        withoutYamlComments(source).match(/^\s*runs-on:/gm) ?? []
      ).length;
      const jobs = new Set(
        scan.labels.map((label) => label.split(': ').slice(0, 2).join(': ')),
      ).size;
      return written === jobs
        ? []
        : [`${file}: ${String(written)} runs-on written, ${String(jobs)} read`];
    });
    expect(
      searched(misread, { of: scans, what: 'workflows' }),
      misread.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('workflow-runners/workflows', scans.length),
    ).toBeUndefined();
  });
});
