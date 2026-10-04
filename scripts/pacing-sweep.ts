import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { PERSONAS } from '../packages/bots/src/personas.ts';
import {
  CI_BOUNDS,
  clickingNeverWins,
  decisions,
  finale,
  firstSail,
  gaps,
  idlerFinishes,
  learnersOrder,
  learningPays,
  largestShift,
  sanity,
  TUNING_TARGETS,
  type Bounds,
} from '../packages/bots/src/targets.ts';
import type { PersonaRun } from '../packages/bots/src/run.ts';
import { applyVariant, VARIANTS, type Variant } from './balance-variants.ts';

/**
 * `npm run pacing:sweep` (#35 AC9): replays the asserted personas on the
 * committed balance and on every variant that moves one tuned lever by
 * ±10%. Prints a table for the PR: each variant's key figures, whether it
 * moves anything at all, and the pacing checks it breaks at the spec's
 * bounds (CI's) and, for the baseline, at the tuning's tighter targets. A
 * variant may cross a gap bound by one open (operator, 2026-10-04); the
 * committed balance may not. A variant that shifts no sail, goal moment or
 * finale by 0.1% of itself is named inert: its green row proves nothing.
 * Exits 1 if any variant breaks a CI bound. `-- --only baseline` plays one
 * variant.
 */

const MAX_DAYS = 84;
/**
 * Below this largest shift a lever is inert: a twentieth of the tightest
 * margin the tuning keeps, the Clicker's 97% target against CI's 95%.
 */
const INERT_SHIFT = 0.001;
const CACHE = 'node_modules/.cache/wordfarer';
const ASSERTED = PERSONAS.filter((p) => p.asserted).map((p) => p.name);

async function bundle(variant: Variant, index: number): Promise<string> {
  const outfile = `${CACHE}/sweep-${String(index)}.mjs`;
  await build({
    entryPoints: ['packages/bots/pacing/play.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'warning',
    plugins: [
      {
        name: 'balance-variant',
        setup(b) {
          b.onLoad(
            { filter: /packages[\\/]core[\\/]src[\\/]balance\.ts$/ },
            (args) => ({
              contents: applyVariant(readFileSync(args.path, 'utf8'), variant),
              loader: 'ts',
            }),
          );
        },
      },
    ],
  });
  return outfile;
}

function play(file: string, name: string): Promise<PersonaRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, name, String(MAX_DAYS)]);
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString()));
    child.stderr.on('data', (c: Buffer) => (err += c.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(JSON.parse(out) as PersonaRun);
      else reject(new Error(`${name} exited ${String(code)}: ${err}`));
    });
  });
}

/** Runs `jobs` with at most `limit` at once, results in order. */
async function pooled<T>(
  jobs: readonly (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < jobs.length; i = next++) {
      const job = jobs[i];
      if (job !== undefined) results[i] = await job();
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function broken(
  runs: ReadonlyMap<string, PersonaRun>,
  b: Bounds,
  slackOpens: 0 | 1,
): string[] {
  const r = (name: string) => {
    const found = runs.get(name);
    if (found === undefined) throw new Error(`no run for ${name}`);
    return found;
  };
  return [
    ...ASSERTED.flatMap((n) => firstSail(r(n), b)),
    ...gaps(r('casual'), b, slackOpens),
    ...finale(r('casual'), b),
    ...idlerFinishes(r('idler'), b),
    ...ASSERTED.flatMap((n) => decisions(r(n))),
    ...learningPays(r('casual'), r('nonlearner'), b),
    ...learnersOrder(r('diligent'), r('casual'), r('idler')),
    ...clickingNeverWins(r('clicker'), r('casual'), b),
    ...ASSERTED.flatMap((n) => sanity(r(n))),
  ];
}

function figures(runs: ReadonlyMap<string, PersonaRun>): string {
  const casual = runs.get('casual');
  const days = casual?.sails.map((s) => s.day) ?? [];
  const g = days.slice(1).map((d, i) => d - (days[i] ?? 0));
  const fin = (n: string) => runs.get(n)?.finaleDay?.toFixed(1) ?? '-';
  const firsts = ASSERTED.map(
    (n) => (runs.get(n)?.sails[0]?.day ?? NaN) * 1_440,
  );
  const clicker = runs.get('clicker')?.sails ?? [];
  const shares = clicker.map(
    (s, i) => s.reachedDay / (casual?.sails[i]?.reachedDay ?? NaN),
  );
  return [
    `first ${Math.min(...firsts).toFixed(1)}-${Math.max(...firsts).toFixed(1)} min`,
    `gaps ${Math.min(...g).toFixed(2)}-${Math.max(...g).toFixed(2)} d`,
    `finale C ${fin('casual')} D ${fin('diligent')} I ${fin('idler')} N ${fin('nonlearner')}`,
    `Clicker ${(100 * Math.min(...shares)).toFixed(1)}%`,
  ].join(' · ');
}

const only = process.argv.indexOf('--only');
const variants =
  only === -1
    ? VARIANTS
    : VARIANTS.filter((v) => v.name === process.argv[only + 1]);
if (variants.length === 0)
  throw new Error(`no variant named ${String(process.argv[only + 1])}`);

const files = await Promise.all(variants.map((v, i) => bundle(v, i)));
const jobs = variants.flatMap((_, i) =>
  ASSERTED.map((name) => async () => ({
    i,
    run: await play(files[i] ?? '', name),
  })),
);
const done = await pooled(jobs, availableParallelism());
let failed = false;
const runsOf = (i: number) =>
  new Map(done.filter((d) => d.i === i).map((d) => [d.run.persona, d.run]));
const baselineAt = variants.findIndex((v) => v.lever === undefined);
const baseline = baselineAt === -1 ? undefined : runsOf(baselineAt);
const inert: string[] = [];
console.log('| variant | figures | largest shift | breaks CI |');
console.log('|---|---|---|---|');
for (const [i, v] of variants.entries()) {
  const runs = runsOf(i);
  const ci = broken(runs, CI_BOUNDS, v.lever === undefined ? 0 : 1);
  failed ||= ci.length > 0;
  let moves = 'not compared: the baseline was not played';
  if (v.lever === undefined) moves = 'baseline';
  else if (baseline !== undefined) {
    const most = largestShift(runs, baseline);
    moves = `${(100 * most).toFixed(3)}%`;
    if (most < INERT_SHIFT) {
      moves += ', inert';
      inert.push(v.name);
    }
  }
  console.log(
    `| ${v.name} | ${figures(runs)} | ${moves} | ${ci.length === 0 ? 'none' : ci.join('; ')} |`,
  );
  if (v.lever === undefined) {
    const tight = broken(runs, TUNING_TARGETS, 0);
    console.error(
      `baseline against the tuning targets: ${tight.length === 0 ? 'all met' : tight.join('; ')}`,
    );
  }
}
if (inert.length > 0) {
  console.log(
    `\nInert: ${inert.join(', ')} shift no sail, goal moment or finale by 0.1% of itself, so their green rows prove nothing about robustness.`,
  );
}
process.exitCode = failed ? 1 : 0;
