# Trademark clearance search: "Wordfarer"

Story #157 (spec §14.3, §15, D16). The searches ran on 2026-10-04 between 23:05 and 23:17 UTC. An agent drove each register's own public search, and the operator made the decision. **This is a record of what the searches found. It is not legal advice.**

## Summary

- **Registers: clear.** No filed or registered mark reads WORDFARER, or a close spelling of it, at the USPTO, the EUIPO or the UK IPO. A TMview search across every office it covers also found none. What the registers do show is a crowded field of `-FARER` marks (SPIRITFARER, MINDFARER, WAYFARER and others) side by side in classes 9 and 41.
- **Use without registration: not clear.** Three businesses were already using the exact name before we chose it (2026-10-01), and two of them are games. In the UK (passing off) and the US (common-law use), a name can carry rights through use alone.
- **Decision (operator, 2026-10-04 23:18 UTC): rename.** The work is filed as #355 (choose and clear a new name), #356 (rename the code and documents) and #357 (rename the infrastructure). No store listing has been made and no domain bought.

## Method

Every search that came back empty was paired with a **positive control**: a query for a mark known to exist, sent the same way in the same batch. A source whose control failed is recorded as unread and is not counted as a clear result.

| Source                        | How it was read                                                                                                                                                                      | Control                                                                       | Control result                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| USPTO (direct)                | The search site's own API, `POST https://tmsearch.uspto.gov/prod-stage-v1-0-0/tmsearch`, called from the page with the query body the site itself sends (`WM` is the wordmark field) | `wordle`, the site's basic query                                              | 19 records                                       |
| EUIPO and UK IPO (via TMview) | TMview's API, `POST https://www.tmdn.org/tmview/api/search/results`, with `offices` set to `["EM","GB"]` or `["EM","GB","US"]`. TMview is run by the EUIPO and fed by each office    | `wordle` with `offices: ["EM","GB","US"]`                                     | 56 records (113 with no office filter)           |
| TMview, worldwide             | The same API with no office filter                                                                                                                                                   | `wordle`, no filter                                                           | 113 records                                      |
| TMview, Indonesia             | The same API with `offices: ["ID"]`                                                                                                                                                  | `wordle`, `spotify`                                                           | **0 and 0: control failed, unread**              |
| UK IPO (direct)               | `https://trademarks.ipo.gov.uk/ipo-tmtext`                                                                                                                                           | none possible                                                                 | **HTTP 403 bot check: unread**                   |
| EUIPO eSearch (direct)        | `https://euipo.europa.eu/eSearch/#basic/1+1+1+1/100+100+100+100/<term>`                                                                                                              | `spiritfarer` (EU mark 018094711)                                             | **"No results": control failed, unread**         |
| Apple App Store               | iTunes Search API, `https://itunes.apple.com/search?term=<t>&entity=<software,macSoftware>&country=<gb,us,id>&limit=200`                                                             | `spiritfarer`                                                                 | "Spiritfarer: Netflix Edition" in gb, us and id  |
| Google Play                   | `https://play.google.com/store/search?q=<t>&c=apps` (GB and US), with the result links read from the page                                                                            | `spiritfarer`                                                                 | `com.netflix.NGP.Spiritfarer` first              |
| itch.io                       | `https://itch.io/search?q=<t>`                                                                                                                                                       | `spiritfarer`                                                                 | "Spiritfarer®: Farewell Edition"                 |
| Steam                         | `https://store.steampowered.com/api/storesearch/`                                                                                                                                    | n/a                                                                           | **Connection reset on this network: unread**     |
| Web                           | A web search for `"Wordfarer"`, `Wordfarer game`, `"Wordfarer" Steam`                                                                                                                | n/a (results returned)                                                        | n/a                                              |
| Domains                       | RDAP through `https://rdap.org/domain/<name>`                                                                                                                                        | `example.com`, `bbc.co.uk`, `nic.game`, `pandi.id`, `google.net`, `google.io` | All 200 except `google.io` (404): **.io unread** |

### Query strings

- **USPTO.** These terms were each sent through the site's basic query (`match_phrase` on `WM` with boost 5, `match` on `WM` with boost 2, `match_phrase` on `PM` with boost 2): `wordfarer`, `wordfarers`, `wordfare`, `wordfair`, `wordfaring`, `wordfarm`. The two-word terms `word farer`, `word fairer` and `word fare` were sent as `match_phrase` alone, because the basic query's `match` returns every mark containing "word" (79,267 records). There were also `fuzzy` on `WM` for `wordfarer` (fuzziness 2, and `AUTO`), `wildcard` on `WM` for `word*far*`, for `*farer` and for `*farer*` with `*word*`, and `match` on `WM` for `wayfarer` and for `farer`.
- **TMview.** `basicSearch` was `wordfarer` with `criteria` `C` (contains), `E` (exact) and `F` (fuzzy), sent to `["EM","GB","US"]` and worldwide. `wordfare`, `wordfair`, `word farer`, `wordfaring`, `wordfarm`, `wayfarer` and `farer` were sent with `C` to `["EM","GB"]`. Results were fetched 100 a page until each total was reached. Pagination was checked with `word` (GB), which fetched 1,000 of 1,857 at the 10-page cap.
- **Stores and web.** `wordfarer`, `word farer`, `wordfare`, `wordfair` and `wordfarers` on the App Store. `wordfarer` and `Wordfarer Clue Word Puzzle` on Google Play. `wordfarer` on itch.io.

## Register results

| Query (office)                                                                 | Total  | Exact or close-spelling WORDFARER      |
| ------------------------------------------------------------------------------ | ------ | -------------------------------------- |
| USPTO `wordfarer` (basic, exact)                                               | 0      | none                                   |
| USPTO `wordfarers`, `wordfare`, `wordfair`, `wordfaring`, `wordfarm`           | 0 each | none                                   |
| USPTO phrase `word farer`, `word fairer`, `word fare`                          | 0 each | none                                   |
| USPTO fuzzy `wordfarer` (distance 2)                                           | 19     | none (see WOODFARER, WORDWARE below)   |
| USPTO wildcard `word*far*`                                                     | 1      | none (WORDSAFARI, dead, class 16)      |
| TMview `wordfarer`, contains and exact (EM, GB, US)                            | 0      | none                                   |
| TMview `wordfarer`, contains (worldwide)                                       | 0      | none                                   |
| TMview `wordfarer`, fuzzy (EM, GB, US)                                         | 1      | none (WOODFARER, US, ended)            |
| TMview `wordfare`, `wordfair`, `word farer`, `wordfaring`, `wordfarm` (EM, GB) | 0 each | none                                   |
| TMview `farer`, contains (EM, GB)                                              | 167    | none; 44 live in classes 9, 28, 41, 42 |
| TMview `wayfarer`, contains (EM, GB)                                           | 61     | none; 15 live in classes 9, 28, 41, 42 |

### Near marks

These are the closest live marks in the classes that matter (9 software, 28 games, 41 entertainment and education, 42 software services). The risk notes are an agent's reading, not legal advice.

| Mark                  | Office and number                                          | Owner                       | Classes           | Status                                     | Risk note                                                                                                   |
| --------------------- | ---------------------------------------------------------- | --------------------------- | ----------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| SPIRITFARER           | EM 018094711; GB UK00918094711; US 88497836 (reg. 7117484) | 9300-2665 Québec Inc.       | 9, 16, 25, 28, 41 | Registered                                 | A video game with a `-FARER` name in our classes. Shares only the suffix; the first word differs.           |
| MINDFARER             | GB UK00004274726                                           | Arcane Arts Limited         | 41                | Registered (filed 2025-10-08)              | `-FARER` in class 41. Differs in the first word.                                                            |
| DREAMFARER            | GB UK00004059287                                           | Tracy Calow-Ball            | 16, 41            | Registered                                 | As above.                                                                                                   |
| SEAFARER THE SHIP SIM | EM 019306987                                               | Astragon Entertainment GmbH | 9, 28, 41         | Registered (filed 2026-01-22)              | A game; "seafarer" is a dictionary word.                                                                    |
| WAYFARER              | GB UK00003825045; EM 018753148; US 97536297                | Niantic, Inc.               | 9, 38, 42         | Registered (GB, EM); live application (US) | A games company in class 9. WAYFARER and WORDFARER differ in their first syllable and share their last two. |
| NOQ THE WAYFARER      | US 79361530 (reg. 7362266)                                 | Bank of Innovation, Inc.    | 9, 41, 42         | Registered                                 | Game software; WAYFARER with a prefix.                                                                      |
| WOOCHI THE WAYFARER   | US 99327067                                                | NEXON Games Co., Ltd.       | 9, 38, 41         | Live application                           | Game software; WAYFARER with a prefix.                                                                      |
| WAYFARER GAMES        | US 98428799 (reg. 8034083)                                 | Wayfarer Games LLC          | 28                | Registered                                 | Board games.                                                                                                |
| WORDWARE              | US 98764235 (reg. 8245847)                                 | HeyDaily Inc.               | 9, 42             | Registered                                 | Shares "WORD" and a two-syllable shape; a software mark.                                                    |
| WOODFARER             | US 88555142                                                | Woodies International, Ltd  | 9                 | Dead                                       | TMview's only fuzzy match to WORDFARER (EM, GB, US), and the closest of the USPTO's 19. Not live.           |
| WONDERFARER           | US 99705181                                                | Atlas Obscura, Inc.         | 9, 39             | Live application                           | Travel software.                                                                                            |

The registers show many `-FARER` marks living side by side in classes 9 and 41. That suggests the suffix alone is not what tells these marks apart.

## Use without registration

| Where                        | Result                                                                                                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple App Store (gb, us, id) | **"Wordfarer: Clue Word Puzzle"**, found in all three stores (details below). No other close name.                                                                                                                               |
| Google Play (GB, US)         | No Wordfarer. The closest is "Sayfarer \| Travel Phrases" (Ripper Apps), a phrasebook app. Creative Soft's game was not found on Play under its subtitle or its iOS bundle id.                                                   |
| itch.io                      | No Wordfarer. The closest are Woodfarer, Warpfarer and Wordforger.                                                                                                                                                               |
| Web search                   | Only this project's own repository and issues. The App Store game did not appear, so a web search alone would have missed it.                                                                                                    |
| Steam                        | **Unread**: this network resets connections to store.steampowered.com (curl and the browser alike). The web search found no Steam page for the name.                                                                             |
| Domains                      | **wordfarer.com**: registered 2024-11-03, Wordfarer Magazine. **wordfarer.app**: registered 2026-08-06, Jolly Good Apps. Not registered: wordfarer.co.uk, wordfarer.game, wordfarer.net, wordfarer.id. **wordfarer.io: unread.** |

### Earlier users of the exact name

| User                                | What                                                                                                                                                                                                                                                                                                                                               | Since                                                                                      | Where                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Creative Soft LLC (mobiloids.com)   | "Wordfarer: Clue Word Puzzle", a free iOS word-clue puzzle game. Genres Games, Trivia, Word; rated 4+; English; version 1.1; 0 ratings. App id 6464591200, bundle `com.mobiloids.word.quest.genius.ios`.                                                                                                                                           | Released 2026-08-27                                                                        | App Store gb, us and id (`https://apps.apple.com/gb/app/wordfarer-clue-word-puzzle/id6464591200`) |
| Jolly Good Apps (jollygoodapps.com) | "Wordfarer — Dynamic Text Adventures", an AI-generated interactive text adventure, "In development for Android & iOS", with a launch mailing list. Listed as "Coming Soon" beside the studio's live games (Kalabux, Swipeloot). No company or country is named on its About, Contact or Privacy pages; the site uses British spelling ("colours"). | wordfarer.app registered 2026-08-06                                                        | `https://wordfarer.app`                                                                           |
| Wordfarer Magazine                  | A print magazine for children aged 7 to 12 (stories, puzzles, real-world topics), plus digital worksheets. Prices are in ₹ (India).                                                                                                                                                                                                                | wordfarer.com registered 2024-11-03; a 200 snapshot from 2025-01-21 in the Wayback Machine | `http://www.wordfarer.com`                                                                        |

### Risk notes

- Two of the three are **games, in our classes, under the identical name**, and both started before our choice. Neither appears to hold a filed mark, and the iOS game has no ratings yet, so the goodwill behind any use-based claim may be small today. Either business can still file at any time, and an earlier user can oppose a later filing.
- Whatever the legal position, players searching the stores for "Wordfarer" would find another game, and both the .com and the .app are taken.
- `TRADEMARKS.md` claims "Wordfarer" as a Shyden Labs trademark. #356 replaces it with the new name.

## Not covered

- **Indonesia** (DJKI, through PDKI), one of the game's two markets. TMview's control returned 0 for Indonesia, so it does not carry that register. #355 carries an operator step for it.
- **Steam**, which this network cannot reach (#355, operator step).
- **The UK IPO's and the EUIPO's own sites**, which refused or could not be read (a bot check, and a failed control). Both offices' data was read through TMview, which the EUIPO runs.
- Unregistered use in any other country beyond what the stores and the web search show.

## Recommendation and decision

**Recommendation: rename, before the website (#331) and before any store or domain step.** About 14% of the work is built (by effort, from the board on 2026-10-04), so a rename costs least now: 76 tracked files and the dev infrastructure, with no public site, store page or domain yet.

**Operator decision, 2026-10-04 23:18 UTC: "Rename now"**, chosen over "get professional advice" and "keep Wordfarer and file our own marks". Next: #355, then #356 and #357. Under §14.3, no store listing or domain purchase happens until #355 has a cleared name.
