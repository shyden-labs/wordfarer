import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../src/personas';
import { pacingReport } from '../src/report';
import type { PersonaRun } from '../src/run';
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
  sanity,
} from '../src/targets';

/**
 * The pacing targets (#35 AC4, M1 design §6), proved by playing the real
 * core every CI run. Every persona plays once, each in its own process and
 * all at once; the tests read those runs, and `pacing-report.json` records
 * them for CI to upload (AC6). The bounds are the spec's; the tuning aims
 * well inside them (AC9).
 */

const MAX_DAYS = 84;
const BUNDLE = 'node_modules/.cache/wordfarer/pacing-play.mjs';
const REPORT = 'pacing-report.json';

/** The asserted personas, written out: a population known before the run. */
const ASSERTED = ['idler', 'casual', 'diligent', 'clicker', 'nonlearner'];

function playOne(name: string): Promise<PersonaRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BUNDLE, name, String(MAX_DAYS)]);
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(JSON.parse(out) as PersonaRun);
      else reject(new Error(`${name} exited ${String(code)}: ${err}`));
    });
  });
}

async function playAll(): Promise<ReadonlyMap<string, PersonaRun>> {
  await build({
    entryPoints: ['packages/bots/pacing/play.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: BUNDLE,
    logLevel: 'warning',
  });
  const runs = await Promise.all(PERSONAS.map((p) => playOne(p.name)));
  const byName = new Map(runs.map((r) => [r.persona, r]));
  const report = pacingReport(
    PERSONAS.map((p) => ({ run: runOf(byName, p.name), asserted: p.asserted })),
  );
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  return byName;
}

function runOf(
  runs: ReadonlyMap<string, PersonaRun>,
  name: string,
): PersonaRun {
  const run = runs.get(name);
  if (run === undefined) throw new Error(`no run for ${name}`);
  return run;
}

let played: Promise<ReadonlyMap<string, PersonaRun>> | undefined;

/** Every persona's run: played on first use rather than at collection (#97). */
async function run(name: string): Promise<PersonaRun> {
  played ??= playAll();
  return runOf(await played, name);
}

describe('the pacing suite', () => {
  it('asserts exactly the personas marked asserted', () => {
    expect(ASSERTED).toEqual(
      PERSONAS.filter((p) => p.asserted).map((p) => p.name),
    );
  });
});

describe(
  'the pacing targets (AC4), at the spec’s bounds',
  { timeout: 600_000 },
  () => {
    it.each(ASSERTED)(
      '(a) %s sets sail for the first time after 30 to 60 minutes',
      async (name) => {
        expect(firstSail(await run(name), CI_BOUNDS)).toEqual([]);
      },
    );

    it('(b) the Casual Learner reaches each later destination 1 to 3 days after the one before', async () => {
      expect(gaps(await run('casual'), CI_BOUNDS)).toEqual([]);
    });

    it('(c) the Casual Learner reaches the finale in 3 to 5 weeks', async () => {
      expect(finale(await run('casual'), CI_BOUNDS)).toEqual([]);
    });

    it('(d) the Idler reaches the finale within 10 weeks', async () => {
      expect(idlerFinishes(await run('idler'), CI_BOUNDS)).toEqual([]);
    });

    it.each(ASSERTED)(
      '(e) every open of %s offers a meaningful decision',
      async (name) => {
        const r = await run(name);
        expect(r.opens).toBeGreaterThan(10);
        expect(decisions(r)).toEqual([]);
      },
    );

    it('(f) learning pays: the Casual Learner reaches the finale at least 20% sooner than the Non-learner', async () => {
      expect(
        learningPays(await run('casual'), await run('nonlearner'), CI_BOUNDS),
      ).toEqual([]);
    });

    it('(f) the Diligent Learner finishes no later than the Casual Learner, nor the Casual Learner than the Idler', async () => {
      expect(
        learnersOrder(
          await run('diligent'),
          await run('casual'),
          await run('idler'),
        ),
      ).toEqual([]);
    });

    it('(g) clicking never beats idling: the Clicker takes at least 95% of the Casual Learner’s time to each sail', async () => {
      expect(
        clickingNeverWins(await run('clicker'), await run('casual'), CI_BOUNDS),
      ).toEqual([]);
    });

    it.each(ASSERTED)(
      '(h) %s meets no NaN, negative or infinite value',
      async (name) => {
        const r = await run(name);
        expect(r.events).toBeGreaterThan(1_000);
        expect(sanity(r)).toEqual([]);
      },
    );
  },
);
