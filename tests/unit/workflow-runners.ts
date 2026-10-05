import { parse } from 'yaml';
import { isRecord } from './workflow-secrets';

/**
 * Every job names a fixed runner image (#400).
 *
 * GitHub moves `ubuntu-latest` to Ubuntu 26.04 from 2026-10-19 and advises
 * pinning `ubuntu-24.04` to stay (actions/runner-images#14748). A `-latest`
 * label changes the machine CI and the deploy run on with no commit saying
 * so; moving image is a deliberate story of its own.
 *
 * The workflow is PARSED, not grepped, so a comment naming a label can
 * neither satisfy nor trip this guard. A label chosen by an expression is
 * refused by name, since nothing here can read what it will be.
 */

export interface RunnerScan {
  /** Every runner label judged, as `file: jobs.<id>: <label>`. */
  readonly labels: readonly string[];
  readonly findings: readonly string[];
}

const MOVING = /-latest$/;

export function scanRunners(file: string, source: string): RunnerScan {
  const doc: unknown = parse(source);
  const jobs =
    isRecord(doc) && isRecord(doc.jobs) ? Object.entries(doc.jobs) : [];
  const labels: string[] = [];
  const findings: string[] = [];
  for (const [id, job] of jobs) {
    const where = `${file}: jobs.${id}`;
    if (!isRecord(job)) {
      findings.push(`${where}: not a YAML mapping`);
      continue;
    }
    const runsOn = job['runs-on'];
    if (runsOn === undefined) {
      if (typeof job.uses !== 'string')
        findings.push(`${where}: no runs-on, and no workflow it calls`);
      continue;
    }
    const written = Array.isArray(runsOn) ? runsOn : [runsOn];
    for (const label of written) {
      if (typeof label !== 'string') {
        findings.push(
          `${where}: runs-on ${JSON.stringify(label)} is not a label`,
        );
        continue;
      }
      labels.push(`${where}: ${label}`);
      if (label.includes('${{'))
        findings.push(
          `${where}: runs-on ${label} is chosen at run time; name a fixed image`,
        );
      else if (MOVING.test(label))
        findings.push(
          `${where}: runs-on ${label} moves with GitHub; name a fixed image such as ubuntu-24.04`,
        );
    }
  }
  return { labels, findings };
}
