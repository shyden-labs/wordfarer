# Handover: Yawelo Idle

**Written:** 2026-10-06 00:20 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. The session names itself "Yawelo Idle" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 00:18 UTC:

- **By tickets: 18% complete** (51 of 285 in-scope stories closed). Measured pace 8.50 a day over 6 days (10, 14, 8, 2, 15, 2). ETA at that pace 2026-11-03. **ETA to release-ready: 2026-12-17 to 2027-01-24** (low to medium confidence: 234 open plus about 30 unfiled stories at an assumed 4–6 a working day, plus 1.5–2.5 weeks of outside waits).
- **By effort: 20% complete** (263 of 1,342 points closed). Measured pace 43.83 points a day over 6 days (64, 53, 43, 16, 77, 10). ETA at that pace 2026-10-31. **ETA to release-ready: 2026-12-11 to 2027-01-20** (low to medium confidence: 1,079 open plus 130–180 unfiled prestige points at an assumed 20–30 a working day, plus the same waits).
- **Measured:** the counts and paces (today's 2 and 10 are a partial day). **Assumed:** the slower future rates; the unfiled prestige work (#328, #329); the outside waits.

## What this session did (2026-10-05 22:09 to 2026-10-06 00:20 UTC)

- **Shyden's decisions:** re-run the CI that GitHub's Actions incident cancelled (nothing of ours had run); **#378 AC2 = option C** (record all 62 literal minimums of 2 or more, and fix fast-check's seed globally; recorded on #378); "you delete it" for the dev D1 (done with wrangler pinned to the dev account; #391 AC4 then proved by the next deploy).
- **Merged and deployed (each verified by step name, deploy and verify green):** #399 (#367), #401 (#376), #403 (#400, runner pinned to ubuntu-24.04, no runner-image annotation on its head), #404 (#372), #407 (#406), #408 (#371), #409 (#405). Closed: #367, #376, #391, #400, #372, #371, #406, #405.
- **#406 (Shyden: "do this, it'll save time"):** floors now live in `tests/floors/<guard>.json`, one file per guard; `readFloors()` returns the union; the recorder writes only changed files and **records a second pass by itself when it creates a guard file** (the file walks count that file). A first draft floored the directory's own size; that put one shared count back, so it became a positive raw-text cross-check instead (reasons on #406).
- **Measured limit of the split:** corpus-wide counts (`floorless-searches/*`, `licences/text-files`, `old-name/files`, the supply-chain walks, `collection-calls/corpus-*`) still move whenever a ticket adds a test or a file, so two such tickets still collide, and should. Creating a new guard file also moves the four file walks (+1).
- **Strict merges:** develop's protection reads `strict: true`, `enforce_admins: true`, and out-of-date PRs now read BEHIND (#23, #24 at 00:00 UTC). #401 merged at 22:59 UTC without containing develop's tip `61762aa`; not explained (strict switched on later, or not enforced then). With strict on, every open PR must be rebased and re-run after each develop merge.
- **#405 (filed this session):** mid-conflict, `committableFiles()` listed a conflicted path once per index stage, which inflated one recording by two phantom files (caught and discarded). Fixed with a real-repository test (#409, merged); CI caught the fixture lacking a git identity for `merge` (exit 128), now fixed.
- **Lessons recorded in memory:** a mutation edited into a test file a corpus guard scans moves that corpus (#371 M4); zsh never word-splits `for r in $ids` (use `${(f)ids}`), with a hook refusing that loop proposed to Shyden (second occurrence); a test building a real git repo passes an identity to every git call (CI has none).

## State

- **No PR is open** apart from Dependabot #23 and #24 (both BEHIND develop). Every branch of this session is merged.
- **#378** (Todo, 5 points): option C decided. Plan: the parse-tree reader (start from `.superpowers/sdd/378/literal-minimums.ts`), the meta-guard with its burn-down list, controls (a)-(e), mutations; the conversions are filed separately (AC6). Option C adds one conversion story: a global fast-check seed (`fc.configureGlobal` in a vitest setup file, plus a guard refusing a missing or per-call seed) before the 16 property-test sites are recorded, each run twice at that seed.
- **Next cleanup tickets:** #370, #373, #374, #375 (floors for the remaining absence searches), then #402 (Ubuntu 26.04, deliberately).
- **For Shyden, outside this project:** ShyTalk's dev Pages project `shytalk-site-dev` sits in the production Cloudflare account (unchanged; a ShyTalk session should handle it).
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`. A read-back must name the board node id (the router refuses a query naming only an item id).

## Resume steps

1. Read this file and `git log origin/develop --oneline -12`.
2. #378: branch from `develop`, build the reader and meta-guard per its ACs (option C is in its last comment), mutations predicted first; file the conversion stories (AC6), including the fast-check seed story.
3. Then #370, #373, #374, #375. After every develop merge, rebase each open PR (strict is on) and run `npm run floors:record` on each commit; stage any conflicted floors file before recording.
4. At close-out, run `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` and state both estimates. Settle the whole handover before the first push, as one commit.
