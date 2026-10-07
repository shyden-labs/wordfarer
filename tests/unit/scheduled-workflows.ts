/**
 * A scheduled workflow never reaches production (#460, global rule
 * "`develop` IS THE DEFAULT BRANCH").
 *
 * GitHub runs a `schedule` trigger from the default branch, which is
 * `develop` here, so a scheduled job runs code nobody has released. Its job
 * may read dev or a read-only source, but a production credential belongs
 * to a separate workflow it dispatches with `--ref main`, whose environment
 * admits `main` alone. So a workflow whose `on:` holds `schedule` may name
 * only an environment on `SCHEDULED_ENVIRONMENTS`, by exact name, in its own
 * jobs or in a local reusable workflow it calls. The name is judged exactly,
 * never by what it seems to mean: `live` or `release` can hold a production
 * key as well as `prod-cron` can. A job with no environment reads no stored
 * secret (`workflow-secrets.test.ts`). Anything the reader cannot place (an
 * environment chosen by expression, a remote reusable workflow, an `on:` of
 * an unknown shape) is refused by name, never skipped.
 */
import { parse } from 'yaml';
import { isRecord } from './workflow-secrets';

/**
 * The only environments a scheduled job may name, matched exactly. `dev`
 * admits `develop` and reaches only dev's Workers and D1.
 */
export const SCHEDULED_ENVIRONMENTS: readonly string[] = ['dev'];

export interface ScheduleFinding {
  readonly file: string;
  readonly job: string;
  readonly problem: string;
}

export interface ScheduleScan {
  /** Whether the workflow's `on:` holds `schedule`. */
  readonly scheduled: boolean;
  /** Jobs judged: every job of a scheduled workflow, none of another. */
  readonly jobs: number;
  readonly findings: readonly ScheduleFinding[];
}

/**
 * Judges one workflow. `readLocal` returns the text of a workflow in this
 * repo by its `./.github/workflows/<file>` path, for a reusable call.
 */
export function scanSchedule(
  file: string,
  source: string,
  readLocal: (path: string) => string,
): ScheduleScan {
  const workflow: unknown = parse(source);
  if (!isRecord(workflow)) throw new Error(`${file}: not a mapping`);
  if (!isScheduled(file, workflow.on))
    return { scheduled: false, jobs: 0, findings: [] };
  const jobs = jobsOf(file, workflow);
  const findings = Object.entries(jobs).flatMap(([job, body]) =>
    judgeJob(file, job, body, readLocal),
  );
  return { scheduled: true, jobs: Object.keys(jobs).length, findings };
}

const LOCAL_WORKFLOW = /^\.\/\.github\/workflows\/[^/]+\.ya?ml$/;
const EXPRESSION = /\$\{\{/;

/** `on:` as a name, a list of names or a mapping; anything else is refused. */
function isScheduled(file: string, on: unknown): boolean {
  if (typeof on === 'string') return on === 'schedule';
  if (Array.isArray(on)) return on.includes('schedule');
  if (isRecord(on)) return Object.hasOwn(on, 'schedule');
  throw new Error(`${file}: cannot classify on: ${String(on)}`);
}

function jobsOf(file: string, workflow: Record<string, unknown>) {
  const { jobs } = workflow;
  if (!isRecord(jobs)) throw new Error(`${file}: jobs is not a mapping`);
  return jobs;
}

function environmentName(environment: unknown): string | undefined {
  if (typeof environment === 'string') return environment;
  if (isRecord(environment) && typeof environment.name === 'string')
    return environment.name;
  return undefined;
}

/** What is wrong with one environment, if anything; `via` names a call. */
function judgeEnvironment(environment: unknown, via: string): string[] {
  const name = environmentName(environment);
  if (name === undefined) return [];
  if (EXPRESSION.test(name))
    return [
      `a scheduled workflow chooses its environment by expression (${name}), which no check can read`,
    ];
  if (SCHEDULED_ENVIRONMENTS.includes(name)) return [];
  return [
    `a scheduled workflow names environment "${name}"${via}, which no scheduled job may use (allowed: ${SCHEDULED_ENVIRONMENTS.join(', ')}): dispatch a separate workflow with --ref main instead`,
  ];
}

function judgeJob(
  file: string,
  job: string,
  body: unknown,
  readLocal: (path: string) => string,
): ScheduleFinding[] {
  return problemsOf(file, job, body, '', readLocal, new Set([file])).map(
    (problem) => ({ file, job, problem }),
  );
}

/**
 * A job's own environment, then every job of a local reusable workflow it
 * calls, followed as deep as the calls go (GitHub allows four levels). A
 * workflow already on the path is not read twice.
 */
function problemsOf(
  file: string,
  job: string,
  body: unknown,
  via: string,
  readLocal: (path: string) => string,
  path: ReadonlySet<string>,
): string[] {
  if (!isRecord(body)) throw new Error(`${file}: job ${job} is not a mapping`);
  const problems = judgeEnvironment(body.environment, via);
  const { uses } = body;
  if (typeof uses !== 'string') return problems;
  if (!LOCAL_WORKFLOW.test(uses))
    return [
      ...problems,
      `a scheduled workflow calls ${uses}, whose environments no check here can read`,
    ];
  if (path.has(uses)) return problems;
  const called = jobsOf(uses, asRecord(uses, parse(readLocal(uses))));
  return [
    ...problems,
    ...Object.entries(called).flatMap(([inner, innerBody]) =>
      problemsOf(
        uses,
        inner,
        innerBody,
        ` through ${uses} (job ${inner})`,
        readLocal,
        new Set([...path, uses]),
      ),
    ),
  ];
}

function asRecord(file: string, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${file}: not a mapping`);
  return value;
}
