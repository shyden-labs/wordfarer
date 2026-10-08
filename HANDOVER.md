# Handover: Yawelo Idle

**Written:** 2026-10-08 16:15 UTC (after #474, PR #512).
**Next session:** launch Claude from a **new terminal** in `~/Developer/Repos/yawelo-idle` (see "Node" below). A hook names the session "Yawelo Idle"; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From this repo's own `node scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Yawelo Idle Stories"` at 16:14 UTC:

- **By tickets: 22% complete** (73 of 328 in-scope stories closed).
  - Measured pace: 9.00 a day over 7 days. At that pace: 2026-11-06.
  - **ETA to release-ready: 2026-12-23 to 2027-02-01** (low to medium confidence).
- **By effort: 23% complete** (355 of 1,549 points closed).
  - Measured pace: 41.57 points a day. At that pace: 2026-11-06.
  - **ETA to release-ready: 2026-12-19 to 2027-01-29** (low to medium confidence).
- **Measured:** the counts and the paces. **Assumed:** 4–6 stories (20–30 points) a working day; about 30 unfiled prestige stories (130–180 points, #328, #329); 1.5–2.5 weeks of outside waits.
- **The release-ready ranges are carried** from 00:21 UTC. This session closed #474 (8), re-scored #416 from 8 to 3 and filed #513 (3): inside the ranges' rounding.

## The order (Shyden: "Cleanup first, every project", 2026-10-08)

1. **Unit tests under 1 s each, cut tests at or under 0.3 s of CPU, no process or outside connection in a unit test:** #474 is done. **#475 next** (5: bots run, svelte-gates, floorless-searches, literal-floors, named in PR #507), then #490, #491, #476, #477 (8). Use #474's tools (`.superpowers/sdd/474/`): `m.zsh <file> [pattern]` (per-test CPU plus recorded floors), `beforeafter.zsh` (develop's tests swapped in from git, then the branch's), `mut.py` and `old.py` (each mutation against the new tests and against develop's). Judge CPU in the full parallel suite, which ran about 1.5x higher than alone.
2. **#505** (3 points): `floors:record -- --suite <name>`, no browser suites by default. Also remove the recorder's `{ unrecordable }` suite form, unused since #506 (comment on #505).
3. **#497:** a daily check that dev serves `develop`'s head, and `workflow_dispatch` on deploy-dev. **#513** (3): verify-dev also waits for the Pages adapter's new deployment.
4. **#432** stays open for its evidence (10 CI runs with `writeFloors` never slow, then `.superpowers/sdd/432/ci/scan.sh`).
5. **#467** (needs Docker), then #51 → #104 → #102; #110 → #103, #125 → #124 → #128; #464 before the first production release.
6. **One M1 floor burn-down a session alongside** (#411–#416, #368–#375, #84, #36).

## What this session did (2026-10-08 15:19 to 16:15 UTC)

- **#474, PR #512** (head `0ccdbc7`, merged as `8aa0c39`): every packages/core test is under 0.3 s of its own CPU in the full suite. At load 11 to 12 the slowest read 265 ms, against 5,158 ms (words) before. Every `*_TIMEOUT_MS` and both bare `120_000` limits are gone. **#474 closed.**
  - words, sim, pemandu-tick, log and automation: fewer seeded runs, with what they reach recorded in `tests/floors/core-*.json`. The sanity checks throw once a step instead of making about 30 `expect` calls, and the number of values checked is a floor. sim's splits are aimed at hour edges. pemandu-tick ends half its horizons on a tick (`atUntil`). log runs one property per event type.
  - det-math (300), num (200) and encounters (280) take fewer random inputs. `pow(1.15, n)` walks its reference by multiplication. Node's review pin reads the first 30,000 vectors, while the engines spec still compares all 100,000.
  - `packages/core/test/tsconfig.json` (new): the core tests get Node types, because `floorBreach` reads from disk. `src/` and the golden vectors stay ECMAScript-only (a planted `process` is refused in each).
  - 13 predicted mutations, 13 matched. Run against develop's tests too: nothing the old tests caught is lost.
  - This converted 6 of #416's scopes (13 sites) ahead of #411. #416 is re-scored to 3, and #411 has a note that it must re-record these floors at its global seed.
- **Dev:** deploy succeeded, but verify-dev failed once: `robots.txt` read 404 14 s after the Pages adapter deployed. Read by hand: `/health` reports commit `8aa0c39` with `db: ok`, the gate answers 401, and `robots.txt` answers 200. **#513 filed** (3 points) instead of a re-run.
- **Lesson recorded:** `feedback-cut-properties-against-old-tests`.

## Waiting on Shyden

1. **Relaunch Claude from a new terminal.** This session's shell ran **Node 24**: PATH began with `/opt/homebrew/opt/node@24/bin` and had no Node 26 directory, although `~/.zshrc` line 4 puts it first. Nothing in the startup files adds node@24, so it came from the terminal Claude was started in. This session prefixed every Node command with Node 26.
2. **Spotlight:** add `~/Developer/Repos` to System Settings → Spotlight → Privacy.
3. **A hook for a lesson missed four times now:** `gh api …/jobs/<id>/logs` without `--allow-escape-sequences`. Global, so not built: say if you want it.
4. **Docker Desktop on,** for #467 (and for `floors:record` until #505 lands).
5. **#451 AC3:** confirm Web Analytics automatic setup on `yawelo-idle-dev-hosts`.
6. **#341 AC8 steps a–d,** then the App ID comment. PR #438 must not merge before that.
7. **#343:** the two Buttondown accounts.
8. **Later:** the #333 wordmark, the #425/#426 prod token, #345 sign-off, and #455's analytics token.

## State

- **`develop`** is at `8aa0c39` (read with `git rev-parse` when written). Deployed to dev, but its verify job failed on the #513 race (dev checked by hand, see above). This handover's PR follows it.
- **Open PRs:** #438 (#341, behind develop); this handover's PR. No Dependabot PRs open.
- **Node:** CI runs 26.11.1; the laptop has 26.10.0 at `/opt/homebrew/opt/node/bin` (see "Waiting on Shyden" 1). The main checkout's `node_modules` came from `npm ci` on Node 26 this session. This session's shell was again Node 24 first in PATH, so every Node command was prefixed with Node 26.
- **Worktrees:** `../yawelo-idle-develop-bench` (detached at `9566388`; re-run `npm ci` on Node 26 before using it), `../yawelo-idle-297-before` (`c84cf07`, the pre-#297 baseline), and `../yawelo-idle-297`, `-341`, `-341-gate`, `-348`, `-348-red`, `-35` from earlier sessions. This session's scratch worktree was removed.
- **Session tools (git-ignored):**
  - `.superpowers/sdd/474/`: `m.zsh`, `beforeafter.zsh`, `compare.py`, `mut.py` (13 mutations), `old.py`, `prof.py` + `vitest.prof.config.ts` (a CPU profile per test), `write-floors.py` (writes the core floor files from a `FLOORS_RECORD` file).
  - `.superpowers/sdd/506/`: `mut.py` (17 mutations with predictions, refuses a moved total), `raise.py <unit log>` (raises each grown floor to its guard's reading, after checking the old figure), `probe.ts` (harness vs `getPlatformProxy` timings), PR and closing texts.
  - `.superpowers/sdd/477/`: `reach.setup.ts` + `vitest.reach.config.ts` (per test: process starts, socket connects, CPU and wall to `MEASURE_OUT`).
  - `.superpowers/sdd/501/measure.zsh` (per-test CPU on Node 26 then 24).
  - `.superpowers/sdd/101/set-status.sh <issue> <option-id>`.
- **Board:** project 4, `PVT_kwDOEOcG584BlRWb`, "Yawelo Idle Stories". Status field `PVTSSF_lADOEOcG584BlRWbzhj-3Hc`: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`. Estimate field `PVTF_lADOEOcG584BlRWbzhkVhDU`.

## Resume steps

1. **Run `ListAgents` first,** then `node -v`: if it is not 26, prefix Node commands with `export PATH=/opt/homebrew/opt/node/bin:$PATH;`.
2. **Read the state of every ticket named below from GitHub before working on it** (`gh issue view N --json state`).
3. **#475:** move it to In Progress; measure with `.superpowers/sdd/474/m.zsh`, profile with `prof.py`, plan the cuts, then write the tests first. Then #490, #491, #476, #477. **#513** can go between them.
4. **After any merge,** read the merge SHA and select its deploy-dev run by that SHA (a Monitor until-loop while it appears); if none appears in 10 minutes, it is #497 again: comment there, and the next merge carries it.
5. **One test run at a time from this session.** Benchmark only at load < 6 (Monitor until-loop on `sysctl -n vm.loadavg`), and judge on CPU, not wall.
6. **At close-out,** run the progress script, state both estimates, and check the closed stories against "Website follows the game" (this session's, #474, was test speed only: nothing for players to see). Settle the handover as one commit.
