# Handover: Yawelo Idle

**Written:** 2026-10-06 13:41 UTC; updated 14:52 UTC for #438's fifth commit.
**Next session:** launch Claude from `~/Developer/Repos/yawelo-idle`. The session names itself "Yawelo Idle" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 13:40 UTC:

- **By tickets: 19% complete** (56 of 301 in-scope stories closed). Measured pace 9.33 a day over 6 days (10, 14, 8, 2, 15, 7). ETA at that pace 2026-11-02. **ETA to release-ready: 2026-12-19 to 2027-01-26** (low to medium confidence: 245 open plus about 30 unfiled stories at an assumed 4–6 a working day, plus 1.5–2.5 weeks of outside waits).
- **By effort: 20% complete** (285 of 1,419 points closed). Measured pace 47.50 points a day over 6 days (64, 53, 43, 16, 77, 32). ETA at that pace 2026-10-30. **ETA to release-ready: 2026-12-14 to 2027-01-23** (low to medium confidence: 1,134 open plus 130–180 unfiled prestige points at an assumed 20–30 a working day, plus the same waits).
- **Website first release (epic #331): live on production 2026-10-13 to 2026-10-20** (low to medium confidence, unchanged).
- **Measured:** the counts and paces. **Assumed:** the slower future rates, the unfiled prestige work (#328, #329) and the outside waits. Unchanged this session: #341 is built but stays open until its deploy and read-backs.

## What this session did (2026-10-06 11:55 to 13:41 UTC)

- **#341's names and operator steps.** Shyden chose `yawelo-idle-roadmap` for the roadmap App. #341's AC3 and AC8 were updated, and AC8 now carries exact click-paths. One change from the spec: secrets go in as GitHub `dev` environment secrets (#357's `--secrets-file` path), not `wrangler secret put`.
- **#341 is built: PR #438**, branch `website/341-roadmap-backend`, head `f2e0d97`, five commits, each gated alone (9 of 9 CI steps from a clean `npm ci`):
  1. `a570c03` `packages/progress`: one classifier; `parseItems(pages, repo)` refuses non-issues for the script, `roadmapItems(pages, repo)` drops them for the Worker; `assertBoard`; the script takes `[owner/repo]`.
  2. `cc49597` webhook verifier (`timingSafeEqual`, GitHub's test vector) and the App client (PKCS#1 key, exact read-only rights), tested in workerd against a fake `api.github.com` (`apps/site/test/github-fake/`), plus the `webhook-compare` guard.
  3. `9a95eaa` the `Roadmap` Durable Object, `/hooks/github`, `/api/roadmap.json|health|live`, the cron.
  4. `34d4b16` the secrets file carries three secrets, `verify-dev` judges the roadmap's health, **drift stays until fixed** (Shyden's decision: no expiry; only a webhook seen delivering a change clears it), spec §5.2/§5.3/§10 amended, CI step name.
  5. `f2e0d97` counts, never titles (Shyden: _"only display the right things"_): the public snapshot and socket no longer name dropped cards; health counts them by kind; the roadmap refuses an unclassifiable item by its kind, never its title.
- 39 mutations, all as predicted (two Stage 2 predictions corrected). R6 measured locally: every engine sends cached Basic credentials on the WebSocket upgrade.

## Waiting on Shyden

1. **#341 AC8 steps a–d** (create `yawelo-idle-roadmap`, generate its key, install it on `yawelo-idle` only, add `ROADMAP_WEBHOOK_SECRET` and `ROADMAP_APP_KEY` to the `dev` environment), then **comment the App ID on #341**. PR #438 must not merge before this: the deploy stops at the secrets step by name, and the Worker cannot read without the App ID.
2. **#341 AC8 step e** (the dev org webhook), after #438 deploys.
3. **#343:** the two Buttondown accounts. No reply as of 13:40 UTC.
4. Later: #334 copy, #333 wordmark, #425/#426 prod token and environment, #423 ICO, #345 visual sign-off.

## State

- `develop` is at `c931bc2`. Open PRs: #438 (#341) and this handover's. Dependabot #23 and #24 are still BEHIND develop.
- **Worktree `../yawelo-idle-341`** holds #438's branch with `node_modules`. `../yawelo-idle-341-gate` is the gate's scratch worktree (`git worktree remove --force ../yawelo-idle-341-gate`).
- **Tooling, git-ignored, in this checkout's `.superpowers/sdd/341/`:** `plan.md` (four review passes), `mutations.py` (S1–S4, predictions, totals), `gate.sh <sha> <log>`, `r6/` (the WebSocket credentials probe: `node run.mjs`), `stubs/`, `pr-body.md`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". #341 is In Progress. Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc` (Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`); Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.
- **Dev:** `https://dev.yawelo-idle.shyden.co.uk/`, password = `dev` environment secret `DEV_BASIC_AUTH_PASSWORD`, any username.

## Resume steps

1. Read this file. Then `git log origin/develop --oneline -3`, `gh issue list -R shyden-labs/yawelo-idle --state open --limit 30`, and `gh pr checks 438 -R shyden-labs/yawelo-idle`. Wait for CI with `~/.claude/scripts/wait-run.sh`, never a bare watcher.
2. Check #341 for the App ID. When it is there, in `../yawelo-idle-341`:
   - add `"ROADMAP_APP_ID": "<id>"` to `vars` in `apps/site/wrangler.jsonc` and to the `toMatchObject` in `tests/unit/dev-config.test.ts`;
   - run `npm run types` in `apps/site`, then remove `ROADMAP_APP_ID` from `RoadmapEnv` in `apps/site/worker/roadmap.ts` (the generated `Env` now has it as a required string, and an optional redeclaration will not type-check);
   - `npm run floors:record` (expect `dev-config/declared-vars` +1, nothing else), commit, gate with `.superpowers/sdd/341/gate.sh`, push, wait for CI.
3. Merge #438 into `develop` only when CI is green on the head SHA **and** Shyden has confirmed steps a–d (the agent App cannot read the environment's secrets: 403). Then wait for deploy-dev; its verify now judges `/api/roadmap/health`.
4. Ask Shyden for AC8 step e. Then the read-backs: (i) health shows `version` ≥ 1 and no `readFailingSince`; (ii) the permission check passed (no `readError`); (iii) the webhook's ping shows 2xx in Recent Deliveries (Shyden), and `lastEventAt` moves after the agent changes a card's Status.
5. AC1's dev half of R6: run the `r6/` probe's browser part against `https://dev.yawelo-idle.shyden.co.uk/` with the dev password, opening `/api/roadmap/live`, in all three engines; post the result on #341. Then close #341 with the evidence and move to #342.
6. At close-out: run `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` and state both estimates; check closed stories against CLAUDE.md's "Website follows the game" (#341 is backend: the roadmap page in #342 is what the site shows); settle the whole handover before the first push, as one commit.
