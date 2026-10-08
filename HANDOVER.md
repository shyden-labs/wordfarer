# Handover: Yawelo Idle

**Written:** 2026-10-08 13:00 UTC (after #496, #498 and #500).
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 10:17 UTC (#297 counted: it had been shut since 02:30 UTC, see below):

- **By tickets: 21% complete** (69 of 323 in-scope stories closed).
  - Measured pace: 8.43 a day over 7 days (14, 8, 2, 15, 10, 6, 4). At that pace: 2026-11-08.
  - **ETA to release-ready: 2026-12-23 to 2027-02-01** (low to medium confidence).
- **By effort: 22% complete** (337 of 1,538 points closed).
  - Measured pace: 39.00 points a day. At that pace: 2026-11-08.
  - **ETA to release-ready: 2026-12-19 to 2027-01-29** (low to medium confidence).
- **Measured:** the counts and the paces. **Assumed:** 4–6 stories (20–30 points) a working day; about 30 unfiled prestige stories (130–180 points, #328, #329); 1.5–2.5 weeks of outside waits.
- **The release-ready ranges are carried** from 00:21 UTC. Since then this session filed #490, #491, #497 and #501 (22 points), re-sized #477 (5 → 8) and #475 (8 → 5): about half a day of work at the measured pace, inside the ranges' rounding.

## The order (Shyden: "Cleanup first, every project", 2026-10-08)

1. **Unit tests under 1 s each, cut tests at or under 0.3 s of CPU, and no process or outside connection in a unit test** (global; at the top until #477 lands):
   - **#297 is done:** AC3 met (operator decision 09:40 UTC). It was reopened for the CI ceiling defect, fixed by #500 (`b09d546`), and shut again after that deploy (resume step 3 checks).
   - **#501 next: Node 26** (operator 12:53 UTC: "Now, as the next story"; 3 points, researched, ACs on the ticket). It takes Dependabot's #493 (`@types/node` 26) as its AC2.
   - **Then #474, #475 (now 5), #490, #491, #476, #477 (now 8).** #490 moves the script and git-behaviour tests to an integration suite; #491 reads git's index in-process (operator 07:18 UTC: "Read git's index in-process"); #477 gained AC7, the unit setup refusing every process entry point and outside connection.
2. **#497** (new, 3 points): a daily check that dev serves `develop`'s head, and `workflow_dispatch` on deploy-dev.
3. **#432 stays open for its evidence:** 10 CI runs with `writeFloors` never slow, then `.superpowers/sdd/432/ci/scan.sh`.
4. **#467,** the back-translation engine. It needs Docker running.
5. **#51 → #104 → #102.**
6. Then #110 → #103, #125 → #124 → #128, and #464 before the first production release.
7. **One M1 floor burn-down a session alongside** (#411–#416, #368–#375, #84, #36).

## What this session did (2026-10-08 06:51 to 09:45 UTC)

- **New global rule, measured here** (the shyden.co.uk session relayed it; read back in `~/.claude/CLAUDE.md` line 22): a unit test starts no process. A per-test logger (`.superpowers/sdd/477/reach.setup.ts`, proven on a planted socket and process first) found **109 of 5,891 unit tests starting a process, in 22 files, and 0 reaching an outside service**. 17 files read the file list through `committableFiles`. Filed #490 and #491 (8 each); #477 AC7 and 5 → 8; #475 re-scoped 8 → 5.
- **#297 AC3 met, PR #496** (`248ca91`, merged as `7c191cd`; CI: 17 + 23 steps success, none skipped): the catch-up cut a further ~30%, every bit unchanged (golden hash exact):
  - shared growth powers, rate tails and gains per context, `rateGainAt` by course place, `ownedCounts` once a purchase, `grammarRatio` reusing the words sum, `milestonesReached` counting;
  - **measured 11.5x on the fastest runs (6.16 vs 70.70 µs), 9.7x at p25, 9.4x at the median** (single-process alternation, 150 rounds, load about 7). Whole-process `bench:pemandu` medians swing 10–25 µs back to back even at load 3, so a quiet AC1-style median was not obtainable;
  - **CI guard:** `pemandu-perf.test.ts`, the fastest of six fresh catch-ups under **100 µs of this thread's CPU** a purchase (operator: "Generous CI ceiling", "40 µs in the runner", then "100 µs"). 40 µs was calibrated on the laptop only and failed on CI at 48.4 µs (PR #499's every-commit); nine CI runs so far gave 18.2 to 54.8 µs. #500 set 100 µs. The code before #297 is seen red at 162.15 µs. Inside vitest the code runs about 2.5x slower than bundled, and process CPU counts V8's helper threads, so the figure is this thread's CPU;
  - two new `rate-memo` key-part cases (gain at a milestone; counts whose course places move); **23 key-part mutations matched and 7 wider ones went red** on the final commit.
- **GitHub dropped #496's push event:** no workflow and 0 check-runs on `7c191cd` an hour after the merge (same App identity as #488 and #489, which deployed; githubstatus all operational). Filed **#497**. The first handover's merge (#498, `50c6a26`) carried #496 to dev: deploy-dev run 37759252087, 42 steps, 0 skipped, verify serving `50c6a26`.
- **#297 had been shut since 02:30 UTC** by PR #485, whose body said "does not" plus the closing keyword and #297; the last handover called it open and I did not re-read it. My handover PR #498 then quoted the operator's answer containing the same keyword and number. **Built `~/.claude/hooks/no-closing-keywords.py`** (operator 10:01 UTC: "Build it, every project"): it refuses close/fix/resolve before an issue reference in `git commit` and `gh pr create/edit/merge` texts and named body files. 28 cases, 8 mutations matched, registered in `~/.claude/settings.json` (backup `settings.json.bak-closing-hook-2026-10-08`) and seen refusing live; the global rule names it.
- **Lessons recorded:** `feedback-worktree-install-starts-spotlight` (an `npm ci` in a new worktree sent the load from 11 to 30); `feedback-reread-ticket-state-at-resume`.

## Waiting on Shyden

1. **Spotlight:** add `~/Developer/Repos` to System Settings → Spotlight → Privacy. Measured cost today: one worktree install took the load from 11 to 30 for about 8 minutes and voided a benchmark.
2. **A hook for a lesson missed three times:** `gh api …/jobs/<id>/logs` without `--allow-escape-sequences`. Global, so not built: say if you want it.
3. **Docker Desktop on,** for #467.
4. **#451 AC3:** confirm Web Analytics automatic setup on `yawelo-idle-dev-hosts`.
5. **#341 AC8 steps a–d,** then the App ID comment. PR #438 must not merge before that.
6. **#343:** the two Buttondown accounts.
7. **Later:** the #333 wordmark, the #425/#426 prod token, #345 sign-off, and #455's analytics token.

## State

- **`develop`** is at `7c191cd` after #496 (read with `git rev-parse origin/develop` when written); this handover's PR follows it.
- **Open PRs:** #438 (#341, behind develop); Dependabot #492 (patch-updates), #494 (wrangler) and #495 (eslint), each to merge on green CI read by name; **#493 (`@types/node` 26) is held for #501** (types must not run ahead of the runtime); this handover's PR. #24 is closed.
- **Worktrees:**
  - `../yawelo-idle-develop-bench` (detached at `9566388`, its own `npm ci`): a ready tree for interleaved benchmarks; reuse it rather than install another (Spotlight).
  - `../yawelo-idle-297-before` (`c84cf07`, detached): the pre-#297 baseline. Its git-ignored `.superpowers/sdd/297b/` holds the AC3 probe copies.
  - `../yawelo-idle-297` (keep for `.superpowers/sdd/297/`), and `-341`, `-341-gate`, `-348`, `-348-red`, `-35` from earlier sessions.
- **Session tools (git-ignored):**
  - `.superpowers/sdd/297b/`: `one-run.ts` + `alternate.mjs` (the load-robust benchmark: bundle `one-run.ts` per tree with esbuild, then `node alternate.mjs <rounds> <bundles…>`), `mut.py` (`python3 .superpowers/sdd/297b/mut.py 16 [names]`: 23 key-part + 7 wide mutations), `prof-catchup.ts`.
  - `.superpowers/sdd/477/`: `reach.setup.ts` + `vitest.reach.config.ts` (per test: process starts, socket connects, CPU and wall to `MEASURE_OUT`), `file.py` (the filer).
  - `.superpowers/sdd/101/set-status.sh <issue> <option-id>`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.

## Resume steps

1. **Run `ListAgents` first.**
2. **Read the state of every ticket named below from GitHub before working on it** (`gh issue view N --json state`): this session worked on #297 for hours as open when it had been shut at 02:30 UTC.
3. **Check #297 is shut** (deploy-dev for `b09d546` read by name; close it by hand if not), then **#501 (Node 26)**, then **#474** (core property tests under 1 s, at or under 0.3 s of CPU), **#475, #490, #491, #476, #477** in that order. Measure with `.superpowers/sdd/477/vitest.reach.config.ts`.
4. **One test run at a time from this session**, whatever its class or worktree. **Benchmark only at load < 6** (Monitor until-loop on `sysctl -n vm.loadavg`), and prefer the alternation harness over whole-process medians.
5. **At close-out,** run the progress script, state both estimates, and check the closed stories against "Website follows the game" (today's work is test and performance only: nothing for players to see). Settle the handover as one commit.
