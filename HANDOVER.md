# Handover: Yawelo Idle

**Written:** 2026-10-09 09:57 UTC (after #515, PR #531).
**Next session:** launch Claude from a **new terminal** in `~/Developer/Repos/yawelo-idle` (see "Node" below). A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 09:56 UTC on 2026-10-09:

- **By tickets: 24% complete** (79 of 334 in-scope stories closed).
  - Measured pace: 7.86 a day over 7 days. At that pace: 2026-11-11.
  - **ETA to release-ready: 2026-12-23 to 2027-02-01** (low to medium confidence).
- **By effort: 25% complete** (387 of 1,571 points closed).
  - Measured pace: 38.57 points a day. At that pace: 2026-11-09.
  - **ETA to release-ready: 2026-12-19 to 2027-01-29** (low to medium confidence).
- **Measured:** the counts and the paces. **Assumed:** 4–6 stories (20–30 points) a working day; about 30 unfiled prestige stories (130–180 points, #328, #329); 1.5–2.5 weeks of outside waits.
- **The release-ready ranges are carried** from 00:21 UTC. This session closed #515 (5) and filed #530 (3): inside the ranges' rounding.

## The order (Shyden: "Cleanup first, every project", 2026-10-08)

1. **Unit tests under 1 s each, cut tests at or under 0.3 s of CPU, no process or outside connection in a unit test:** #474, #475, #490 and #491 and #515 are done. **0 unit tests start a process, and none reads the whole tree** (51 moved to `tests/guards/`). **Next: #476**, then #477 (8), then **#530** (3: the unit setup refuses a whole-tree read; it builds on #477 AC7's setup file).
2. **#523** (3): the fixture-repo integration test #518 owes (AC5), and the pre-push check also refuses a step that runs a repo file an earlier commit lacks.
3. **#527** (5): one tracked mutation runner that predicts the corpus floors a mutation moves (the third miss of that class, in #491).
4. **#505** (3 points): `floors:record -- --suite <name>`, no browser suites by default. Also remove the recorder's `{ unrecordable }` suite form, unused since #506 (comment on #505).
5. **#497:** a daily check that dev serves `develop`'s head, and `workflow_dispatch` on deploy-dev. **#513** (3): verify-dev also waits for the Pages adapter's new deployment.
6. **#432** stays open for its evidence (10 CI runs with `writeFloors` never slow, then `.superpowers/sdd/432/ci/scan.sh`).
7. **#467** (needs Docker), then #51 → #104 → #102; #110 → #103, #125 → #124 → #128; #464 before the first production release.
8. **One M1 floor burn-down a session alongside** (#411–#416, #368–#375, #84, #36).

## What this session did (2026-10-09 09:17 to 09:57 UTC)

- **#515, PR #531** (head `3245934`, merged as `d73512a`, deploy-dev run 37913636383 green; its verify job read dev serving `d73512a`, D1 answering). **#515 closed.**
  - 51 whole-tree tests moved from 9 unit files into `tests/guards/` (collection-calls 7, one-test-per-case 6 with `BURN_DOWN`, core-import-graph 7, git-walks 2, licences 1, line-of 1, old-name 2 + 21, record-floors 1, supply-chain 3); fixture tests stay in unit. Shared: `tests/unit/calls-in-tree.ts`, `tests/unit/dissolved-company.ts`.
  - Cut, kept in unit: site-copy resolves `file:` by a one-path lookup; scheduled-workflows reads `.github/workflows`.
  - Unit 6,066 → 6,018, guards 10 → 61. 15 burn-down keys renamed, 21 floors re-recorded. Guards CI step 4 s before and after (limit 1 min). 13 of 13 mutations as predicted.
- **Board:** #530 filed (3). #515 comment with the AC evidence.
- **Memory:** `feedback-count-moved-tests-from-the-run.md` (per-file counts from the run tally; a memo shows reach only in its first test).

## Waiting on Shyden

1. **Relaunch Claude from a new terminal.** This session's shell again ran **Node 24** (v24.21.0) first in PATH; every Node command was prefixed with Node 26.
2. **Spotlight:** add `~/Developer/Repos` to System Settings → Spotlight → Privacy.
3. **A hook for a lesson missed five times now:** `gh api …/jobs/<id>/logs` without `--allow-escape-sequences` (missed again this session, caught by `wc -c`). Global, so not built: say if you want it.
4. **Docker Desktop on,** for #467 (and for `floors:record` until #505 lands). It was on this session.
5. **#451 AC3:** confirm Web Analytics automatic setup on `yawelo-idle-dev-hosts`.
6. **#341 AC8 steps a–d,** then the App ID comment. PR #438 must not merge before that.
7. **#343:** the two Buttondown accounts.
8. **Later:** the #333 wordmark, the #425/#426 prod token, #345 sign-off, and #455's analytics token.

## State

- **`develop`** is at `d73512a` (read with `git rev-parse` when written). Deployed to dev: all 44 steps of deploy-dev run 37913636383 green, `dev-verified` success on the commit. This handover's PR follows it.
- **Open PRs:** #438 (#341, behind develop); this handover's PR. No Dependabot PRs open.
- **Node:** CI runs 26.11.1; the laptop has 26.10.0 at `/opt/homebrew/opt/node/bin`.
- **Worktrees:** unchanged (`../yawelo-idle-develop-bench`, `../yawelo-idle-297-before`, and older ones). None added.
- **Session tools (git-ignored):**
  - `.superpowers/sdd/515/`:
    - `reach.setup.ts` + `vitest.reach.config.ts` / `vitest.reach-guards.config.ts`: #477's reach logger plus files read, directories listed and the index read, per test (`REACH_PATHS=1 MEASURE_OUT=<file> REACH_ROOT=$PWD npx vitest run -c .superpowers/sdd/515/vitest.reach.config.ts`); `whole.py <jsonl>` classifies whole-tree tests, `cpu.py <before> <after>` compares.
    - `move.ts` + `specs.py`: the parse-tree mover (moves named statements into a new file, rebuilds both import lists, refuses shared top-level names).
    - `mut.py`: the 13 mutations; `file.py` + `stories/`: the #530 filer.
  - `.superpowers/sdd/477/`: the reach logger (`MEASURE_OUT=<file> npx vitest run -c .superpowers/sdd/477/vitest.reach.config.ts`).
  - `.superpowers/sdd/475/`: `count-tree.mjs <files>` (calls and accesses, HEAD vs the tree).
  - `.superpowers/sdd/101/set-status.sh <issue> <option-id>`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.

## Resume steps

1. **Run `ListAgents` first,** then `node -v`: if it is not 26, prefix Node commands with `export PATH=/opt/homebrew/opt/node/bin:$PATH;`.
2. **Read the state of every ticket named below from GitHub before working on it** (`gh issue view N --json state`).
3. **#476** next: move it to In Progress, read its ACs, then #477. #530 follows #477 (its refusal sits in #477 AC7's unit setup file).
4. **Never edit the tree while `npm run floors:record` runs,** and keep test-file paths out of edit commands (the test lock queues them): use Write/Edit.
5. **Floors over machine-dependent populations** (anything ignored, anything a build writes) get no recorded floor: use a whole-list equality with a liveness positive instead (shyden.co.uk #631; #491's checkout ignored-list test).
6. **After any merge,** read the merge SHA and select its deploy-dev run by that SHA; if none appears in 10 minutes, it is #497 again: comment there.
7. **One test run at a time from this session.** Judge CPU, not wall; benchmark only at load < 6.
8. **At close-out,** run the progress script, state both estimates, and check the closed stories against "Website follows the game" (#515 was test hygiene: nothing for players to see). Settle the handover as one commit.
