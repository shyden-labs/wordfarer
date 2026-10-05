# Handover: Yawelo Idle

**Written:** 2026-10-05 16:20 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle` **after** the local move in step 1 (until then the checkout is still at its old path). The session names itself "Yawelo Idle" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 16:19 UTC, after the stores were parked:

- **By tickets: 14% complete** (40 of 279 in-scope stories closed). Measured pace 8.00 a day over 5 days (10, 14, 8, 2, 6). ETA at that pace 2026-11-04. **ETA to release-ready: 2026-12-18 to 2027-01-24** (low to medium confidence: 239 open plus about 30 unfiled stories at an assumed 4–6 a day, plus 1.5–2.5 weeks of waits).
- **By effort: 16% complete** (211 of 1,322 points). Measured pace 42.20 points a day (64, 53, 43, 16, 35). ETA at that pace 2026-11-01. **ETA to release-ready: 2026-12-11 to 2027-01-22** (low to medium confidence: 1,111 open plus 130–180 unfiled prestige points at an assumed 20–30 a day, plus 1.5–2.5 weeks of waits).
- **Measured:** the counts and paces. That read does not yet count #391 (Todo, 3 points, filed 16:17 UTC); the cause was not checked. **Assumed:** the measured pace is front-loaded with quick M0 and M1 tickets, hence the assumed rates; the unfiled prestige work (#328, #329); the outside waits (operator admin, the production Cloudflare account, Steam review). **What moved:** the App Store, Google Play and the iOS/Android app are **parked** (operator, 15:07 UTC: no company can register yet). 15 stories and 46 points left scope, and the store reviews left the waits. #357 is not closed yet (step 1).

## State

- **#357 is nearly done** (In Progress; evidence in its comments of 15:50 and 16:19 UTC). PRs #389 and #390 are merged; deploy-dev run 37338370340 is green at `e97571c` (attempt 2), with `dev-verified` posted.
  - Dev is `https://dev.yawelo-idle.shyden.co.uk` (gated) and `https://dev-api.yawelo-idle.shyden.co.uk`. The Workers are `yawelo-idle-web-dev` and `yawelo-idle-sync-dev`.
  - The D1 `yawelo-idle-dev` is in **Asia Pacific**, read in the dashboard. The deploy creates it with `--location apac` and refuses a create in any other region (`scripts/ensure-d1.ts`); it is bound by name, with no id.
  - The dev password was **changed by Shyden** in the `dev` environment secret `DEV_BASIC_AUTH_PASSWORD`. The deploy uploads it to the Worker every time (`scripts/dev-secrets.ts`, `--secrets-file`), and verify passed with it. Never write its value anywhere.
  - The old Workers and D1 are deleted; the old hosts no longer resolve.
  - Repository `shyden-labs/yawelo-idle`, App `yawelo-idle-agent` (slug changed with the name; id 5144082; manifest key `yawelo-idle`), board "Yawelo Idle Stories".
  - **Left:** AC6, the local move (step 1). Also, the Cloudflare API token's label still names the old game; renaming it may roll the token, so that is Shyden's call.
- **#391** (Todo, 3 points): wrangler 4.145 cannot rebind a by-name D1 after the bound database is deleted (7404 on inherit). **Until it lands, recreating a D1 database also means deleting its Worker before the deploy.**
- **Parked (post-launch):** #262, #263, #265, #267, #268, #275–#284. Mixed tickets #11, #12, #237, #264, #266, #270, #285, #294 carry a note: trim the mobile parts and re-score when picked up. Phones are served by the PWA (#152, #323). Steam is not parked.
- **#385** (2 points, Todo): five guards walk `trackedFiles()` and cannot see a new uncommitted file. **Until it lands: commit before any whole-suite run you rely on, `npm run floors:record` included.**
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`. New issues are not auto-added. Read an item back through `repository.issue.projectItems`. Read labels back per issue (`gh api repos/shyden-labs/yawelo-idle/issues/<n>`): `gh issue list --label` lags.
- **Worktrees:** `~/Developer/Repos/yawelo-idle-348`, `-348-red` and `-35` after the move, kept for their tooling.

## Resume steps

1. **The local move (Shyden, in his own terminal, with no Claude session open in this repository):**
   1. Run `move-checkout.zsh` from the checkout's git-ignored `.superpowers/sdd/357/` (its full path is in the close-out message, since the folder is still at its old name). It refuses before changing anything if a target exists, a tree is dirty, or a process still works inside the checkout. It moves the three worktrees and the checkout, repairs the worktree links, rewrites the old absolute path in the git-ignored tool scripts (run logs stay as written), and copies Claude's project folder to `-Users-shyden-Developer-Repos-yawelo-idle`, printing both memory digests.
   2. `cd ~/Developer/Repos/yawelo-idle && claude`, accept the trust dialog once, and check that MEMORY.md is in context.
   3. Then, from his terminal: `zsh ~/Developer/Repos/yawelo-idle/.superpowers/sdd/357/finish-move.zsh`. It removes the old project folder only if every old file is in the new one and a session has run there.
   4. The agent checks the move: `git worktree list`, `git remote -v`, a fetch, and the memory folder. Then it closes #357, moves it to Done, and tells Shyden the rename is complete for the shyden.co.uk project (AC7: repository, hosts, App).
2. Then **#391** (small, and it closes a trap on the deploy path), **#385**, **#378** and **#367** (they change guards the conversions touch), then **#368–#376**, then #331's list. #353 is small and can be taken whenever.
3. At close-out, run `board-progress.ts` and state both estimates. Settle the whole handover before the first push, as one commit.
