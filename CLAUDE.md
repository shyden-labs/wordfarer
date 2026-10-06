# Yawelo Idle: project instructions

Yawelo Idle is a cross-platform idle game for learning a real language: English speakers learning Indonesian (`en-id`) and Indonesian speakers learning English (`id-en`). It is built once for web and shipped to browsers (PWA), Steam (Electron) and mobile (Capacitor), owned by Shyden Labs.

The global `~/.claude/CLAUDE.md` rules all apply here. This file adds what is specific to this repo.

## Read first

- **`HANDOVER.md`**: where work stopped and the numbered resume steps.
- **Design spec:** `docs/superpowers/specs/2026-10-01-yawelo-idle-design.md`. This is the source of truth. Operator decisions D1–D18 in its §2 are settled, so don't re-ask them.
- **Research:** `docs/research/2026-10-01-idle-game-research.md`. The spec cites its H-numbers (player complaints) and DN-numbers (the do-not list).

## Boundaries

- **Board:** "Yawelo Idle Stories", a GitHub Project owned by shyden-labs. Its node id is recorded below once created. Resolve the board from that node id and assert its **title** before any write. **Never** touch project #1 (ShyTalk Stories), project #2 (Shyden Site), project #3 (ShyFerry Stories), or the ShyTalk roadmap.
  - Board node id: `PVT_kwDOEOcG584BlRWb` (shyden-labs project **4**, title "Yawelo Idle Stories", renamed by the App and read back 2026-10-05 15:25 UTC, #357)
- **Git identity:** agent git and `gh` act through the repo's GitHub App (`yawelo-idle-agent`, renamed in #357). Never route around the credential helper or the `gh` router. Commits are authored as Shyden.

## Flow

- `main` and `develop`. Each ticket gets its own branch, with a PR into `develop`, never directly into `main`. Every `develop` merge deploys the dev environment (web Worker + sync Worker + D1 dev) once the pipeline exists (milestone M0).
- TDD: failing test first. Zero warnings policy. Dependabot targets `develop`. Actions are SHA-pinned.
- One test per case: a population known before the run is generated as one test each, never looped inside a test body. `tests/unit/one-test-per-case.test.ts` refuses the loop unless it carries `// runtime population: <why>` or `// one scenario: <why>`, and its `BURN_DOWN` list only shrinks (#58).
- Write `Refs #N` in commit messages and PR bodies, never close/fix/resolve next to an issue number unless you mean it.

## Website follows the game

The coming-soon site (`apps/site`, epic #331, spec `docs/superpowers/specs/2026-10-04-website-design.md`) keeps advertising the game as it grows (operator, 2026-10-06, website spec W16). When a player-facing story or epic closes, file a `Website: announce <feature>` story in the same session: 1–3 points, full ACs, Estimate set, copy approved by Shyden before translation, en + id with D18 evidence. Skip it only when the closing story says why there is nothing new to show. Every story's **Website** field (`.github/ISSUE_TEMPLATE/story.yml`) says what it lets the site show, and every close-out checks that session's closed stories against this rule.

## Stack (decided, spec §6)

npm workspaces · TypeScript · Svelte 5 · Vite · Vitest + fast-check + Stryker · Playwright · break_infinity.js · ts-fsrs · Zod · Cloudflare Workers + D1 (`wrangler`) · Electron + steamworks.js · Capacitor.

## Content rule

No native speakers are available before release (operator, 2026-10-02; spec D18). Every build ships `claude-checked` and `native-reviewed` content and refuses `draft` and `rejected`. `claude-checked` must carry its evidence: two independent sources, a back-translation, and a label audit for text of 3 words or fewer. Be as accurate as possible, and never add a gate that needs a native reviewer. Players report mistakes in game (#51–#54). Motifs are publicly shared decorative traditions only: no Aboriginal dot-painting or other restricted or sacred designs.
