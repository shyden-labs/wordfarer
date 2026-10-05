# Handover: Yawelo Idle

**Written:** 2026-10-05 10:57 UTC.
**Next session:** launch Claude from `~/Developer/Repos/wordfarer`. The session names itself "Yawelo Idle" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Wordfarer Stories"` at 10:56 UTC, after #356 closed:

- **By tickets: 13% complete** (39 of 294 in-scope stories closed). Measured pace 7.80 a day over 5 days (10, 14, 8, 2, 5). ETA at that pace 2026-11-07. **ETA to release-ready: 2026-12-24 to 2027-02-02** (low to medium confidence; 255 open plus about 30 unfiled stories at an assumed 4–6 a day, plus 2–3 weeks of waits).
- **By effort: 15% complete** (208 of 1,368 points). Measured pace 41.60 points a day (64, 53, 43, 16, 32). ETA at that pace 2026-11-02. **ETA to release-ready: 2026-12-18 to 2027-01-28** (low to medium confidence; 1,160 open plus 130–180 unfiled prestige points at an assumed 20–30 a day, plus 2–3 weeks of waits).
- **Measured:** the counts and paces above. **Assumed:** the measured pace is front-loaded with quick M0 and M1 tickets, hence the assumed rates; the unfiled prestige work (#328, #329); the outside waits (operator admin, the production Cloudflare account, store reviews). **What moved:** #356 (8) closed; #383 (3) and #385 (2) were filed. The release-ready ranges are unchanged.

## State

- **#356 is done.** PR #384 merged at `9224733`; dev deploy verified (deploy-dev run 37299187829: test, deploy and verify green at `9224733`; verify read the commit from the renamed `yawelo-idle-commit` page stamp). Record: `docs/superpowers/plans/2026-10-05-m3-356-rename.md`.
  - **Operator decisions, 2026-10-05, asked interactively:** _"Yawelo Idle is the name to match everywhere, not Yawelo"_ (10:16 UTC). Case forms: `Yawelo Idle`, `yawelo-idle` (npm scope `@yawelo-idle/*`), `YAWELO_IDLE_*`, `yaweloIdle*`. Hosts become `yawelo-idle.shyden.co.uk` (#357). Store id **`com.shyden.yaweloidle`** (10:18 UTC): Apple bundle ids allow no underscore and Android ids no hyphen, so it is the only spelling of the full name valid in both stores. The design spec is now `docs/superpowers/specs/2026-10-01-yawelo-idle-design.md`; D16 and review-log row 10 record all this.
  - **The guard** `tests/unit/old-name.test.ts` refuses the old name outside `ALLOWANCES` in `tests/unit/old-name.ts`: history (clearance record, dated plans, the main spec's §2 and §17, the content-reports review log, one operator quote) and **six infrastructure entries named "(#357)"**. A test per entry fails once the thing it covers is gone, so #357 deletes each entry as it renames the thing, and the `old-name/allowances` floor (27) moves down with it, by hand. Floors: `old-name/files` 219, `old-name/files-naming-it` 32. 27 mutations, all as predicted (tooling in the git-ignored `.superpowers/sdd/356/`: `mutate.py`, `rename.ts`, `gate.sh`).
- **#383 filed** (3 points, Todo): re-secure the store ids as `com.shyden.yaweloidle`. The 2026-10-05 Apple bundle id and App Store record, and the Play record, hold `com.shyden.yawelo`. Play package names are permanent, so it needs a new Play record. Every step there is the operator's click or follows his explicit OK.
- **#385 filed** (2 points, Todo): five guards walk `trackedFiles()` and so cannot see a new uncommitted file; move them to `committableFiles()`. Found when the first floor record passed with the new test file untracked, and `collection-calls` refused it once committed (third time for this class; memory `feedback-gate-after-commit.md` updated). **Until it lands: commit before any whole-suite run you rely on, `npm run floors:record` included.**
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Wordfarer Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`. New issues are not auto-added. Read an item back through `repository.issue.projectItems` (a `node(id:)` read runs as the operator and is refused).
- **Worktrees:** `~/Developer/Repos/wordfarer-348`, `~/Developer/Repos/wordfarer-348-red` and `~/Developer/Repos/wordfarer-35`, kept for their tooling. The #356 worktree is removed.

## Resume steps

1. `git fetch origin`; check that `origin/develop` includes this handover.
2. **#383** (store ids): move it to In Progress and read its criteria. It is mostly operator console work, so ask before any submit and never press Return in those forms (`feedback-return-submits-forms.md`).
3. **#357** (infrastructure: Workers, D1, hosts `yawelo-idle.shyden.co.uk`, App, repository, board, local paths and the memory folder): read its criteria and its two comments; the operator steps are listed there. Remove each infrastructure entry from `ALLOWANCES` as its thing is renamed.
4. Then **#385**, **#378** and **#367** (they change guards the conversions touch), then **#368–#376**, then #331's list. #353 is small and can be taken whenever.
5. At close-out, run `board-progress.ts` and state both estimates. Settle the whole handover before the first push, as one commit.
