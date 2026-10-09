# Handover: Yawelo Idle

**Written:** 2026-10-09 03:52 UTC (after #520, PR #521; #475 before it).
**Next session:** launch Claude from a **new terminal** in `~/Developer/Repos/yawelo-idle` (see "Node" below). A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 03:51 UTC on 2026-10-09:

- **By tickets: 23% complete** (75 of 331 in-scope stories closed).
  - Measured pace: 7.29 a day over 7 days (today's 1 so far counts in it). At that pace: 2026-11-14.
  - **ETA to release-ready: 2026-12-23 to 2027-02-01** (low to medium confidence).
- **By effort: 23% complete** (364 of 1,560 points closed).
  - Measured pace: 35.29 points a day. At that pace: 2026-11-12.
  - **ETA to release-ready: 2026-12-19 to 2027-01-29** (low to medium confidence).
- **Measured:** the counts and the paces. **Assumed:** 4–6 stories (20–30 points) a working day; about 30 unfiled prestige stories (130–180 points, #328, #329); 1.5–2.5 weeks of outside waits.
- **The release-ready ranges are carried** from 00:21 UTC. This session closed #475 (re-scored 5 → 8 when it took on the guards suite) and #520 (1), and filed #515 (5) and #518 (2): inside the ranges' rounding.

## The order (Shyden: "Cleanup first, every project", 2026-10-08)

1. **Unit tests under 1 s each, cut tests at or under 0.3 s of CPU, no process or outside connection in a unit test:** #474 and #475 are done. **Next: #490** (the integration suite; script and git-behaviour tests leave unit), then #491, **#515** (the other whole-repo guards move into the guards suite, re-measuring its 1-minute limit), #476, #477 (8). **#518** (2) is small and stops the every-commit trap below; do it early.
2. **#505** (3 points): `floors:record -- --suite <name>`, no browser suites by default. Also remove the recorder's `{ unrecordable }` suite form, unused since #506 (comment on #505).
3. **#497:** a daily check that dev serves `develop`'s head, and `workflow_dispatch` on deploy-dev. **#513** (3): verify-dev also waits for the Pages adapter's new deployment.
4. **#432** stays open for its evidence (10 CI runs with `writeFloors` never slow, then `.superpowers/sdd/432/ci/scan.sh`).
5. **#467** (needs Docker), then #51 → #104 → #102; #110 → #103, #125 → #124 → #128; #464 before the first production release.
6. **One M1 floor burn-down a session alongside** (#411–#416, #368–#375, #84, #36).

## What this session did (2026-10-08 16:24 to 2026-10-09 03:52 UTC)

- **#520, PR #521** (merged as `f19617a`, deployed to dev, read by hand). **Every push now runs the guards suite** after format, lint and typecheck (Shyden, 2026-10-09: _"Yes, run them"_, the global rule; a side agent flagged that #475 wired it into CI only). A push therefore waits while another session's heavy test run holds the machine: `test-lock: … waits` is a queue, not a failure. **#520 closed.**

- **#475, PR #517** (head `ede6a4f`, merged as `4ae03aa`, deployed to dev and read by hand). **#475 closed.**
  - **Bots run tests:** the slowest went from 992 to 149 ms of CPU. They play the Capped buyer's first day, once and shared. The sail-timing restart moved into `SailLog` (packages/bots/src/run.ts), with a stand-in test. Develop's old 11-day Idler test missed a missing restart; the new test catches it.
  - **Real multi-sail runs stay tested, in the pacing suite** (Shyden: _"we still need these tests, but they do not belong in unit tests"_). `sailTiming` runs over every asserted persona's 84-day run (floors `pacing-sails/<persona>`, 12 each), and `longWaits` checks the Idler waits hours with its goal met. Made a **global rule**: a cut never drops a real run, it moves it (`~/.claude/CLAUDE.md`, reference-engineering-standards.md, memory `feedback-cut-keeps-real-runs`).
  - **Guards suite:** `tests/guards/`, `vitest.guards.config.ts`, `npm run test:guards`, CI step "Guards (whole-repo checks)" after the unit tests, docs-only included, `timeout-minutes: 1` (suite 1.4–1.7 s). The recorder lists it as its ninth suite, and `tests/unit/guards-ci.test.ts` pins it. Members so far: the floorless-searches and literal-floors tree tests, and svelte-gates (Shyden chose the guards suite for the ESLint plant, whose config load alone is about 1 s).
  - Burn-down ceilings lowered to the lists' real sizes: literal 55/50, floorless 113/101.
  - 29 predicted mutations, all matched.
- **PR #516 closed, replaced by #517:** every-commit runs the head's `ci.yml` against each commit, and the Guards step's script did not exist in the first two. This repeated #123's lesson, so **#518 filed** for the pre-push mechanism. The stages were folded with `git commit-tree` onto a new branch, with an identical tree.
- **Board:** #475 re-scored 5 → 8 with ACs 5–6 for the suite; #515 and #518 filed with Estimates.

## Waiting on Shyden

1. **Relaunch Claude from a new terminal.** This session's shell again ran **Node 24** first in PATH; every Node command was prefixed with Node 26.
2. **Spotlight:** add `~/Developer/Repos` to System Settings → Spotlight → Privacy.
3. **A hook for a lesson missed four times now:** `gh api …/jobs/<id>/logs` without `--allow-escape-sequences`. Global, so not built: say if you want it.
4. **Docker Desktop on,** for #467 (and for `floors:record` until #505 lands). It was on this session.
5. **#451 AC3:** confirm Web Analytics automatic setup on `yawelo-idle-dev-hosts`.
6. **#341 AC8 steps a–d,** then the App ID comment. PR #438 must not merge before that.
7. **#343:** the two Buttondown accounts.
8. **Later:** the #333 wordmark, the #425/#426 prod token, #345 sign-off, and #455's analytics token.

## State

- **`develop`** is at `f19617a` (read with `git rev-parse` when written). Deployed to dev, with all 43 steps of deploy-dev run 37880562056 green. `/health` reports that commit with `db: ok`. This handover's PR follows it.
- **Open PRs:** #438 (#341, behind develop); this handover's PR. No Dependabot PRs open.
- **Node:** CI runs 26.11.1; the laptop has 26.10.0 at `/opt/homebrew/opt/node/bin`.
- **Worktrees:** unchanged from the last handover (`../yawelo-idle-develop-bench`, `../yawelo-idle-297-before`, and older ones). None added.
- **Session tools (git-ignored):**
  - `.superpowers/sdd/475/`:
    - `m.zsh <file> [pattern]`: per-test CPU, output kept in `out/`.
    - `mut.py [--old]`: bots, 9 mutations, run against new or develop's tests.
    - `mut2.py` and `mut3.py`: targets/pacing and guards mutations.
    - `count-tree.mjs <files>`: calls and accesses, HEAD vs working tree, for reading recorder raises.
    - `probe-eslint.mjs`, `probe-bots*.ts`.
    - `file.py`: the story filer.
  - `.superpowers/sdd/474/`: `beforeafter.zsh`, `prof.py` + `vitest.prof.config.ts` (a CPU profile per test).
  - `.superpowers/sdd/477/`: `reach.setup.ts` + `vitest.reach.config.ts`, which log per test the process starts, socket connects, CPU and wall.
  - `.superpowers/sdd/101/set-status.sh <issue> <option-id>`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.

## Resume steps

1. **Run `ListAgents` first,** then `node -v`: if it is not 26, prefix Node commands with `export PATH=/opt/homebrew/opt/node/bin:$PATH;`.
2. **Read the state of every ticket named below from GitHub before working on it** (`gh issue view N --json state`).
3. **Before the first push of any branch that touches `ci.yml`,** check the commit adding a step comes first (`git log --format=%h origin/develop..HEAD`), until #518 lands.
4. **#518** first (small), then **#490**: move it to In Progress; measure with `.superpowers/sdd/475/m.zsh`, plan, write the tests first. A test cut from unit keeps its real run in a non-unit suite (global rule).
5. **After any merge,** read the merge SHA and select its deploy-dev run by that SHA; if none appears in 10 minutes, it is #497 again: comment there.
6. **One test run at a time from this session.** Judge CPU, not wall; benchmark only at load < 6.
7. **At close-out,** run the progress script, state both estimates, and check the closed stories against "Website follows the game" (#475 was test speed only: nothing for players to see). Settle the handover as one commit.
