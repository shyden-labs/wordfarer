# Handover: Yawelo Idle

**Written:** 2026-10-09 15:17 UTC (after #476, #477 and #530; PRs #533, #534, #535, #537).
**Next session:** launch Claude from a **new terminal** in `~/Developer/Repos/yawelo-idle` (see "Node" below). A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"`, run at 15:16 UTC on 2026-10-09:

- **By tickets: 24% complete** (82 of 335 in-scope stories closed).
  - Measured pace: 8.29 a day over 7 days. At that pace: 2026-11-09.
  - **ETA to release-ready: 2026-12-23 to 2027-02-01** (low to medium confidence).
- **By effort: 25% complete** (401 of 1,574 points closed).
  - Measured pace: 40.57 points a day. At that pace: 2026-11-07.
  - **ETA to release-ready: 2026-12-19 to 2027-01-29** (low to medium confidence).
- **Measured:** the counts and the paces. **Assumed:** 4–6 stories (20–30 points) a working day; about 30 unfiled prestige stories (130–180 points, #328, #329); 1.5–2.5 weeks of outside waits.
- **The release-ready ranges are carried** from earlier today. This session closed #476 (3), #477 (8) and #530 (3) and filed #536 (3): within the ranges' rounding.

## The order (Shyden: "Cleanup first, every project", 2026-10-08)

1. **#536** (3) first. On this 6-core Mac, unit tests that use 0.15–0.3 s of CPU time out at the 1 s wall limit once the load passes about 12, with wall time running 5.5–9.3x past CPU. AC2 is **Shyden's choice** among three remedies, once measured:
   - cut the heavy tests further
   - run fewer workers
   - make the test lock wait for a quiet machine (that one is global)
2. **#523** (3): the fixture-repo integration test #518 owes, plus the pre-push refusal of a step that runs a repo file an earlier commit lacks.
3. **#527** (5): one tracked mutation runner that predicts which corpus floors a mutation moves.
4. **#505** (3): `floors:record -- --suite <name>`, with no browser suites by default. Also drop the `{ unrecordable }` form.
5. **#497:** a daily check that dev serves `develop`'s head, and `workflow_dispatch` on deploy-dev. **#513** (3): verify-dev waits for the Pages adapter.
6. **#432** stays open for its evidence (10 CI runs).
7. **#467** (needs Docker), then #51 → #104 → #102; #110 → #103, #125 → #124 → #128; #464 before the first production release.
8. **One M1 floor burn-down a session alongside** (#411–#416, #368–#375, #84, #36).

## What this session did (2026-10-09 13:15 to 15:17 UTC)

- **#476, PR #533.** Every non-unit suite now has one limit, at its CI step, set at the smallest whole minute at least 3x its slowest measured run:
  - pacing went from 5 to 2 minutes
  - Worker, cross-engine, web smoke and dev smoke each got 1 minute (they had none)
  - no per-test or per-hook limits remain inside those suites
  - `tests/unit/suite-limits.test.ts` holds all of it
- **#477, PRs #534 and #535.** The unit suite now enforces its limits:
  - `testTimeout` and `hookTimeout` are 1 s
  - `tests/unit/setup.ts` fails a test over 1 s of its own thread CPU, and refuses every `child_process` entry point and every socket that leaves the process
  - a parse-tree guard (`tests/guards/raised-limits.test.ts`) refuses raised limits
  - **PR #535 closed a gap the side agent found,** per Shyden's "everything needs to be checked": every test call is judged whatever its source, and the forms that would hide one are refused
  - the core-determinism ESLint test's 60 s hook was cut: the bans moved to `eslint.core-determinism.ts`, and the full-config check moved to the guards suite
- **#530, PR #537.** The unit setup refuses whole-tree reads: `committableFiles`, `ignoredPaths` and `walkTree` on the checkout, and any third directory listed.
  - It found three hidden whole-tree reads (suite-limits' Vitest config list, dev-config's wrangler walk and the notices render). All three were cut and their real runs moved to the guards suite.
  - `syncBuiltinESMExports` is needed for `fs` (mutation W11) but not for `child_process`.
- **Board:** #536 filed (3). Evidence comments are on #476, #477 and #530.
- **Rules recorded:**
  - the global guard catalogue gained the row "Traced origin"
  - new memory: `feedback-everything-needs-to-be-checked.md`

## Waiting on Shyden

1. **#536 AC2:** pick the remedy once it's measured. You'll be asked, with figures.
2. **A `uv` Python process has been at about 94% CPU for over 2 days** (`~/.cache/uv/archive-v0/…/bin/python`, probably a memory or observer worker). It loads the whole machine. Check whether it should be running.
3. **Relaunch Claude from a new terminal.** This session's shell again ran **Node 24** (v24.21.0) first in PATH.
4. **Spotlight:** add `~/Developer/Repos` to System Settings → Spotlight → Privacy.
5. **A hook for `gh api …/jobs/<id>/logs` without `--allow-escape-sequences`.** This one is global: say if you want it.
6. **Docker Desktop on,** for #467 and `floors:record` until #505.
7. **#451 AC3:** confirm Web Analytics automatic setup on `yawelo-idle-dev-hosts`.
8. **#341 AC8 steps a–d,** then the App ID comment. PR #438 must not merge before that.
9. **#343:** the two Buttondown accounts.
10. **Later:** the #333 wordmark, the #425/#426 prod token, #345 sign-off, and #455's analytics token.

## State

- **`develop`** is at `6e26d55` (read with `git rev-parse` when written). Deployed to dev: deploy-dev run 37949533973, all five jobs green on it, `dev-verified` success. This handover's PR follows it.
- **Open PRs:** #438 (#341, behind develop); this handover's PR. No Dependabot PRs are open.
- **Node:** CI runs 26.11.1; the laptop has 26.10.0 at `/opt/homebrew/opt/node/bin`.
- **Worktrees:** `../yawelo-idle-develop-bench` is now detached at `4c3cef0` (moved this session, for #530's before/after measurement). The others are unchanged.
- **Session tools (git-ignored):**
  - `.superpowers/sdd/476/`:
    - `steps.py <workflow> <job> <n> [branch|-]`: per-step CI durations over green runs
    - `mut.py`: 13 mutations
  - `.superpowers/sdd/477/`:
    - `reach.setup.ts` + `vitest.reach.config.ts`: the per-test logger, now with thread CPU
    - `report.py <jsonl>`
    - `mut.py`: 21 mutations
    - `esm/`: the ESM-exports probe
    - `cmp/`: the old-vs-new reader comparison
  - `.superpowers/sdd/530/`:
    - `measure.sh`: unit thread CPU on develop (bench worktree) vs this tree
    - `vitest.measure.config.ts` (`MEASURE_ROOT`)
    - `mut.py`: 11 mutations
    - `file.py` + `stories/`: the #536 filer
  - `.superpowers/sdd/101/set-status.sh <issue> <option-id>`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.

## Resume steps

1. **Run `ListAgents` first,** then `node -v`. If it is not 26, prefix Node commands with `export PATH=/opt/homebrew/opt/node/bin:$PATH;`.
2. **Read the state of every ticket named below from GitHub before working on it** (`gh issue view N --json state`).
3. **#536 next:** move it to In Progress and measure (AC1) at loads of about 2, 6, 12 and 20, using `.superpowers/sdd/530/measure.sh` as the base. Then ask Shyden AC2 with the figures, in plain words, with a recommendation.
4. **The unit suite now refuses whole-tree reads, process starts, outside sockets and over 1 s of CPU,** each naming the test. A new whole-tree check goes in `tests/guards/`; one that starts a process goes in `tests/integration/`.
5. **Benchmark and record floors only at load < 6** (watch with Monitor and an until-loop). On load above about 12, unit tests can time out (#536).
6. **Never edit the tree while `npm run floors:record` runs.** Keep test-file paths out of edit commands: the test lock reads them, and even the word "vitest", as a test run. Use Write/Edit.
7. **After any merge,** read the merge SHA and select its deploy-dev run by that SHA. If none appears in 10 minutes, it is #497 again: comment there.
8. **One test run at a time from this session.** Judge CPU, not wall.
9. **At close-out,** run the progress script, state both estimates, and check the closed stories against "Website follows the game". (#476, #477 and #530 were test hygiene: nothing for players to see.) Settle the handover as one commit.
