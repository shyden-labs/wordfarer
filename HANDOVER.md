# Handover: Yawelo Idle

**Written:** 2026-10-06 02:22 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. The session names itself "Yawelo Idle" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 02:21 UTC:

- **By tickets: 18% complete** (53 of 299 in-scope stories closed). Measured pace 8.83 a day over 6 days (10, 14, 8, 2, 15, 4). ETA at that pace 2026-11-03. **ETA to release-ready: 2026-12-19 to 2027-01-26** (low to medium confidence: 246 open plus about 30 unfiled stories at an assumed 4–6 a working day, plus 1.5–2.5 weeks of outside waits).
- **By effort: 19% complete** (269 of 1,411 points closed). Measured pace 44.83 points a day over 6 days (64, 53, 43, 16, 77, 16). ETA at that pace 2026-11-01. **ETA to release-ready: 2026-12-14 to 2027-01-23** (low to medium confidence: 1,142 open plus 130–180 unfiled prestige points at an assumed 20–30 a working day, plus the same waits).
- **Website first release (epic #331, 24 stories, 101 points, 100 open): live on production 2026-10-13 to 2026-10-20** (low to medium confidence: 100 points at an assumed 20–30 a working day, because feature work runs slower than the guard work behind the measured pace, plus Shyden's steps listed below).
- **Measured:** the counts and paces. **Assumed:** the slower future rates, the unfiled prestige work (#328, #329) and the outside waits. The total rose by 7 stories and 25 points: this session filed #420–#426.

## What this session did (2026-10-06 01:38 to 02:22 UTC)

- **The website comes first, re-planned** (operator, 01:38: _"prioritise getting the links for dev and prod showing something to users ... don't forget the instant-update roadmap ... focus on this first"_). His decisions at 01:46–01:49 are recorded as website spec **W12–W16**:
  - **W12:** a site-only production path now: #424 security review, #425 prod infrastructure, #426 prod pipeline with his approval. These are split out of #245, #252 and #253, and #423 (the site privacy notice) out of #246. All four return to their milestones. The 2026-10-04 "pull the chains" is superseded, except #101, #102, #110, #123, #125 and #126, which the site needs.
  - **W13:** the first release holds the hype home page, the live roadmap, the launch list, Indonesian and a trailer. The playable demo (#336) and the voyage map (#337) come later.
  - **W14:** the trailer (#421) is code-made scenes rendered to a self-hosted MP4/WebM; real gameplay replaces it later (#422).
  - **W15:** dev keeps its password gate.
  - **W16:** every finished player-facing feature gets a `Website: announce <feature>` story (#420).
- **#420 merged and deployed** (PR #427, `a99f8f2`, deploy-dev run 37403180443 green, dev-verified posted). It added the CLAUDE.md rule "Website follows the game", the story form `.github/ISSUE_TEMPLATE/story.yml` with a required Website field (live once develop reaches `main`), and the spec amendment with R1 answered (SQLite Durable Objects and Cron run on Free; "Requests to static assets are free and unlimited") and R3 answered from #395. Review passes 11–12.
- **Board:** #420–#426 filed with Estimates. Amendments added to #332 (it no longer waits for #123, and uses the post-#395 hosts), #334, #335, #338, #339 (its own manifest, no longer #152), #344, #345, #336, #337, #245, #246, #252 and #253. Epic #331's body lists the first release in working order.
- **#343:** Shyden picked **Buttondown** (02:14). The comparison and his steps are on #343. The full comparison file is `.superpowers/sdd/343/comparison.md`. Its `[search]` items are summaries, not fetched pages.
- **Dev password:** the gate takes any username and the password from the GitHub `dev` environment secret `DEV_BASIC_AUTH_PASSWORD`. That secret reaches the Worker only on a deploy-dev run; the latest ran at 02:15 UTC (`a99f8f2`). Today dev still shows only the wordmark, at `https://yawelo-idle-web-dev.shyden-labs-dev.workers.dev/`. After #332 the front door becomes the site Worker's own workers.dev address.

## Waiting on Shyden

1. **#343:** create the Buttondown newsletter "Yawelo Idle" and a second free account "Yawelo Idle (dev)", check that double opt-in is on and tracking is off, create no keys yet, and reply on #343 with the two usernames.
2. Later in the order: the copy approval (#334), the wordmark pick (#333), the roadmap App and two org webhooks (#341), the prod Cloudflare token and the `prod` GitHub environment (#425, #426), the ICO self-assessment (#423) and the visual sign-off (#345).

## State

- **No PR of this session is open.** Dependabot #23 and #24 are still BEHIND develop.
- **Next: #332** (8 pts), the `apps/site` scaffold. Research is in `.superpowers/sdd/332/notes.md`: versions measured, current Worker and config read, and six design ideas to check in the plan (none decided). It needs a plan reviewed to zero before code.
- **M1 cleanup waits behind the website** (#370, #373, #374, #375, #417, #411 → #416, #412–#415).
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`. A re-runnable filer is at `.superpowers/sdd/331/file.py`.
- **Machine:** test runs share a lock with other sessions (`test-lock: … waits`); a queued run is not a broken one.

## Resume steps

1. Read this file, epic #331's body, and `git log origin/develop --oneline -8`.
2. Check #343 for Shyden's reply; when it is there, read it back and close #343 (AC1 and AC2 are done in its comment).
3. #332: branch from `develop` (`website/332-site-scaffold`). Read `.superpowers/sdd/332/notes.md` and #332 with its 2026-10-06 amendment. Write the plan in `.superpowers/sdd/332/plan.md`, review it to zero by executing its code blocks, then build TDD. A new file moves the walk floors (`npm run floors:record`, each delta read against the diff).
4. Then #340 → #341 → #342, so dev shows the live roadmap early. Put #341's operator steps (App plus two org webhooks) in the issue before starting, and ask Shyden at the start of the story, because they are an outside wait.
5. Any new test must not write a literal minimum of two or more: `literal-floors.test.ts` refuses it. Record a floor with `floorBreach` instead.
6. At close-out, run `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` and state both estimates. Check every story closed this session against CLAUDE.md's "Website follows the game" rule (#420): each player-facing one has its `Website: announce <feature>` story filed, or says why there is nothing to show. Settle the whole handover before the first push, as one commit.
