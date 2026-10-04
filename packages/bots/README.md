# @wordfarer/bots

Simulated players for Wordfarer's pacing (M1 design §6, #35). They play the
real `@wordfarer/core` and decide only from `view`, as a UI would. Every
action goes through `apply`. On every CI run they check that the game's pace
meets the spec.

## The personas

| Persona            | Opens a day | Minutes | Reviews | How it buys                          | Asserted |
| ------------------ | ----------- | ------- | ------- | ------------------------------------ | -------- |
| Idler              | 2           | 2       | no      | by payback, until nothing is left    | yes      |
| Casual Learner     | 3           | 5       | yes     | by payback, until nothing is left    | yes      |
| Diligent Learner   | 5           | 8       | yes     | by payback, until nothing is left    | yes      |
| Clicker            | 3           | 5       | yes     | as Casual, tapping 10 times a second | yes      |
| Casual Non-learner | 3           | 5       | no      | as Casual                            | yes      |
| Capped Buyer       | 3           | 5       | yes     | at most 5 per 2-minute check         | report   |
| Random Buyer       | 3           | 5       | yes     | uniformly among what it can afford   | report   |

Every persona starts with a 60-minute first session at 08:00 UTC on
2027-01-04. Waking hours run from 08:00 to 22:00. They are split into one
equal slot per open, and two opens are at least an hour apart. Open times,
recall, latency, prompt types and the Random Buyer's choices each come from
their own seeded stream. The Clicker, the Non-learner and both report-only
buyers share the Casual Learner's seed, so each one differs from the Casual
Learner in one behaviour only.

## Commands

- `npm run test:pacing` plays every persona once, each in its own process,
  and checks the spec's targets (design §6, #35 AC4). It writes
  `pacing-report.json`, which CI uploads as the `pacing-report` artifact.
  The suite must finish in under 5 minutes on the runner (AC7), and its CI
  step enforces that.
- `npm run pacing:calibrate` re-derives `BALANCE.sail.goals`, destination by
  destination, from the Casual Learner. It bisects each goal so that sail
  `i` lands by `firstMinutes + i × gapDays`, then prints the table to paste
  into `packages/core/src/balance.ts`. The options are
  `npm run pacing:calibrate -- --gap-days 2.2 --first-minutes 45`, and those
  are also the defaults. It takes about an hour.
- `npm run pacing:sweep` plays the asserted personas on the committed
  balance, then once with every goal at ×0.9 and ×1.1, then once with each
  tuned lever at ×0.9 and ×1.1, one at a time. The levers are the rank
  ladder, the floor share, the repeat-card Insight, the Phrasebook's cost
  and Listen's value. It prints a table for the PR and exits 1 if any
  variant breaks a CI bound. `-- --only baseline` plays the committed
  balance alone.

## When a pacing test goes red

A rule change that moves a number can move the pace. Before re-tuning
anything:

1. **Read the report first.** Download the `pacing-report` artifact from the
   red run, or run `npm run test:pacing` locally. Each failing test names
   what broke it, for example `destination 7 came 3.104 days after the one
before`. The report holds every sail day, the finale, the first Mastered
   word, the opens that offered no decision, and each persona's CPU time.
2. **Decide whether the rule change or the tuning is wrong.** A red pacing
   test after a rule change is the bots doing their job. Re-tune only when
   the new rule is the one wanted.
3. **Re-tune the goals:** run `npm run pacing:calibrate` and paste the table
   it prints into `BALANCE.sail.goals`. A lever (the rank ladder, the floor
   share, the repeat-card Insight, a Phrasebook's cost, Listen) moves only
   by deliberate decision, recorded in the design spec.
4. **Check the headroom** with `npm run pacing:sweep`. The baseline must
   meet the tuning's own targets, which are tighter than CI's (`TUNING_TARGETS` in
   `src/targets.ts`, #35 AC9):
   - first Set Sail in 38–52 minutes for every persona;
   - each later Casual destination 1.4–2.8 days after the one before;
   - the Casual finale on days 23–32;
   - the Idler's finale by day 63;
   - the Casual Learner at least 35% sooner than the Non-learner;
   - the Clicker at least 97% of the Casual Learner's time at every sail.

   Every variant must keep every CI bound. Put the sweep's table in the PR.

5. **Regenerate the golden log** with `npm run golden-log`, in the same commit
   as the new balance. The balance moves the golden log's hash, and the
   unit suite names the command when it does.
