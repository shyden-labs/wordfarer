# Handover: Yawelo Idle

**Written:** 2026-10-08 00:22 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 00:21 UTC:

- **By tickets: 21% complete** (66 of 319 in-scope stories closed).
  - Measured pace: 8.00 a day over 7 days (14, 8, 2, 15, 10, 6, 1). At that pace: 2026-11-09.
  - **ETA to release-ready: 2026-12-23 to 2027-02-01** (low to medium confidence).
- **By effort: 21% complete** (322 of 1,517 points closed).
  - Measured pace: 36.86 points a day. At that pace: 2026-11-10.
  - **ETA to release-ready: 2026-12-19 to 2027-01-29** (low to medium confidence).
- **Measured:** the counts and the paces. **Assumed:**
  - 4–6 stories (20–30 points) a working day;
  - about 30 unfiled prestige stories (130–180 points, #328, #329);
  - 1.5–2.5 weeks of outside waits.
- **The release-ready ranges are computed, not typed.** The method reproduces the last handover's own dates to within 1 to 3 days, which is rounding.
- **Why the dates held:** #473 closed (8 points), but #479 was filed (5 points) and #297 re-scored from 3 to 8.

## The order (Shyden, 2026-10-07: "set a priority order and go from there", then "fix them all now")

1. **Unit tests under 1 s each** (global rule, 2026-10-07):
   - **#479 next:** shop-agreement judged one day per test, building on #473's days fixture.
   - **#297 (Pemandu's catch-up)** is also in this line now. It is the only fix for the golden-log days whose one `resume` makes 1,329 to 3,131 purchases (days 21, 23, 26, 30, 32): 0.7 to 2.4 s each on CI.
   - **Then #474, #475, #476, and #477 last.** #477 now waits for #297 as well.
2. **#432 stays open for its evidence:** 10 CI runs with `writeFloors` never slow, then scan with `.superpowers/sdd/432/ci/scan.sh`.
3. **#467,** the back-translation engine. It needs Docker running.
4. **#51 → #104 → #102.**
5. Then #110 → #103, #125 → #124 → #128, and #464 before the first production release.
6. **One M1 floor burn-down a session alongside** (#411–#416, #368–#375, #84, #36). #297 has left this list for item 1.

## What this session did (2026-10-07 18:50 to 2026-10-08 00:22 UTC)

- **#473 closed.** PR #480 merged `4047c8d`, deployed and dev-verified.
  - **Core memo:** core keeps each state's Understanding and its last advance by state object.
  - **Days fixture:** `npm run golden-log` also writes `packages/core/fixtures/golden-days.jsonl` (35 days, 1.1 MB), and golden-log.test.ts checks one day per test, 142 tests.
  - **Before and after, back to back at load about 7:** golden-log's slowest test went from 14,454 to 1,156 ms of CPU; shop-agreement's from 20,477 to 5,750 ms.
  - **Unchanged:** every hash, every count and every floor table.
  - **Mutations:** 12, every one predicted and matched.
  - **Cross-engine spec:** passed on all three engines.
- **Operator decisions:**
  - 23:07 UTC, **"Day by day"**: the golden log is checked one day per test from recorded starts;
  - 23:41 UTC, **"Faster catch-up story"**: that is #297, which already existed, so nothing was filed twice. #297 now carries tonight's figures and AC6, and was re-scored from 3 to 8 points.
- **Filed:** #479 (shop-agreement by day, 5 points).
- **Saved for #297, not landed:** an exact rate-lines and held-cards memo, measured 702 → 555 ms on day 32. Patch: `.superpowers/sdd/297/rate-and-held-memo.2026-10-07.patch` in this tree.
- **A side agent's note was right:** late days cost more. CI runs about 2.5 times slower than this Mac, and I had sold day by day as one that "stays fast as the game grows". The memory note `feedback-cite-only-measured-figures` now covers claims in decision options too.
- **Header misses:** three tonight. Recorded in `feedback-header-opens-every-final-text`.

## Waiting on Shyden

1. **Test-isolation hook, an observation:** several `cd <worktree> && node --experimental-transform-types … probe.ts` commands ran without the test lock tonight, beside another session's heavy run, while one identical in shape was queued. It is a global hook (`~/.claude/hooks/test-isolation.py`), so I have not changed it. Should probes run by `node` count as heavy?
2. **Spotlight:** add `~/Developer/Repos` to System Settings → Spotlight → Privacy.
3. **Docker Desktop on,** for #467.
4. **#451 AC3:** confirm Web Analytics automatic setup on `yawelo-idle-dev-hosts`.
5. **#341 AC8 steps a–d,** then the App ID comment. PR #438 must not merge before that.
6. **#343:** the two Buttondown accounts.
7. **Later:** the #333 wordmark, the #425/#426 prod token, #345 sign-off, and #455's analytics token.

## State

- **`develop`** is at `4047c8d` (read with `git rev-parse origin/develop` when written).
- **Open PRs:**
  - #438 (#341, behind develop);
  - Dependabot #24 (`@types/node`);
  - this handover's PR.
- **Worktrees:** `../yawelo-idle-341`, `-341-gate`, `-348`, `-348-red` and `-35` remain from earlier sessions. `-473` was merged and removed tonight.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories".
  - Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`.
  - Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.
- **Session tools:**
  - `.superpowers/sdd/101/set-status.sh <issue> <option-id>` sets a status after asserting the board title.
  - `.superpowers/sdd/432/vitest.measure.config.ts` records each test's CPU and wall time to JSONL. Its root is this tree; a worktree needs its own copy, with that worktree as root.
  - `.superpowers/sdd/473/probe-*.ts` hold the per-day, per-event and day-32 probes. Run them with `node --experimental-transform-types --import ./.superpowers/sdd/432/ext-loader.mjs`.

## Resume steps

1. **Run `ListAgents` first.**
2. **#479:** judge shop-agreement one day per test from `golden-days.jsonl`.
   - `playGoldenDay`, `readGoldenDays` and `GoldenDay` are in `packages/core/fixtures/golden-log.ts`.
   - The kind totals must stay checked against `FLOORS`, or #413's recorded floors, without one test walking the whole log. Golden-log's answer: record the per-day figures, and let each day's test prove them.
   - Measure with the measuring config, before and after.
3. **#297:** start from the saved patch.
   - AC5 asks for one test per key part.
   - The real cut is keeping the best payback across a bucket's purchases rather than re-judging every Encounter each tick.
   - Measure days 21, 23, 26, 30 and 32 on CI.
4. **Then #474 and #475, then #476, then #477.**
5. **At close-out,** run the progress script, state both estimates, and check the closed stories against "Website follows the game" (tonight's close is test work, with nothing to announce). Settle the handover as one commit.
