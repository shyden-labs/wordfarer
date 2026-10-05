import { parse } from 'yaml';

/**
 * Where a workflow may read a secret (spec §12.9).
 *
 * The agent App has `workflows: write`, and this repo is public, so anyone can
 * open a fork PR that runs workflows. That is safe only while every secret is
 * an ENVIRONMENT secret: GitHub hands those to a job only if the job names the
 * environment, and `dev` and `production` each admit one branch. A secret read
 * outside such a job can only be a repository secret, which any workflow on
 * any branch can read, so the rule this enforces is "no secret reference
 * outside a job that declares one of the protected environments".
 *
 * The workflow is PARSED, not grepped. Comments never reach the parsed tree,
 * so a comment naming `secrets.X` can neither satisfy nor trip this guard
 * (the source-text rule, applied by construction).
 */

export const PROTECTED_ENVIRONMENTS = ['dev', 'production'] as const;

/** The token GitHub mints per run. It is not a stored secret. */
const RUN_TOKEN = 'secrets.GITHUB_TOKEN';

export interface Finding {
  where: string;
  problem: string;
}

export interface Scan {
  jobs: number;
  secretReferences: number;
  /** Every secret reference read, as `file: where: reference` (#367). */
  references: string[];
  findings: Finding[];
}

type Yaml = unknown;

export const isRecord = (value: Yaml): value is Record<string, Yaml> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every string in a parsed YAML value, keys included. */
function strings(value: Yaml): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, child]) => [
      key,
      ...strings(child),
    ]);
  }
  return [];
}

/**
 * Each reference to the secrets context in a string, minus the run token.
 * Matches `secrets.X`, `secrets['X']`, `toJSON(secrets)` and a bare
 * `secrets` key (a reusable-workflow call's `secrets: inherit` or map).
 */
function secretReferences(text: string): string[] {
  return (
    text.match(/\bsecrets\b(?:\.[A-Za-z_][A-Za-z0-9_]*|\s*\[[^\]]*\])?/g) ?? []
  ).filter((ref) => ref !== RUN_TOKEN);
}

function environmentName(environment: Yaml): string | undefined {
  if (typeof environment === 'string') return environment;
  if (isRecord(environment) && typeof environment.name === 'string') {
    return environment.name;
  }
  return undefined;
}

export function scanWorkflow(file: string, source: string): Scan {
  const doc: Yaml = parse(source);
  if (!isRecord(doc)) {
    return {
      jobs: 0,
      secretReferences: 0,
      references: [],
      findings: [{ where: file, problem: 'not a YAML mapping' }],
    };
  }
  const findings: Finding[] = [];
  const references: string[] = [];

  const triggers = isRecord(doc.on)
    ? Object.keys(doc.on)
    : typeof doc.on === 'string'
      ? [doc.on]
      : Array.isArray(doc.on)
        ? doc.on.filter((t): t is string => typeof t === 'string')
        : [];
  if (triggers.includes('pull_request_target')) {
    findings.push({
      where: `${file}: on`,
      problem:
        'pull_request_target runs fork code with this repo’s secrets and a write token',
    });
  }

  for (const key of Object.keys(doc).filter((k) => k !== 'jobs')) {
    const refs = secretReferences(strings(doc[key]).join('\n'));
    references.push(...refs.map((ref) => `${file}: ${key}: ${ref}`));
    for (const ref of refs) {
      findings.push({
        where: `${file}: ${key}`,
        problem: `${ref} outside any job, so no environment can protect it`,
      });
    }
  }

  const jobs = isRecord(doc.jobs) ? Object.entries(doc.jobs) : [];
  for (const [id, job] of jobs) {
    const refs = secretReferences(strings(job).join('\n'));
    references.push(...refs.map((ref) => `${file}: jobs.${id}: ${ref}`));
    if (refs.length === 0) continue;
    const name = isRecord(job) ? environmentName(job.environment) : undefined;
    const isProtected = (PROTECTED_ENVIRONMENTS as readonly string[]).includes(
      name ?? '',
    );
    if (!isProtected) {
      const declared =
        name === undefined
          ? 'declares no environment'
          : `declares environment "${name}"`;
      for (const ref of refs) {
        findings.push({
          where: `${file}: jobs.${id}`,
          problem: `${ref} in a job that ${declared}; it must be one of ${PROTECTED_ENVIRONMENTS.join(', ')}`,
        });
      }
    }
  }

  return {
    jobs: jobs.length,
    secretReferences: references.length,
    references,
    findings,
  };
}
