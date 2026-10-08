# Handover: Yawelo Idle

**Written:** 2026-10-08 14:00 UTC (after #504 and #507).
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 13:45 UTC (before #501 and #503 closed: add 2 stories and 5 points):

- **By tickets: 21% complete** (69 of 327 in-scope stories closed).
  - Measured pace: 8.43 a day over 7 days. At that pace: 2026-11-08.
  - **ETA to release-ready: 2026-12-23 to 2027-02-01** (low to medium confidence).
- **By effort: 22% complete** (337 of 1,551 points closed).
  - Measured pace: 39.00 points a day. At that pace: 2026-11-09.
  - **ETA to release-ready: 2026-12-19 to 2027-01-29** (low to medium confidence).
- **Measured:** the counts and the paces. **Assumed:** 4–6 stories (20–30 points) a working day; about 30 unfiled prestige stories (130–180 points, #328, #329); 1.5–2.5 weeks of outside waits.
- **The release-ready ranges are carried** from 00:21 UTC. This session filed #503, #505 and #506 (10 points) and closed #501 and #503: inside the ranges' rounding.

## The order (Shyden: "Cleanup first, every project", 2026-10-08)

1. **#506 next** (5 points; proposed straight after #501 at 13:36 UTC, no objection): the sync Worker tests move to wrangler's own runtime (`createTestHarness`, `getPlatformProxy()`), and `@cloudflare/vitest-pool-workers`, its `overrides` pin and probably the Vitest `>=5` Dependabot ignore all go. Operator 13:35 UTC: "we need to unpin. so if that test tool's runtime isn't kept up to date properly, we need a replacement tool or make our own". Until it lands, every wrangler bump from Dependabot goes red on `worker-runtime.test.ts` and needs #503's hand edit (move the override's `miniflare` to the one the new wrangler depends on).
2. **Unit tests under 1 s each, cut tests at or under 0.3 s of CPU, no process or outside connection in a unit test:** #474, #475 (5), #490, #491, #476, #477 (8). The 12 tests still over 1 s on Node 26 are named in PR #507: #474 owns words, sim, pemandu-tick, det-math; #475 owns bots run, svelte-gates, floorless-searches, literal-floors.
3. **#505** (3 points): `floors:record -- --suite <name>`, and no browser suites by default.
4. **#497:** a daily check that dev serves `develop`'s head, and `workflow_dispatch` on deploy-dev. **GitHub dropped a merge's push event again today** (#504's `8fa15cf`, comment on #497): it reached dev only with the next merge.
5. **#432** stays open for its evidence (10 CI runs with `writeFloors` never slow, then `.superpowers/sdd/432/ci/scan.sh`).
6. **#467** (needs Docker), then #51 → #104 → #102; #110 → #103, #125 → #124 → #128; #464 before the first production release.
7. **One M1 floor burn-down a session alongside** (#411–#416, #368–#375, #84, #36).

## What this session did (2026-10-08 13:03 to 14:00 UTC)

- **Dependabot:** #492 (patch-updates) and #495 (eslint 10.12.0) brought up to date with develop (`strict` protection), merged on green CI read by name, each deployed and verified on dev (42 steps). #494 (wrangler 4.147) was red by design (two workerds in the lock): filed **#503**, fixed in **PR #504** (wrangler 4.148.0, override moved to miniflare 5.20261006.0-alpha, guard seen red first), #494 closed with a note. **#503 closed.**
- **#501 Node 26, PR #507** (`51180e3`, merged as `6c5c66e`): `.nvmrc` 26; `engines.node` `^24.16.0 || >=26.3.0` (the astro lint packages refuse 26.0–26.2; the 24 line stays because Dependabot's npm updater installs on Node 24 and `engine-strict` would refuse it); `@types/node` ^26.6.4 (#493 closed with a note); Dependabot ignores `@types/node` `>=27.0.0`; `tests/unit/node-version.test.ts` and a parsed-YAML case in `supply-chain.test.ts`; 11 of 11 mutations matched. CI and every deploy-dev job ran Node 26.11.1. Unit CPU 55.7 s on 26 vs 64.4 s on 24; AC5 amended by the operator to no-regression. **#501 closed.**
- **17 floors raised by hand** (the new test file grew them; `floors:record` also runs browser suites and Docker is off). Two passes were needed. Filed **#505**.
- **The laptop's default Node is 26** (operator 13:32 UTC): `~/.zshrc` line 3 now puts `/opt/homebrew/opt/node/bin` first (node, npm, npx only, so `gh` stays the router); backup `~/.zshrc.bak-node26-2026-10-08`. `node@24` stays at `/opt/homebrew/opt/node@24/bin`.
- **Every project moves to Node 26** (operator 13:44 UTC, "move them all to 26"): a STANDING TASK line in `~/.claude/CLAUDE.md` (Supply Chain section) and the evidence in `reference-supply-chain.md` (backups `*.bak-node26-2026-10-08`). Each project's own session does its move.
- **Lesson recorded:** `feedback-deploy-waiter-needs-the-sha` (a `-L 1` run list right after a merge returned the previous run, and the waiter "completed" on it).

## Waiting on Shyden

1. **Spotlight:** add `~/Developer/Repos` to System Settings → Spotlight → Privacy.
2. **A hook for a lesson missed four times now:** `gh api …/jobs/<id>/logs` without `--allow-escape-sequences` (missed again today on #494's log). Global, so not built: say if you want it.
3. **Docker Desktop on,** for #467 (and for `floors:record` until #505 lands).
4. **#451 AC3:** confirm Web Analytics automatic setup on `yawelo-idle-dev-hosts`.
5. **#341 AC8 steps a–d,** then the App ID comment. PR #438 must not merge before that.
6. **#343:** the two Buttondown accounts.
7. **Later:** the #333 wordmark, the #425/#426 prod token, #345 sign-off, and #455's analytics token.

## State

- **`develop`** is at `6c5c66e` (read with `git rev-parse origin/develop` when written), deployed and verified on dev (run 37787491142). This handover's PR follows it.
- **Open PRs:** #438 (#341, behind develop); this handover's PR. No Dependabot PRs open.
- **Node:** the laptop and CI both run Node 26 (26.10.0 locally, 26.11.1 in CI). The main checkout's `node_modules` was installed by `npm ci` on 26.10.0.
- **Worktrees:**
  - `../yawelo-idle-develop-bench` (detached at `9566388`, its own `npm ci` under Node 24): a ready tree for interleaved benchmarks; re-run `npm ci` there under Node 26 before using it.
  - `../yawelo-idle-297-before` (`c84cf07`, detached): the pre-#297 baseline, with `.superpowers/sdd/297b/`.
  - `../yawelo-idle-297`, `-341`, `-341-gate`, `-348`, `-348-red`, `-35` from earlier sessions.
- **Session tools (git-ignored):**
  - `.superpowers/sdd/501/`: `measure.zsh` (per-test CPU on Node 26 then 24, writes `cpu-26.jsonl` / `cpu-24.jsonl`, refuses to overwrite), `file.py` (filed #505 and #506), closing notes.
  - `.superpowers/sdd/494/`: `file.py` (filed #503), PR text.
  - `.superpowers/sdd/477/`: `reach.setup.ts` + `vitest.reach.config.ts` (per test: process starts, socket connects, CPU and wall to `MEASURE_OUT`).
  - `.superpowers/sdd/101/set-status.sh <issue> <option-id>`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.

## Resume steps

1. **Run `ListAgents` first.**
2. **Read the state of every ticket named below from GitHub before working on it** (`gh issue view N --json state`).
3. **#506:** read `apps/sync-worker/test/health.test.ts` and wrangler's `createTestHarness` / `getPlatformProxy()` types in `node_modules/wrangler`; write the plan, then tests first. Then **#474, #475, #490, #491, #476, #477** in that order, measured with `.superpowers/sdd/477/vitest.reach.config.ts`.
4. **After any merge,** read the merge SHA and select its deploy-dev run by that SHA; if none appears in 10 minutes, it is #497 again: comment there, and the next merge carries it.
5. **One test run at a time from this session.** Benchmark only at load < 6 (Monitor until-loop on `sysctl -n vm.loadavg`), and judge on CPU, not wall.
6. **At close-out,** run the progress script, state both estimates, and check the closed stories against "Website follows the game" (this session's were toolchain only: nothing for players to see). Settle the handover as one commit.
