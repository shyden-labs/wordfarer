# Handover: Wordfarer

**Written:** 2026-10-04 03:45 UTC, mid-#35 (pacing bots, report and balance tuning).
**Next session:** launch Claude from `~/Developer/Repos/wordfarer` (its `HANDOVER.md` points here), then work in the worktree `~/Developer/Repos/wordfarer-35` on branch `m1/35-pacing-bots`. The session names itself "Wordfarer" by hook; type `/color green` once.

## Progress (global rule: every close-out states this)

- **% complete: about 14% by story count** (32 of 233 stories closed; none closed since the last close-out, because #35 is mid-flight).
- **ETA to release-ready: late November to mid-December 2026** (2026-11-29 to 2026-12-13). Confidence is low to medium; unchanged.
  - **Measured:** 10, 14 and 8 stories closed per day on 2026-10-01 to 03. #35 has taken one full session of discovery and is expected to need two to three more. Pacing balance is far more sensitive than the M1 design assumed.
  - **Assumed:** about 6 stories a day once M2/M3 content and UI work starts, plus the outside waits (store reviews, operator setup).
  - **To tighten it:** #35's remaining sessions, then the first M2 content story (#111) and the first M3 UI story.

## State

- **Branch `m1/35-pacing-bots`** (worktree `../wordfarer-35`, cut from `develop` at `0f1147e`). It carries one commit, the spec amendments (Task 0, in progress). No code yet.
- **Discovery is done.** Everything measured is in `.superpowers/sdd/m1-35/decisions.md` (git-ignored, on disk in the worktree). Read it first. In short:
  - The buying style decides the pace: the same balance gave over 10 weeks with "at most 5 per pass" and 3.1 days with greedy payback buying. §6's policy is now pinned exactly (greedy by `price / gain`, bootstrap taps after each sail, 30-second checks).
  - A geometric goal table cannot fit 45 minutes then about 2 days per destination; the goal is now a per-destination table, `BALANCE.sail.goals`.
  - Learning's lead came from week-one Insight starvation (Phrasebooks) and, late, the word ladder.
- **Operator decisions (all recorded in the specs and tickets, read back):**
  1. Two less-efficient buyers, Capped and Random, appear in the report only (2026-10-03).
  2. Rank ladder Heard 0.04 to Mastered 0.16 (4×), never-reviewed floor 80% (2026-10-04). Parent spec §3.3 amended.
  3. Encounter prices and outputs move from content to `balance.ts` by tier (1 to 6) plus each region's step (2026-10-04). #35 AC8; #111 and #116 amended (#116 needs two more Encounters).
  4. Real-content checks widen as content lands: #243 runs #35's whole suite on the real packs (2026-10-04).
  5. Headroom and a re-tune tool: #35 AC9 sets tighter tuning targets plus a ±10% robustness sweep, and AC10 adds `npm run pacing:calibrate` and `packages/bots/README.md` (2026-10-04).
- **Current best tuning:**
  - Values: X2 (floorShare 0.8; rankBonus 0.04/0.06/0.09/0.12/0.16; duplicateInsight [40,80,120,200,400]; phrasebook [5]), Listen 0.5 per tap, and goals from `cal2.goals.json`.
  - Measured: Casual first sail 46 min, finale day 24.1; Idler day 44.3; Non-learner day 41.1; Diligent day 21.6; Clicker worst sail 97.8%; Capped day 30.4; Random day 25.3.
  - Still short of AC9's headroom: Casual gaps 1.23 and 3.08 days, and a finale at the 24-day edge. Assertions (e) and (h) are not measured by the probe yet.
- **Tools** (all in `.superpowers/sdd/m1-35/`, on disk, none in `/tmp`):
  - `probe.ts` plays the personas; env `GOALS`, `PASS_S`, `TRACE`, `CLICK_NOOP`.
  - `tune.mjs '<patches>' <persona> [days]` patches `balance.ts`, `synthetic-course.ts` or `sail.ts` at bundle time and refuses a patch that does not apply exactly once.
  - `sweep.mjs <variants.json> [days] [conc]` runs variants in parallel and writes `*.results.json`.
  - `calibrate.mjs '<patches>' <firstMin> <gapDays>` bisects each goal in turn.
- Open Dependabot PRs #23 (vitest 5.0.2) and #24 (@types/node 26) are untouched.

## Resume steps

1. `cd ~/Developer/Repos/wordfarer-35 && git fetch origin && git status`: the branch should show the Task 0 commit, a clean tree, and `node_modules` present. If `node_modules` is missing, run `npm ci`.
2. Read `.superpowers/sdd/m1-35/decisions.md` and #35's ACs 1–10 (`gh issue view 35`).
3. Recalibrate for headroom: write `x2tap.patches.json` (`x2.patches.json` plus `{"file":"balance","from":"listen: { understandingPerTap: 1 },","to":"listen: { understandingPerTap: 0.5 },"}`), then run `node calibrate.mjs "$(cat x2tap.patches.json)" 45 2.0` in the background (about 15 minutes). Round to 2 significant figures, re-run all seven personas with `sweep.mjs`, and check every AC9 target. If the finale lands under 24 days, raise the gap target.
4. Finish Task 0: amend the M1 design §5 with the tuned values once final, and replace the parent §3.3 day figures with the final measured ones.
5. Write the plan (house process: one commit per task, red runs on the parent stage, mutations with predictions written first and `TOTAL` set, plan generated from the stage commits and reviewed to zero). Suggested tasks:
   - T1: `view.shop` (AC3).
   - T2: the Encounter ladder in `balance.ts` by tier (AC8).
   - T3: the goal table (`BALANCE.sail.goals`).
   - T4: the `packages/bots` personas, scheduler and streams (AC1, AC2).
   - T5: the CI assertions (a)–(h) plus `pacing-report.json` and the artifact upload (AC4–AC7).
   - T6: the tuned values and the robustness sweep (AC9).
   - T7: `pacing:calibrate` and the README (AC10).
   - Last: regenerate the golden log, since the balance moves it.
6. CPU budget (AC7): the laptop measured 10–45 s per persona (Random 45 s, Clicker 32 s). Run one test file per persona so vitest spreads them across workers.
7. At close-out, recompute progress from the board and state % complete and ETA.
