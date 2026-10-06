# Handover: Yawelo Idle

**Written:** 2026-10-06 03:59 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. The session names itself "Yawelo Idle" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 03:58 UTC:

- **By tickets: 18% complete** (54 of 300 in-scope stories closed). Measured pace 9.00 a day over 6 days (10, 14, 8, 2, 15, 5). ETA at that pace 2026-11-03. **ETA to release-ready: 2026-12-19 to 2027-01-26** (low to medium confidence: 246 open plus about 30 unfiled stories at an assumed 4–6 a working day, plus 1.5–2.5 weeks of outside waits).
- **By effort: 20% complete** (277 of 1,416 points closed). Measured pace 46.17 points a day over 6 days (64, 53, 43, 16, 77, 24). ETA at that pace 2026-10-31. **ETA to release-ready: 2026-12-14 to 2027-01-23** (low to medium confidence: 1,139 open plus 130–180 unfiled prestige points at an assumed 20–30 a working day, plus the same waits).
- **Website first release (epic #331, now 25 stories, 106 points; #420 and #332 closed, 97 open): live on production 2026-10-13 to 2026-10-20** (low to medium confidence: 97 points at an assumed 20–30 a working day, plus Shyden's steps below).
- **Measured:** the counts and paces. **Assumed:** the slower future rates, the unfiled prestige work (#328, #329) and the outside waits. The total rose by 1 story and 5 points: #429.

## What this session did (2026-10-06 02:27 to 03:59 UTC)

- **#332 done** (PR #430, merge `0fc2c84`). The site Worker `yawelo-idle-site-dev` is dev's front door: placeholder pages in en and id, the dev gate on every path but `/hooks/github`, and the game behind it at `/play/` through the `GAME` service binding. The game Worker has `workers_dev: false` and no route. Deploy-dev run 37410734649 is green on every step, and its verify logged _"keeps the game behind the site"_. Outside probe: the site and `/play/` answer 401, and the game's old address answers 404. #332 is closed with an AC table and set to Done (read back).
  - Built from three stage commits, each gated alone on a clean `npm ci` (nine steps each), red against stubs first, 9 mutations predicted and run. The plan, reviewed to zero in four passes, is in `.superpowers/sdd/332/plan.md`.
  - Measured: local workerd serves static assets for the PRIMARY Worker only (the second Worker's assets answer 500 in `createTestHarness` and in `wrangler dev -c a -c b`). So the site's harness points `GAME` at an echo Worker (`bindingOverrides`), and the two together are proven only on dev.
  - #152 got a comment: its manifest must declare scope and `start_url` `/play/`.
- **Dev address, decided by Shyden** (03:07–03:34 UTC): dev must answer at `dev.yawelo-idle.shyden.co.uk`, like every Shyden product, with dev and prod in separate Cloudflare accounts and no new domain. Filed **#429** (5 pts): a Pages "hostname adapter" project in the dev account carries `dev.yawelo-idle` and `dev-api.yawelo-idle.shyden.co.uk` as custom domains, and forwards by host to the site and sync Workers through service bindings. Research is in `.superpowers/sdd/429/notes.md`. Epic #331's order now reads #332 → #429 → #340.
  - **#429 operator step 2 is done**: the dev deploy token "yawelo-idle dev deploy (Workers + D1)" is an **Account** API token on the dev account (not under My Profile). It now holds D1 Write, Pages Write and Workers Scripts Write, read back from the token page (comment on #429).
- Shyden: steadyhand and ShyFerry are not Shyden products (ShyFerry is deprecated). Browser work goes through his own Chrome (claude-in-chrome), never a separate Playwright window. Both are in memory.

## Waiting on Shyden

1. **#343:** create the Buttondown newsletter "Yawelo Idle" and a second free account "Yawelo Idle (dev)", check that double opt-in is on and tracking is off, create no keys yet, and reply on #343 with the two usernames.
2. **#429 steps 1 and 3, only when the next session asks** (after the Pages project exists): two proxied CNAMEs in the `shyden.co.uk` zone, `dev.yawelo-idle` and `dev-api.yawelo-idle` → `yawelo-idle-dev-hosts.pages.dev`, plus a validation TXT if Cloudflare asks for one.
3. Later in the order: the copy approval (#334), the wordmark pick (#333), the roadmap App and two org webhooks (#341), the prod Cloudflare token and the `prod` GitHub environment (#425, #426), the ICO self-assessment (#423) and the visual sign-off (#345).

## State

- **No PR of this session is open** except this handover's. Dependabot #23 and #24 are still BEHIND develop.
- **Dev today:** `https://yawelo-idle-site-dev.shyden-labs-dev.workers.dev/` (password = the GitHub `dev` environment secret `DEV_BASIC_AUTH_PASSWORD`, any username). `dev.yawelo-idle.shyden.co.uk` has no DNS until #429.
- **Next: #429.** Then #340 → #341 → #342, so dev shows the live roadmap early.
- **M1 cleanup waits behind the website** (#370, #373, #374, #375, #417, #411 → #416, #412–#415).
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`. Re-runnable filers are in `.superpowers/sdd/331/file.py` and `.superpowers/sdd/devhost/file.py`.
- **Tooling from #332, reusable:** `.superpowers/sdd/332/` holds `gate.sh` (gate a commit alone, as CI does), `red.py` (run tests against stub files, restore byte for byte), `mutations.py`, `stages.py`, `gen.py` and `verify_blocks.py` (plan blocks generated from stage commits and checked against them).
- **Machine:** test runs share a lock with other sessions (`test-lock: … waits`); a queued run is not a broken one.

## Resume steps

1. Read this file, #429 with its comments, `.superpowers/sdd/429/notes.md`, and `git log origin/develop --oneline -6`.
2. Check #343 for Shyden's reply; when it is there, read it back and close #343 (AC1 and AC2 are done in its comment).
3. #429: branch from `develop` (`website/429-dev-hostnames`). **Prove the route first, before building it:** deploy a throwaway Pages project in the dev account with one Function forwarding to `yawelo-idle-site-dev`, add `dev.yawelo-idle.shyden.co.uk` as its custom domain by API (`POST /accounts/{id}/pages/projects/{name}/domains`, Pages Write now on the token), and read `validation_data.method`. Then ask Shyden for the two proxied CNAMEs (step 1), and the TXT if validation says `txt`. Measure one HTTPS request through it. If it fails, stop and report with the evidence before any further work.
4. Then write the plan in `.superpowers/sdd/429/plan.md` and review it to zero by running its stages (`gate.sh`, `red.py`, mutations) as #332 did, then build TDD. A new file moves the walk floors (`npm run floors:record`, each delta read against the diff). In any test that has both, exact checks go BEFORE floors (memory `feedback-exact-checks-before-floors`).
5. Any new test must not write a literal minimum of two or more (`literal-floors.test.ts`), and must not assert absence with a negated `toContain` (`floorless-searches.test.ts`). Assert the exact value instead.
6. At close-out, run `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` and state both estimates. Check every story closed this session against CLAUDE.md's "Website follows the game" rule. Settle the whole handover before the first push, as one commit.
