# Handover: Yawelo Idle

**Written:** 2026-10-09 06:50 UTC (after #518, PR #524, and #490, PR #525).
**Next session:** launch Claude from a **new terminal** in `~/Developer/Repos/yawelo-idle` (see "Node" below). A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 06:50 UTC on 2026-10-09:

- **By tickets: 23% complete** (77 of 332 in-scope stories closed).
  - Measured pace: 7.57 a day over 7 days (today's 3 so far count in it). At that pace: 2026-11-12.
  - **ETA to release-ready: 2026-12-23 to 2027-02-01** (low to medium confidence).
- **By effort: 24% complete** (374 of 1,563 points closed).
  - Measured pace: 36.71 points a day. At that pace: 2026-11-11.
  - **ETA to release-ready: 2026-12-19 to 2027-01-29** (low to medium confidence).
- **Measured:** the counts and the paces. **Assumed:** 4–6 stories (20–30 points) a working day; about 30 unfiled prestige stories (130–180 points, #328, #329); 1.5–2.5 weeks of outside waits.
- **The release-ready ranges are carried** from 00:21 UTC. This session closed #518 (2) and #490 (8) and filed #523 (3): inside the ranges' rounding.

## The order (Shyden: "Cleanup first, every project", 2026-10-08)

1. **Unit tests under 1 s each, cut tests at or under 0.3 s of CPU, no process or outside connection in a unit test:** #474, #475 and #490 are done. **Next: #491** (the file-list readers read git's index in-process: 44 unit tests still start git, every one through `committableFiles`, `gitGrepCounts` or `git check-ignore`; the reach logger lists them, and #491's comment names what #490 left), then **#515** (the other whole-repo guards move into the guards suite), #476, #477 (8).
2. **#523** (3): the fixture-repo integration test #518 owes (AC5), and the pre-push check also refuses a step that runs a repo file (`node scripts/…`, `scripts/fail-on-warnings.sh`) an earlier commit lacks.
3. **#505** (3 points): `floors:record -- --suite <name>`, no browser suites by default. Also remove the recorder's `{ unrecordable }` suite form, unused since #506 (comment on #505).
4. **#497:** a daily check that dev serves `develop`'s head, and `workflow_dispatch` on deploy-dev. **#513** (3): verify-dev also waits for the Pages adapter's new deployment.
5. **#432** stays open for its evidence (10 CI runs with `writeFloors` never slow, then `.superpowers/sdd/432/ci/scan.sh`).
6. **#467** (needs Docker), then #51 → #104 → #102; #110 → #103, #125 → #124 → #128; #464 before the first production release.
7. **One M1 floor burn-down a session alongside** (#411–#416, #368–#375, #84, #36).

## What this session did (2026-10-09 05:16 to 06:50 UTC)

- **#518, PR #524** (head `22f3d9a`, merged as `edc10c7`, deployed to dev and read by hand). **#518 closed.**
  - The pre-push hook now runs `npm run --silent check:ci-scripts` **first**: `scripts/ci-scripts.ts` reads the head's `ci.yml` as parsed YAML, collects every `npm run [--silent|-s] <script>`, and refuses a push where any commit on `origin/develop..HEAD` lacks one, naming each commit and script. The every-commit trap (#123, #475) is now caught before GitHub.
  - 38 unit tests in-process with git stood in; 29 mutations predicted and matched. The planted #475 shape was refused at `git push` to a local bare repo (quoted in the PR), with a passing control.
  - Its git half is owed a fixture-repo test in the integration suite: I asked #490 for it and closed #490 without writing it. Now **#523 AC5** (re-scored 2 → 3).
- **#490, PR #525** (head `b4d9bd0`, merged as `65559f6`, deployed to dev and read by hand). **#490 closed.**
  - **Integration suite:** `tests/integration/`, `vitest.integration.config.ts` (`testTimeout: 0`: the step's limit is the one), `npm run test:integration`, CI step "Integration tests" after the guards, skipped on docs-only, `timeout-minutes: 1` from six CI measurements (6–9 s). The recorder runs it as its tenth suite. `tests/unit/integration-ci.test.ts` pins it.
  - Moved whole: fail-on-warnings, pre-push, tracked-files, script-loads. Split: ci-scope (18), old-name walkTree (2), ci-fast-path bash (6), record-floors suites-list (1, its raised `120_000` gone). board-progress: `boardProgress(args, gh, today)` tested in-process, the 5 real runs kept in integration.
  - Unit 5,992 → 5,932; integration 70. Unit tests starting a process: 112 → 44, all #491's.
- **Board:** #523 filed (2), then re-scored to 3 with the owed test as AC5. Boundary comments on #491 and #515.
- **#518's check worked on its first real branch:** #490's first commit added the step and its script together and the hook passed all three commits.

## Waiting on Shyden

1. **Relaunch Claude from a new terminal.** This session's shell again ran **Node 24** first in PATH; every Node command was prefixed with Node 26.
2. **Spotlight:** add `~/Developer/Repos` to System Settings → Spotlight → Privacy (`mds_stores` was again near the top of the CPU list during a starved guards run).
3. **A hook for a lesson missed four times now:** `gh api …/jobs/<id>/logs` without `--allow-escape-sequences`. Global, so not built: say if you want it.
4. **Docker Desktop on,** for #467 (and for `floors:record` until #505 lands). It was on this session.
5. **#451 AC3:** confirm Web Analytics automatic setup on `yawelo-idle-dev-hosts`.
6. **#341 AC8 steps a–d,** then the App ID comment. PR #438 must not merge before that.
7. **#343:** the two Buttondown accounts.
8. **Later:** the #333 wordmark, the #425/#426 prod token, #345 sign-off, and #455's analytics token.

## State

- **`develop`** is at `65559f6` (read with `git rev-parse` when written). Deployed to dev, all 44 steps of deploy-dev run 37894979164 green; its verify step read dev serving that commit with D1 answering. This handover's PR follows it.
- **Open PRs:** #438 (#341, behind develop); this handover's PR. No Dependabot PRs open.
- **Node:** CI runs 26.11.1; the laptop has 26.10.0 at `/opt/homebrew/opt/node/bin`.
- **Worktrees:** unchanged (`../yawelo-idle-develop-bench`, `../yawelo-idle-297-before`, and older ones). None added.
- **Session tools (git-ignored):**
  - `.superpowers/sdd/518/`: `mut.py` (29 mutations of the check), `plant.zsh` / `plant-pass.zsh` / `plant-edit.py` (the AC4 plant and its control, pushed to a local bare repo), `file.py` (the #523 filer).
  - `.superpowers/sdd/490/`: `plan.md`, `split.py` + `to-end.py` (split a test file at a line, each half keeping only the imports it uses), `mut.py` (board-progress, 7), `reach-before.jsonl` / `reach-after.jsonl` (per-test process starts).
  - `.superpowers/sdd/477/`: `reach.setup.ts` + `vitest.reach.config.ts`: `MEASURE_OUT=<file> npx vitest run -c .superpowers/sdd/477/vitest.reach.config.ts` logs per test the process starts, socket connects, CPU and wall.
  - `.superpowers/sdd/475/`: `m.zsh <file>` (per-test CPU), `count-tree.mjs <files>` (calls and accesses, HEAD vs working tree, for reading recorder raises).
  - `.superpowers/sdd/101/set-status.sh <issue> <option-id>`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.

## Resume steps

1. **Run `ListAgents` first,** then `node -v`: if it is not 26, prefix Node commands with `export PATH=/opt/homebrew/opt/node/bin:$PATH;`.
2. **Read the state of every ticket named below from GitHub before working on it** (`gh issue view N --json state`).
3. **#491** next: move it to In Progress; re-run the reach logger for today's list, read #491's ACs and its #490 comment, plan, write the tests first.
4. **Never edit the tree while `npm run floors:record` runs,** and keep test-file paths out of edit commands (the test lock queues them): use Write/Edit.
5. **After any merge,** read the merge SHA and select its deploy-dev run by that SHA; if none appears in 10 minutes, it is #497 again: comment there.
6. **One test run at a time from this session.** Judge CPU, not wall; benchmark only at load < 6. If guards time out at 5 s, read the load before blaming code (this session: load 21.8, three guards starved; green at load 7).
7. **At close-out,** run the progress script, state both estimates, and check the closed stories against "Website follows the game" (#518 and #490 were CI and test hygiene: nothing for players to see). Settle the handover as one commit.
