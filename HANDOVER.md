# Handover: Wordfarer

**Written:** 2026-10-05 08:18 UTC.
**Next session:** launch Claude from `~/Developer/Repos/wordfarer`. The session names itself "Wordfarer" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Wordfarer Stories"` at 08:17 UTC, after #355 closed:

- **By tickets: 13% complete** (38 of 292 in-scope stories closed). Measured pace 7.60 a day over 5 days (10, 14, 8, 2, 4). ETA at that pace 2026-11-08. **ETA to release-ready: 2026-12-24 to 2027-02-02** (low to medium confidence; 254 open plus about 30 unfiled stories at an assumed 4–6 a day, plus 2–3 weeks of waits).
- **By effort: 15% complete** (200 of 1,363 points). Measured pace 40.00 points a day (64, 53, 43, 16, 24). ETA at that pace 2026-11-04. **ETA to release-ready: 2026-12-18 to 2027-01-28** (low to medium confidence; 1,163 open plus 130–180 unfiled prestige points at an assumed 20–30 a day, plus 2–3 weeks of waits).
- **Measured:** the counts and paces above. **Assumed:** the measured pace is front-loaded with quick M0 and M1 tickets, hence the assumed rates; the unfiled prestige work (#328, #329); the outside waits (operator admin, the production Cloudflare account, store reviews). **What moved:** #355 (8) closed and #380 (8) was filed, so the release-ready ranges are unchanged.

## State

- **#355 is done: the new name is "Yawelo Idle"** (operator, 2026-10-05 07:33 UTC). PR #381 merged at `48d4de9`; dev deploy verified (deploy-dev run 37282009369, test, deploy and verify jobs green at `48d4de9`). The record is the "Replacement name (#355)" section of `docs/compliance/trademark-search.md`; spec D16 names it.
  - 38 invented words screened (English, KBBI plus slang, Mandarin plus slang, one-edit near-homophones) and cleared on USPTO, TMview, App Store (Mac control: Final Cut Pro, matched on `kind`), Google Play, itch.io, web, six TLDs; Steam and PDKI by the operator with controls.
  - **Secured and read back:** Apple bundle id `com.shyden.yawelo` (team F3XX4PM3MF), App Store record "Yawelo Idle" (Apple ID 6819183398, SKU `yawelo-idle`), Play record "Yawelo Idle" with package `com.shyden.yawelo` (Play app id 4974929390956746595). Both are personal developer accounts.
  - **Not claimed (operator):** no domains (the game will live at `yawelo.shyden.co.uk`), no trade mark for now, no Steamworks app.
  - The clearance kit and every run's output are in the main checkout's git-ignored `.superpowers/sdd/355/` (`screen.py`, `slang.py`, `near.py`, `domains.py`, `appstore2.py`, `data/`, `runs/`).
- **#380 filed** (8 points, Todo): register labels on every sense (formal, neutral, informal, slang, regional), informal forms paired with formal from region 1, rude senses cautioned but never taught. Operator decisions D19 (2026-10-05 06:11 UTC, asked interactively). It depends on #101, #103 and #141; the 12 lexicon stories carry an added criterion. Not in the rename order below; it lands with M2's content schema.
- **Session name:** the hook is now `~/.claude/hooks/yawelo-session-title.py` (operator, 2026-10-05: sessions are named "Yawelo Idle"); it also replaces the old hook title "Wordfarer" and leaves any manual name. 13 cases, 4 mutations as predicted; the old `wordfarer-session-title.py` is removed. Wired from the git-ignored `.claude/settings.local.json`: #357 must move that file with the repository directory (comment on #357).
- **Lesson saved** (`feedback-return-submits-forms.md`): pressing Return to confirm a dropdown submitted Apple's New App form before the operator's OK. Never press Return in a form with an irreversible submit.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Wordfarer Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`. New issues are not auto-added. Read an item back through `repository.issue.projectItems`.
- **Worktrees:** `wordfarer-348`, `wordfarer-348-red` and `wordfarer-35`, kept for their tooling. #361's tooling is in `.superpowers/sdd/361/`.

## Resume steps

1. `git fetch origin`; check that `origin/develop` includes this handover.
2. **#356** (rename the code and documents to Yawelo Idle): move it to In Progress, read its acceptance criteria and its comment from #355 (name, `com.shyden.yawelo`). History stays as written (operator decision on #355): old ticket text, merged plans and #157's record keep "Wordfarer".
3. Then **#357** (infrastructure: Workers, D1, dev host `yawelo.shyden.co.uk`, App, repository, board), **#378** and **#367** (they change guards the conversions touch), then **#368–#376**, then #331's list. #353 is small and can be taken whenever.
4. At close-out, run `board-progress.ts` and state both estimates. Settle the whole handover before the first push, as one commit.
