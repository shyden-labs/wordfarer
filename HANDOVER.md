# Handover: Yawelo Idle

**Written:** 2026-10-07 08:04 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 07:54 UTC:

- **By tickets: 20% complete** (61 of 312 in-scope stories closed).
  - Measured pace: 8.71 a day over 7 days (10, 14, 8, 2, 15, 10, 2). At that pace: 2026-11-05.
  - **ETA to release-ready: 2026-12-19 to 2027-01-27** (low to medium confidence).
- **By effort: 21% complete** (302 of 1,470 points closed).
  - Measured pace: 43.14 points a day. At that pace: 2026-11-04.
  - **ETA to release-ready: 2026-12-17 to 2027-01-24** (low to medium confidence).
- **Measured:** the counts and paces. **Assumed:**
  - 4–6 stories (20–30 points) a working day;
  - about 30 unfiled stories (130–180 prestige points, #328, #329);
  - 1.5–2.5 weeks of outside waits.
- Today's audits added 6 stories (32 points), and #460 is already closed.

## What this session did (2026-10-07 05:20 to 08:04 UTC)

### #460 is closed: `develop` is the default branch

- **Shyden switched the default branch** at 05:28. Read back as `develop`.
- **Dependabot then closed PR #23 (vitest 5) by itself, within a second.** Proof that it was reading `main`'s stale config.
- **PR #461** added CI's first step, "The default branch is develop", plus a guard on scheduled workflows.
- **PR #463** turned that guard into an exact allow-list, on a side agent's note (Shyden: "do what the agent says"):
  - a scheduled job may name `dev` or no environment;
  - `live`, `release` and `cloudflare-prod` are planted and refused;
  - the lesson is in the global guard-forms file.
- Both PRs are deployed and dev-verified (develop `57942ab`).

### The "nothing stops silently" audit is done

- Recorded on #455, with a story per point:
  - **#457** roadmap feed (5 points);
  - **#458** Dependabot jobs (3 points);
  - **#459** launch-list sign-ups (5 points).
- Production uptime is covered by #455 AC2. Dev D1 holds no player data.

### #462 filed: the pack → core `CourseData` projection (8 points)

- #121 now depends on it.

### #464 filed: licence compatibility for every package (5 points)

- Shyden's rule, chosen as "Two tiers":
  - shipped packages must be permissive;
  - build and test tools may also be LGPL or MPL;
  - GPL, AGPL, unknown or missing licences go red.
- It also retires the hand-written `SHIPPED_WORKSPACES` (a side agent's note): the shipped set comes from npm's `dev` flag in the lockfile.
- Measured: 747 packages. The 166 shipped ones are all MIT or Apache-2.0, so the repo is green today.
- The rule is also in the global shared-library scope.

### #101 is in progress, PR #465 open (CI running at 08:03)

- **Head:** `f857a089de152b1013e8d81114edbc31b5ae53a8` on `m2/101-content-schema-b`.
- **Runs:** build-and-test 37591251991, every-commit 37591252493.
- **The plan** was reviewed in 8 passes to zero findings (`.superpowers/sdd/101/plan.md` in this checkout). Its decisions are posted on #101.
- **T1:** core `CEFR_LEVELS`.
- **T2:** `packages/content` with `loadCourse`, 30 tests, 12 mutations as predicted.
- **T3:** a drift test checked by typecheck.
- **Verified:** the whole suite is green at the head (90 files, 5,472 tests).
- **The rebase:** the commits were rebuilt onto develop with every floor recomputed. Git had silently merged identical count edits on both sides; the lesson is in the global floor rules.

### Other evidence posted

- **#432:** a load stall timed out two repository-walk tests at 5 s (1.6–1.8 s alone).
- **New memories:** guards judge names exactly; `npm install -w` on a new workspace adds nothing; rebase floors by delta. The mutation-predictions memory was extended.

## Waiting on Shyden

1. **#451 AC3:** confirm with a comment on #451 that Workers & Pages > `yawelo-idle-dev-hosts` > Web Analytics is on, with **automatic** setup.
2. **#341 AC8 steps a–d**, then comment the App ID on #341. PR #438 must not merge before that.
3. **#341 AC8 step e**, after #438 deploys.
4. **#343:** the two Buttondown accounts.
5. **Later:** the #333 wordmark, the #425/#426 prod token and environment, #345 visual sign-off, and #455's read-only Cloudflare Analytics token.

## State

- **`develop`** is at `57942ab`. Default branch: `develop` (read back 05:28).
- **Open PRs:**
  - #465 (#101);
  - #438 (#341, head `f2e0d97`, behind develop);
  - Dependabot #24 (`@types/node`, targets develop).
- **Worktrees:**
  - `../yawelo-idle-101` holds #465's branch with `node_modules`. Its `.superpowers/sdd/101/` holds the T1–T3 predictions, `mut2.py`, `t3mut.py`, `resolve-floors.py` and `rebuild.py`.
  - `../yawelo-idle-341` and `-341-gate` are #438's.
  - `../yawelo-idle-451` is merged and can be removed (`git worktree remove ../yawelo-idle-451`).
- **Merged local branches that can go:** `ci/460-default-branch-develop`, `ci/460-schedule-allowlist`, `m3/123-dev-smoke-webkit`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories".
  - Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`.
  - Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.
  - Add new issues with `addProjectV2ItemById`, and read them back through `repository{issue{projectItems}}`.
- **Machine:** the test lock was contended all session (waits of up to 32 minutes behind shyden.co.uk and ShyTalk runs). Put whole-suite runs in `run_in_background`.

## Resume steps

1. **Check for running agents first.** Run `ListAgents`.
2. **Read #465's CI.** Run `~/.claude/scripts/wait-run.sh ~/Developer/Repos/yawelo-idle <run> <sha-file>` for runs 37591251991 and 37591252493. Write the head SHA above into a file; never type it.
   - Read every step by name.
   - **every-commit must pass for each of the 3 commits.** It is the check on the rebuilt floors of commits 1 and 2.
3. **If it is green, merge.** Confirm `headRefOid` equals that SHA, merge into develop, and wait for deploy-dev, including `dev-verified`.
   - Then close #101 with the evidence: ACs 1–6, the mutation counts and the deploy run.
   - Set #101 to Done.
   - Website rule: #101 has nothing to show players.
4. **If every-commit is red on commit 1 or 2,** a floor is off: compare the run's "read X, recorded Y" with `rebuild.py`'s printed values.
5. **Next ticket:** #102 (per-item licence guard) is next in M2 after #101; or #462 (projection) or #464 (licence check), whichever Shyden prefers. Read the board for priorities.
6. **At close-out,** run the progress script, state both estimates, check closed stories against "Website follows the game", and settle the handover as one commit.
