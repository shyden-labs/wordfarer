# Handover: Wordfarer

**Written:** 2026-10-03 20:13 UTC.
**Next session:** launch Claude from `~/Developer/Repos/wordfarer`. The session names itself "Wordfarer" by hook; type `/color green` once.

## Progress (global rule since 2026-10-03: every close-out states this)

- **% complete: about 14% by story count** (32 of 233 stories closed, #34 included; #297 was filed today). By effort it's nearer 11–13%: what remains includes UI, real-device and content work, which runs slower than M1's pure logic.
- **ETA to release-ready: about 8–10 weeks** (late November to mid-December 2026). Confidence is low to medium; unchanged from the last close-out.
  - **Measured:** stories closed per day were 10, 14 and 8 on 2026-10-01 to 03. #34 took about 2.5 hours as a full-process story (TDD, 64 mutations, a plan reviewed to zero). 201 stories are open.
  - **Assumed:** 6 stories a day gives about 34 working days, roughly 7 weeks. On top come outside waits: Apple and Google review, Steam's store page, and operator setup (Access, store accounts, trademark search, the support mailbox). 22 stories are operator steps.
  - **To tighten it:** time the first region-1 lexicon story (#112) and the first M3 UI story (#123), since content and UI pace are the biggest unknowns. #35 (pacing bots and tuning) is the next long pole in M1.

## State

- **#34 is done.** PR #298 merged at `c27cdb1`; CI green step by step on `7726a47`. The event log, refusals and state hash are in:
  - `events.ts`: the `GameEvent` union (design §4's eleven types plus `resume`) and `parseEvent`, the validator for untrusted logs.
  - `log.ts`: `apply` (staleSeq first, then advance, then dispatch; a refusal returns no state) and `replay`. They sit above `sim.ts` because `journeys.ts` imports a value from `sim.ts`.
  - `hash.ts`: `stateHash`, SHA-256 (`@noble/hashes` 2.4.0) of a canonical form whose numbers are their IEEE-754 bits. A new game's hash is pinned in `hash.test.ts`, so a change to the form or to a new game's state is deliberate.
  - **The golden log:** `packages/core/fixtures/golden-log.jsonl`, regenerated with `npm run golden-log`. Any change to a rule or a dependency that moves a bit turns `tests/unit/golden-log.test.ts` red ("is exactly what the golden policy writes", "replays in Node to the live hash"); regenerate, check the floors in that test, and commit the fixture with the change. The engines suite replays it in all three browsers.
  - The plan is `docs/superpowers/plans/2026-10-03-m1-34-event-log.md`.
- **Operator decision 2026-10-03:** the `resume` event, recorded whenever the game opens, banks a visit's offline time (design §4, §9). #143 (the welcome-back card) now carries it: AC1 records a `resume` through `apply` and never stores an `advance`, and AC6 tests a visit with no action.
- **#297 filed** (M1): Pemandu's per-purchase cost in a production-heavy late game. Its first text tied the golden log to a probe's slow replay; that was corrected the same day (comment on #297 and #182).
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Wordfarer Stories". New issues are not auto-added; add by node id. Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`.
- **Tooling** (git-ignored): `.superpowers/sdd/m1-34/` is the newest plan pipeline: `rebuild_floors.sh` re-measures the import-graph floors per stage and amends each task, `red_stages.sh` runs the red stages in `wordfarer-34-red`, `mutate.py` + `mutations.py` + `peek.py`, `build_plan.sh`.
- Open Dependabot PRs #23 (vitest 5.0.2) and #24 (@types/node 26) are untouched.

## Resume steps

1. `git fetch origin`; check `develop` is at the handover merge or later. Remove the `wordfarer-34` and `wordfarer-34-red` worktrees if they remain.
2. Take **#35** (pacing bots and balance tuning), the next M1 story in design §8's order. It will move the balance, so it regenerates the golden log (`npm run golden-log`) in the same commit as the change.
3. Build as before: one commit per task, red runs on the parent stage, commit before gating, mutations with predictions written first and `TOTAL` set, every stage gated on a clean `npm ci`, the plan generated from the stage commits and reviewed to zero.
4. At close-out, recompute progress from the board and state % complete and ETA.
