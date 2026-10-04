# Handover: Wordfarer

**Written:** 2026-10-04 12:30 UTC.
**Next session:** launch Claude from `~/Developer/Repos/wordfarer`. The session names itself "Wordfarer" by hook; type `/color green` once.

## Progress (global rule: every close-out states both estimates)

From `node ~/Developer/Repos/repo-template/scripts/board-progress.ts PVT_kwDOEOcG584BlRWb "Wordfarer Stories"` at 12:28 UTC:

- **By tickets: 12% complete** (32 of 273 in-scope stories closed). Measured pace 8.0 a day over 4 days (10, 14, 8, 0). ETA at that pace 2026-11-04. **ETA to release-ready: 2026-12-02 to 2027-01-01** (low to medium confidence; 241 open plus about 30 unfiled stories at an assumed 4–6 a day, plus 2–3 weeks of waits).
- **By effort: 13% complete** (160 of 1,213 points). Measured pace 40 points a day. ETA at that pace 2026-10-31. **ETA to release-ready: 2026-11-26 to 2026-12-26** (low to medium confidence; 1,053 open plus 130–180 unfiled points at an assumed 20–30 a day, plus 2–3 weeks of waits).
- **Measured:** the counts and paces above, and the 63 new website points (#332–#345) filed today.
- **Assumed:** the measured pace is front-loaded with quick M0 setup tickets, and M4/M5 run slower, so the ranges assume 20–30 points a day. On top of that: about 130–180 points of prestige launch work not yet filed (#328, #329), and 2–3 weeks of outside waits (trademark decision, operator admin for the website's App, webhooks and newsletter provider, the production Cloudflare account, store reviews).
- **Website live (epic #331):** it is behind #35 and 61 pulled-forward stories (259 points) plus its own 63 points, 335 points at 20–30 a day: roughly 2026-10-15 to 2026-10-21, before the operator waits (low confidence).

## State

- **Operator, 2026-10-04 11:50 UTC: build the Wordfarer website before more game work.** Brainstormed and approved question by question, 11:54–12:23 UTC. Spec: `docs/superpowers/specs/2026-10-04-website-design.md` (merged in #330, delivery section updated in #346), reviewed to zero.
- **Board:** epic **#331** with website stories **#332–#345** (63 points), each Todo with an Estimate, read back. The operator pulled the shared game stories forward **with their whole dependency chains**: tokens #125, motifs #126, PWA #152, privacy notice #246, production pipeline #252 and infrastructure #253, plus everything under them, 61 open stories and 259 points as measured. #331 lists them in dependency order. Those six carry a "website epic #331" amendment; #252 was re-scored to 13 and #253 to 5.
- **Order (operator):** **#35 first** (12:23 UTC), then #157 (trademark search, gates production), then the chain in #331's order with the website stories as their dependencies land.
- **Knowledge passed on (operator 12:03 UTC):** `~/.claude/global-rules/reference-live-roadmap.md` plus a "Live Public Roadmaps" section in the global CLAUDE.md. ShyTalk's own next session adopts it; #342 updates it with what the build measures.
- **#35** is unchanged from this morning: branch `m1/35-t1`, worktree `~/Developer/Repos/wordfarer-35-t1`, remote head 3f48497. Its handover is `~/Developer/Repos/wordfarer-35/.superpowers/sdd/m1-35/HANDOVER.next.md`.
- **Prestige design** (#328, #329): decisions are recorded in #328; the spec (#329) is not written yet.
- **Worktree `~/Developer/Repos/wordfarer-site`** holds the spec branches; remove it once #346 and this handover are merged.
- claude-mem's observer allowance was exhausted this session, so nothing went to claude-mem. The repo memory files are unaffected.

## Resume steps

1. `git fetch origin`; check that `develop` includes #346 and this handover. In the main checkout, `HANDOVER.md` carries an older uncommitted two-line pointer; this file supersedes it. Read this one with `git show origin/develop:HANDOVER.md` and leave the local edit for Shyden.
2. **Finish #35** from `HANDOVER.next.md` (path above), through its PR, merge and dev deploy.
3. Then **#157**: the desk search (UK IPO, EUIPO, USPTO), recorded in `docs/compliance/trademark-search.md`, with a recommendation; the operator decides.
4. Then work **#331's list in order**. Each story gets its own branch and plan, built as before: one commit per task, red runs, mutations with predictions written first, the plan generated from the stage commits and reviewed to zero. Research items R1–R7 (spec §10) are answered inside the story that needs them, never assumed.
5. At close-out, run board-progress and state both estimates.
