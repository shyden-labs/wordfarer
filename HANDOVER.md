# Handover: Yawelo Idle

**Written:** 2026-10-05 14:23 UTC.
**Next session:** launch Claude from `~/Developer/Repos/wordfarer`. The session names itself "Yawelo Idle" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Wordfarer Stories"` at 14:22 UTC, after #383 closed:

- **By tickets: 14% complete** (40 of 294 in-scope stories closed). Measured pace 8.00 a day over 5 days (10, 14, 8, 2, 6). ETA at that pace 2026-11-06. **ETA to release-ready: 2026-12-24 to 2027-02-02** (low to medium confidence; 254 open plus about 30 unfiled stories at an assumed 4–6 a day, plus 2–3 weeks of waits).
- **By effort: 15% complete** (211 of 1,368 points). Measured pace 42.20 points a day (64, 53, 43, 16, 35). ETA at that pace 2026-11-02. **ETA to release-ready: 2026-12-18 to 2027-01-28** (low to medium confidence; 1,157 open plus 130–180 unfiled prestige points at an assumed 20–30 a day, plus 2–3 weeks of waits).
- **Measured:** the counts and paces above. **Assumed:** the measured pace is front-loaded with quick M0 and M1 tickets, hence the assumed rates; the unfiled prestige work (#328, #329); the outside waits (operator admin, the production Cloudflare account, store reviews). **What moved:** #383 (3) closed. The release-ready ranges are unchanged.

## State

- **#383 is done.** PR #387 merged at `0890e58`; deploy-dev run 37323266668 (test, deploy, verify) green at `0890e58`. Both stores now hold **`com.shyden.yaweloidle`**: Apple bundle id registered, App Store Connect record 6819183398 switched to it, the old `com.shyden.yawelo` identifier removed; Play app **4973248216649940944** created by the operator, and the old `com.shyden.yawelo` draft (4974929390956746595) deleted by the operator. Record: `docs/compliance/trademark-search.md`, "Store ids moved to `com.shyden.yaweloidle` (#383)"; D16 updated.
  - **Found on the way:** Play has two delete routes. The help page's one (Advanced settings, transaction ID, 7-day recovery) and the apps list's bin icon ("Delete draft app?", no transaction ID, permanent). Android developer verification still lists `com.shyden.yawelo` as Registered after the deletion. The browser `find` tool once returned the WRONG row's Delete button (`yaweloidle` for a query naming `yawelo`): memory `feedback-browser-find-never-picks-destructive-targets.md`.
  - **This checkout's `node_modules` was stale after #356's scope rename** (it still linked the pre-rename npm scope and lacked `ts-fsrs`, so 27 test files failed to load). `npm ci` fixed it: 69 files, 4,905 tests green. **The three worktrees kept for tooling (listed below) predate the rename too: run `npm ci` in one before trusting a run there.**
- **#356 is done** (PR #384, `9224733`). The guard `tests/unit/old-name.test.ts` refuses the old name outside `ALLOWANCES` in `tests/unit/old-name.ts`, which holds history and **six infrastructure entries named "(#357)"**; #357 deletes each as it renames the thing, and the `old-name/allowances` floor (27) moves down by hand.
- **#385** (2 points, Todo): five guards walk `trackedFiles()` and cannot see a new uncommitted file. **Until it lands: commit before any whole-suite run you rely on, `npm run floors:record` included.**
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Wordfarer Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`. New issues are not auto-added. Read an item back through `repository.issue.projectItems` (a `node(id:)` read runs as the operator and is refused).
- **Worktrees:** `~/Developer/Repos/wordfarer-348`, `~/Developer/Repos/wordfarer-348-red` and `~/Developer/Repos/wordfarer-35`, kept for their tooling.

## Resume steps

1. `git fetch origin`; check that `origin/develop` includes this handover.
2. **#357** (infrastructure: Workers, D1, hosts `yawelo-idle.shyden.co.uk`, App, repository, board, local paths and the memory folder). Move it to In Progress, read its criteria and its four comments (the store id one is #383's). It is mostly operator steps, each with exact instructions and read back. Plan the order before starting: criterion 6 (moving `~/Developer/Repos/wordfarer` changes the folder Claude's memory is keyed to) comes last, after everything that runs from this checkout. Remove each infrastructure entry from `ALLOWANCES` as its thing is renamed.
3. Then **#385**, **#378** and **#367** (they change guards the conversions touch), then **#368–#376**, then #331's list. #353 is small and can be taken whenever.
4. At close-out, run `board-progress.ts` and state both estimates. Settle the whole handover before the first push, as one commit.
