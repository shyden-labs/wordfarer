# Content without native review, and player reports: design (D18)

- **Status:** sections A–D approved by the operator (Shyden) on 2026-10-02, one question per section; reviewed to zero findings (§F) and self-approved under the house rule.
- **Stories:** #51 (gates and evidence, M2), #52 (report endpoint and D1 queue, M2), #53 (review-tool triage and the daily count, M2), #54 (in-game reporting and the disclosure line, M3).
- **Parent spec:** [`2026-10-01-yawelo-idle-design.md`](2026-10-01-yawelo-idle-design.md), amended by D18.
- **Precedent:** shyden.co.uk's translation reports (its #97, with #349's waiting count) and ShyTalk's in-app report and admin review queue.

## 1. Intent

The operator, 2026-10-02 02:40 UTC: _"there's no native speakers available to review before release. we will need to release without them so do your best to be as accurate as possible. We need to have a mechanism in place that allows people to report errors and submit corrections."_

The parent spec made `native-reviewed` a hard gate for Steam, mobile and the public web launch (D4, §5.5, §13). With no reviewer, that gate can never open. This design replaces it with two things:

1. a `claude-checked` bar that has to be **evidenced** to be claimed; and
2. a way for the people best placed to spot a mistake, the players, to report it and suggest a correction from where they saw it.

**Success:** content ships on every platform; a player can report a mistake in under a minute without losing their place or their text; the operator sees each report beside its item and can turn an accepted correction into a PR in a few keystrokes; and no personal data is stored.

## 2. Decisions

All four were asked as separate questions on 2026-10-02 and answered with the recommended option.

| Question         | Decision                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| What may ship    | Evidence-backed `claude-checked` and `native-reviewed`, on every build. `draft` and `rejected` never ship.    |
| Disclosure       | One honest line in About, Settings and store listings, plus a Report action on every item. No per-item badge. |
| Where reports go | A private D1 queue on the sync Worker, triaged in the local review tool. No public issue per report.          |
| When             | Endpoint, queue and triage in M2; the in-game Report action and the disclosure line in M3.                    |

## A. Content status and ship gates (#51)

1. **Statuses** stay `draft` → `claude-checked` → `native-reviewed`, or `rejected` (parent §5.2).
2. **Evidence.** A `claude-checked` review block must hold:
   - `sources`: at least two **distinct** source ids, each naming a dictionary, corpus or reference that was consulted (for checking only: content is never copied from a source whose licence is outside the allow-list in parent §5.3);
   - `backTranslation`: the item translated back by an independent pass, non-empty;
   - `labelAudit`: when the item's text is 3 words or fewer, a non-empty note on the sense checked, because a bare label gives a translator no context (the parent spec's _"Tình dục"_ case).

   The content schema (Zod) refuses a `claude-checked` block missing any of these, naming the item and the field.

3. **History.** Every review block keeps `history: {at, by, change}[]`, where `at` is an ISO-8601 UTC timestamp and `by` is `claude`, `operator` or `player-report:<id>`. The schema refuses any other `by`.
4. **Ship gate.** Every build target refuses an item whose status is `draft` or `rejected`, and ships `claude-checked` and `native-reviewed`. The parent spec's "beta" marker and its native-review web launch gate are removed.
5. **Disclosure.** `needsDisclosure(course)` is true while **any** shipped item of the course is below `native-reviewed`. It is computed from the content and never stored, so the line disappears by itself if a course is ever fully reviewed. English copy, for approval with the rest of M3's copy: _"Course content is checked against dictionaries but not yet by native speakers. Spot a mistake? Choose Report a mistake from its menu."_ The wording names no gesture, because the same line ships on web, Steam and mobile.
6. **D4** now reads: Claude drafts and checks with recorded evidence; the operator triages player reports in the review tool.

## B. The report endpoint and data (#52, sync Worker + D1)

### B.1 `POST /v1/content-reports`

Strict Zod body (unknown keys refused):

| Field            | Rule                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `course`         | `en-id` or `id-en`                                                                                                                                                       |
| `kind`           | `lexicon`, `culture`, `grammar`, `story`, `motif` or `ui`. An example sentence is part of its lexicon item, so it is reported as `lexicon` with `problem: wrong-example` |
| `itemId`         | for `ui`, a key of the UI catalogue for `appVersion`; otherwise an item id in that course's content for `contentVersion`. The Worker bundles both id lists per version   |
| `problem`        | `wrong-translation`, `wrong-example`, `spelling`, `pronunciation`, `offensive` or `other`                                                                                |
| `suggestion`     | optional, at most 1,000 characters, counted in Unicode code points                                                                                                       |
| `note`           | optional, at most 1,000 characters, counted in Unicode code points                                                                                                       |
| `appVersion`     | the client build                                                                                                                                                         |
| `contentVersion` | the content build the player saw                                                                                                                                         |
| `installId`      | the anonymous random install id                                                                                                                                          |
| `website`        | honeypot: must be empty                                                                                                                                                  |

Checked in this order: body shape (422), honeypot (201 and nothing written, so a bot learns nothing), item exists (422), daily limit (429), one open report per install per item (409), then insert (201 with the report id).

### B.2 Limits

- 10 reports per install per UTC day (parent §10.7's figure), and one **open** report per install per item.
- The per-item rule is a `UNIQUE` index, so it holds under concurrency by construction. The daily count lives in its own table, because resolving a report deletes its row and a count of stored rows would let a quickly triaged install send more than 10 a day. It is raised by one conditional upsert that refuses at 10. The upsert and the insert run in one D1 batch, which Cloudflare documents as a transaction, so a report refused as a duplicate (409) should not use up the day's quota. Both the rollback and the limit under concurrency are measured in #52, not assumed (see Assumptions).
- A Cloudflare rate-limit rule on the path, as shyden.co.uk #97 uses, for traffic that rotates install ids.

### B.3 Data

```sql
CREATE TABLE content_reports (
  id              TEXT PRIMARY KEY,
  created_at      INTEGER NOT NULL,
  course          TEXT NOT NULL,
  kind            TEXT NOT NULL,
  item_id         TEXT NOT NULL,
  problem         TEXT NOT NULL,
  suggestion      TEXT,
  note            TEXT,
  app_version     TEXT NOT NULL,
  content_version TEXT NOT NULL,
  install_id      TEXT NOT NULL
);
CREATE INDEX content_reports_created ON content_reports (created_at);
CREATE UNIQUE INDEX content_reports_one_per_item ON content_reports (install_id, course, kind, item_id);

CREATE TABLE content_report_quota (
  install_id TEXT NOT NULL,
  utc_day    TEXT NOT NULL,
  n          INTEGER NOT NULL,
  PRIMARY KEY (install_id, utc_day)
);
```

- **No personal data:** no IP, user agent, name or email is stored. The form asks players not to type contact details into the note.
- **Retention:** _kept until actioned_. Resolving a report deletes its row; the outcome lives on in the item's `history` in git.
- **Delete my data:** the install id is the one M4's device pairing adopts, so "Delete my data" (parent §6.6) deletes the install's reports and quota rows. Each stored report deletes that install's quota rows for earlier days in the same D1 batch, so no quota row outlives the day after its last use.

### B.4 Operator API

- `GET /v1/staff/content-reports`: open reports, oldest first, grouped by `(course, kind, itemId)`.
- `POST /v1/staff/content-reports/:id/resolve` with `{outcome: 'accepted'|'dismissed', reason}`: deletes the row.
- Both sit behind Cloudflare Access, as every staff route does (parent §11; operator, 2026-10-03). The Worker verifies the Access JWT (signature against the team's JWKS, `aud`, expiry) on every request. Without a valid one: 401 and nothing changes. A person reaches them through Access SSO; a machine client (the daily count) uses an Access service token.
- `GET /v1/content-reports/health`: 200 when D1 answers.

## C. Triage and corrections (#53, review tool)

1. The review tool (parent §5.4) gains a **Reports** view: open reports oldest first, grouped by item, each shown beside the item as players see it, with the suggestion as a diff against the current text.
2. **Accept** writes the suggestion into the content JSON, appends `{by: 'player-report:<id>', change}` to the item's history, and resolves the report as accepted. **Edit** opens the item editor with the report alongside. **Dismiss** needs a reason.
3. Changes land in the working tree only, for a normal branch and PR, and ship in the next content update. The tool never pushes.
4. An accepted correction does **not** make an item `native-reviewed`.
5. **Daily count**, as shyden.co.uk #349: a scheduled workflow reads the open count through the staff API with an Access service token and, when it is above 0, posts one comment on a single open issue assigned to the operator (`1 content report is waiting.` or `<n> content reports are waiting.`), at most once per UTC day. The comment carries the count only, because the repository is public. The workflow reads the operator token from a branch-restricted GitHub environment, never a repository secret, because a public repository runs workflows for fork pull requests.

## D. In-game reporting (#54, M3)

1. **Entry points:** every word card, review card, example sentence, culture card and grammar note has **Report a mistake** in its menu. Settings has **Report a text problem**, with a type-ahead of the current screen's UI strings (shyden.co.uk's pattern).
2. **Form:** what's wrong (radio buttons), an optional suggestion, an optional note with the hint _"Please don't include names or contact details."_, in the player's UI language. Its labels go through the separate short-label audit.
3. **Offline-first:** a report made offline is queued locally, the player is told it is queued, and it is sent exactly once on reconnect, including after a reload mid-send.
4. **Feedback:** sent, queued, limit reached (429) and already reported (409) each have their own message. A failure never loses the typed text.
5. **Accessibility:** keyboard-only and screen-reader use; focus moves to the status message; axe clean.
6. **Disclosure line:** in About and Settings while `needsDisclosure(course)` is true, and in the store-listing text kept in the repo.

## E. Testing

- **Unit and property (Vitest + fast-check):** the evidence schema, history `by`, the ship gate per target, `needsDisclosure` over generated courses, and the request schema at its boundaries (1,000 code points accepted, 1,001 refused, with astral characters in the fixture).
- **Worker (workerd + local D1, the existing harness, no mocks):** every response code in B.1's order; the daily and per-item limits at the 10th and 11th report; a refused duplicate leaves the quota unchanged; 20 concurrent reports from one install store exactly 10; the stored row holds no personal data; the operator API's 401; delete-my-data.
- **Review tool:** the Reports view and its actions against a local Worker and D1, keyboard-only.
- **Playwright (M3, Chromium, Firefox, WebKit):** report online; report offline then reconnect; the 11th report in a day; a UI-string report. Each reads the report back through the operator API.
- **Mutations:** every guard above mutation-verified, with predictions written first.

## Assumptions, to be measured in the stories' plans

- Which second source each course uses for evidence (open dictionaries and wordnets are candidates; each one's licence is read before it is named here).
- That the free-plan Cloudflare rate-limit rule applies to a Worker on a custom domain (`dev-api.yawelo-idle.shyden.co.uk`) as it does to shyden.co.uk's Pages Function.
- That the conditional upsert holds the daily limit under concurrency (measured in #52 with the 20-at-once test).
- That a D1 batch rolls back as a whole when its insert hits the `UNIQUE` index (Cloudflare documents batches as transactions; #52 measures it with a duplicate that must leave the quota unchanged).

## F. Review log

Each pass runs the mechanical checks (every story number and parent-spec section named here exists; every decision in §2 appears in a section; the parent spec's amended lines agree with this document; no unmeasured figure is stated as fact) and then reads the whole document.

- **Pass 1** (2026-10-02): five findings, all fixed. (1) "Delete my data" cited parent §6; it is §6.6. (2) The disclosure copy said "Tap Report", wrong on web and Steam; it now names no gesture. (3) This log held a placeholder. (4) The rate-limit assumption named the Worker unclearly; it now names the dev host. (5) §C did not say where the daily-count workflow keeps the operator token; a public repository needs a branch-restricted environment.
- **Pass 2** (2026-10-02): seven findings, all fixed. (1) A `sentence` kind clashed with the data model: an example sentence lives inside its lexicon item and has no id; it is reported as `lexicon` + `wrong-example`. (2) A `ui` report's id was checked against course content; UI keys live in the UI catalogue, per app version. (3) The daily limit counted stored rows, but resolving deletes rows, so a quickly triaged install could exceed 10 a day; a quota table now holds the count. (4) The per-item rule is now a `UNIQUE` index. (5) B.2 stated as fact an atomicity the assumptions list called unmeasured. (6) "1,000 characters" did not say what a character is; it is a code point. (7) `history.at` had no format; it is ISO-8601 UTC.
- **Pass 3** (2026-10-02): mechanical checks clean (#7, #17, #51–#54 and parent §5.2–§5.5, §6.6, §10.7, §11, §13 exist; all four decisions appear; the parent's amended D4, D18, §5.2, §5.4, §5.5, §13 and §15 lines and `CLAUDE.md` agree with this document). One finding, fixed: pass 2's B.3 had "the daily job" delete old quota rows, but §C.5's job is a GitHub workflow that only reads a count; the Worker now deletes an install's earlier-day rows in the same batch as each new report.
- **Pass 4** (2026-10-02): two findings, fixed. (1) The quota was raised before the `UNIQUE` insert, so a refused duplicate would have used up quota; both now run in one D1 batch, with the rollback listed as an assumption #52 measures. (2) "Each accepted report" reused the triage word "accepted"; it is "each stored report".
- **Pass 5** (2026-10-02): one finding, fixed. B.2 stated as fact that the D1 batch "rolls back as a whole", the claim the Assumptions list marks unmeasured (pass 2's finding 5 again, in new words); it now says what Cloudflare documents and that #52 measures it. §E's Worker tests now include the duplicate-leaves-quota case that #52's AC3 already asks for.
- **Pass 6** (2026-10-02): mechanical checks run by script, not by eye: every `#N` in the body above this log is an open Wordfarer story (#51–#54) or shyden.co.uk's own #97 and #349, cited as theirs; parent §5.2, §5.3, §5.4, §5.5, §6.6, §10.7, §11, §13 and §15 each exist once; the parent carries the evidence sentence, the Reports view, the new gate, the disclosure line (3 places), the D18 risk row and 8 D18 mentions; `CLAUDE.md` carries the two-source rule. One finding, in this log: pass 3 said it checked #7 and #17, which this document never cites (they are the stories' epics); recorded here rather than rewriting pass 3.
- **Pass 7** (2026-10-02): zero findings. The script re-run gives the same references (#51–#54, shyden.co.uk #97 and #349; parent §5.2, §5.3, §5.4, §6.6, §10.7, §11, plus §5.5 and §13 in §1), all present; the whole log re-read against the runs it describes. Self-approved.
- **Amendment** (2026-10-03): the operator chose Cloudflare Access for staff authentication, asked interactively, replacing the operator token in section B; the daily count now authenticates with an Access service token.
