# Handover: Yawelo Idle

**Written:** 2026-10-07 17:45 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 17:48 UTC:

- **By tickets: 20% complete** (65 of 318 in-scope stories closed).
  - Measured pace: 9.29 a day over 7 days (10, 14, 8, 2, 15, 10, 6). At that pace: 2026-11-04.
  - **ETA to release-ready: 2026-12-23 to 2027-02-01** (low to medium confidence).
- **By effort: 21% complete** (314 of 1,507 points closed).
  - Measured pace: 44.86 points a day. At that pace: 2026-11-03.
  - **ETA to release-ready: 2026-12-19 to 2027-01-30** (low to medium confidence).
- **Measured:** the counts and the paces. **Assumed:**
  - 4–6 stories (20–30 points) a working day;
  - about 30 unfiled prestige stories (130–180 points, #328, #329);
  - 1.5–2.5 weeks of outside waits.
- **Why the dates moved:** tonight added 6 stories (37 points, #467 and #473–#477), so the ETAs moved out by a few days. 4 stories closed (#101, #448, #353, #417).

## The order (Shyden, 2026-10-07: "set a priority order and go from there", then "fix them all now")

1. **Unit tests under 1 s each** (new global rule, below): **#473 → #474 → #475 → #476, then #477 last.** #477 is the guard and the 1 s limit, so it lands once the suite is fast. 32 points.
2. **#432 stays open for its evidence.** AC1: the CI stall of `writeFloors` is narrowed but not reproduced. AC3: 10 consecutive CI runs with it never slow. The local timeouts are fixed (PR #471).
3. **#467,** the back-translation engine. It needs Docker running; Docker Desktop was off tonight.
4. **#51 → #104 → #102,** in that order (Shyden: "#104 first"). #104 needs #51's evidence rules and #467's engine, and #102 needs #104.
5. Then #110 → #103 (content), #125 → #124 → #128 (UI foundations), and #464 before the first production release.
6. **One M1 floor burn-down a session alongside** (#411–#416, #368–#375, #84, #36, #297). #402 is not urgent: the runner is pinned to 24.04.

## What this session did (2026-10-07 15:54 to 17:45 UTC)

- **#101 closed.** PR #465 merged `9a1f699`, deployed and dev-verified.
- **#448 closed.** PR #468: the floor recorder finds callers from the parse tree and refuses by name what it cannot follow. Merged `9858269`, deployed.
- **#353 closed.** PR #469: the pacing upload runs only when the pacing step ran. Proved live on throwaway PR #470 (closed). Merged `cb591a0`, deployed.
- **#417:** PR #472, one `lineOf` home for every guard (U+2028-safe). Merged `a510918`. Deployed and dev-verified; #417 closed and set Done.
- **#432:** PR #471 cut slow work instead of raising limits. Merged `8764b1a`, deployed.
  - `walkTree` spawns git once instead of 60 times.
  - The walks run once per file.
  - The recorder loads TypeScript lazily.
  - `supply-chain` reads the lockfile.
  - `ci-scope` copies one template repo.
  - Across 35 tests: 27.4 s → 8.0 s.
  - **The issue stays open,** and its CI-log measurement is posted on it.
- **Filed:** #467 (engine, 5 points) and #473–#477 (1-second rule, 32 points). #102 and #104 now name their dependencies.
- **Corrected by Shyden:** I first gave 27 slow tests 30 s "named budgets". He: _"reduce the slow parts. you already know increasing time limits is not the fix"_. They were reverted, and the memory note is `feedback-reduce-slow-work-never-raise-timeouts`.
- **New global rule** (`~/.claude/CLAUDE.md` and `reference-engineering-standards.md`):
  - every unit test runs in under 1 s, and no limit is ever raised;
  - non-unit suites keep one measured limit at their CI step;
  - it is a standing task in every repo.
- **#473 is profiled.** shop-agreement's replay (6.9 s in plain node, 32 s in the suite) is production-rate recomputation in core: `linesFor`, `rateBreakdown`, `tenTo` and others, recomputed for the same state at every offer. The fix to plan is to compute a state's breakdown once, for example cached by state object.
  - It needs a reviewed plan first: it is engine work under the golden-hash determinism rules.
  - The profile is on #473. Probe: `.superpowers/sdd/473/probe.ts`, run with `node --experimental-transform-types --import ./.superpowers/sdd/432/ext-loader.mjs`.
- **GitHub write outage:** writes returned HTTP 500 from 16:53 to about 17:19 UTC while reads worked. Writes queued in that window were sent once writes worked again.

## Waiting on Shyden

1. **Spotlight** (a side agent's note, which fits the measurement): add `~/Developer/Repos` to System Settings → Spotlight → Privacy. Its indexer hit 137% CPU after the `npm ci` runs tonight, just as a test timed out.
2. **Docker Desktop on,** for #467.
3. **#451 AC3:** confirm Web Analytics automatic setup on `yawelo-idle-dev-hosts`.
4. **#341 AC8 steps a–d,** then the App ID comment. PR #438 must not merge before that.
5. **#343:** the two Buttondown accounts.
6. **Later:** the #333 wordmark, the #425/#426 prod token, #345 sign-off, and #455's analytics token.
7. **Optional:** file "test timeouts only shrink" as a separate guard? #477 covers it for unit tests.

## State

- **`develop`** is at `a510918` (read with `git rev-parse origin/develop` when written).
- **Open PRs:**
  - #438 (#341, behind develop);
  - Dependabot #24 (`@types/node`);
  - this handover's PR, which supersedes #466 (closed).
- **Worktrees still present:** `../yawelo-idle-341`, `-341-gate`, `-348`, `-348-red` and `-35` (earlier sessions). `-101`, `-353`, `-417` and `-451` were merged and removed tonight.
- **The local branch `m1/473-golden-once`** has no commits; reuse it or delete it.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories".
  - Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`.
  - Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.
- **Session tools:** `.superpowers/sdd/101/set-status.sh <issue> <option-id>` sets a status after asserting the board title. `.superpowers/sdd/432/measure.setup.ts` and `vitest.measure.config.ts` record each test's wall, CPU and timeout to JSONL.

## Resume steps

1. **Run `ListAgents` first.**
2. **Start #473.** Read the profile comment on #473, then write a plan (superpowers:writing-plans).
   - Cache the production breakdown per state in `packages/core`, and prove it changes nothing: the golden-log hash, the determinism lint, and the cross-engine spec.
   - Profile `golden-log.test.ts` too.
   - Review the plan to zero by running its code, then implement it TDD.
3. **Then #474 and #475.** Measure with the measuring config first (`MEASURE_OUT=… npx vitest run -c .superpowers/sdd/432/vitest.measure.config.ts`).
   - Cut work only. Never raise a limit.
   - Remove the `*_TIMEOUT_MS` constants as each test gets fast.
4. **#477 last:** `testTimeout: 1_000`, the CPU check in a setup file, and the guard with planted forms.
5. **#432:** after 10 CI runs, scan them with `.superpowers/sdd/432/ci/scan.sh` (edit its run list) and close it if `writeFloors` never appears.
6. **At close-out,** run the progress script, state both estimates, and check the closed stories against "Website follows the game" (tonight's closes are all test or CI work, with nothing to announce). Settle the handover as one commit.
