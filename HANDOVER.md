# Handover: Wordfarer

**Written:** 2026-10-04 18:31 UTC.
**Next session:** launch Claude from `~/Developer/Repos/wordfarer`. The session names itself "Wordfarer" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Wordfarer Stories"` at 18:30 UTC:

- **By tickets: 12% complete** (33 of 274 in-scope stories closed). Measured pace 8.25 a day over 4 days (10, 14, 8, 1). ETA at that pace 2026-11-03. **ETA to release-ready: 2026-12-12 to 2027-01-08** (low to medium confidence; 241 open plus about 30 unfiled stories at an assumed 4–6 a day, plus 2–3 weeks of waits).
- **By effort: 14% complete** (173 of 1,218 points). Measured pace 43.25 points a day (64, 53, 43, 13). ETA at that pace 2026-10-29. **ETA to release-ready: 2026-12-07 to 2027-01-06** (low to medium confidence; 1,045 open plus 130–180 unfiled prestige points at an assumed 20–30 a day, plus 2–3 weeks of waits).
- **Measured:** the counts and paces above. Today closed one 13-point story (#35) in a full day, including a history rewrite.
- **Assumed:** the measured pace is front-loaded with quick M0 and M1 tickets, so the ranges assume 20–30 points a day; plus the unfiled prestige work (#328, #329) and 2–3 weeks of outside waits (trademark decision, operator admin for the website's App, webhooks and newsletter provider, the production Cloudflare account, store reviews).

## State

- **#35 is done.** PR #349 merged at `074367c`; CI green step by step on `9e56ff3`; the pacing step took 98 s on the runner (AC7); `dev-verified` on `074367c`; #35 closed with per-AC evidence and its card is Done. The plan is `docs/superpowers/plans/2026-10-04-m1-35-pacing-bots.md`, reviewed to zero in four passes.
- **Operator, 17:36 UTC: every commit green, NEVER a red commit** (_"this does break my standard and I am not happy about it. fix it and NEVER do this again"_). #35's branch had one commit whose pacing suite was red on its own; it was folded into its fix before the PR. The rule is in the global CLAUDE.md ("EVERY COMMIT GREEN") and in memory `feedback-every-commit-green.md`. Gate every stage alone on a clean `npm ci` **before** writing a plan, and fold a red stage into its fix.
- **#348 filed (operator 17:40 UTC, "yes add it"):** a CI job that tests every commit a pull request brings, with a stable `every-commit` check made required on `develop`. On the board, Todo, Estimate 5. **Next, before #157.**
- **AC5 of #35 was amended** (operator 16:24 UTC): pacing assertions share one run, so the mutation tables name every test each mistuning reddens.
- **Order (operator):** #348, then #157 (trademark desk search), then #331's list in its order. The prestige design (#328, #329; decisions in `.superpowers/sdd/prestige/decisions.md` in the main checkout) waits behind that.
- **Tooling** (git-ignored, in `~/Developer/Repos/wordfarer-35/.superpowers/sdd/m1-35/`): the #35 plan pipeline, the newest model for the next plan: `build_plan35.sh`, `gen35.py`, `verify_blocks35.py`, `fill35.py` (refuses any red gate line), `tables35.py` (lists every test each mutation turned red, from its log), `check_names35.py`, `red35.sh` (runs the pacing suite red wherever a stage edits it), `gate35.sh` and `gate-stages35.sh` (CI's steps per commit, no escape hatch), `mutate.py`, `split35.py`. `decisions.md` there holds #35's full decision record.
- **Worktrees:** `~/Developer/Repos/wordfarer-35` holds that tooling (its branch `m1/35-pacing-bots` is obsolete; keep the folder). `~/Developer/Repos/wordfarer-35-t1` is where this handover was written: remove it once this handover merges.
- claude-mem's observer allowance was exhausted this session, so nothing went to claude-mem. The repo memory files are unaffected.

## Resume steps

1. `git fetch origin`; check that `develop` includes #349 and this handover. In the main checkout, `HANDOVER.md` carries an older uncommitted pointer; this file supersedes it. Read this one with `git show origin/develop:HANDOVER.md` and leave the local edit for Shyden. Remove the `wordfarer-35-t1` worktree.
2. **#348**: read its ACs on the ticket. AC4 (the required check) may be operator administration: check whether the App can write branch protection first, and ask Shyden only if it cannot. AC7's live proof needs a throwaway PR, closed unmerged.
3. Then **#157**: the desk search (UK IPO, EUIPO, USPTO), recorded in `docs/compliance/trademark-search.md`, with a recommendation; the operator decides.
4. Then **#331's list in order**. Each story: its own branch, one commit per task, **every stage gated alone before the plan**, red runs, mutations with predictions written first, the plan generated from the stage commits and reviewed to zero.
5. At close-out, run board-progress and state both estimates.
