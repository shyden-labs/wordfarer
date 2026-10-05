# Handover: Wordfarer

**Written:** 2026-10-05 05:25 UTC.
**Next session:** launch Claude from `~/Developer/Repos/wordfarer`. The session names itself "Wordfarer" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Wordfarer Stories"` at 05:23 UTC, after #361 closed:

- **By tickets: 13% complete** (37 of 291 in-scope stories closed). Measured pace 7.40 a day over 5 days (10, 14, 8, 2, 3). ETA at that pace 2026-11-09. **ETA to release-ready: 2026-12-24 to 2027-02-02** (low to medium confidence; 254 open plus about 30 unfiled stories at an assumed 4–6 a day, plus 2–3 weeks of waits).
- **By effort: 14% complete** (192 of 1,355 points). Measured pace 38.40 points a day (64, 53, 43, 16, 16). ETA at that pace 2026-11-05. **ETA to release-ready: 2026-12-18 to 2027-01-28** (low to medium confidence; 1,163 open plus 130–180 unfiled prestige points at an assumed 20–30 a day, plus 2–3 weeks of waits).
- **Measured:** the counts and paces above. **Assumed:** the measured pace is front-loaded with quick M0 and M1 tickets, hence the assumed rates; the unfiled prestige work (#328, #329); the outside waits (operator admin, the production Cloudflare account, store reviews). **What moved:** #361 (8) closed, and 11 follow-ups were filed (99 points: #367, #368–#376, #378), so both ranges moved out by two to three weeks.

## State

- **#361 is done: every absence search checks a recorded floor, or is on a burn-down that only shrinks.** PR #377 merged at `e57b94e`; dev deployed and verified (deploy-dev run 37261734727, `dev-verified` success). What it built:
  - `tests/floors.json` with `floorBreach` (`tests/floors.ts`): a count checked for equality. `npm run floors:record` (`scripts/record-floors.ts`) raises figures, never lowers one, never runs in CI, and runs every suite that holds a floor (each of the five lists its own files; a caller in the sync Worker's workerd suite is refused by name, since workerd has no file system).
  - `searched(findings, { of, what })` and `againstControl(run, { input, control })` in `tests/searched.ts`. `againstControl` is for an input left empty on purpose only (operator decision, asked interactively).
  - The reader `tests/unit/floorless-searches.ts`, its independent text count `tests/unit/absence-text.ts`, and the meta-guard in `tests/unit/floorless-searches.test.ts` against `tests/unit/floorless-searches.burn-down.ts` (155 unproved sites in 141 scopes, ceilings at those figures).
  - 12 of 12 mutations caught; the plan, generated from the stage commits and reviewed to zero in five passes, is `docs/superpowers/plans/2026-10-05-m1-361-floorless-searches.md`.
- **Converting a site** (the follow-up stories): wrap the finding list in `searched` with the population it searched, check `floorBreach('<id>', <population>.length)` in the same test (`<population>` spelled exactly as `of:` spells it), run `npm run floors:record`, quote its deltas in the commit, and lower the burn-down entry and both ceilings. The recorder runs the whole unit suite (about 70 s), plus pacing (about 2 min) when a pacing test holds a floor.
- **Follow-ups filed this session**, all Todo on the board with estimates: #367 count-shaped absence checks become lists (5); #368–#376 the conversions (89 points, 155 sites; each story lists its scopes); #378 hard-coded minimums become recorded floors (5), which #361's estimate named and did not build.
- **Rename (unchanged):** #355 choose, clear and secure the new name (8), #356 rename the code and documents (8), #357 rename the repository and infrastructure (8). Operator decisions on #355, so don't re-ask: an invented, brandable word plus "Idle", neutral across English, Indonesian and Mandarin; history stays as written; Shyden tells the shyden.co.uk project himself. #355's kit is in the main checkout's git-ignored `.superpowers/sdd/355/` (README first).
- **Order (operator decision, 2026-10-05, asked interactively: "Rename first"):** **#355 → #356 → #357**, then **#378 and #367** (they change guards the conversions touch), then **#368–#376**, then #331's list in order. #353 is small and can be taken whenever. Memory: `project-website-epic-order.md`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Wordfarer Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`. New issues are not auto-added. Read an item back through `repository.issue.projectItems`.
- **Worktrees:** `wordfarer-ho361` (this handover's branch; remove it once merged), plus `wordfarer-348`, `wordfarer-348-red` and `wordfarer-35`, kept for their tooling. #361's tooling (`gate.sh`, `gate-stages.sh`, `red.py`, `mutate.py` with multi-file mutations, `mutations.py`, `gen.py`, `check.py`, `tables.py`, `conv-gen.py`) is in the main checkout's git-ignored `.superpowers/sdd/361/`.
- The main checkout's old uncommitted `HANDOVER.md` pointer was removed this session so `develop` could fast-forward; it pointed at #350, long merged.

## Resume steps

1. `git fetch origin`; check that `origin/develop` includes this handover. Remove the `wordfarer-ho361` worktree.
2. **#355**: move it to In Progress. Read `.superpowers/sdd/355/README.md`, then follow step 4 of the handover at `c699155` (`git show c699155:HANDOVER.md`): at least 15 invented words, screened in English, KBBI and pinyin; clear the 8 or more that survive, each with a control; then ask Shyden to pick, with the evidence in the option descriptions, and secure the name the same day.
3. Then #356, #357, #378, #367, and #368–#376 in that order. Each conversion story lists its scopes; follow "Converting a site" above, and its AC4 mutation (blind part of the population, red through the new floor).
4. At close-out, run `board-progress.ts` and state both estimates. Settle the whole handover before the first push, as one commit.
