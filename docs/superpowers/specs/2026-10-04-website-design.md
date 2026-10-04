# Wordfarer website (coming soon): design

- **Status:** Design approved section by section by the operator (Shyden) on 2026-10-04, between 11:54 and 12:06 UTC, one question per decision (§2). Review log in §13.
- **Parent spec:** [`2026-10-01-wordfarer-design.md`](2026-10-01-wordfarer-design.md). This design amends §6.1 and D2 there (§12).
- **Knowledge passed on:** `~/.claude/global-rules/reference-live-roadmap.md` (operator, 12:03 UTC: _"for the roadmap live updates, learn about this and make sure you pass in the knowledge to ShyTalk and future projects that will have a roadmap assigned to them"_). This build proves that note and updates it (§9, W-S9).

## 1. Intent

The operator, 2026-10-04 11:50 UTC: _"i want you to make the wordfarer website. Really hype up the game with enriched graphics and detailed game mechanics. I want people to be able to see that it's coming soon and be ready for it ... do this first before continuing with the actual game"_.

**Who it is for:** the game's two audiences (English speakers learning Indonesian, Indonesian speakers learning English) and idle-game players who never plan to study (parent §1).

**Success:**

1. A visitor understands what Wordfarer is, how it plays and when it is coming, in English or Indonesian, on any device from a 320 px phone to a TV.
2. A visitor can get ready for launch in one place: join the launch list, save the site, follow the project.
3. Anyone can watch development happen: the public roadmap shows each change on the board within seconds, without a reload. Design target: under 10 s from the board edit to the open page. It is a target, not yet a measurement; W-S9 measures it on dev, and a miss is reported, never hidden by loosening the target.
4. Nothing on the site breaks a player-trust promise (parent §9): no ads, no analytics, no cookies, no third-party trackers.
5. Every page says plainly that the game is in development and may change completely.

**Game work is paused** until this site is live in production (operator, 12:00 UTC, "Pause game fully"). #35's state is recorded in its own handover.

## 2. Decisions (operator, 2026-10-04 UTC)

| #   | Decision     | Choice                                                                                                                                                                                                                                                                                                         |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Main action  | 11:54: **email launch list + follow links**, _"and give them the ability to once-click bookmark the website"_. No browser lets a page add a bookmark (measured, §6.2), so 11:55 chose the smart **Save Wordfarer** button                                                                                      |
| W2  | Location     | 11:54: **`wordfarer.shyden.co.uk`**, the game's planned production host. The site takes `/`, and the game moves to `/play` (W10)                                                                                                                                                                               |
| W3  | Trademark    | 11:54: **search first, then publish**. #157 runs first; nothing goes to production before the operator records a decision on it                                                                                                                                                                                |
| W4  | Graphics     | 11:54: **code-generated art + a playable demo on the real simulation**, _"but make sure there's a message that says the released content may change and could potentially be completely different to what is being shown"_                                                                                     |
| W5  | Roadmap      | 11:54: _"a roadmap similar to ShyTalk where users can follow the progress. but it needs to be properly built and updated in realtime which ShyTalk currently struggles with"_. 11:55: **voyage map + story detail**, updated **on screen in seconds**. The ShyTalk roadmap was not read (global boundary rule) |
| W6  | Reveal depth | 11:55: **everything decided**, including the four-layer prestige year (the operator's prestige decisions of 2026-10-04 11:04–11:45 UTC, recorded in epic #328; their spec is #329)                                                                                                                             |
| W7  | Email list   | 11:57: held by **a newsletter provider** (compared and picked in story W-S10). 12:04: it sends **the launch email plus at most one milestone update a month**                                                                                                                                                  |
| W8  | Languages    | 11:57: **English + Indonesian** at launch of the site                                                                                                                                                                                                                                                          |
| W9  | Pricing      | 11:57: **state it plainly**: free on web, Steam, iOS and Android; an optional supporter pack, cosmetic only, never progress (prestige decisions, #328, which amend D2)                                                                                                                                         |
| W10 | Approach     | 12:01: **A**: a new `apps/site` (Astro + Svelte 5 islands) as one Worker, which also holds the live roadmap; the game at `/play`                                                                                                                                                                               |
| W11 | Order        | 12:00: the website first, all the way to production, then the game resumes                                                                                                                                                                                                                                     |

## 3. Pages and content (design question 1 of 5, approved 12:02)

Every page exists in English at `/…` and Indonesian at `/id/…`, with a language switcher and `hreflang` alternates.

**Home**, top to bottom:

1. **Development strip**, fixed on every page: _"In development: what you see may change, and the released game could be completely different."_ Its wording is approved with the copy in W-S4.
2. **Hero:** animated batik night sky, the wordmark, a tagline (drafted in W-S4, approved by the operator), a "Coming soon" badge, and **Join the launch list** and **Save Wordfarer** buttons.
3. **Two journeys:** a toggle between _Learn Indonesian_ (Jawa, Bali, Sumatra) and _Learn English_ (England, USA, Australia). The default follows the page language (`/` shows _Learn Indonesian_, `/id/` shows _Learn English_). The demo, map and examples below follow it. The choice lives in the URL (`?course=id-en`) so it can be shared; nothing is stored on the device.
4. **Play the demo:** about two minutes on the real `packages/core`: tap _Selamat pagi!_ (or its `id-en` mirror), open the first Encounter, pick up the first word card, answer one review, watch Insight arrive. It runs on a short demo clock and saves nothing.
5. **How it plays:** the three currencies, Encounters, word cards ranked Heard → Mastered, spaced-repetition review explained plainly, Journeys and culture cards, the grammar tree, Set Sail.
6. **The voyage:** the map of 6 regions and 24 destinations (parent §4.5).
7. **A year of adventure:** Set Sail → Homecoming → Generations → Tour Guide, the lottery and shards, the daily gift, dialect choices (#328).
8. **Fair by design:** taken from parent §9 and naming the DN items: no ads (DN14), nothing sold that speeds you up (DN12), learning never reset (DN3), no energy (DN11), no missed-day punishment (DN16), no expiring content (DN13), no login (D6), saves never lost (DN18), fair leaderboards (parent §10).
9. **Platforms and price:** W9's sentence.
10. **Roadmap teaser:** live % complete and ETA, linking to `/roadmap`.
11. **Open source:** the public repo, Apache-2.0 code, CC content licences, the reserved name and logo (TRADEMARKS.md).
12. **Get ready:** sign-up form, Save Wordfarer, follow links, footer.

**Other pages:** `/roadmap` (§5), `/privacy` (§6.3), `/play` "coming soon" (served by the game app, §7.2), and a 404.

**Site-wide:** no analytics, no cookies, no third-party requests of any kind (fonts self-hosted), WCAG 2.2 AA (parent §8).

**Copy rule:** every claim about a mechanic traces to the parent spec, a recorded operator decision (this §2, epic #328) or a merged design spec. A claim with no source is cut, not softened. The English copy is approved by the operator before translation (W-S4), the cheap moment to change it.

## 4. Look and graphics (design question 2 of 5, approved 12:02)

- **Palette:** Batik night (D7): a deep indigo ground, gold, and a region accent each. All colours are CSS custom properties. Contrast is checked on the rendered page (§8). A `@media print` token block covers paper.
- **Motifs:** a new pure-TypeScript package, `packages/motifs`, that returns SVG strings from a seed and a palette. No DOM, so it can be unit-tested and the game reuses it later. `en-id`: kawung, parang, mega mendung, truntum, songket. `id-en`: tartan, knotwork, quilt-block geometry. Each motif carries a cultural-safety review block (parent §5.2, §7). Nothing restricted or sacred is used: no Aboriginal dot painting.
- **Motion:** mega mendung clouds drifting over a star field, a ship that sails the route as the page scrolls, and cards that turn over in the demo. CSS and SVG with small scripts, and no 3D or animation libraries. All motion stops under `prefers-reduced-motion: reduce` and while the document is hidden (the spirit of DN22).
- **Map:** coastlines from **Natural Earth** (map data its site states is public domain; W-S6 quotes the terms before use), simplified at build time and drawn in the batik palette.
- **Logo:** none exists, and the name and logo are reserved trademarks. W-S3 draws **three code-made wordmark candidates**, and the operator picks one.
- **Fonts:** OFL-licensed, self-hosted, a Latin subset covering every Indonesian character.
- **Devices:** the shyden.co.uk standard the operator set for Wordfarer on 2026-10-04 (#323): mobile-first from 320 px, no horizontal scroll, 44 px touch targets, legible on a TV and a Steam Deck.
- **Visual sign-off:** before production the operator approves the real render on dev, from screenshots at phone, tablet, laptop and TV widths in both languages (W-S12).

## 5. Live roadmap (design question 3 of 5, approved 12:03)

### 5.1 Measured facts (GitHub docs, read 2026-10-04)

- `projects_v2_item` webhooks go **only to organization webhooks and GitHub Apps**, and need at least **read on the "Projects" organization permission**. Its actions are `archived converted created deleted edited reordered restored`.
- Project webhooks are **"in public preview and subject to change"**.
- **Closing an issue sends an `issues` event**, not `projects_v2_item`.
- A GitHub App has **one** webhook URL.

### 5.2 Design

1. **Source:** the Wordfarer Stories board only, resolved by node id `PVT_kwDOEOcG584BlRWb` with its title asserted on every read. Shown: items whose content is an issue in `shyden-labs/wordfarer`. Never shown: draft items and other repos' issues. Anything unclassifiable is refused by name and logged, never shown.
2. **Events:** **two org webhooks**, dev and prod, each with its own secret, subscribed to `issues` and `projects_v2_item`, POSTing to `/hooks/github` on that environment's site Worker. The Worker verifies `X-Hub-Signature-256` (HMAC-SHA256) with a constant-time compare and refuses anything unsigned or mismatched with 401 and no body detail. That one path skips the dev password because the signature is its guard.
3. **Read:** an event means only "something changed". The Worker re-reads the board over GraphQL as a **new read-only GitHub App, `wordfarer-roadmap`** (Projects, Issues, Metadata: read; nothing else). A public-facing Worker never holds a key that can write. Events arriving in a burst are coalesced into one read.
4. **Hold and push:** a Durable Object, `Roadmap`, keeps the latest snapshot and its version, and pushes each new snapshot over **hibernating WebSockets** (`/api/roadmap/live`) to every open roadmap page. A page that cannot open a socket fetches `/api/roadmap.json` when it loads and says it is not live.
5. **Read failures:** a GraphQL read that fails keeps the last snapshot, sets `readFailingSince` on the health endpoint, and the page shows its real age ("updated 14 minutes ago"). There is no retry loop: the next event or the next scheduled check is the next read, and verify-dev fails red on a failing read. A replayed signed delivery only causes one more idempotent read.
6. **Check:** a Cron Trigger every **10 minutes** reads the whole board and compares its hash with the snapshot. If they differ, the fresh read wins, `drift` is incremented, and the event is recorded. `/api/roadmap/health` returns the last event time, last check time, snapshot version and drift count. **The dev verify job fails red** when drift is above zero, when `readFailingSince` is set, or when the last check is older than two intervals (20 min). A quiet board sends no events for hours, so the time since the last event is shown but is never a failure on its own; a missed event surfaces as drift. This is an independent reading of the source of truth, not a retry: a missed delivery is reported, never hidden.
7. **One home for the maths:** the % complete and ETA, both by tickets and by effort (the `Estimate` field), come from `scripts/board-progress.ts` in `shyden-labs/repo-template`, which Wordfarer has not copied in yet (measured 2026-10-04: no such file in this repo). W-S9 brings its maths in as `packages/progress`, with a thin `scripts/board-progress.ts` wrapper, and the script and the Worker both import that one module. The roadmap and the operator's close-out lines therefore cannot disagree.
8. **Shown:** islands M0–M8 plus a "Beyond launch" cluster (`post-launch`), with the ship at the earliest milestone not complete. Tapping an island lists its stories under Done / In progress / Up next, each linking to its GitHub issue. Also shown: both estimates with ETA dates and confidence, "recently shipped" (the last 10 closed), and "updated N seconds ago". The development strip sits above it all.

### 5.3 Operator steps (exact click-paths go in W-S9)

Create and install the read-only App, and create the two org webhooks. Each webhook secret and the App's private key become Worker secrets on the matching environment's Worker only, set the way `DEV_PASSWORD` is set today (the operator runs `wrangler secret put`; the agent never sees a value). Dev's values never reach the prod Worker, and the reverse.

## 6. Sign-up, Save and privacy (design question 4 of 5, approved 12:04)

### 6.1 Launch list

- **Provider:** W-S10 compares Buttondown, Brevo, Mailchimp and EmailOctopus on free-tier size, UK/EU data handling, double-opt-in API, unsubscribe and consent records. The operator picks one and creates the account. Prices are not yet read, so none is quoted here. Cloudflare's Email Service was ruled out: it is "Beta for outbound transactional emails" on the Workers Paid plan (read 2026-10-04), and a launch announcement is not transactional.
- **Form:** email; site language; "which course interests you" (optional); an **unticked** consent box reading what W7 sends (_"one email when Wordfarer launches, and at most one milestone update a month"_); an **"I am 13 or older"** box (UK GDPR art. 8). Double opt-in is done by the provider.
- **Worker `POST /api/signup`:** validates with Zod and passes the sign-up to the provider. **Never stores or logs the address.** It returns the same response whether the address is new or already listed. Abuse controls: a honeypot field, a per-IP rate limit, double opt-in, and no CAPTCHA script (§3: no third-party requests).
- **Secrets:** dev and prod each get their own provider key (dev points at a separate test list). Each is a Worker secret on its own environment's Worker only, set the way §5.3 sets the roadmap secrets; the agent never sees a value.

### 6.2 Save Wordfarer

- **Measured:** no current browser lets a page add a bookmark. Chrome and Safari refuse for security, and Firefox removed `window.sidebar.addPanel`. `beforeinstallprompt` (a real install prompt) fires in Chromium browsers only, never in Safari or Firefox.
- **Behaviour:** where `beforeinstallprompt` has fired, the button opens the install prompt. Elsewhere it shows that browser's exact steps (⌘D / Ctrl+D; on iPhone and iPad, Share → Add to Home Screen, with a small picture).
- **Manifest:** `id: "/"`, `scope: "/"`, `start_url: "/play/"`, so an icon installed today opens the game at launch. **One service worker owns the origin, and it is the game's.** The site adds one only if Chromium's installability criteria still require it (research item R2).

### 6.3 Privacy page

`/privacy` (en and id) states: what is collected (the sign-up, held by the named provider as processor), the lawful basis (consent) and how to withdraw it, exactly what request logging Cloudflare and the Worker keep (read from the Worker config and Cloudflare's own terms in W-S10, never assumed), and that there are no cookies or analytics. Operator step: check whether the ICO data protection fee applies. W-S10 sets out the ICO's own criteria and does not guess.

## 7. Architecture (W10, approved 12:01)

### 7.1 Units

| Unit                | Does                                                                                                                                                     | Depends on                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `packages/motifs`   | Seeded SVG motif generator with a review block per motif                                                                                                 | nothing                                       |
| `packages/progress` | Board snapshot → % complete and ETA by tickets and by effort; used by the `scripts/board-progress.ts` wrapper (ported from repo-template) and the Worker | nothing                                       |
| `apps/site` (Astro) | Prerendered pages in en and id, Svelte 5 islands (demo, map, roadmap, Save, sign-up)                                                                     | `packages/core`, `packages/motifs`            |
| `apps/site/worker`  | Static assets, dev gate, `/hooks/github`, `/api/roadmap*`, `/api/signup`, `/play/*` forwarding, Cron                                                     | `packages/progress`, Durable Object `Roadmap` |
| `apps/web` (game)   | The game, rebuilt with base `/play/`; until launch its shell shows "coming soon"; no hostname of its own                                                 | —                                             |

### 7.2 One hostname, two apps

The site Worker owns `dev.wordfarer.shyden.co.uk` now and `wordfarer.shyden.co.uk` in production. It forwards `/play/*` to the game Worker through a **service binding**. The game Worker gives up its Custom Domain and keeps `workers_dev: false`, so the binding is its only way in. The dev password gate moves to the site Worker, the front door, and `apps/web/test/gate.test.ts` moves with it. Before launch, `/play/` shows "coming soon" with links to the roadmap and the list.

### 7.3 Data flow

Board change → GitHub → org webhook → `/hooks/github` (verify) → coalesce → GraphQL read as `wordfarer-roadmap` → `Roadmap` DO (snapshot, version) → WebSocket push → open pages. In parallel: Cron (10 min) → full read → compare → health/drift.

## 8. Testing

TDD throughout: each test is written and seen failing before its code (red against throwing stubs).

- **Unit:** motif SVG output is deterministic for a seed and well-formed. HMAC verification: a wrong secret, one flipped byte, a missing header and a malformed header are each refused, and each mutation goes red. The comparison is `crypto.subtle.timingSafeEqual` (a timing property a unit test cannot measure), so a stripped-source guard asserts the verifier calls it and never compares digests with `===`. Progress module: the script and the Worker get identical outputs from one fixture. DO: snapshot versioning, coalescing, drift accounting (Workers pool). Signup handler: validation, identical responses, address never in logs (an asserted log capture with a liveness sentinel).
- **Rendered (Playwright, one test per page × language × width, never looped):** axe accessibility; contrast measured on the render against the tokens the page serves; no horizontal scroll at 320, 375, 768, 1280 and 1920 px; reduced motion stops every animation; print ink is measured against white; the development strip is visible on every page.
- **Privacy guard:** a recorder of every request and `Set-Cookie` on every page asserts **zero third-party hosts and zero cookies**, with liveness (a counted first-party request total, `searched(...)` style) so an empty recorder cannot pass.
- **Visual regression:** in the pinned container, as the house rule says (threshold and ratio both set, `{platform}` in the path).
- **End-to-end on dev:** a real board edit is made and the open roadmap page is observed to update. The latency is measured and recorded in the PR and in `reference-live-roadmap.md`. The health endpoint is checked in `verify-dev`.
- **Guards:** every new guard proves what it saw, counted at the level it judges, with a recorded floor and an independent cross-check (global rule).

## 9. Delivery

A new epic, **"Website (coming soon)"**, on Wordfarer Stories. Every story has full acceptance criteria and an `Estimate` when filed. The W-S ids below are placeholders that the issue numbers replace when the stories are filed. In order:

| Story | Scope                                                                                                                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #157  | Trademark search (existing story); the operator's decision is recorded before any production publish (W3)                                                                                                                                                                        |
| W-S2  | `apps/site` scaffold (Astro, Svelte islands, i18n routing), site Worker with the gate, game moved to `/play` via service binding, CI and dev deploy                                                                                                                              |
| W-S3  | `packages/motifs`, tokens, fonts, three logo candidates; operator picks the logo                                                                                                                                                                                                 |
| W-S4  | English copy for every section, tagline and development strip; operator approves before translation                                                                                                                                                                              |
| W-S5  | The demo island on `packages/core`                                                                                                                                                                                                                                               |
| W-S6  | The voyage map (Natural Earth, build-time simplification)                                                                                                                                                                                                                        |
| W-S7  | Indonesian translation, evidence-checked under D18, label audit for text of three words or fewer                                                                                                                                                                                 |
| W-S8  | Save Wordfarer: manifest, install prompt, per-browser steps                                                                                                                                                                                                                      |
| W-S9  | Live roadmap: `packages/progress`, webhooks, `Roadmap` DO, Cron check, health in verify, voyage-map UI, operator App and webhook steps; update `reference-live-roadmap.md` with what was measured; then propose the reusable parts for `shyden-labs/repo-template` as its own PR |
| W-S10 | Provider comparison → operator pick → `/api/signup` and `/privacy`; ICO criteria set out                                                                                                                                                                                         |
| W-S11 | Production: a separate production Cloudflare account, a `prod` environment with `ShydenMcM` as required reviewer, deploy from `main` (research item R3)                                                                                                                          |
| W-S12 | Visual sign-off on dev, then the production release with the operator's approval                                                                                                                                                                                                 |

## 10. Research items settled in the plan or the story (never assumed)

- **R1:** whether a SQLite-backed Durable Object and Cron Triggers run on the Workers Free plan, or whether the roadmap waits for the Paid plan (#253).
- **R2:** Chromium's current installability criteria (whether a service worker is still required).
- **R3:** the `shyden.co.uk` zone is on the dev deploy account (#39, read 2026-10-01). How a production Worker in a **separate** account attaches `wordfarer.shyden.co.uk`, so that dev can never reach prod (global rule). Read from Cloudflare's docs and from how shyden.co.uk #415 solved it, without assuming either.
- **R4:** how the board links stories to milestones, so the islands group correctly. Measured 2026-10-04: the board has `Parent issue`, `Sub-issues progress` and `Milestone` fields, and story bodies say "Part of epic #N"; which of them is complete and authoritative is not yet measured.
- **R5:** whether a service-binding-forwarded game keeps correct asset paths and PWA scope under `/play/`.
- **R6:** the dev gate is HTTP Basic auth (no cookie, `packages/lockdown`). Whether each browser engine sends cached Basic credentials on the same-origin WebSocket upgrade, or whether `/api/roadmap/live` needs its own handling on dev.
- **R7:** whether the Workers rate-limiting binding used by `/api/signup` is available on the account's plan.

## 11. Risks

- **Preview webhooks change:** the 10-minute check keeps the page correct and makes a broken webhook visible (§5.2 item 6).
- **Trademark clash:** nothing is public before W3's decision.
- **Over-promising:** the development strip on every page, and the copy rule in §3.
- **Translation errors:** D18 evidence and the label audit (W-S7).

## 12. Amendments to the parent spec (made in the same PR)

- §6.1: add `packages/motifs`, `packages/progress` and `apps/site`, and note that `apps/web` is served under `/play`.
- D2: record the 2026-10-04 prestige decision (free everywhere, plus an optional cosmetic supporter pack; epic #328), with its date.
- §13: the Website epic comes before M1 resumes (W11).

## 13. Review log

| Pass | Date (UTC)       | Findings                                                                                                                                                                                                                                                                                                                | Fixed  |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1    | 2026-10-04 12:08 | 11: wrong decision cross-ref (W9→W10); a memory-link token in a repo doc; device-stored course choice contradicting "nothing stored"; an unmeasurable constant-time test; an unapproved footer report link; no read-failure handling; R6 (Basic auth on the WebSocket upgrade) and R7 (rate-limit binding) missing      | all 11 |
| 2    | 2026-10-04 12:09 | 10: citations of a git-ignored decisions file (now epic #328); no default course per language; "within seconds" with no target; Natural Earth licence asserted unread; a verify rule that would fail on a quiet board; the game called "unchanged" while it shows coming soon; repo-template hand-off missing from W-S9 | all 10 |
| 3    | 2026-10-04 12:09 | 2: §8 cited where §3 holds the no-third-party rule; secret handling for webhook and App key unspecified                                                                                                                                                                                                                 | both   |
| 4    | 2026-10-04 12:10 | 2: headings cited the design questions as §1–§4, colliding with this document's own sections; "(§10)" meant the parent's §10                                                                                                                                                                                            | both   |
| 5    | 2026-10-04 12:10 | 4: the provider-key secret path contradicted §5.3; the WebSocket path named only in R6; D2 amendment cited a git-ignored decision number; W-S placeholders not explained                                                                                                                                                | all 4  |
| 6    | 2026-10-04 12:10 | 1: the privacy page asserted Cloudflare request logs without a source                                                                                                                                                                                                                                                   | yes    |
| 7    | 2026-10-04 12:11 | 0: mechanical checks (every issue cited exists: #35 #39 #157 #253 #323 #328 #329; every bare § resolves in this document; every W-S id in §9; no `TBD`/`TODO`) and a read of the whole document                                                                                                                         | —      |
| 8    | 2026-10-04 12:12 | 1, found while filing the stories: §5.2 item 7 said the maths moves out of a `scripts/board-progress.ts` this repo does not have (it lives in repo-template); R4 updated with the board's measured fields                                                                                                               | yes    |
| 9    | 2026-10-04 12:13 | 0: a whole read, the mechanical checks from pass 7 again, and `git ls-files` for every repo path the spec names as existing                                                                                                                                                                                             | —      |
