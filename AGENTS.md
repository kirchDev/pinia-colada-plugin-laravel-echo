# Agent instructions

`@kirchdev/pinia-colada-plugin-laravel-echo` is a **Pinia Colada plugin published to npm**: it subscribes a query's cache entry to Laravel Echo while the entry lives, leaves when it is removed, and treats the websocket connection itself as part of the cache's validity.

The meta layer (lint, format, hooks, CI, CodeQL, Dependabot, release-please, templates) comes from `TitusKirch/scaffold`; `src/`, `tsdown` and `vitest` are this package's own. When unsure about a config choice, open a reference instead of inventing one: `../vite-plugin-iconify-bundle` for packaging (`package.json`, tsdown, release workflow, README), `../../TitusKirch/forgemap` for the meta layer.

## The plugin

1. **Subscription lifecycle** — `queryCache.$onAction` pairs `extend` (subscribe) with `remove` (leave). Channels are **reference-counted**: two entries may share one.
2. **Connection-aware validity** — via `connector.onConnectionChange`: while connected, `staleTime` is relaxed to `echo.staleTime`; on disconnect the query's own value returns; a *re*connect invalidates each entry exactly once.

Settled decisions — do not quietly undo them (ADRs in `docs/99.adr/`):

- **Peer on `laravel-echo`, not `@laravel/echo-vue`** (ADR 0001).
- **The Echo instance is a factory option** — instance or getter, never a global; `() => null` makes SSR a no-op (ADR 0002).
- **`EchoEventContext` is not generic over the query's data type**; its cache handles take their own type parameter. A _type surface_ test guards that installing the plugin does not make `UseQueryEntry` stricter. Method bivariance does not fix it — measured (ADR 0003).
- **`staleTime` relaxation is opt-in per query**; reconnect invalidation is always on.

Trap: `queryCache.ensure()` assigns a **fresh options object on every call**, so a relaxed `staleTime` on `entry.options` is lost on the next render. The plugin hooks `ensure` and re-applies, tracking the patched object's identity.

## Commands

`pnpm check` is the gate (lint + format + typecheck + test + `check:policy`) and the only thing CI runs — add a check to that script, not to a workflow. Other scripts are in `package.json`; note `pnpm format` _checks_, `pnpm format:fix` writes. Tests mock Echo; no server needed.

## Conventions

- **Node 24, pnpm 12**, pinned via `.nvmrc`, `engines`, `packageManager`. Don't loosen `pnpm-workspace.yaml` (3-day `minimumReleaseAge`, isolated linker) and leave `pmOnFail` unset — the file says why.
- **oxc, not eslint/prettier**: `oxlint` / `oxfmt`, configs in `.oxlintrc.json` / `.oxfmtrc.json`.
- **TypeScript, one build**: `tsdown` emits ESM + types only; `tsconfig.json` is `noEmit`. `erasableSyntaxOnly` is on — no enums, no parameter properties — so the meta scripts and `*.config.ts` run under Node's type stripping.
- **Nothing is bundled**: `@pinia/colada`, `laravel-echo`, `vue` are peers in `deps.neverBundle`. Never bundle Echo.
- **Tests sit beside the source** (`src/*.spec.ts`); Echo is a hand-written double against the `EchoLike` interface.
- **Hooks**: husky runs `lint-staged` and `commitlint`. Conventional Commits; never `--no-verify` unless asked.
- **Public API**: `UseQueryEchoOptions`, `EchoEventContext`, `EchoLike`, `EchoChannelVisibility`. Widening is `feat`, narrowing `feat!`.
- **Releases**: release-please from `main` (`release-please-config.json`); `release-please.yml` also publishes to npm via Trusted Publishing (OIDC) — there is no `NPM_TOKEN`.
- **Public repo**: CodeQL stays, MIT (`"private"` must stay unset — it publishes), the Discord links in `.github/ISSUE_TEMPLATE/config.yml` stay.
- **READMEs** follow the `/write-readme` house style.

## Branching

Branch off `dev`, PR into `dev`; `promotion-pr.yml` keeps a draft PR rolling `dev` into `main`. Merge that PR with a **merge commit, never a squash** — a squash hides the `feat:`/`fix:` commits from release-please. Going main-only: delete `promotion-pr.yml`, drop both `target-branch: 'dev'` lines in `.github/dependabot.yml`, set `pr.base` to `"main"` in `.tituskirch-skills.json`. `ci.yml` and `codeql.yml` must keep `dev` in their `pull_request` branches.

## Workflows

Every file in `.github/workflows/` is a stub calling a body in [`kirchDev/workflows`](https://github.com/kirchDev/workflows), pinned by commit SHA with the version as a comment (Dependabot bumps them). Never paste a body back in — add an input upstream or an own job beside the call (see that repo's `docs/1.guides/2.add-a-body.md`). A publishing job is gated on `needs.release-please.outputs.release-created`; a compiled language goes into `codeql.yml`'s `languages` input.

## Permission policy

`.claude/settings.json` and `.codex/rules/default.rules` hold the same policy and **change together**; `pnpm check:policy` proves parity, and the Codex header lists the deliberate differences.

- **`deny`** may be generous and stack-agnostic. Block what wrecks the machine, tears down remote state or destroys work without recovery (incl. `git reflog expire`, `git gc --prune=now`). Ordinary local work (`rm -rf node_modules`, `docker compose down -v`, deleting a remote branch, `git push`) is not denied.
- **`allow`** stays short: only what runs many times per session. **Never allow a rule that runs arbitrary code** (`tinker --execute`, `pnpm exec`, `find . *`, raw `pnpm dlx`, SQL-executing MCP tools).
- Neither file normalises flag order or case, and neither sees a push's target branch — that is branch protection's job.
- Check a Codex rule with `codex execpolicy check --pretty --rules .codex/rules/default.rules -- <command>`.

## Skills

`.tituskirch-skills.json` configures the [TitusKirch skills](https://github.com/TitusKirch/skills); reconcile it with `/tituskirch-skills-config`. Install the skills with `pnpm dlx skills add TitusKirch/skills`; `pnpm skills:update` refreshes project-scoped ones.

## Open

- **`SETUP.md`** is the temporary brief the package was built from; where it and the code disagree, the code wins. Delete it once the README carries its content.
- After the first publish, open a PR adding the plugin to the [Pinia Colada community plugins page](https://pinia-colada.esm.dev/plugins/community.html).
