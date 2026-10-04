# Handover: Wordfarer

**Written:** 2026-10-04 19:37 UTC.
**Next session:** launch Claude from `~/Developer/Repos/wordfarer`. The session names itself "Wordfarer" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Wordfarer Stories"` at 19:30 UTC (#348 is still open, waiting on AC4, so it is not counted):

- **By tickets: 12% complete** (33 of 275 in-scope stories closed). Measured pace 8.25 a day over 4 days (10, 14, 8, 1). ETA at that pace 2026-11-03. **ETA to release-ready: 2026-12-12 to 2027-01-08** (low to medium confidence; 242 open plus about 30 unfiled stories at an assumed 4–6 a day, plus 2–3 weeks of waits).
- **By effort: 14% complete** (173 of 1,220 points). Measured pace 43.25 points a day (64, 53, 43, 13). ETA at that pace 2026-10-29. **ETA to release-ready: 2026-12-07 to 2027-01-06** (low to medium confidence; 1,047 open plus 130–180 unfiled prestige points at an assumed 20–30 a day, plus 2–3 weeks of waits).
- **Measured:** the counts and paces above. **Assumed:** the measured pace is front-loaded with quick M0 and M1 tickets, so the ranges assume 20–30 points a day; plus the unfiled prestige work (#328, #329) and 2–3 weeks of outside waits (trademark decision, operator admin, the production Cloudflare account, store reviews). The total rose by 2 points today: #353 was filed.

## State

- **#348 is engineering-done, waiting on Shyden for AC4.** PR #351 merged at `e20cc6f`; CI green step by step at `1b6542a`; `dev-verified` on `e20cc6f`; per-AC evidence on the issue (comment 5983643413). The new `every-commit` workflow lists a pull request's commits, calls `ci.yml`'s own `build-and-test` once per commit (a matrix), and an aggregate job `every-commit` names every commit that is not green. Live proof: throwaway PR #352, middle commit red, `every-commit` red naming only it. Plan: `docs/superpowers/plans/2026-10-04-ci-348-every-commit.md`.
- **AC4, Shyden's step:** make `every-commit` a required check on `develop` (the App's `administration` is read-only). The exact command is on #348 (comment 5983234899), to run in his own terminal. Then the agent reads the protection back (`gh api repos/shyden-labs/wordfarer/branches/develop/protection/required_status_checks`), records it on #348, closes #348 and moves its card to Done.
- **Operator rule, 2026-10-04 18:52 UTC: acting as Shyden needs his consent, reads included** (_"use the app. not me, you need my consent to act as me"_). A side agent found that `gh` calls naming no App repository or board ran on his login, silently. Measured this session: every write went as `wordfarer-agent[bot]`; five reads went as him. **Now enforced:** `~/.claude/scripts/github-app/gh_route.py` refuses such a call in any agent session unless Shyden creates `~/.claude/allow-operator-gh-once` himself (used up by one call), and `~/.claude/hooks/operator-consent-files.py` refuses an agent creating that file. Global CLAUDE.md and memory `feedback-gh-operator-fallback-needs-consent.md` record it. If a `gh` call is refused: name the repo (`-R shyden-labs/wordfarer`) or the board node id; read public docs with WebFetch.
- **#353 filed** (Todo, Estimate 2): a skipped pacing step makes `Upload the pacing report` fail too, a misleading second red step (`if-no-files-found: error`, #35 AC6). Measured on #352's C2.
- **Order (operator):** #348's AC4 (Shyden), then #157 (trademark desk search), then #331's list in order. #353 is small and can be taken whenever. The prestige design (#328, #329) waits behind that.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Wordfarer Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`. New issues are not auto-added. A read naming only a `PVTI_` item id is now refused by the router: include the board node id in the query.
- **Tooling** (git-ignored, `~/Developer/Repos/wordfarer-348/.superpowers/sdd/m1-348/`): the newest plan pipeline, `gen.py` (plan from stage commits, whole files), `check.py` (blocks, AC titles, mutation ids, paths, placeholders; proved by five planted errors), `tables.py` (mutation table from logs), `mutate.py` + `mutations.py`, `gate.sh` + `gate-stages.sh` (CI's steps per stage on a clean `npm ci`, in the `wordfarer-348-red` worktree).
- **Worktrees:** `wordfarer-348` (branch merged; keep for its tooling), `wordfarer-348-red` (detached; the stage gate's checkout), `wordfarer-348-ho` (this handover: remove once it merges), `wordfarer-35` (keep for #35's tooling).
- claude-mem's observer allowance was exhausted, so nothing went to claude-mem. The repo memory files are unaffected.
- The main checkout's `HANDOVER.md` carries an old uncommitted pointer from an earlier session; this file supersedes it. Leave the local edit for Shyden.

## Resume steps

1. `git fetch origin`; check `develop` includes #351 and this handover (`git log origin/develop --oneline -3`). Remove the `wordfarer-348-ho` worktree.
2. **#348 AC4:** read `develop`'s required checks. If `every-commit` is there, record it on #348 with the read-back, close #348 (use `gh issue close 348 -c "..."`, no closing keyword in a commit), move its card to Done (Status option `98236657`). If not, ask Shyden; never write branch protection with his login.
3. Then **#157**: the desk search (UK IPO, EUIPO, USPTO), recorded in `docs/compliance/trademark-search.md`, with a recommendation; the operator decides.
4. Then **#331's list in order** (or #353 if a small story fits). Each story: its own branch, one commit per task, every stage gated alone before the plan, red runs, mutations with predictions written first, the plan generated from the stage commits and reviewed to zero. `every-commit` now checks every commit of each PR on CI too.
5. At close-out, run board-progress and state both estimates.
