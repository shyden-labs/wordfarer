# Wordfarer — Design Spec

- **Status:** Design approved section by section by the operator (Shyden) on 2026-10-01; amended 2026-10-02 by D18 (content without native review). Reviewed to zero findings in 7 passes and self-approved under the house rule (§17).
- **Owner:** Shyden Labs
- **Repo:** `shyden-labs/wordfarer`
- **Research:** [`docs/research/2026-10-01-idle-game-research.md`](../../research/2026-10-01-idle-game-research.md). H-numbers (H1–H28) and the do-not list (DN1–DN26) cited below refer to sections 3 and 7b of that report.

---

## 1. Intent

Wordfarer is a cross-platform idle (incremental) game about **learning a real language and discovering the cultures of the places it is spoken**. It ships as one web codebase to browsers (PWA), Steam (Electron) and iOS/Android (Capacitor).

**Who it is for**

- English speakers learning Indonesian (course `en-id`), journeying across the Indonesian archipelago.
- Indonesian speakers learning English (course `id-en`), journeying across the English-speaking world.
- Idle-game players who want a game with substance, whether or not they ever study.

**Success criteria for v1**

1. A pure idler (never reviews) can finish the v1 ending; a learner finishes faster and ends up genuinely knowing roughly 450 words and phrases per course.
2. None of the 26 do-not-list items (§9) is present, each enforced by a test.
3. Players never lose a save: layered local backups plus device-pairing sync.
4. Leaderboards stay fair for legitimate players: cheats are detected server-side and excluded from public view, never banned.
5. Staff can moderate, support and audit without ever being able to read or edit a save.

## 2. Operator decisions (2026-10-01)

The operator's choices from brainstorming, recorded so no later session re-litigates them.

| #   | Decision                      | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Learning depth                | Real vocabulary, **optional**: correct recall gives large multipliers, and nobody is forced to study                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D2  | Money                         | ~~Free web, paid Steam and mobile (one-off purchase).~~ **Amended 2026-10-04 (operator, prestige decisions, epic #328): free everywhere, plus an optional one-off supporter pack, cosmetic only, never progress.** Stated publicly on the website (W9, [`2026-10-04-website-design.md`](2026-10-04-website-design.md)). Keep a seam for cosmetic IAP later (never sold progress)                                                                                                                                                                                                               |
| D3  | Languages                     | **Indonesian** only, in **both directions at launch** (`en-id` and `id-en`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D4  | Content QA                    | Claude drafts from licensed open data and checks each item with recorded evidence; **no native review before release** (amended by D18); the operator triages player reports in the review tool                                                                                                                                                                                                                                                                                                                                                                                                |
| D5  | Audio                         | **Music and sound effects at launch**, from CC0 or CC-BY 4.0 packs; **no spoken language audio** (a possible later update), and the schema keeps an optional `audio` slot for it (operator, 2026-10-03)                                                                                                                                                                                                                                                                                                                                                                                        |
| D6  | Saves                         | Platform-native layers, **plus ongoing sync via device pairing** (QR or 6-digit code, anonymous, no login, **no export-code pasting**)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D7  | Art direction                 | **B, "Batik night"**: a dark modern UI with batik and songket motifs generated as SVG                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D8  | Stack                         | Pure TypeScript core, **Svelte 5** UI, Vite, PWA, Electron + steamworks.js, Capacitor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D9  | Backend                       | **Cloudflare Workers + D1**, matching shyden.co.uk's stack. The web app is a Worker serving static assets (amended 2026-10-01: wrangler 4.145 creates new Pages projects as Workers, and the operator chose Workers static assets over legacy Pages)                                                                                                                                                                                                                                                                                                                                           |
| D10 | Leaderboards                  | **Learning-based** and endless (Mastery reviews, §10.1; amended 2026-10-04 from Words Mastered), per course; extra boards may be added later                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D11 | Ranked participation          | **Mandatory, no opt-out** (operator: no personal information is displayed and players cannot contact each other). See §14 for the pre-launch privacy check                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D12 | Names                         | **Free text**, filtered, **unique**, **romanised characters only**, **one free change**, then each change costs earned in-game currency. Players can **report** names and cheating                                                                                                                                                                                                                                                                                                                                                                                                             |
| D13 | Staff tooling                 | Admin, moderator and support roles with a console, a reports queue and an audit log. **MVP scope**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D14 | Load testing                  | Required before public launch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D15 | Launch order                  | **Web-first**: public web launch at the end of M6, then the Steam and mobile shells                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D16 | Name                          | **Wordfarer** (trademark clearance is a pre-launch task)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D17 | Openness and licences         | **Public, open-source repository** (operator 2026-10-01 01:01 UTC: "all new repos will usually be open-source and public and transparent"). Code **Apache-2.0**. Content is licensed **per item** (01:03 and 02:59 UTC): adapted from CC BY-SA sources → **CC BY-SA 4.0**; original writing and art (story, culture cards, motifs, original examples) → **CC BY-NC-SA 4.0**. The Wordfarer name and logo are **reserved trademarks**, not licensed                                                                                                                                             |
| D18 | Content without native review | Operator 2026-10-02 02:40 UTC: _"there's no native speakers available to review before release. we will need to release without them so do your best to be as accurate as possible. We need to have a mechanism in place that allows people to report errors and submit corrections."_ Every build ships evidence-backed `claude-checked` and `native-reviewed` content; one honest disclosure line; players report mistakes in game; reports queue in D1 and are triaged in the review tool. Design: [`2026-10-02-content-reports-design.md`](2026-10-02-content-reports-design.md) (#51–#54) |

**D9 amended 2026-10-01 (#39):** dev is served at `dev.wordfarer.shyden.co.uk` (web) and `dev-api.wordfarer.shyden.co.uk` (sync) as Workers Custom Domains, behind the shared Shyden Labs dev password, which replaced Cloudflare Access. See §6.7.

## 3. Core loop

Numbers are **starting values for balance testing**, not commitments (operator: "approve, tweak numbers later"). Every one lives in a single `balance.ts` table, and the pacing bots (§12.2) guard the outcomes rather than the constants.

### 3.1 Currencies (at most 3 visible per layer, DN8)

| Currency        | Symbol | Earned by                               | Spent on                                                                                               |
| --------------- | ------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Understanding   | 💬     | Encounters, every second                | Encounters, picking up Words                                                                           |
| Insight         | ✨     | **Only** correct answers to due reviews | Upgrades, journey slots, name changes after the free one                                               |
| Passport Stamps | 🛂     | Set Sail (prestige)                     | Permanent stamp upgrades; each stamp ever earned also gives +10% global production, spent or not (#29) |

### 3.2 Encounters (generators)

Everyday situations in which you hear the language. Examples for `en-id`: Warung chat, Angkot ride, Pasar haggling, Kondangan (wedding), Ojek ride, Becak ride. For `id-en`: Café small talk, Bus journey, Market stall, Pub quiz.

- The cost of the n-th purchase is `c0 · 1.15^n`. Bulk-buy uses the geometric-series closed form.
- Output is `p0 · owned · 2^(milestones reached) · M_words · M_global`. Milestones fall at 10, 25, 50 and 100 owned, then every further 100.
- Each Encounter carries **tags** (`food`, `transport`, `greetings`, `market`, `family`, `numbers`, `ceremony`, …).

### 3.3 Words

- Spending Understanding **picks up** a word or phrase: a collectible card drawn from the current destination's lexicon, in curriculum order (CEFR A1 first).
- Each word carries tags and boosts every Encounter that shares a tag, so words from earlier destinations keep paying on later ones.
- Word bonus: `b_w = rankBonus[rank] · (0.8 + 0.2·R)`, where `R` is FSRS retrievability (0 to 1), taken as the word's mean over the current clock hour ([M1 design §2.2](2026-10-01-m1-core-simulation-design.md)). Per-Encounter `M_words = 1 + Σ b_w` over tagged words.
- `rankBonus`: Heard 0.04 · Recognised 0.06 · Recalled 0.09 · Fluent 0.12 · Mastered 0.16, so Mastered is worth 4× Heard. Amended in M1 #35 (operator, 2026-10-04): the first ladder (0.02 to 0.40, 20×) with a floor at half a rank's bonus left a player who never reviews at 9 of 12 destinations after 12 weeks while the Casual Learner finished in about 25 days, so the Idler could not finish; measured with this ladder and floor, learning still pays 1.7× (Non-learner day 42.0 against Casual day 24.2) and the Idler finishes on day 47.2, measured with #35's final balance (`npm run test:pacing`, 2026-10-04).
- **Floor:** as `R` falls towards 0, a word that is never reviewed decays towards `0.8 · rankBonus[rank]`, four fifths of its current rank's bonus, and never below it (half until #35). Ranks drop only on a wrong answer, never through absence, so idlers lose nothing they earned (DN16).

### 3.4 Review and memory (FSRS)

- Scheduling uses **ts-fsrs** (MIT), FSRS-6 default weights.
- Ranks follow FSRS stability `S`: Heard (new) → Recognised `S ≥ 2 d` → Recalled `S ≥ 7 d` → Fluent `S ≥ 14 d` → **Mastered `S ≥ 30 d`**. Ranks only rise on a correct answer and drop one step on a lapse. Mastery therefore needs reviews spread over real weeks, which is what makes the leaderboard hard to cheat (§10).
- The **review queue shows at most 10 due items**, most-forgotten first, and never shows a backlog count (DN23). Returning after a month gives the same 10.
- Prompt types, unlocked progressively: multiple choice → type the answer (lenient on case, diacritics and whitespace; typo tolerance of Damerau distance 1 for words of 5+ letters) → build the sentence (tile order).
- Each correct due answer gives `1 + 0.5 · rankIndex` Insight, where `rankIndex` runs from Heard 0 to Mastered 4. A wrong answer costs nothing and the word is simply rescheduled (DN16).
- **Practice mode** (any word, any time) is always available, earns **no** currency (DN24, H26), and leaves FSRS memory state and ranks untouched. Only due reviews move a word towards Mastered, so practice cannot be ground into leaderboard score (§10). It is the game's always-on option, one step from every screen (operator, 2026-10-04: _"there should be always something to do"_), so a player who comes back before anything new has arrived still has something to do (DN1).

### 3.5 Clocks

Seconds (Understanding) · minutes to hours (Journeys, early reviews) · days (later reviews, later destinations) · weeks (Mastery, finale).

## 4. Progression and unlocks

**Unfolding rule:** nothing is shown before the player can use it (DN7). Each reveal comes with a one-line narrative beat.

### 4.1 First 30 minutes (`en-id`; `id-en` mirrors it)

1. A blank batik screen showing one phrase, _"Selamat pagi!"_. **Tapping the phrase** earns Understanding (the manual action) and briefly shows its translation (operator, 2026-10-03).
2. At 10 💬 the first Encounter appears (Warung chat).
3. The first word card is picked up (_terima kasih_), and the Words tab appears.
4. The tutorial word is due after **4 minutes**, and Review appears with an explanation.
5. The first Insight is earned and the Upgrades tab appears. A player who never reviews sees it instead with their first Passport Stamp, because stamp upgrades live there too (D1).
6. The first Journey (30-minute tutorial outing) arrives, and the Culture tab appears when it returns.
7. The destination goal becomes visible and Set Sail is previewed.

### 4.2 Journeys and culture cards

- Timed outings of 30 min (tutorial), 2 h, 4 h, 8 h or 24 h. One slot to start; upgradable to 3.
- A Journey returns a **culture card** (festival, food, custom, place or motif): a short fact plus a phrase pack (new pickable words) and a permanent tagged bonus.
- Cards come from the current region's pool, one **drawn uniformly from a seeded stream** when a Journey starts, so a held card can return again; a repeat pays Insight and Understanding instead (operator, 2026-10-03, #30: _"duplicates of cards is ok throughout. so that insights are being delivered and it's more gacha-style"_; this replaced "no duplicates until the set is complete"). Nothing is paid for: a draw costs only a Journey's time. Completing a set (e.g. all five Javanese foods) grants a set bonus.
- **Seasonal festivals:** real-calendar festivals (Lebaran, Nyepi, Imlek, 17 Agustus; for `id-en`: Bonfire Night, Thanksgiving, Anzac Day) have an _in-season_ bonus while live, but their cards are always obtainable (DN15).

### 4.3 Grammar tree

- `en-id`: affixes `ber-`, `me-`, `di-`, `-kan`, `-an`, `pe-…-an`. Unlocking one multiplies every root it attaches to and teaches the derived words (_ajar → belajar, mengajar, pelajar, pelajaran_).
- `id-en`: plural `-s`, past `-ed`, `-ing`, articles, common phrasal verbs.
- Nodes are content (§5), bought with Insight. v1 ships the first 4 nodes per course.

### 4.4 Prestige 1: Set Sail

- A **region** (island or country) has **4 destinations** (towns, cities or landmarks such as Danau Toba). Each destination is one prestige run.
- Set Sail becomes available when the run's goal is met: an Understanding target **and** a count of words picked up. **Reviewing is never required** to progress (D1).
- **Resets:** Encounters and Understanding. **Kept forever:** words and their ranks and memory, culture cards, grammar nodes, stamps and upgrades. A reset never undoes learning (DN3).
- **Gain:** `stamps = floor(k · sqrt(U_run / U_goal))`, with `k` tuned by the pacing bots (sqrt per Pecorella, part III). The screen previews exactly what is kept and what is gained before you confirm (DN3, DN6).
- Within a region, destinations unlock in order. After the finale, any visited destination can be replayed with scaling goals.

### 4.5 v1 destinations (subject to content review)

| Course  | Region 1                                         | Region 2                                               | Region 3                                            |
| ------- | ------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------- |
| `en-id` | **Jawa**: Jakarta, Bandung, Yogyakarta, Surabaya | **Bali**: Denpasar, Ubud, Singaraja, Karangasem        | **Sumatra**: Medan, Danau Toba, Bukittinggi, Padang |
| `id-en` | **England**: London, York, Bath, Manchester      | **USA**: New York, New Orleans, Chicago, San Francisco | **Australia**: Sydney, Melbourne, Brisbane, Perth   |

Each region brings its own motif and palette (§7), its own Encounters, words, culture cards, and **one new mechanic**: region 1 has the core loop and Journeys, region 2 adds automation and grammar, and region 3 adds Immersion and the finale.

### 4.6 Later layers

- **Automation (Pemandu / Guide):** unlocks in region 2 and auto-buys the Encounter with the best payback at a player-set rate. It makes idling viable (DN10).
- **Immersion:** UI labels are mapped to lexicon item IDs. Once that word is **Mastered**, the label shows in the target language, with a tooltip or long-press translation. A setting toggles it. A web page cannot detect a screen reader, so instead every immersed word carries `lang` for its language, and the control's accessible name starts with that visible word and then gives its UI-language meaning (e.g. "Pasar, Market"). Screen readers pronounce it correctly and still announce a meaning the player knows, and WCAG 2.5.3 (Label in Name) holds for voice-control users.
- **Achievements:** about 30 in v1, mirrored to Steam achievements.
- **Post-launch (not v1):** challenges (e.g. _Bahasa-only day_), regional scripts (Aksara Jawa, Balinese) as a letters → syllables → words chain, more regions, extra boards, spoken audio for lexicon items, cosmetic IAP, more courses.

### 4.7 Ending

- **Mudik finale:** completing region 3 unlocks a homecoming story told in cloze form using words the player has picked up. For `en-id` you are invited to a family's Lebaran mudik; for `id-en` you return home for Lebaran and tell the stories of your journey.
- The game then enters **Mastery mode**: an endless mode that replays destinations with scaling goals (DN5).

## 5. Learning content

### 5.1 A course is data, not code

A course is a content pack: `{ id, sourceLang, targetLang, regions[], destinations[], encounters[], lexicon[], grammarNodes[], cultureCards[], motifs[], story[] }`. It is validated by a Zod schema at build time. The engine never branches on a language code.

### 5.2 Lexicon item fields

`id`, `target`, `translations[]`, `pos`, `tags[]`, `example {target, translation}`, `cefr` (A1–B1), `pronunciation` (respelling; required for `id-en` items, e.g. _thought → THAWT_), `audio?` (unused in v1), `source`, `licence`, `review {status, reviewer, reviewedAt, notes}`.

**Review status:** `draft` → `claude-checked` → `native-reviewed` (or `rejected`). Culture cards, motifs, grammar nodes, story lines and UI strings carry the same review block. A `claude-checked` block must hold its evidence (at least two distinct source ids, a back-translation, and a label-audit note for text of 3 words or fewer), and every block keeps a `history` of who changed the item and why (D18, [`2026-10-02-content-reports-design.md`](2026-10-02-content-reports-design.md) §A).

### 5.3 Sources and licences

- Drafted by Claude from openly licensed data, such as frequency lists and Wiktionary/Kaikki extracts (CC BY-SA), plus original writing.
- **Per-item licence (D17):** an item adapted from CC BY-SA material must stay **CC BY-SA 4.0** (ShareAlike forbids relicensing it NonCommercial). Original work (story lines, culture cards, motifs, art, original example sentences) is **CC BY-NC-SA 4.0**. `LICENSE-CONTENT.md` states the rule, and the in-game attribution screen lists both licences and every source.
- The allow-list is exactly `CC-BY-SA-4.0` and `CC-BY-NC-SA-4.0`. CI fails on any item whose `licence` is missing or not on the list, and on any item with a BY-SA `source` whose `licence` is not `CC-BY-SA-4.0`.
- **Audio assets** (music and sound effects) are **CC0-1.0** or **CC-BY-4.0** only. Each file records its source, author and attribution text, and CC-BY files are credited on the attribution screen. ShareAlike and NonCommercial audio is refused (operator, 2026-10-03).
- The game code is **Apache-2.0** (`LICENSE`). The name and logo are reserved (`TRADEMARKS.md`).

### 5.4 Review tool (`tools/review`)

A local web tool for the operator. It shows one item at a time (target, translation, example, pronunciation, culture fact or motif image) with **Approve / Edit / Reject** and keyboard shortcuts (`A`, `E`, `R`, `←`/`→`). Decisions are written back into the content JSON, which goes through a normal branch and PR. A **Reports** view shows each open player report beside its item, with Accept / Edit / Dismiss (D18, [`2026-10-02-content-reports-design.md`](2026-10-02-content-reports-design.md) §C).

### 5.5 Ship gates (CI)

- Every build (web, Steam, mobile) ships `claude-checked` and `native-reviewed` items and **refuses** `draft` and `rejected` ones (D18). No native review is required before release.
- A `claude-checked` item without its full evidence fails CI, so the bar cannot be claimed without the work.
- While any shipped item of a course is below `native-reviewed`, About, Settings and the store listings carry one disclosure line. It is derived from the content, never a stored flag ([`2026-10-02-content-reports-design.md`](2026-10-02-content-reports-design.md) §A).
- Separate guards, each mutation-verified:
  - labels of 3 words or fewer are audited separately from prose, because a bare label gives machine translation no context (a sibling Shyden Labs project shipped Vietnamese _"Tình dục"_, "sexual intercourse", as the column header for "Sex");
  - no UI string in the `id` catalogue is identical to English unless allow-listed;
  - no empty strings;
  - every culture card, motif and story line carries a review block;
  - every lexicon `id` is unique;
  - every Encounter tag has at least one word.

### 5.6 v1 volume

About 150 words and phrases plus about 12 culture cards per region, across 3 regions × 2 courses. That is roughly **900 lexicon items and 72 culture cards** for operator review, plus the UI catalogue and story text.

## 6. Architecture

### 6.1 Monorepo (npm workspaces)

```
packages/core        pure TS simulation: state, balance, advance(), FSRS wrapper, unlock rules, seeded RNG, event log
packages/content     course packs (JSON), Zod schema, build-time validators and ship gates
packages/save        save schema, versioning and migrations, checksum, rotating backups
packages/sync        client for pairing, encrypted sync, ranked upload, grants
packages/bots        pacing bots and the pacing report (§12.2)
packages/ui          Svelte 5 components and screens, i18n catalogues (en, id)
packages/motifs      seeded SVG motif generator, shared by the site and the game (website design §4)
packages/progress    board snapshot -> % complete and ETA, shared by a scripts/board-progress.ts wrapper (ported from repo-template) and the site Worker
apps/site            Astro website with Svelte islands and its Worker (live roadmap, sign-up); serves / (website design §7)
apps/web             Vite PWA shell (Worker static assets), served under /play through the site Worker
apps/desktop         Electron shell + steamworks.js (main process)
apps/mobile          Capacitor shell (iOS, Android)
apps/sync-worker     Cloudflare Worker + D1: devices, pairing, sync, ranked, leaderboards, reports, staff API
apps/console         staff console (Svelte), behind Cloudflare Access
tools/review         local content review UI
```

### 6.2 Core

- No DOM, timers, network or `Date.now()` inside `core`. Time is an argument.
- `advance(state, elapsedMs, events) → state`: closed-form integration between events (purchases, journey returns, automation ticks). The time model (integer-millisecond clock, state anchored at its last event, hourly rate buckets) and the rule that every transcendental function goes through deterministic pure-JS maths are fixed in the [M1 design](2026-10-01-m1-core-simulation-design.md) §2. Advancing 1 h then 1 h must equal advancing 2 h (a property test, §12.1).
- **Offline progress** is the same call with a larger gap, capped at **24 h** (upgradable to 72 h with Insight) and summarised on a "welcome back" card.
- Big numbers sit behind a `Num` type backed by **break_infinity.js**.
- Every player action is a typed, serialisable **event**. The event log drives both the local save and ranked verification (§10).

### 6.3 UI

- Svelte 5 samples the core about 4 times a second while visible; requests no frames while `document.hidden`; never keeps the device awake (DN22).
- Every rate and multiplier on screen opens a breakdown (DN6). Number notation is a setting: `1.2 million` / `1.2M` / `1.2e6` (DN9).
- i18n: every string is a catalogue key from the first commit; UI languages are `en` and `id`.

### 6.4 Platform port

A single `Platform` interface: `storage`, `notifications`, `achievements`, `entitlements`, `share`, `haptics`, `lifecycle`. Each shell implements it.

- **Entitlements** decide which regions a build unlocks: web gets regions 1–2, Steam and mobile get everything. This is the seam for future IAP. A paired save with region-3 progress opened on web keeps that progress and shows _"continue on Steam or mobile"_.
- **Electron:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. steamworks.js runs in the **main process** behind a typed IPC bridge (preload with `contextBridge`).
- **Capacitor:** native local notifications and haptics (Apple guideline 4.2). Saves happen on `pause` and `visibilitychange`.

### 6.5 Saves

- A versioned JSON save with a migration chain, compressed, carrying a SHA-256 checksum.
- **5 rotating backups** in IndexedDB (web) or app storage (Capacitor / Electron), written on visibility change, on `pagehide`, and every 30 s while visible.
- Steam builds also write the latest save to the Steam Cloud directory.
- A corrupt save falls back to the newest backup that passes its checksum and tells the player. It is never silently reset (DN18).

### 6.6 Sync and pairing (D6)

- On first launch the device registers with the Worker and receives `playerId` plus a device token. The token is stored hashed (SHA-256) server-side. The device also generates a 256-bit save key `K` locally.
- **Saves are end-to-end encrypted** (AES-256-GCM under `K`). The Worker stores ciphertext, a monotonically increasing `version`, and the **last 5 versions**.
- **Pair by QR:** the old device shows a QR carrying a one-time pairing token and `K`. The new device scans it, claims the token, and gets its own device token. `K` never reaches the server.
- **Pair by 6-digit code** (for when there is no camera): the old device uploads `K` to the Worker, bound to a code-hash, for at most **10 minutes** and at most **5 claim attempts**, then it is deleted. The server can see `K` during that window; the operator accepted this trade-off when the sync design was approved in brainstorming.
- **Ongoing sync:** push on every local save while online (debounced 30 s) with `If-Match: version`. On conflict, the save with **more progress** (a deterministic progress score) becomes current and the other is kept as a restorable version. A save is never silently dropped.
- **Devices:** list them, rename them, revoke a lost one.
- **"Delete my data"** in Settings removes the player's server rows (saves, ranked data, devices, reports they filed) after confirmation, and the player is told the leaderboard entry goes with it.

### 6.7 Worker and D1 data model (initial)

`players`, `devices`, `saves` (+ `save_versions`, max 5), `pairings`, `ranked_batches`, `ranked_state` (server-replayed checkpoint per player and course), `leaderboard_entries`, `names` (+ `name_holds`), `reports`, `flags`, `grants`, `staff`, `audit_log`, `deletion_requests`. Migrations are SQL files under `apps/sync-worker/migrations`.

**Hostnames and the dev gate (#39).** Production is `wordfarer.shyden.co.uk` (web) and `api.wordfarer.shyden.co.uk` (sync), attached by the production pipeline. Dev is `dev.wordfarer.shyden.co.uk` and `dev-api.wordfarer.shyden.co.uk`, Workers Custom Domains on the `shyden.co.uk` zone, declared in each `wrangler.jsonc`. `packages/lockdown` (ported from shyden.co.uk's `functions/_lib/lockdown.js`, which ShyTalk shares) passes the production hostnames through untouched. On any other host the web Worker serves a blocking `robots.txt` publicly and demands HTTP Basic auth against one shared password (`run_worker_first`, so no asset is served without it), failing closed when the password is unset; the sync API is not password-gated, because native apps cannot answer a browser challenge, and carries `X-Robots-Tag: noindex, nofollow, noarchive` only. The password lives in two places only, both entered by the operator: the Worker secret `DEV_PASSWORD` on `wordfarer-web-dev`, and the GitHub `dev` environment secret `DEV_BASIC_AUTH_PASSWORD`, which the deploy's verify job reads.

**Plan note:** server replay needs more CPU than the Workers Free plan's 10 ms per request, so the **Workers Paid plan** (about $5/month) is a launch prerequisite.

## 7. Art direction: Batik night (D7)

- A dark UI (`--bg` deep indigo) with gold and region accents. Motifs are **generated SVG patterns** (kawung, parang, mega mendung, truntum, songket for `en-id`; tartan, knotwork and quilt-block-style geometry for `id-en`), each with its own palette per region.
- **Cultural safety:** only motifs that are publicly shared decorative traditions. **No Aboriginal dot-painting styles or other restricted or sacred designs.** Every motif carries a review block (§5.2) and is checked like language content.
- Review cards may borrow the postcard framing (a framed card, a stamp).
- All tokens are CSS custom properties. Contrast meets WCAG 2.2 AA, verified on rendered pages (§12.5). There is a `@media print` token block.

## 8. Accessibility and localisation

- WCAG 2.2 AA; full keyboard play; visible focus; screen-reader labels and live-region announcements for purchases and reviews; `prefers-reduced-motion`; text scaling to 200% without loss; no colour-only meaning; a dyslexia-friendly font option (DN9).
- UI languages are `en` and `id`, with machine-seeded translations reviewed like content (§5.5).

## 9. Player-trust guarantees (do-not list → requirements)

Each item below becomes at least one automated test or CI guard.

| DN  | Requirement in Wordfarer                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Every time the game opens there is a decision to make (a buy, a review, a journey, a sail), and coming back 15 minutes later finds one too; asserted by the pacing bots. Practice is always on offer sooner (§3.4) |
| 2   | Every goal names its route past it; nothing is ever sold                                                                                                                                                           |
| 3   | Set Sail previews what is kept and gained; learning is never reset                                                                                                                                                 |
| 4   | Target run lengths are written into the pacing tests (§12.2)                                                                                                                                                       |
| 5   | A real ending (Mudik), Mastery mode, and a post-launch content cadence                                                                                                                                             |
| 6   | Every rate has a multiplier breakdown                                                                                                                                                                              |
| 7   | Unfolding UI: nothing is shown before it can be used                                                                                                                                                               |
| 8   | At most 3 currencies visible per layer                                                                                                                                                                             |
| 9   | Notation setting, contrast, screen-reader support                                                                                                                                                                  |
| 10  | Clicking never beats idling; automation in region 2; no autoclicker detection                                                                                                                                      |
| 11  | No energy or stamina                                                                                                                                                                                               |
| 12  | No sold progress, skips or boosts. Paid builds add **content**, never speed                                                                                                                                        |
| 13  | No expiring content, battle passes or false scarcity                                                                                                                                                               |
| 14  | **No ads of any kind**                                                                                                                                                                                             |
| 15  | Seasonal content is never permanently missable                                                                                                                                                                     |
| 16  | No punishment for missed days. An optional "rhythm" counter pauses rather than resets                                                                                                                              |
| 17  | Notifications are opt-in, at most 1 a day, factual, never guilt-tripping or fake-social                                                                                                                            |
| 18  | Layered saves plus pairing sync                                                                                                                                                                                    |
| 19  | Offline progress is capped, summarised, and tested at 1 h, 1 day and 30 days                                                                                                                                       |
| 20  | No retroactive nerfs to earned progress. Balance changes apply only going forward and are announced                                                                                                                |
| 21  | Clock changes are clamped (§10.3), never punished or banned                                                                                                                                                        |
| 22  | No rendering or polling while hidden; no keep-awake                                                                                                                                                                |
| 23  | Review queue capped at 10, no backlog count                                                                                                                                                                        |
| 24  | Currency comes only from correct due reviews; practice earns nothing                                                                                                                                               |
| 25  | No forced _league_ competition: no relegation or promotion pressure. The ranked board (D11) has no penalties, demotions or rewards that change gameplay                                                            |
| 26  | Numbers carry real-world meaning (words known, places visited)                                                                                                                                                     |

**Privacy at launch:** no analytics and no advertising IDs. Server data is limited to §6.6, §6.7 and §10. Balancing uses the pacing bots instead of player tracking.

## 10. Fair play and leaderboards (D10–D12)

### 10.1 Boards

- Per course: **all-time Mastery reviews**, and **monthly "Mastery reviews this month"** (UTC). The score is endless (operator, 2026-10-04: _"the leaderboards should be endless"_): every correct due review that leaves its word Mastered adds 1, the review that first masters a word included, so the score keeps rising after every word in the course is Mastered. Practice answers and reviews that were not due score nothing (DN24). Each entry also shows the player's Words Mastered. Ties are broken by culture cards collected, then destinations completed.
- Early on, before anyone has mastered a word (Mastered needs FSRS stability of 30 days, so an estimated 4–5 weeks at the earliest; the pacing bots measure the real figure), the tiebreakers order the board. This is expected behaviour and the UI explains it.
- The board system is generic over a `score` definition, so the progress and collection boards can be added later without redesign.
- **Ranked is mandatory** (D11). Every player has a ranked identity and an action log. Offline play is uploaded when the device is next online.

### 10.2 Server verification

- The client uploads its **event log** for ranked (purchases, review answers with response times, journeys, sails) in batches.
- The Worker stamps each batch with **its own clock** and **replays it with the same `@wordfarer/core` code** from the player's last server checkpoint.
- The leaderboard score comes **only** from the server's replay, never from the client's claim.
- Flags are raised when:
  - claimed client time inside a batch exceeds the server-observed window since the previous batch (plus a 5-minute tolerance);
  - an event is impossible under replay (unaffordable purchase, a scored review of an item that wasn't due, non-monotonic sequence). Practice answers (§3.4) are a separate event type that scores nothing, so practising never raises a flag;
  - a client-reported state hash diverges from the replayed state.

### 10.3 Clock handling (DN21)

On the client, a backwards jump advances nothing (the elapsed time is clamped to 0), and a forward jump is capped at the offline cap. Ranked verification uses server time regardless. No player is ever banned for clock changes.

### 10.4 Bot signals

A flag, never automatic punishment, is raised for:

- a median answer latency under 600 ms over 200+ reviews;
- accuracy of 99% or more over 300+ reviews combined with low latency variance;
- reviews at machine-regular intervals.

All thresholds are starting values.

### 10.5 What a flag does

**Shadow exclusion.** The player keeps playing, keeps their save, and still sees their own entry and rank. Other players don't see it. Staff can clear or uphold the flag (§11). Nobody is banned.

### 10.6 Names (D12)

- New players get a unique generated name (e.g. `Traveller-4821` / `Pelancong-4821`).
- **One free change.** After that, each change costs Insight, `costN = 50 · 2^(N-1)` (starting value), which the server verifies from replayed state. There must be **at least 7 days** between changes.
- **Charset:** `^[A-Za-z][A-Za-z0-9 _-]{2,19}$` (3–20 characters, romanised only), with no double spaces and trimmed ends.
- **Unique** across all players on a normalised key: case-folded, with spaces, `_` and `-` removed.
- Filtered against EN and ID blocklists after leetspeak normalisation, plus a reserved list (staff, brand, system words).
- A released name is **held for 30 days**.

### 10.7 Reports

- Every board entry has **Report name** and **Report cheating**.
- Each reporter is limited to 10 reports a day and 1 per target per kind.
- **3 independent name reports auto-hide the name** (it is shown as the generated name) until a moderator reviews it.
- Cheating reports raise the case's priority in the queue.
- Reports filed by players who are themselves shadow-excluded carry no weight.

## 11. Staff console, roles and reports (D13)

- `apps/console` lives on its own subdomain **behind Cloudflare Access** (SSO, MFA enforced).
- The Worker verifies the Access JWT on **every** staff request, the content-reports API included (#52), and maps the identity to a role in `staff`.
- There are no staff functions in the game client.

| Capability                                                                               | Owner / Admin | Moderator | Support        |
| ---------------------------------------------------------------------------------------- | ------------- | --------- | -------------- |
| Add or remove staff, change roles                                                        | ✅            | —         | —              |
| Edit blocklists, reserved names, bot thresholds                                          | ✅            | —         | —              |
| Reports queue: dismiss, hide name + force rename, uphold or clear cheat flag, escalate   | ✅            | ✅        | view only      |
| View ranked logs and verification reports                                                | ✅            | ✅        | —              |
| Look up a player by support code; see devices, sync status, name history, flags          | ✅            | ✅        | ✅             |
| Revoke a device                                                                          | ✅            | —         | ✅             |
| Issue capped grants (free name change; offer to restore one of the last 5 save versions) | ✅            | —         | ✅             |
| Data deletion                                                                            | confirms      | —         | raises request |
| Export audit log                                                                         | ✅            | —         | —              |

- **Nobody can read or edit save contents.** State changes reach a player through **Ed25519-signed grants**, which the client verifies with an embedded public key and applies at its next sync. The client acknowledges each one, and every grant is auditable and reversible.
- **Reports queue:** sorted by priority (automatic flags and cheating reports first). Each case shows the entry, name history, report count and reasons, and the verification report (replay differences, latency stats).
- **Audit log:** every staff action records who, what, when, before/after, and a **required reason**. It is append-only, with no update or delete path, including for the Owner.
- **Monitoring page:** open reports, flags per day, sync and Worker error rates, D1 size, rate-limit hits.
- **Player support:** Settings shows a **support code** and a _Contact support_ button that opens an email to the Shyden Labs support address with the code filled in. There is no in-game messaging.

## 12. Testing and quality

TDD throughout: write the failing test first. Zero warnings policy across lint, `svelte-check`, `tsc` and Prettier. The numbered items below are cited as §12.1–§12.9.

1. **Core:** Vitest unit tests plus **fast-check** property tests:
   - `advance(s, a + b) == advance(advance(s, a), b)` for any state `s` and gaps `a`, `b`;
   - no NaN, negative or Infinity values;
   - saves round-trip;
   - every migration;
   - FSRS rank transitions.

   **Stryker** mutation testing runs on the economy and memory code.

2. **Pacing bots:** deterministic simulated players play the real core: _Idler_ (2 opens a day, never reviews), _Casual Learner_ (3 opens, reviews), _Diligent Learner_ (5 opens). CI asserts:
   - first Set Sail in **30–60 min**;
   - each later destination in **1–3 days**;
   - the v1 ending in **3–5 weeks** of casual play;
   - the Idler can finish;
   - every simulated open, and a return 15 minutes after each one ends, has at least one meaningful decision (DN1).
3. **Content guards:** §5.5, each one mutation-verified with comments left in place (house rule).
4. **Worker:** Vitest with `@cloudflare/vitest-pool-workers` against **real local D1** (Miniflare). Covers:
   - pairing (QR and code, expiry, attempt limits);
   - sync conflicts and version history;
   - ranked replay;
   - every cheat scenario (clock jump, edited save, impossible event, bot timing);
   - names (duplicates, charset, blocklist, cost, cooldown, holds);
   - reports and the auto-hide threshold;
   - role permissions (every endpoint × every role);
   - audit-log immutability;
   - grants and their signatures.
5. **E2E:** Playwright on Chromium, WebKit and Firefox against the built web app and a local Worker. Journeys:
   - the first 30 minutes of unfolding;
   - review;
   - Set Sail;
   - two-device pairing (two browser contexts) and ongoing sync;
   - offline return (`page.clock`);
   - ranked and report;
   - console moderation per role.

   Plus **axe** on every screen, a keyboard-only journey, computed-style contrast checks, and **visual regression** in the pinned Playwright container.

6. **Devices:** a real Android phone and a real iPhone over USB (background/resume accrual, notifications, pairing by QR), and the Electron build with a real Steam client (achievements, Steam Cloud).
7. **Load:** scripted load tests on the **dev** Worker before public launch, e.g. 1,000 concurrent syncs, a ranked-upload burst, and leaderboard reads. Record the limits found.
8. **Budgets:** zero frames and timers while hidden; a bundle-size cap per app; cold start under 2 s on a mid-range phone.
9. **Security:**
   - input validation (Zod) and rate limits on every endpoint;
   - a strict CSP;
   - the Electron security checklist;
   - Access-JWT verification tests;
   - secret scanning with push protection (on since 2026-10-01);
   - Dependabot (npm + github-actions, target `develop`, sub-path groups above `patch-updates`);
   - SHA-pinned actions;
   - deploy secrets only as **environment** secrets, with `dev` restricted to `develop` and `production` to `main` (production also needs the operator's approval). A source-text guard (comments stripped) asserts that every `secrets.*` reference other than `GITHUB_TOKEN` sits in a job that declares an `environment`, which is what makes the agent App's `workflows: write` safe on a public repo whose fork PRs run workflows. Neither the App nor `GITHUB_TOKEN` can list secrets, so whether any repository-level secrets exist is checked by the operator, not by CI;
   - the supply-chain test from `shyden-labs/repo-template`.

## 13. Delivery

- **Flow:** `main` and `develop`, one branch per ticket, PRs into `develop`. Every `develop` merge deploys the **dev** environment (web Worker + sync Worker + D1 dev). Production deploys come from `main` releases.
- **Board:** "Wordfarer Stories", shyden-labs project 4 (`PVT_kwDOEOcG584BlRWb`). Every story is fully specified with acceptance criteria before work starts. It is separate from the ShyTalk, Shyden Site and ShyFerry boards.
- **Milestones (each becomes an epic):**
  - **Website (coming soon), 2026-10-04:** comes first, all the way to production, and game work (M1 onwards) waits for it (operator; [`2026-10-04-website-design.md`](2026-10-04-website-design.md) W11).
  - **M0:** repo, CI, supply-chain guards, dev deploy pipeline.
  - **M1:** core simulation and pacing bots (no UI).
  - **M2:** content schema, review tool, and region-1 content for both courses.
  - **M3:** web vertical slice (first 30 minutes, region 1, PWA, accessibility).
  - **M4:** saves, Worker, and pairing sync.
  - **M5:** ranked, anti-cheat, names, reports, and staff console.
  - **M6:** regions 2–3, grammar, journeys, immersion, automation, achievements, and finale.
    - **Web launch gate:** privacy notice, privacy and OSA checks (§14), load tests, trademark clearance, content reports working end to end with the disclosure line in place (D18, #52–#54), then **public web launch** (D15).
  - **M7:** Electron/Steam and Capacitor shells on real devices.
  - **M8:** store submissions (Steam, App Store, Google Play), store privacy labels, age ratings.

## 14. Compliance and pre-launch checks (launch blockers for web unless marked)

The numbered items are cited as §14.1–§14.6.

1. **UK GDPR:**
   - privacy notice;
   - record of processing;
   - legitimate-interests assessment for anti-cheat logging;
   - DPIA screening.
   - Ranked is mandatory by operator decision (D11). Before launch, a privacy professional confirms the operator's position. The open questions are whether pseudonymous ranked logs and free-text names, which could include a child's real name, bring the game into scope of the ICO Children's Code, and what that would require.
2. **UK Online Safety Act:** confirm whether user-chosen display names make Wordfarer a user-to-user service. If so, complete the illegal-content risk assessment and children's access assessment, and document the reporting mechanism (§10.7) and moderation (§11).
3. **Trademark clearance** for "Wordfarer" (UK IPO, EUIPO, USPTO) before any store listing or domain purchase.
4. **Licences (D17):** attribution screen listing CC BY-SA 4.0 and CC BY-NC-SA 4.0 items and their sources; `LICENSE`, `LICENSE-CONTENT.md` and `TRADEMARKS.md` present; the per-item licence check green.
5. **Infrastructure:** Workers Paid plan, Cloudflare Access configured, a support mailbox, custom domain (operator decision).
6. **Stores (M8):** Apple guideline 4.2 native features, App Privacy labels, Google Data safety form, IARC age rating, Steamworks setup.

## 15. Risks

| Risk                                                                                                                 | Mitigation                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content errors reach players without native review (D18)                                                             | Evidence-gated `claude-checked`, the separate label audit, in-game reports triaged from a daily count, corrections in the next content update                                                              |
| Economy pacing misses targets                                                                                        | Balance values in one table; pacing bots in CI; numbers explicitly tunable                                                                                                                                 |
| Server replay CPU or cost                                                                                            | Incremental replay from checkpoints; Workers Paid plan; load tests before launch                                                                                                                           |
| Pairing via 6-digit code exposes `K` to the server for ≤10 min                                                       | QR preferred and shown first; strict TTL and attempt limits; key deleted on claim or expiry                                                                                                                |
| iOS rejects a "web wrapper"                                                                                          | Native notifications and haptics, offline play, platform-native feel (M7)                                                                                                                                  |
| A culturally inappropriate motif or translation ships                                                                | Review status on every item and motif; CI ship gates; short-label audit                                                                                                                                    |
| Mandatory ranked conflicts with children's privacy rules                                                             | §14.1 professional check before public launch                                                                                                                                                              |
| The public repo (D17) shows the name before trademark clearance, and the Apache-2.0 code can be cloned and reskinned | Clearance search early, not only at the M6 gate (§14.3); the name and logo are reserved (`TRADEMARKS.md`); original content is NonCommercial, so a clone has to bring its own story, culture cards and art |

## 16. Glossary

**Encounter**: a generator. **Destination**: one prestige run. **Region**: a group of 4 destinations (an island or a country). **Set Sail**: prestige 1. **Pemandu**: the automation guide. **Shadow exclusion**: hidden from others on boards while staying visible to oneself. **Grant**: a signed server instruction that the client applies to its own encrypted save.

## 17. Review log

| Pass | Date       | Findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Status   |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1    | 2026-10-01 | Mechanical: D1–D17 each in §2; DN1–DN26 each mapped once in §9 (26 rows, 26 distinct); every cited DN, H (H1, H26, H28) and research section (§3, §7b, 26-item list) exists; no placeholders. Read-through found 9: (1) §3.3 floor named `rankBonus[Heard]` where the formula gives `0.5 · rankBonus[rank]`; (2) §4.4 "towns or cities" excluded Danau Toba; (3) §10.1 "about 5 weeks" stated as fact, now an estimate the bots measure; (4) §4.6 relied on detecting screen readers, which the web cannot do, now `lang` plus accessible names; (5) §6.6 cited "§4 approval", a brainstorm section, not this spec's §4; (6, 7) §12 and §14 items were cited as §12.n and §14.n with no numbering note; (8) §13 board was "a new project", now project 4 by node id; (9) §12.9 lacked the environment-only secrets rule behind the App's `workflows` grant, with an enforceable guard | fixed    |
| 2    | 2026-10-01 | Mechanical checks re-run, unchanged. Full read found 5: (1) pass 1's Immersion fix gave the control an accessible name without the visible word, failing WCAG 2.5.3 Label in Name; now the name starts with the visible word; (2) §10.3 clamped a backwards jump only beyond the offline cap; now any backwards jump advances nothing; (3) §12.1's property omitted the state argument; (4) §5.5 cited "the vi lesson" with no context for a public reader; (5) §12.9 omitted push protection                                                                                                                                                                                                                                                                                                                                                                                         | fixed    |
| 3    | 2026-10-01 | Mechanical checks re-run, unchanged; the Pecorella citation in §4.4 exists in the research (line 56). Full read found 3: (1) the spec and three other docs failed Prettier (ticket #2 AC5); formatted, with word counts identical before and after; (2) Prettier's reflow folded the §12.1 Stryker sentence into the last bullet; (3) §10.2 flagged any review of an item that was not due, which every Practice-mode answer (§3.4) would trip; practice is now a separate event type that scores nothing                                                                                                                                                                                                                                                                                                                                                                             | fixed    |
| 4    | 2026-10-01 | Mechanical checks re-run, unchanged. Full read found 2: (1) §3.4 Practice mode earned no currency but did not say it leaves FSRS state and ranks alone, so practice could have been ground into Words Mastered; now explicit; (2) `rankIndex` in the Insight formula was undefined                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | fixed    |
| 5    | 2026-10-01 | Mechanical checks re-run, unchanged. Full read found 1: §4.1 revealed the Upgrades tab only on the first Insight, which an Idler never earns, hiding the stamp upgrades from players who never review (D1); it now also appears with the first Passport Stamp                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | fixed    |
| 6    | 2026-10-01 | Mechanical checks re-run, unchanged. Full read found 1: §15 did not carry D17's consequences (the name is public before trademark clearance; the permissive code can be cloned); added with mitigations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | fixed    |
| 7    | 2026-10-01 | Mechanical checks re-run (D1–D17; DN1–DN26 once each; DN ≤ 26, H ≤ 28; every § reference resolves; no placeholders; Prettier clean). Full read of all sections: **no findings**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | approved |
| 8    | 2026-10-03 | Operator amendment, asked interactively: D5 becomes music and sound effects from CC0 or CC-BY 4.0 packs, with no spoken language audio; the first screen's manual button is removed, and tapping the phrase is the manual action (§4.1); audio licences join §5.3; §11 names the content-reports API as behind Access.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Consistency fix made while writing:** the §5 approval text said "each later island in 1–3 days" and "the v1 ending in 3–5 weeks". With 3 regions, those two targets contradict each other. Resolved by making each region **4 destinations** (prestige runs), with the 1–3 day target applying per **destination** (§4.4, §12.2). **Confirmed by Shyden 2026-10-01 00:55 UTC** (AskUserQuestion: "Confirm 4 per region").
