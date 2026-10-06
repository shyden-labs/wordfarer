# Handover: Yawelo Idle

**Written:** 2026-10-06 10:16 UTC.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. The session names itself "Yawelo Idle" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 10:14 UTC:

- **By tickets: 18% complete** (55 of 301 in-scope stories closed). Measured pace 9.17 a day over 6 days (10, 14, 8, 2, 15, 6). ETA at that pace 2026-11-02. **ETA to release-ready: 2026-12-19 to 2027-01-26** (low to medium confidence: 246 open plus about 30 unfiled stories at an assumed 4–6 a working day, plus 1.5–2.5 weeks of outside waits).
- **By effort: 20% complete** (282 of 1,419 points closed). Measured pace 47.00 points a day over 6 days (64, 53, 43, 16, 77, 29). ETA at that pace 2026-10-31. **ETA to release-ready: 2026-12-14 to 2027-01-23** (low to medium confidence: 1,137 open plus 130–180 unfiled prestige points at an assumed 20–30 a working day, plus the same waits).
- **Website first release (epic #331): live on production 2026-10-13 to 2026-10-20** (low to medium confidence, unchanged).
- **Measured:** the counts and paces. **Assumed:** the slower future rates, the unfiled prestige work (#328, #329) and the outside waits. The ranges are unchanged from the last handover: one 5-point story closed and nothing was filed.

## What this session did (2026-10-06 05:50 to 10:16 UTC)

- **#429 is done and closed.** Dev now lives at **`https://dev.yawelo-idle.shyden.co.uk`** (site, behind the dev password) and **`https://dev-api.yawelo-idle.shyden.co.uk`** (sync API). Full evidence is in #429's last comment.
  - **How it works.** A Pages project `yawelo-idle-dev-hosts` in the dev account runs `apps/dev-hosts`. Its one Function forwards each request through a service binding chosen by host: `SITE` → `yawelo-idle-site-dev`, `SYNC` → `yawelo-idle-sync-dev`. Every other host gets `404`.
  - **The names.** Proxied CNAMEs in the production `shyden.co.uk` zone point at that project. Shyden added them in the dashboard, and they were read back.
  - **Deploying it.** `deploy-dev.yml` deploys the adapter after both Workers with `wrangler pages deploy --branch main`. The project's production branch is `main`; without the flag the deploy is a preview, which the custom domains do not serve. verify-dev now checks the new names.
  - **Shipped** as PR #433, two stage commits each gated alone, with 15 mutations all as predicted. Merged as `e4d4da3`. deploy-dev run 37447634291 was green on every step and posted `dev-verified`.
  - **Measured after the deploy.** `/` and `/play/` answer 401 with no markup. `/health` reports the merge commit. Both `pages.dev` addresses answer 404.
  - **The workers.dev addresses still work** as a second way in, behind the same gate (plan decision 3).
- **shyden.co.uk email records (a side fix, with Shyden's approval at each step):** the production zone had duplicate SPF records (SPF permerror) and duplicate DMARC records (ignored under RFC 7489). Both are merged to one record each and read back on both authoritative nameservers. The merged SPF uses 6 of its 10 lookups. One hardening note remains, about the `+a` mechanism in that SPF record; it belongs to shyden.co.uk's own board, so it is Shyden's call whether to file it.
- **Before pushing this handover, the local unit suite found two things, neither in the change:**
  - **A stale install.** This checkout's `node_modules` predated `apps/dev-hosts`, so `npm query .workspace` listed 6 workspaces and the supply-chain test failed. After `npm ci` it lists 7 and passes. Run `npm ci` after pulling a `develop` that adds a workspace.
  - **A timeout under load.** `old-name.test.ts`'s walk took 5.36 s in the suite at load average about 30 (1.7 s alone). Evidence added to #432, the open story for this class; its timeout was not raised and the suite was not re-run.
- Deleted the superseded, never-pushed branch `handover/2026-10-06e` (`1fdc711`), which this file replaces. Removed the gate scratch worktree `../yawelo-idle-429-gate`.

## Waiting on Shyden

1. **#343:** create the Buttondown newsletter "Yawelo Idle" and a second free account "Yawelo Idle (dev)". Check that double opt-in is on and tracking is off, create no keys yet, and reply on #343 with the two usernames. No reply as of 10:00 UTC.
2. Later in the order:
   - the copy approval (#334);
   - the wordmark pick (#333);
   - the roadmap App and two org webhooks (#341);
   - the prod Cloudflare token and the `prod` GitHub environment (#425, #426);
   - the ICO self-assessment (#423);
   - the visual sign-off (#345).

## State

- `develop` is at `e4d4da3`. This handover goes in as its own one-commit PR. No other PR of this session is open. Dependabot #23 and #24 are still BEHIND develop.
- **Dev:** `https://dev.yawelo-idle.shyden.co.uk/`. The password is the GitHub `dev` environment secret `DEV_BASIC_AUTH_PASSWORD`, with any username.
- **Next: #340 → #341 → #342.**
- **M1 cleanup waits behind the website:** #370, #373, #374, #375, #417, #411 → #416, #412–#415, #432.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories".
  - Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`.
  - Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.
  - Closing an issue sets Done by itself (seen on #429).
- **Tooling from #429, reusable:** `.superpowers/sdd/429/build/` (git-ignored, in this checkout) holds:
  - `plan.md` with its six-pass review log;
  - `gate.sh`, which gates one commit alone in a fresh worktree with the full CI step list;
  - `mutations.py` and the mutation logs.
- **Worktree `../yawelo-idle-429`** (branch merged) can be removed with `git worktree remove ../yawelo-idle-429` once nothing else is wanted from it. Its tooling is copied above.
- **Machine:** test runs share a lock with other sessions (`test-lock: … waits`); a queued run is not a broken one.

## Resume steps

1. Read this file, then run `git log origin/develop --oneline -5` and `gh issue list -R shyden-labs/yawelo-idle --state open --limit 30`.
2. Check #343 for Shyden's reply. When it is there, read it back and close #343: AC1 and AC2 are done in its comment.
3. Start #340: read it in full, branch from `develop`, write `.superpowers/sdd/340/plan.md`, and review it to zero by running its stages. Reuse `.superpowers/sdd/429/build/gate.sh` and `mutations.py` with the ticket's paths changed. Build TDD.
   - A new file moves the walk floors (`npm run floors:record`); read each delta against the diff.
   - Exact checks go before floors.
   - Every order check anchors its `findIndex` with `toBeGreaterThanOrEqual(0)` first: #429's review found one without the anchor.
4. At close-out:
   - Run `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` and state both estimates.
   - Check every story closed in the session against CLAUDE.md's "Website follows the game" rule.
   - Settle the whole handover before the first push, as one commit.
