# Handover: Yawelo Idle

**Written:** 2026-10-07 05:03 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 05:02 UTC:

- **By tickets: 20% complete** (60 of 306 in-scope stories closed). Measured pace: 8.57 a day over 7 days (10, 14, 8, 2, 15, 10, 1). ETA at that pace: 2026-11-05. **ETA to release-ready: 2026-12-19 to 2027-01-27** (low to medium confidence). That assumes 246 open stories plus about 30 unfiled, at 4–6 a working day, plus 1.5–2.5 weeks of outside waits.
- **By effort: 21% complete** (299 of 1,441 points closed). Measured pace: 42.71 points a day over 7 days (64, 53, 43, 16, 77, 41, 5). ETA at that pace: 2026-11-03. **ETA to release-ready: 2026-12-17 to 2027-01-24** (low to medium confidence). That assumes 1,142 open points plus 130–180 unfiled prestige points, at 20–30 a working day, plus the same waits.
- **Website first release (epic #331): live on production 2026-10-13 to 2026-10-20** (low to medium confidence, unchanged).
- **Measured:** the counts and paces. **Assumed:** the slower future rates, the unfiled prestige work (#328, #329) and the outside waits.

## What this session did (2026-10-07 04:20 to 05:03 UTC)

- **#123 is closed.** The dev smoke was red for two reasons, and both are fixed:
  - **PR #453 (WebKit).** The dev smoke's `httpCredentials` lost `origin`. On HTTPS's default port, WebKit refuses a password scoped to an origin. M30d and M30e went red as predicted.
  - **PR #454 (#451, the beacon).** Shyden decided at 01:11 UTC to keep analytics, so the game's CSP now admits Cloudflare Web Analytics' beacon.
  - **Evidence:** deploy-dev run 37573623116 on `879585b` succeeded in all five jobs, including `smoke` (12 of 12, all three engines) and `dev-verified`.
- **#451's policy.** The only new source is `script-src 'self' https://static.cloudflareinsights.com/beacon.min.js/`.
  - The trailing `/` is needed: a path without it refuses the versioned URL Cloudflare injects. A probe measured this in 3 engines (`.superpowers/sdd/451/csp-path.out`).
  - There is no `connect-src`: under automatic setup the beacon reports to the site's own `/cdn-cgi/rum`, according to Cloudflare's FAQ. I narrowed AC1 on that evidence, with a comment on #451.
  - The smoke serves a stub beacon at a versioned path and requires it to run. It also plants a foreign script and a script on the beacon's host outside its path, and both must be refused. M1–M4 all went red as predicted.
  - The copy line approved at 01:19 and the W17 row are in, along with the amended spec lines.
  - ACs were added on #423 (disclosure) and #425/#426 (automatic setup, beacon-clean production smoke).
- **#451 AC7 (ICO PECR) was decided by Shyden at 04:48 UTC: "No opt-out: read it as not covered."** The ICO's reading and quotes are on #451. Don't re-ask, and don't file an opt-out story.
- **Shyden asked that the beacon never stop silently.** Two things came of it:
  - **#455** (8 points): the smoke requires the real beacon; a daily check, including Cloudflare's own visit count above zero; and an issue assigned to Shyden on failure.
  - **A new global rule**, "Nothing we rely on stops silently", in `~/.claude/CLAUDE.md`, by Shyden's choice ("Every project").

## Waiting on Shyden

1. **#451 AC3:** confirm with a comment on #451 that Workers & Pages > `yawelo-idle-dev-hosts` > Web Analytics is enabled with **automatic** setup. #451 stays open only for this.
2. **#341 AC8 steps a–d** (create `yawelo-idle-roadmap`, generate its key, install it on `yawelo-idle` only, add `ROADMAP_WEBHOOK_SECRET` and `ROADMAP_APP_KEY` to the `dev` environment), then **comment the App ID on #341**. Nothing had arrived by 05:02 UTC. PR #438 must not merge before it.
3. **#341 AC8 step e** (the dev org webhook), after #438 deploys.
4. **#343:** the two Buttondown accounts. No reply as of 05:02 UTC.
5. Later: the #333 wordmark pick, the #425/#426 prod token and environment, #345 visual sign-off, and #455's read-only Cloudflare Analytics token.

## State

- `develop` is at `879585b`. Open PRs: #438 (#341, head `f2e0d97`) and this handover's. Dependabot #23 and #24 are still behind develop.
- **Worktrees:**
  - `../yawelo-idle-341` holds #438's branch with `node_modules`; `../yawelo-idle-341-gate` is #341's gate scratch.
  - `../yawelo-idle-451` holds #451's merged branch and can be removed with `git worktree remove ../yawelo-idle-451`.
  - The merged local branch `m3/123-dev-smoke-webkit` can go too.
- **Tooling, git-ignored, in this checkout:**
  - `.superpowers/sdd/451/`: the probe, predictions, `mut.py`, the logs and the issue comments.
  - `.superpowers/sdd/123/`: `mut_t8.py`, the mutation records and the WebKit auth probes.
  - `.superpowers/sdd/101/plan.md`: #101's plan, with review pass 1 logged.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories".
  - Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc` (Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`); Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.
  - A new issue may not be auto-added: add it with `addProjectV2ItemById` naming the board.
  - Read an item back through `repository{issue{projectItems}}`; a bare `PVTI_` read is refused by the router.
- **Dev:** `https://dev.yawelo-idle.shyden.co.uk/`. The password is the `dev` environment secret `DEV_BASIC_AUTH_PASSWORD`; any username works.
- **The default branch is still `main`.** The global standing task (switch to `develop`, guard scheduled workflows, CI check, move Dependabot security PRs) has not been started here. #455's daily schedule depends on it.

## Resume steps

1. Read this file. Then run `git log origin/develop --oneline -3` and `gh issue list -R shyden-labs/yawelo-idle --state open --limit 30`, and check #451 (AC3), #341 and #343 for replies. If AC3 is confirmed, close #451 with the evidence from its status comment.
2. **If #341 has the App ID**, follow #341's steps (they were in this file before 2026-10-07; read them with `git show 879585b:HANDOVER.md`, "Resume steps" item 2): set `ROADMAP_APP_ID`, rebase `../yawelo-idle-341` on develop, re-record the floors, gate, merge on green and Shyden's a–d, then step e and the read-backs.
3. **Otherwise, #101 is next** in the chain #123 (done) → #101 → #102 → #110 → #125 → #126, which #333 and then #335 wait on.
   - Its plan is `.superpowers/sdd/101/plan.md`. Continue the review loop to zero findings, executing the plan's code as the global rule requires, then do T1–T3.
   - Also file the projection story the plan names (pack → core `CourseData`).
4. **Global standing task, new this session ("Nothing we rely on stops silently"):** before other test work, list this repo's silent-failure points from code and config (every schedule, outbound email, webhook, third-party script, backup and feed). Analytics is #455. File one story per other point.
5. At close-out, run `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` and state both estimates. Check closed stories against CLAUDE.md's "Website follows the game" rule. Settle the whole handover before the first push, as one commit.
