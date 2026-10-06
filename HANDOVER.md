# Handover: Yawelo Idle

**Written:** 2026-10-06 11:22 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. The session names itself "Yawelo Idle" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 11:20 UTC (new in #340; repo-template's copy printed identical lines on the same board):

- **By tickets: 19% complete** (56 of 301 in-scope stories closed). Measured pace 9.33 a day over 6 days (10, 14, 8, 2, 15, 7). ETA at that pace 2026-11-02. **ETA to release-ready: 2026-12-19 to 2027-01-26** (low to medium confidence: 245 open plus about 30 unfiled stories at an assumed 4–6 a working day, plus 1.5–2.5 weeks of outside waits).
- **By effort: 20% complete** (285 of 1,419 points closed). Measured pace 47.50 points a day over 6 days (64, 53, 43, 16, 77, 32). ETA at that pace 2026-10-30. **ETA to release-ready: 2026-12-14 to 2027-01-23** (low to medium confidence: 1,134 open plus 130–180 unfiled prestige points at an assumed 20–30 a working day, plus the same waits).
- **Website first release (epic #331): live on production 2026-10-13 to 2026-10-20** (low to medium confidence, unchanged).
- **Measured:** the counts and paces. **Assumed:** the slower future rates, the unfiled prestige work (#328, #329) and the outside waits. Ranges unchanged: one 3-point story closed and nothing was filed.

## What this session did (2026-10-06 10:35 to 11:22 UTC)

- **#340 is done and closed.** PR #435, merged as `a7d7c16`, deploy-dev run 37455010414 green on every step with `dev-verified` posted. Evidence is in #340's last comment.
  - **`packages/progress`** (new workspace, no dependencies, `types: []` so the site Worker can import it in #341) holds the maths: `inScope`, `progress`, `formatLines`, `parseItems`, `assertTitle`, `closeOutLines`, `BOARD_QUERY`.
  - **`scripts/board-progress.ts`** is a 40-line wrapper: argv, `gh api graphql --paginate --slurp`, the clock, print. **Use it for every close-out from now on** instead of repo-template's copy.
  - **`packages/progress/test/board-fixture.ts`** is a two-page raw GraphQL board with dates relative to `today`. #341's Worker test should reuse it to meet the spec's "script and Worker give identical outputs from one fixture".
  - **Seven defects fixed in the port** (D1–D7 in PR #435): an empty scope printed NaN%; an Estimate off 1, 2, 3, 5, 8, 13 was summed; not-planned and duplicate closures counted as done; `labels(first: 20)` could drop `post-launch` silently; the ETA could come out a day late from float rounding; a page with no board threw a bare TypeError; a dead branch. **repo-template still has all seven**: that repo is outside this project, so filing them there is Shyden's call.
  - 21 repo-template tests ported under their titles, 28 more; red 49 of 49 against throwing stubs; 15 mutations all as predicted; 17 floors moved and each read against the diff; the one commit gated alone (all nine CI steps).
- Removed the merged worktree `../yawelo-idle-340`. Its tooling (`plan.md` with three review passes, `gate.sh`, `mutations.py`, logs) is kept in `.superpowers/sdd/340/` in this checkout.

## Waiting on Shyden

1. **#343:** create the Buttondown newsletter "Yawelo Idle" and a second free account "Yawelo Idle (dev)". Check that double opt-in is on and tracking is off, create no keys yet, and reply on #343 with the two usernames. No reply as of 11:20 UTC.
2. **#341's names (ask before it starts, AskUserQuestion):** its ACs still give the GitHub App and the repository under the game's former name. The repo is `shyden-labs/yawelo-idle` and the agent App was renamed `yawelo-idle-agent` in #357, but the roadmap App's name has not been decided. Never rename on assumption; the obvious option is `yawelo-idle-roadmap`.
3. Later in the order:
   - the copy approval (#334);
   - the wordmark pick (#333);
   - the roadmap App and two org webhooks (#341, AC8);
   - the prod Cloudflare token and the `prod` GitHub environment (#425, #426);
   - the ICO self-assessment (#423);
   - the visual sign-off (#345).

## State

- `develop` is at `a7d7c16`. This handover goes in as its own one-commit PR. No other PR of this session is open. Dependabot #23 and #24 are still BEHIND develop.
- **Run `npm ci` after pulling `develop`:** #340 added the workspace `packages/progress`, so an older install lists one workspace too few and the supply-chain test fails.
- **Dev:** `https://dev.yawelo-idle.shyden.co.uk/`. The password is the GitHub `dev` environment secret `DEV_BASIC_AUTH_PASSWORD`, with any username.
- **Next: #341 → #342.** #341 is 8 points and depends on #332 and #340, both closed.
- **M1 cleanup waits behind the website:** #370, #373, #374, #375, #417, #411 → #416, #412–#415, #432.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories".
  - Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`.
  - Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.
  - Closing an issue sets Done by itself.
  - Read an item's status back through `repository{issue{projectItems}}`: a bare `node(id: "PVTI_…")` read names no App's repo or board, so the router refuses it.
- **Reusable tooling:** `.superpowers/sdd/340/` (git-ignored, in this checkout):
  - `gate.sh <sha> <log>` gates one commit alone in a fresh worktree with the full CI step list (change `repo=` and `dir=` per ticket);
  - `mutations.py` with predicted failing titles and a fixed total;
  - `stubs/` for the red run.
    `.superpowers/sdd/429/build/` has the earlier copies.
- **Worktree `../yawelo-idle-429`** (branch merged) can still be removed with `git worktree remove ../yawelo-idle-429`.
- **Machine:** test runs share a lock with other sessions (`test-lock: … waits`); a queued run is not a broken one.

## Resume steps

1. Read this file, then run `git log origin/develop --oneline -5` and `gh issue list -R shyden-labs/yawelo-idle --state open --limit 30`. `git pull` then `npm ci`.
2. Check #343 for Shyden's reply. When it is there, read it back and close #343: AC1 and AC2 are done in its comment.
3. Before #341: ask Shyden the roadmap App's name (Waiting item 2), then update #341's ACs with the names and write AC8's exact click-paths into the issue, as AC8 requires before work starts. Read `~/.claude/global-rules/reference-live-roadmap.md` and spec §5 first.
4. Build #341 the way #340 was built: plan in `.superpowers/sdd/341/plan.md`, reviewed by running; TDD against stubs; mutations predicted first; `floors:record` deltas read against the diff; exact checks before floors; every `findIndex` order check anchored with `toBeGreaterThanOrEqual(0)` first. Reuse `board-fixture.ts` for the Worker's identical-output test.
5. At close-out:
   - Run `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` and state both estimates.
   - Check every story closed in the session against CLAUDE.md's "Website follows the game" rule (#340: nothing to show, internal tooling).
   - Settle the whole handover before the first push, as one commit.
