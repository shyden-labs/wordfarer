# Handover: Yawelo Idle

**Written:** 2026-10-06 17:22 UTC; updated 18:31 UTC for #443 and #444.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 18:30 UTC:

- **By tickets: 19% complete** (59 of 303 in-scope stories closed). Measured pace: 9.83 a day over 6 days (10, 14, 8, 2, 15, 10). ETA at that pace: 2026-10-31. **ETA to release-ready: 2026-12-19 to 2027-01-26** (low to medium confidence): 244 open stories plus about 30 unfiled, at an assumed 4–6 a working day, plus 1.5–2.5 weeks of outside waits.
- **By effort: 21% complete** (294 of 1,425 points closed). Measured pace: 49.00 points a day over 6 days (64, 53, 43, 16, 77, 41). ETA at that pace: 2026-10-30. **ETA to release-ready: 2026-12-14 to 2027-01-23** (low to medium confidence): 1,131 open points plus 130–180 unfiled prestige points, at an assumed 20–30 a working day, plus the same waits.
- **Website first release (epic #331): live on production 2026-10-13 to 2026-10-20** (low to medium confidence, unchanged).
- **Measured:** the counts and paces. **Assumed:** the slower future rates, the unfiled prestige work (#328, #329) and the outside waits.

## What this session did (2026-10-06 15:08 to 18:31 UTC)

- **#443 is done: the site stays in sync with the game.** Shyden: _"make sure everything stays in sync"_. Decision: **digits update by themselves, words go red.** `apps/site/src/figures.ts` reads the copy's nine game figures from `BALANCE`/`RANKS`. `tests/unit/site-copy.test.ts` now also refuses a worded figure with no words for the current value, and any other figure or name that is not in the text of a cited source. 14 mutations, all as predicted: a queue of 12 just reads "12 reviews"; a floor of 0.75 goes red, naming the line, the key and what to do. PR #446, merged as `b671683`, deployed and verified. #101 commented, #338 amended (shared bindings).
- **#444 is done (P0, found while starting #443):** sharp 0.35.4 carried GHSA-wq5f-xc86-pv6w. The root `overrides` lifts it to 0.35.5, and `npm audit` reports 0. PR #445, merged as `c4e6bb9`, deployed and verified.

- **#334 is done and closed.** `apps/site/src/copy-en.ts` holds the approved English. Every line is `line(text, ...sources)` (`apps/site/src/copy-line.ts`). `tests/unit/site-copy.test.ts` refuses an unsourced or blank line and any source that names nothing real, with floors `site-copy/leaves` 103 and `site-copy/sources` 139. 13 mutations ran, all as predicted. PR #441, merged as `d6af97b`. deploy-dev run 37501993352: test, deploy and verify all green.
- **Shyden approved the copy section by section** (16:55–17:02 UTC; recorded on #334). Tagline A: _"An idle adventure through a real language."_ **The site names no platform** (Shyden: _"don't mention about platforms. just mention that it'll be playable in browser"_). Section 10 is "Play in your browser": _"Yawelo Idle will be free to play in your browser, with an optional supporter pack that is cosmetic only, never progress."_ W9 and §3 item 9 of the website spec are amended. **Never name Steam, iOS, Android or the stores on the site** (#338 translation and #421 trailer captions included).
- `apps/site/src/copy.ts` (the scaffold) now reads its approved English from `COPY_EN`, so each wording has one home.
- Tidied: #339's title no longer uses the old name; epic #331 ticks #429, #340 and #334.

## Waiting on Shyden

1. **#341 AC8 steps a–d** (create `yawelo-idle-roadmap`, generate its key, install it on `yawelo-idle` only, add `ROADMAP_WEBHOOK_SECRET` and `ROADMAP_APP_KEY` to the `dev` environment), then **comment the App ID on #341**. None of this had arrived by 18:31 UTC. PR #438 must not merge before it.
2. **#341 AC8 step e** (the dev org webhook), after #438 deploys.
3. **#343:** the two Buttondown accounts. No reply as of 18:31 UTC.
4. Later: #333 wordmark pick, #425/#426 prod token and environment, #423 ICO, #345 visual sign-off.

## State

- `develop` is at `b671683`. Open PRs: #438 (#341, head `f2e0d97`) and this handover's. Dependabot #23 and #24 are still BEHIND develop.
- **Worktree `../yawelo-idle-341`** holds #438's branch with `node_modules`. `../yawelo-idle-341-gate` is the scratch worktree for #341's gate.
- **Tooling, git-ignored, in this checkout:** `.superpowers/sdd/341/` (plan, `mutations.py`, `gate.sh`, the R6 probe in `r6/`, the PR body); `.superpowers/sdd/334/`, `443/` and `444/` (`gate.sh` for this checkout, `muts.py`, the logs).
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc` (Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`); Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`. Read an item back through `repository{issue{projectItems}}`; a bare `PVTI_` read is refused by the router.
- **Dev:** `https://dev.yawelo-idle.shyden.co.uk/`. The password is the `dev` environment secret `DEV_BASIC_AUTH_PASSWORD`; any username works.

## Resume steps

1. Read this file. Then run `git log origin/develop --oneline -3`, `gh issue list -R shyden-labs/yawelo-idle --state open --limit 30`, and check #341 and #343 for replies.
2. **If #341 has the App ID**, go to `../yawelo-idle-341` and:
   - add `"ROADMAP_APP_ID": "<id>"` to `vars` in `apps/site/wrangler.jsonc` and to the `toMatchObject` in `tests/unit/dev-config.test.ts`;
   - run `npm run types` in `apps/site`, then remove `ROADMAP_APP_ID` from `RoadmapEnv` in `apps/site/worker/roadmap.ts`;
   - rebase on `develop` (#334, #443 and #444 touched `apps/site`, `package.json`, `package-lock.json` and the floors files). Resolve a floors-file conflict by taking develop's file and re-recording, and a lockfile conflict by taking develop's and running `npm install`. Then run `npm run floors:record` (expect `dev-config/declared-vars` +1 beside #341's own), commit, gate with `.superpowers/sdd/341/gate.sh`, push and wait with `~/.claude/scripts/wait-run.sh`;
   - merge only when CI is green on the head SHA **and** Shyden has confirmed steps a–d. Then ask him for step e, do the read-backs (health `version` ≥ 1, no `readError`, `lastEventAt` moves after a Status change), run the R6 browser probe against dev, close #341 and move to #342.
3. **Otherwise, the next unblocked story in #331's order is #123** (Svelte 5 UI package, Vite shell, Worker static-assets build, 5 points). It starts the chain #123 → #101 → #102 → #110 → #125 → #126 that #333 (fonts and wordmark) and then #335 (home page from the approved copy) wait on. Read its ACs and its `Depends on` before starting.
4. At close-out, run `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` and state both estimates. Check closed stories against CLAUDE.md's "Website follows the game" rule. Settle the whole handover before the first push, as one commit.
