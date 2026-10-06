# Handover: Yawelo Idle

**Written:** 2026-10-06 01:30 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. The session names itself "Yawelo Idle" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 01:28 UTC:

- **By tickets: 18% complete** (52 of 292 in-scope stories closed). Measured pace 8.67 a day over 6 days (10, 14, 8, 2, 15, 3). ETA at that pace 2026-11-03. **ETA to release-ready: 2026-12-19 to 2027-01-26** (low to medium confidence: 240 open plus about 30 unfiled stories at an assumed 4–6 a working day, plus 1.5–2.5 weeks of outside waits).
- **By effort: 19% complete** (268 of 1,386 points closed). Measured pace 44.67 points a day over 6 days (64, 53, 43, 16, 77, 15). ETA at that pace 2026-11-01. **ETA to release-ready: 2026-12-14 to 2027-01-23** (low to medium confidence: 1,118 open plus 130–180 unfiled prestige points at an assumed 20–30 a working day, plus the same waits).
- **Measured:** the counts and paces (today's 3 and 15 are a partial day). **Assumed:** the slower future rates; the unfiled prestige work (#328, #329); the outside waits. Effort fell from 20% to 19% because this session filed 49 points of conversion work (#411–#417).

## What this session did (2026-10-06 00:28 to 01:30 UTC)

- **#378 merged and deployed** (PR #418, `22d4561`, deploy-dev run 37398841713 green on every step, dev verified): the literal-floors meta-guard. `tests/unit/literal-floors.ts` reads every comparison matcher and folds its lower bound when it is a figure written in the file: a number, arithmetic, a `const`, a `const` table look-up, or an `.each`/`.for` table parameter. **71 minimums of two or more in 58 scopes** sit on `tests/unit/literal-floors.burn-down.ts` (ceilings 71 and 58). 62 are numbers in place and 9 are written another way, which the text count on the ticket could not see. Per-file text cross-check in `comparison-text.ts`. 7 mutations, all as predicted.
- **Refactor first, as its own green commit:** `tests/unit/test-scopes.ts` (test placement) and `tests/unit/burn-down.ts` (`scopeKey`, `walkDisagreements`, `listFindings`) are now shared by floorless-searches and literal-floors.
- **Filed (AC6), scored against #371/#372/#376 (19 points for 40 sites, 0.475 a site):** #411 fast-check global seed and its guard (5, **blocks #416**), #412 guards I (8), #413 guards II (8), #414 bots (8), #415 core on fixed inputs (5), #416 core properties (8). Plus #417 (2): TypeScript counts U+2028 as a line break, so every guard names `hash.test.ts` lines 2 too high.
- **Design call recorded on #378:** the length of a written array (`pool.length`) is derived, not a typed figure, because it moves with its fixture.

## State

- **No PR of this session is open.** Dependabot #23 and #24 are still BEHIND develop.
- **Open M1 cleanup, in order:** #370, #373, #374, #375 (floors for absence searches), then #417 (2 pts, touches every guard that reports a line), then #411 → #416, and #412–#415 in any order. #402 (Ubuntu 26.04) deliberately later.
- **For Shyden, outside this project:** ShyTalk's dev Pages project `shytalk-site-dev` sits in the production Cloudflare account (unchanged; a ShyTalk session should handle it).
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.
- **Machine:** test runs share a lock with other sessions (`test-lock: … waits`): a queued run is not a broken one.

## Resume steps

1. Read this file and `git log origin/develop --oneline -12`.
2. #370: branch from `develop`; convert its 11 sites (pacing suite and web gate) per its ACs. `npm run floors:record` runs the pacing suite too (about two minutes).
3. Then #373, #374, #375, #417. After every develop merge, rebase each open PR (strict is on) and run `npm run floors:record` on each commit; stage any conflicted floors file before recording.
4. Any new test must not write a literal minimum of two or more: `literal-floors.test.ts` now refuses it. Record a floor with `floorBreach` instead.
5. At close-out, run `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` and state both estimates. Check every story closed this session against CLAUDE.md's "Website follows the game" rule (#420): each player-facing one has its `Website: announce <feature>` story filed, or says why there is nothing to show. Settle the whole handover before the first push, as one commit.
