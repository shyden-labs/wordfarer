# Handover: Yawelo Idle

**Written:** 2026-10-08 15:05 UTC (after #509 and #510).
**Next session:** launch Claude from a **new terminal** in `~/Developer/Repos/yawelo-idle` (see "Node" below). A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 15:04 UTC:

- **By tickets: 22% complete** (72 of 327 in-scope stories closed).
  - Measured pace: 8.86 a day over 7 days. At that pace: 2026-11-06.
  - **ETA to release-ready: 2026-12-23 to 2027-02-01** (low to medium confidence).
- **By effort: 22% complete** (347 of 1,551 points closed).
  - Measured pace: 40.43 points a day. At that pace: 2026-11-07.
  - **ETA to release-ready: 2026-12-19 to 2027-01-29** (low to medium confidence).
- **Measured:** the counts and the paces. **Assumed:** 4–6 stories (20–30 points) a working day; about 30 unfiled prestige stories (130–180 points, #328, #329); 1.5–2.5 weeks of outside waits.
- **The release-ready ranges are carried** from 00:21 UTC. This session closed #506 (5 points) and filed nothing: inside the ranges' rounding.

## The order (Shyden: "Cleanup first, every project", 2026-10-08)

1. **Unit tests under 1 s each, cut tests at or under 0.3 s of CPU, no process or outside connection in a unit test:** **#474 next** (packages/core property tests: words, sim, pemandu-tick, log, automation, det-math, num, encounters, golden-vectors, review; remove every `*_TIMEOUT_MS`), then #475 (5), #490, #491, #476, #477 (8). The 12 tests still over 1 s on Node 26 are named in PR #507: #474 owns words, sim, pemandu-tick, det-math; #475 owns bots run, svelte-gates, floorless-searches, literal-floors. Start #474 with a measurement pass (`.superpowers/sdd/477/vitest.reach.config.ts`), at load < 6, on Node 26. Vitest is now 5.0.3 (#510): re-check anything a plan says about Vitest 4.
2. **#505** (3 points): `floors:record -- --suite <name>`, no browser suites by default. Also remove the recorder's `{ unrecordable }` suite form, unused since #506 (comment on #505).
3. **#497:** a daily check that dev serves `develop`'s head, and `workflow_dispatch` on deploy-dev. (Both merges this session reached dev normally.)
4. **#432** stays open for its evidence (10 CI runs with `writeFloors` never slow, then `.superpowers/sdd/432/ci/scan.sh`).
5. **#467** (needs Docker), then #51 → #104 → #102; #110 → #103, #125 → #124 → #128; #464 before the first production release.
6. **One M1 floor burn-down a session alongside** (#411–#416, #368–#375, #84, #36).

## What this session did (2026-10-08 14:17 to 15:05 UTC)

- **#506, PR #509** (`7c24bab`, merged as `5eb0dba`, deployed and verified): the sync Worker tests run on wrangler's own `createTestHarness`, **every case inside workerd** (operator 14:34 UTC: "keep everything running through the same things and be as consistant as you can"). The three cases that need an environment no deploy has go to a test-only wrapper Worker in the same harness (`apps/sync-worker/test/injected-worker.ts`, `wrangler.injected.jsonc`). It wraps the real handler, makes the one change the `x-inject` header names, refuses any other with 400, and returns what the handler logged. A test holds its config equal to `wrangler.jsonc` except for `name` and `main`. 17 cases kept plus 2 (19).
  - `@cloudflare/vitest-pool-workers` is gone from the package, the tsconfig, the lock and the root `overrides` (only `sharp` is left). Its config is now `vitest.harness.config.ts`, like the other harness suites.
  - `tests/unit/worker-runtime.test.ts`: new check that the Workers runtime enters the lock only through wrangler. It searches the lock entries naming wrangler or miniflare, floored at 2 (`tests/floors/worker-runtime.json`). It was red first on the pool.
  - The Dependabot `vitest >=5` ignore is gone; the floor recorder runs the sync Worker harness like the others; spec §12.4 amended.
  - 17 predicted mutations, 17 matched (`.superpowers/sdd/506/mut.py`). AC6: wrangler moved alone to 4.147.0 in a scratch worktree, with the guard and the suite green and no hand edit. **#506 closed.**
- **#510 (Dependabot, Vitest 4.1.11 → 5.0.3)** opened minutes after the ignore went. CI was green with **identical totals in every suite** (5,911 / 22 / 19 / 21 / 52 / 12, browser 27 and 12). Merged as `d9a78a3`, deployed and verified (60 of 60 steps; `/health` read by hand).
- **Floors:** raised by hand three times (the guards' own readings, old figures checked first), because `floors:record` still runs browser suites (#505).
- **Lesson recorded:** `feedback-session-shell-may-run-node-24`.

## Waiting on Shyden

1. **Relaunch Claude from a new terminal.** This session's shell ran **Node 24**: PATH began with `/opt/homebrew/opt/node@24/bin` and had no Node 26 directory, although `~/.zshrc` line 4 puts it first. Nothing in the startup files adds node@24, so it came from the terminal Claude was started in. This session prefixed every Node command with Node 26.
2. **Spotlight:** add `~/Developer/Repos` to System Settings → Spotlight → Privacy.
3. **A hook for a lesson missed four times now:** `gh api …/jobs/<id>/logs` without `--allow-escape-sequences`. Global, so not built: say if you want it.
4. **Docker Desktop on,** for #467 (and for `floors:record` until #505 lands).
5. **#451 AC3:** confirm Web Analytics automatic setup on `yawelo-idle-dev-hosts`.
6. **#341 AC8 steps a–d,** then the App ID comment. PR #438 must not merge before that.
7. **#343:** the two Buttondown accounts.
8. **Later:** the #333 wordmark, the #425/#426 prod token, #345 sign-off, and #455's analytics token.

## State

- **`develop`** is at `d9a78a3` (read with `git rev-parse origin/develop` when written), deployed and verified on dev (run 37796585304). This handover's PR follows it.
- **Open PRs:** #438 (#341, behind develop); this handover's PR. No Dependabot PRs open.
- **Node:** CI runs 26.11.1; the laptop has 26.10.0 at `/opt/homebrew/opt/node/bin` (see "Waiting on Shyden" 1). The main checkout's `node_modules` came from `npm install` on Node 24 this session (the lock does not depend on it); run `npm ci` on 26 before benchmarking.
- **Worktrees:** `../yawelo-idle-develop-bench` (detached at `9566388`; re-run `npm ci` on Node 26 before using it), `../yawelo-idle-297-before` (`c84cf07`, the pre-#297 baseline), and `../yawelo-idle-297`, `-341`, `-341-gate`, `-348`, `-348-red`, `-35` from earlier sessions. This session's scratch worktree was removed.
- **Session tools (git-ignored):**
  - `.superpowers/sdd/506/`: `mut.py` (17 mutations with predictions, refuses a moved total), `raise.py <unit log>` (raises each grown floor to its guard's reading, after checking the old figure), `probe.ts` (harness vs `getPlatformProxy` timings), PR and closing texts.
  - `.superpowers/sdd/477/`: `reach.setup.ts` + `vitest.reach.config.ts` (per test: process starts, socket connects, CPU and wall to `MEASURE_OUT`).
  - `.superpowers/sdd/501/measure.zsh` (per-test CPU on Node 26 then 24).
  - `.superpowers/sdd/101/set-status.sh <issue> <option-id>`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.

## Resume steps

1. **Run `ListAgents` first,** then `node -v`: if it is not 26, prefix Node commands with `export PATH=/opt/homebrew/opt/node/bin:$PATH;`.
2. **Read the state of every ticket named below from GitHub before working on it** (`gh issue view N --json state`).
3. **#474:** move it to In Progress; `npm ci` on Node 26; measure every packages/core test's CPU and wall with `.superpowers/sdd/477/vitest.reach.config.ts` at load < 6; write the plan (which property, what smaller input still covers, its reached-counter); then tests first. Then #475, #490, #491, #476, #477.
4. **After any merge,** read the merge SHA and select its deploy-dev run by that SHA (a Monitor until-loop while it appears); if none appears in 10 minutes, it is #497 again: comment there, and the next merge carries it.
5. **One test run at a time from this session.** Benchmark only at load < 6 (Monitor until-loop on `sysctl -n vm.loadavg`), and judge on CPU, not wall.
6. **At close-out,** run the progress script, state both estimates, and check the closed stories against "Website follows the game" (this session's were tooling only: nothing for players to see). Settle the handover as one commit.
