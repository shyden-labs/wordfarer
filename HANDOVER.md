# Handover: Yawelo Idle

**Written:** 2026-10-05 16:59 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. The session names itself "Yawelo Idle" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 16:58 UTC:

- **By tickets: 15% complete** (41 of 280 in-scope stories closed). Measured pace 8.20 a day over 5 days (10, 14, 8, 2, 7). ETA at that pace 2026-11-04. **ETA to release-ready: 2026-12-18 to 2027-01-24** (low to medium confidence: 239 open plus about 30 unfiled stories at an assumed 4–6 a day, plus 1.5–2.5 weeks of waits).
- **By effort: 17% complete** (219 of 1,325 points). Measured pace 43.80 points a day (64, 53, 43, 16, 43). ETA at that pace 2026-10-31. **ETA to release-ready: 2026-12-11 to 2027-01-22** (low to medium confidence: 1,106 open plus 130–180 unfiled prestige points at an assumed 20–30 a day, plus 1.5–2.5 weeks of waits).
- **Measured:** the counts and paces. **Assumed:** the measured pace is front-loaded with quick M0 and M1 tickets, hence the assumed rates; the unfiled prestige work (#328, #329); the outside waits (operator admin, the production Cloudflare account, Steam review).

## State

- **#357 is closed and Done** (2026-10-05 16:48 UTC). The checkout and the worktrees `yawelo-idle-348`, `-348-red` and `-35` are at the new paths. Claude's project folder moved, with memory digests matching (75 files), and the old folder is removed. Evidence is in #357's comments.
  - Dev is `https://dev.yawelo-idle.shyden.co.uk` (gated) and `https://dev-api.yawelo-idle.shyden.co.uk`. The Workers are `yawelo-idle-web-dev` and `yawelo-idle-sync-dev`, and the D1 `yawelo-idle-dev` is in Asia Pacific.
  - Never write the dev password (`DEV_BASIC_AUTH_PASSWORD`, `dev` environment) anywhere.
  - Shyden's own call: the Cloudflare API token's label still names the old game, and renaming it may roll the token.
- **claude-mem history relabelled** from the old project name to `yawelo-idle` (1548 observations, 146 summaries, 40 sessions, 7174 tool uses), run by Shyden because auto mode refused the write. Backup: the `claude-mem.db.bak-rename-*-1791219101` file in `~/.claude-mem/`; it can be deleted once a session or two has shown the history working. The startup recap shows only 5 observations by setting; `session_start_context` with `full: true` shows Oct 1–5.
- **#391** (Todo, 3 points): wrangler 4.145 cannot rebind a by-name D1 after the bound database is deleted (7404 on inherit). **Until it lands, recreating a D1 database also means deleting its Worker before the deploy.**
- **Parked (post-launch):** #262, #263, #265, #267, #268, #275–#284. Mixed tickets #11, #12, #237, #264, #266, #270, #285, #294 carry a note: trim the mobile parts and re-score when picked up. Phones are served by the PWA (#152, #323). Steam is not parked.
- **#385** (2 points, Todo): five guards walk `trackedFiles()` and cannot see a new uncommitted file. **Until it lands: commit before any whole-suite run you rely on, `npm run floors:record` included.**
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`. New issues are not auto-added. Read an item back through `repository.issue.projectItems`. Read labels back per issue (`gh api repos/shyden-labs/yawelo-idle/issues/<n>`): `gh issue list --label` lags.

## Resume steps

1. **#391** (small, and it closes a trap on the deploy path), then **#385**, **#378** and **#367** (they change guards the conversions touch), then **#368–#376**, then #331's list. #353 is small and can be taken whenever.
2. At close-out, run `board-progress.ts` and state both estimates. Settle the whole handover before the first push, as one commit.
