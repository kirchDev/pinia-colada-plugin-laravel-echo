# CLAUDE.md

This file provides guidance to AI coding agents — Claude Code (claude.ai/code) and vendor-neutral tools such as Codex, OpenCode, Cursor, and Copilot — when working with code in this repository.

## Agent instruction files

`CLAUDE.md` and `AGENTS.md` are kept **byte-identical**. `CLAUDE.md` is what Claude Code reads; `AGENTS.md` is what vendor-neutral agent tools read — Codex, OpenCode, Cursor, Copilot, and whatever follows them. Two real files, deliberately not a symlink: not every tool resolves one.

**After editing either file, copy it over the other — don't repeat the edit by hand:**

```bash
cp CLAUDE.md AGENTS.md   # or the reverse, whichever you just edited
```

Retyping a change is exactly how the two drift; one reflowed line or reworded clause is enough. `diff CLAUDE.md AGENTS.md` must print nothing. If it ever does, treat it as a defect and fix it by letting one file win wholesale — never by merging them.

## What this repo is

`@kirchdev/pinia-colada-plugin-laravel-echo` is a **Pinia Colada plugin published to npm**. It ties a Colada query's cache to Laravel Echo: subscribe while the cache entry lives, leave when it is removed — and, the part that earns it its place, treat the websocket connection itself as part of the cache's validity.

The repo started as a `TitusKirch/scaffold` clone, so the whole meta layer (lint, format, commit hooks, CI, CodeQL, Dependabot, release-please, issue/PR templates) is the scaffold's and the notes below still describe it. What is new is `src/`, `tsdown` and `vitest`.

`vite-plugin-iconify-bundle` (sibling checkout at `../vite-plugin-iconify-bundle`) is the reference for every packaging convention here. **Read it rather than guessing** — the `package.json` shape, the tsdown config, the release workflow and the README structure were all lifted from it.

## The plugin

Two responsibilities, and the second is the reason it is a plugin rather than a composable:

1. **Subscription lifecycle** — `queryCache.$onAction` pairs `extend` (entry created → subscribe) with `remove` (entry gone → leave). Channels are **reference-counted**: two entries may name the same channel, and leaving it when the first is removed would make the second go deaf.
2. **Connection-aware cache validity** — a websocket drops silently and the cache then holds data that looks fresh and is not. `connector.onConnectionChange` drives one rule: while connected the query's `staleTime` is relaxed to `echo.staleTime`, on disconnect the query's own value is restored, and a *re*connect invalidates each entry exactly once.

Four decisions that are settled, and that a later change should not quietly undo:

- **The peer is `laravel-echo`, not `@laravel/echo-vue`.** Everything the plugin uses — `ConnectionStatus`, `connectionStatus()`, `connector.onConnectionChange()` — lives in `laravel-echo`; the Vue wrapper only re-exports it and adds composables a plugin cannot call (there is no component lifecycle here). Peering on the wrapper would exclude plain-Echo users and buy nothing.
- **The Echo instance is a factory option**, an instance or a getter, never a global or an app lookup. Explicit, testable without module stubbing, and `() => null` is what makes SSR a no-op instead of a crash.
- **`EchoEventContext` is not generic over the query's data type**, and its cache handles carry their own type parameter instead (`setQueryData<T>(…)`). Reaching `TData` from inside a handler puts it in a contravariant position of `UseQueryOptions`, and merely installing the plugin then stops a typed `UseQueryEntry` from fitting the plain one that `queryCache.invalidate()`, `cancel()`, `track()` and `remove()` all take. There is a test for exactly this under _type surface_ — a plugin must not make the library it extends stricter. The method-bivariance hack does **not** rescue it; that was measured, not assumed.
- **`staleTime` relaxation is opt-in per query.** Reconnect invalidation is always on; touching staleness is not, so adding `echo` to an existing query cannot silently change its refetch behaviour.

One non-obvious mechanic: `queryCache.ensure()` builds a **fresh options object on every call** and assigns it to the entry, so a relaxed `staleTime` written onto `entry.options` does not survive the next render. The plugin therefore also hooks `ensure` and re-applies, holding the patched object's identity so it never restores a value onto the wrong object.

## Commands

| Command             | What it does                                               |
| :------------------ | :--------------------------------------------------------- |
| `pnpm install`      | Install deps and wire husky hooks via the `prepare` script |
| `pnpm lint`         | `oxlint . --deny-warnings`                                 |
| `pnpm format`       | `oxfmt --check .` (note: `format` is the check, not fix)   |
| `pnpm build`        | `tsdown` → `dist/index.mjs` + `dist/index.d.mts`           |
| `pnpm test`         | `vitest run` — Echo is mocked, no server needed            |
| `pnpm test:watch`   | `vitest`                                                   |
| `pnpm test:coverage`| `vitest run --coverage`                                    |
| `pnpm typecheck`    | `tsc --noEmit` over `src/` and the meta scripts            |
| `pnpm check`        | Runs `lint` + `format` + `typecheck` + `test` + `check:policy` — the CI gate |
| `pnpm check:policy` | Proves the two agent policy files ban the same commands    |
| `pnpm lint:fix`     | Auto-fix lint                                              |
| `pnpm format:fix`   | Auto-fix format                                            |
| `pnpm check:fix`    | Auto-fix lint + format                                     |
| `pnpm skills:update`| Update project-scoped agent skills via the skills.sh CLI   |
| `pnpm taze`         | Interactive dependency upgrade check                       |
| `pnpm taze:w`       | Write upgrade results                                      |

CI runs whatever the `check` script chains, so adding a check needs no workflow change.

## Architecture / conventions

- **Node 24, pnpm 11.** Pinned via `.nvmrc`, `engines`, and `packageManager`. `pnpm-workspace.yaml` enforces `minimumReleaseAge=4320` (3-day cooldown), isolated node-linker. Don't loosen these without reason. Package-manager enforcement carries no key on purpose: pnpm 11 replaced `packageManagerStrict`/`packageManagerStrictVersion` with `pmOnFail`, whose default `download` already errors on a foreign package manager and fetches the pinned pnpm version — every other value only weakens it, so leave it unset (the rationale sits as a comment in the file).
- **oxc, not eslint/prettier.** Linting via `oxlint`, formatting via `oxfmt`. Configs live in `.oxlintrc.json` / `.oxfmtrc.json`. `oxlint` uses `unicorn` + `oxc` plugins; rules deliberately minimal.
- **TypeScript everywhere, one build.** `tsdown` emits ESM only (`dist/index.mjs`) plus types (`dist/index.d.mts`); `tsconfig.json` stays `noEmit` and is the typecheck gate, not the build. `erasableSyntaxOnly` is on, so only strippable syntax (no enums, no parameter properties) can be written — that is what keeps the meta scripts and the four tool configs (`scripts/check-policy-parity.ts`, `commitlint.config.ts`, `lint-staged.config.ts`, `taze.config.ts`) directly executable under Node 24's native type stripping.
- **Nothing is bundled.** `tsdown.config.ts` lists `@pinia/colada`, `laravel-echo` and `vue` under `deps.neverBundle` — they are peers. A bundled second copy of Echo would hand the plugin a different instance than the app's, which is the one bug this package cannot afford. `vue` is the only runtime import the emitted module actually has.
- **Tests sit beside the source** (`src/index.spec.ts`, not a `tests/` directory), and Echo is a hand-written double — the structural `EchoLike` interface exists so the suite never needs a running server.
- **Husky hooks** (`.husky/pre-commit`, `.husky/commit-msg`) run `lint-staged` and `commitlint`. `lint-staged.config.ts` excludes `README.md`, `CLAUDE.md`, and `AGENTS.md` (free-form prose) and `pnpm-lock.yaml`. `oxlint --fix --deny-warnings` then `oxfmt` on JS/TS; `oxfmt` only on JSON/YAML/MD.
- **Conventional Commits enforced** via `@commitlint/config-conventional`. Don't `--no-verify` unless explicitly asked.
- **release-please is included** (unlike many templates that omit it). Files: `release-please-config.json`, `.release-please-manifest.json`, `.github/workflows/release-please.yml`. Config uses `release-type: node` (it bumps `package.json`), `include-v-in-tag: true`, `initial-version: 0.1.0`. The manifest starts at `0.0.0`, so the first conventional commit on `main` opens the initial release PR. `release-please.yml` also carries the two npm publish jobs — stable on a created release, prerelease otherwise — both via npm Trusted Publishing (OIDC), so **no `NPM_TOKEN` exists in this repo**.
- **Workflows** use `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v6`, `github/codeql-action/{init,analyze}@v4`. Keep these pinned to major versions; Dependabot bumps them monthly.
- **CodeQL** scans `actions` + `javascript-typescript` with `security-extended,security-and-quality` queries, gated by path filters so non-code changes don't trigger it.
- **Dependabot** groups all minor/patch updates per ecosystem into a single PR (`npm-minor-patch`, `actions-minor-patch`). Majors come as separate PRs.

## AI & skills

- **`.claude/settings.json`** ships a baseline permission policy — see _Permission policy_ below for the rules it follows. `.claude/settings.local.json` (per-machine overrides, typically `enabledMcpjsonServers`) is gitignored.
- **`.tituskirch-skills.json`** configures the [TitusKirch skills](https://github.com/TitusKirch/skills) (commit, PR, issue, release, docs …) per repo. It is the runtime **config**, not an installer. Regenerate/reconcile it with the `tituskirch-skills-config` skill.
- **Installing the skills.** The bundle is installed via the skills.sh CLI (`pnpm dlx skills add TitusKirch/skills`), not vendored into the repo. `pnpm skills:update` refreshes project-scoped skills tracked in `skills-lock.json` (only present once a repo actually installs project skills).

## Permission policy

`.claude/settings.json` is deliberately lopsided: a **long `deny` list and a short `allow` list**. The two sides answer different questions, so they follow opposite rules.

**`deny` may be generous.** A rule for a command the repo doesn't have is a no-op, it never needs maintenance, and it is never reviewed — a too-broad block only surfaces when you actually hit it. So the list covers every stack kirchDev repos might grow into (Laravel, Prisma, Terraform/OpenTofu, AWS), not just this one. `git reflog expire` and `git gc --prune=now` are in there because they destroy the rescue path that survives a `reset --hard`.

The line to draw is **the machine or something remote, not the working copy**. Blocked: anything that wrecks the OS (`dd`, `mkfs`, `chmod -R`, `rm -rf /…`), tears down remote state or resources (`terraform destroy`, `state rm`, `aws ec2 terminate-instances`, `gh repo delete`), or throws away work with no recovery path (force-push, `reset --hard`, `stash drop`). Deliberately *not* blocked, because they are ordinary local development: `rm -rf node_modules`, `docker volume rm`, `docker compose down -v`, `docker system prune`, `php artisan tinker`, deleting a remote branch. Those prompt instead — a command that is sometimes wanted belongs in the middle state, never in `deny`.

**`allow` must stay short.** Its only return is fewer prompts — no safety is gained. Every line has to be read and understood by whoever copies this file, and an unreviewed allow list is more dangerous than none. Keep what occurs many times per session (read-only git, `ls`/`grep`/`rg`, the project's own check scripts) and let everything else ask.

**Three states, not two.** A command in `allow` runs unasked; one in `deny` is impossible and has to be typed by hand; one in **neither list prompts you** — and that middle state is the right default for almost everything. Reserve `deny` for what a mistaken "yes" could not undo. A normal `git push` is not that: it is reversible, visible and the ordinary way work ships, so it sits in `allow`.

> [!IMPORTANT]
> **Never allow a rule that runs arbitrary code.** `php artisan tinker --execute`, `pnpm exec turbo run`, `find . *` (which covers `-delete` and `-exec rm`), a raw `pnpm dlx`, or an MCP tool that executes SQL (`database-query`, `run-query`) each hand back everything the `deny` list took away — a blocked `db:wipe` means nothing next to an allowed `tinker --execute 'DB::statement(...)'`. A deny list is only as strong as the weakest allow rule beside it.

Two things this file cannot do, by design: it cannot tell which branch a `git push` targets (protect release branches with **branch protection**, not permissions), and prefix rules miss flags placed before the subcommand (`docker compose -f x.yml down -v`). Treat it as lowering the odds, not as a guarantee.

Downstream repos keep the `deny` list as-is and swap the `pnpm` lines in `allow` for whatever their stack runs.

**Codex gets the same policy** in `.codex/rules/default.rules` — permission config is not portable, so the block list exists twice and **both must be changed together**. Codex uses Starlark `prefix_rule()` calls matching on argument *tokens*, which handles flags and shell chains that the `Bash(…)` prefix patterns miss, and every rule carries its own `match`/`not_match` cases. Check a rule with:

```bash
codex execpolicy check --pretty --rules .codex/rules/default.rules -- git push --force
```

**Parity between the two is machine-checked, not eyeballed.** `pnpm check:policy` (`scripts/check-policy-parity.ts`, part of `pnpm check` and of CI) expands every `prefix_rule` into its concrete argv prefixes — the cartesian product over its alternation lists — and matches the two sets in both directions, so "we changed both files" becomes a number rather than a claim. Two things it encodes are worth knowing before editing either file:

- **The languages differ, so a few gaps cannot be closed.** Claude Code matches a prefix of the command _string_; a `prefix_rule` matches whole argv _tokens_. `Bash(aws iam delete-:*)` therefore bans every delete verb AWS will ever ship, and the Codex side can only enumerate the ones it ships today. Such a difference is legal but must be **declared** — in the `DELIBERATE` list in the script and in the `.codex/rules/default.rules` header — and the check fails both on an undeclared one and on a declaration that has gone stale.
- **Neither language normalises flag order or case.** `rm -rf /` and `rm -fr /` are separate bans; `rm -r -f /` and `redis-cli FlushAll` are neither, and enumerating permutations never ends. The check proves the two files list the **same spellings** — it does not claim the set of spellings is complete. Same caveat as the two below, and for the same reason.

## Workflows are calls, not copies

Every file in `.github/workflows/` is a **stub**: a trigger and a `uses:` pointing at a body in [`kirchDev/workflows`](https://github.com/kirchDev/workflows). A repo created from this template inherits the calls, not 727 lines of workflow — and a fix made centrally reaches it on its next Dependabot bump instead of never.

What follows for a new repo:

- **Do not paste a workflow body back in.** If a stub almost fits, the answer is an input on the body or an own job beside the call — see that repository's `docs/1.guides/2.add-a-body.md`.
- **The pins are commit SHAs with the version as a trailing comment.** Dependabot raises the bumps; the `github-actions` ecosystem is already configured in `.github/dependabot.yml`.
- **A repo that publishes something** adds its own job to `release-please.yml`, gated on `needs.release-please.outputs.release-created`.
- **A repo with a compiled language** names it in `codeql.yml`'s `languages` input rather than forking the workflow.
- **Checks come from `package.json`.** `ci.yml` runs whatever the `check` script chains, so adding a check needs no workflow change at all.

## Branching model

This repo runs a **`dev` integration branch**: branch off `dev`, PR into `dev`, roll `dev` up into `main`, and release-please releases from `main`.

> [!IMPORTANT]
> The `dev` **config** is in place (`dependabot.yml`, `.tituskirch-skills.json` → `pr.base`), but the branch itself does not exist yet. Create it before the first Dependabot run: with `target-branch: 'dev'` pointing at a branch that isn't there, Dependabot opens nothing at all.

`.github/workflows/promotion-pr.yml` opens and updates the rolling draft promotion PR. Mark that PR ready and **merge it with a merge commit, never a squash**: squashing collapses the individual `feat:`/`fix:` commits into the PR's own `chore:` title, and release-please then cuts nothing.

It calls a central body that picks its own target: with a `stage` branch it promotes `dev` into `stage`, without one straight into `main`. The stub is therefore the same file whichever flow a repo is on.

Going **main-only** is three edits, all of them removals:

```bash
rm .github/workflows/promotion-pr.yml
# .github/dependabot.yml    — drop both `target-branch: 'dev'` lines
# .tituskirch-skills.json   — set `pr.base` to "main"
```

`ci.yml` and `codeql.yml` list both `main` and `dev` in their `on: branches:` filters — without `dev` in `ci.yml`, PRs into `dev` (Dependabot's included) would run no CI at all.

## This is a public repo

Which settles three things the scaffold leaves open, and none of them should be reopened by accident:

- **CodeQL stays.** It depends on GitHub Advanced Security, which is free on public repos.
- **MIT.** `LICENSE`, the README footer, and `"license": "MIT"` in `package.json`. Note the package is **not** `"private": true` — it publishes.
- **The Discord forum links stay** in `.github/ISSUE_TEMPLATE/config.yml`: questions, ideas and possible bugs go there, confirmed bugs and features stay as GitHub issue forms.

## House style for READMEs and meta files

`/write-readme` skill encodes the canonical structure. Key rules: hero block wrapped in `<div align="center">`, prescribed section emojis (✨ Features, 🚀 Setup, 🤝 Contributing, 🛣️ Versioning, 📄 License), license footer always reads `[MIT](LICENSE) © [Titus Kirch](https://github.com/TitusKirch/) / [IT-Dienstleistungen Titus Kirch](https://kirch.dev)`. Use GitHub callouts (`> [!TIP]`, `> [!IMPORTANT]`), never plain blockquotes.

## When editing this repo

- **`SETUP.md` is the working brief** that this package was built from, and it is temporary: delete it once the package is released and the README carries the same information. Where it and the code disagree, the code won — Part 4's open questions are all decided, and _The plugin_ above records how.
- **`vite-plugin-iconify-bundle` (`../vite-plugin-iconify-bundle`) is the packaging reference**, `forgemap` (`../forgemap`) the reference for the meta layer. When unsure about a config choice, open one of them rather than inventing.
- **Anything public is a release decision.** The exported types are the API: `UseQueryEchoOptions`, `EchoEventContext`, `EchoLike`, `EchoChannelVisibility`. Widening them is a `feat`, narrowing them a `feat!`.
- **Step 5 of `SETUP.md` is still open**: after the first publish, open a PR against the [Pinia Colada community plugins page](https://pinia-colada.esm.dev/plugins/community.html).
