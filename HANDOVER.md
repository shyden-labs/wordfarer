# Handover: Yawelo Idle

**Written:** 2026-10-09 08:10 UTC (after #491, PR #528).
**Next session:** launch Claude from a **new terminal** in `~/Developer/Repos/yawelo-idle` (see "Node" below). A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 08:09 UTC on 2026-10-09:

- **By tickets: 23% complete** (78 of 333 in-scope stories closed).
  - Measured pace: 7.71 a day over 7 days. At that pace: 2026-11-12.
  - **ETA to release-ready: 2026-12-23 to 2027-02-01** (low to medium confidence).
- **By effort: 24% complete** (382 of 1,568 points closed).
  - Measured pace: 37.86 points a day. At that pace: 2026-11-10.
  - **ETA to release-ready: 2026-12-19 to 2027-01-29** (low to medium confidence).
- **Measured:** the counts and the paces. **Assumed:** 4–6 stories (20–30 points) a working day; about 30 unfiled prestige stories (130–180 points, #328, #329); 1.5–2.5 weeks of outside waits.
- **The release-ready ranges are carried** from 00:21 UTC. This session closed #491 (8) and filed #527 (5): inside the ranges' rounding.

## The order (Shyden: "Cleanup first, every project", 2026-10-08)

1. **Unit tests under 1 s each, cut tests at or under 0.3 s of CPU, no process or outside connection in a unit test:** #474, #475, #490 and #491 are done. **0 unit tests start a process now.** **Next: #515** (the whole-repo guards move into the guards suite; its comment lists the five unit tests still over 0.3 s, all whole-tree scans), then #476, #477 (8).
2. **#523** (3): the fixture-repo integration test #518 owes (AC5), and the pre-push check also refuses a step that runs a repo file an earlier commit lacks.
3. **#527** (5): one tracked mutation runner that predicts the corpus floors a mutation moves (the third miss of that class, in #491).
4. **#505** (3 points): `floors:record -- --suite <name>`, no browser suites by default. Also remove the recorder's `{ unrecordable }` suite form, unused since #506 (comment on #505).
5. **#497:** a daily check that dev serves `develop`'s head, and `workflow_dispatch` on deploy-dev. **#513** (3): verify-dev also waits for the Pages adapter's new deployment.
6. **#432** stays open for its evidence (10 CI runs with `writeFloors` never slow, then `.superpowers/sdd/432/ci/scan.sh`).
7. **#467** (needs Docker), then #51 → #104 → #102; #110 → #103, #125 → #124 → #128; #464 before the first production release.
8. **One M1 floor burn-down a session alongside** (#411–#416, #368–#375, #84, #36).

## What this session did (2026-10-09 07:00 to 08:10 UTC)

- **#491, PR #528** (head `6c8e01a`, merged as `65ba7e5`, deployed to dev, `/health` read by hand). **#491 closed.**
  - `tests/unit/git-index.ts` reads `.git/index` in-process and refuses by name every form it does not read. `tests/unit/tracked-files.ts` keeps `committableFiles` / `ignoredPaths` and adds `isIgnored`, all in-process. It follows every `.gitignore`, `info/exclude` (through `commondir`), the global excludes file, `core.ignorecase`, `core.precomposeunicode` and config includes. New devDependency `ignore` (MIT). `tests/unit/grep.ts` gives `grepLines`.
  - git itself now runs against all of it in `tests/integration/` (`tracked-files`, `grep`, `old-name`), on the checkout and on a planted repository.
  - **CI's first run failed:** `actions/checkout` writes an `[includeIf "gitdir:…"]` into `.git/config`, which the first version refused. The reader now follows includes as git does. Folded into the one commit.
  - Unit tests starting a process: 44 → 0. AC4 A/B: 446 floor ids identical but two, both explained in the PR. 28 mutations: every predicted failure seen.
- **Board:** #527 filed (5). Comments on #491 (probes, close) and #515 (the five slow whole-tree tests).
- **Memory:** `project-ci-checkout-writes-includeif.md`; the corpus-floor and escape-flag lessons updated.

## Waiting on Shyden

1. **Relaunch Claude from a new terminal.** This session's shell again ran **Node 24** first in PATH; every Node command was prefixed with Node 26.
2. **Spotlight:** add `~/Developer/Repos` to System Settings → Spotlight → Privacy.
3. **A hook for a lesson missed five times now:** `gh api …/jobs/<id>/logs` without `--allow-escape-sequences` (missed again this session, caught by `wc -c`). Global, so not built: say if you want it.
4. **Docker Desktop on,** for #467 (and for `floors:record` until #505 lands). It was on this session.
5. **#451 AC3:** confirm Web Analytics automatic setup on `yawelo-idle-dev-hosts`.
6. **#341 AC8 steps a–d,** then the App ID comment. PR #438 must not merge before that.
7. **#343:** the two Buttondown accounts.
8. **Later:** the #333 wordmark, the #425/#426 prod token, #345 sign-off, and #455's analytics token.

## State

- **`develop`** is at `65ba7e5` (read with `git rev-parse` when written). Deployed to dev: all 44 steps of deploy-dev run 37902462551 green; dev's `/health` reports that commit and `db: ok`. This handover's PR follows it.
- **Open PRs:** #438 (#341, behind develop); this handover's PR. No Dependabot PRs open.
- **Node:** CI runs 26.11.1; the laptop has 26.10.0 at `/opt/homebrew/opt/node/bin`.
- **Worktrees:** unchanged (`../yawelo-idle-develop-bench`, `../yawelo-idle-297-before`, and older ones). None added.
- **Session tools (git-ignored):**
  - `.superpowers/sdd/491/`:
    - `mut.py`: 28 mutations; already stale for `line-of/accesses`, see #527.
    - `ab/ab.py`: the AC4 A/B recording.
    - `reach-after.jsonl`: per-test reach and CPU after.
    - `fs-tests.test.ts` + `vitest.probe.config.ts`: count the guards' tests and judged calls per file, HEAD vs the tree.
    - `probes.md`, `file.py` (the #527 filer).
  - `.superpowers/sdd/477/`: the reach logger (`MEASURE_OUT=<file> npx vitest run -c .superpowers/sdd/477/vitest.reach.config.ts`).
  - `.superpowers/sdd/475/`: `count-tree.mjs <files>` (calls and accesses, HEAD vs the tree).
  - `.superpowers/sdd/101/set-status.sh <issue> <option-id>`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.

## Resume steps

1. **Run `ListAgents` first,** then `node -v`: if it is not 26, prefix Node commands with `export PATH=/opt/homebrew/opt/node/bin:$PATH;`.
2. **Read the state of every ticket named below from GitHub before working on it** (`gh issue view N --json state`).
3. **#515** next: move it to In Progress, and read its ACs and the #490 and #491 comments on it. Derive the population from the code (each call into `committableFiles` / `ignoredPaths` / a directory walk, followed to its test), plan, and write the tests first.
4. **Never edit the tree while `npm run floors:record` runs,** and keep test-file paths out of edit commands (the test lock queues them): use Write/Edit.
5. **Floors over machine-dependent populations** (anything ignored, anything a build writes) get no recorded floor: use a whole-list equality with a liveness positive instead (shyden.co.uk #631; #491's checkout ignored-list test).
6. **After any merge,** read the merge SHA and select its deploy-dev run by that SHA; if none appears in 10 minutes, it is #497 again: comment there.
7. **One test run at a time from this session.** Judge CPU, not wall; benchmark only at load < 6.
8. **At close-out,** run the progress script, state both estimates, and check the closed stories against "Website follows the game" (#491 was test hygiene: nothing for players to see). Settle the handover as one commit.
