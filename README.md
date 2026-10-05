# Yawelo Idle

An idle game for learning a real language. English speakers learn Indonesian (`en-id`) while journeying across the Indonesian archipelago; Indonesian speakers learn English (`id-en`) while journeying across the English-speaking world. Words you pick up power the game, and reviewing them with spaced repetition makes them stronger. Nobody is ever forced to study.

It is built once for the web and shipped to browsers (PWA), Steam (Electron) and iOS/Android (Capacitor), by [Shyden Labs](https://shyden.co.uk).

## Status

**Pre-alpha: design complete, foundations in progress.** Nothing is playable yet. Work is tracked on the [Yawelo Idle Stories](https://github.com/orgs/shyden-labs/projects/4) board.

## Read first

- [Design spec](docs/superpowers/specs/2026-10-01-yawelo-idle-design.md): the source of truth. It covers the core loop, progression, content, architecture, fair play and testing.
- [Idle-game research](docs/research/2026-10-01-idle-game-research.md): 20 games, 28 player complaints, and the 26-item do-not list the design is held to.

## Player-trust promises

No ads. No energy timers. No sold progress. No punishment for missed days. No expiring content. Saves are never silently lost. Each promise is enforced by an automated test (spec §9).

## Development

```sh
npm ci                # Node 24 (see .nvmrc); engine-strict is on
npm run format:check  # Prettier
npm run lint          # ESLint, zero warnings
npm run typecheck     # tsc and svelte-check
npm run test:unit
npm run build
```

Every change follows test-driven development, and each ticket gets its own branch with a PR into `develop`. Third-party GitHub Actions are pinned to full commit SHAs, Dependabot opens its PRs against `develop`, and `tests/unit/supply-chain.test.ts` enforces both.

Every merge to `develop` deploys dev (web and sync Workers, D1) and verifies it live before marking it `dev-verified`. Dev is at `https://yawelo-idle-web-dev.shyden-labs-dev.workers.dev`, behind the shared Shyden Labs dev password, with the sync API at `https://yawelo-idle-sync-dev.shyden-labs-dev.workers.dev`. Both live in the dev-only "Shyden Labs Dev" Cloudflare account, so no dev credential can reach production (#395).

## Licences

| What                                                           | Licence                                         |
| -------------------------------------------------------------- | ----------------------------------------------- |
| Source code                                                    | [Apache-2.0](LICENSE)                           |
| Course content adapted from CC BY-SA sources (e.g. Wiktionary) | [CC BY-SA 4.0](LICENSES/CC-BY-SA-4.0.txt)       |
| Original story, culture cards, motifs and art                  | [CC BY-NC-SA 4.0](LICENSES/CC-BY-NC-SA-4.0.txt) |
| The Yawelo Idle name and logo                                  | Reserved, see [TRADEMARKS.md](TRADEMARKS.md)    |

Every content item records its own licence. See [LICENSE-CONTENT.md](LICENSE-CONTENT.md).
