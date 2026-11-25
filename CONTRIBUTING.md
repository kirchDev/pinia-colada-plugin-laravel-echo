# Contributing to @kirchdev/pinia-colada-plugin-laravel-echo

Thanks for contributing! 🛠️ This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting issues

- **Questions, ideas, possible bugs** → the [Discord forum](https://discord.kirch.dev/).
- **Confirmed bugs** → a [Bug report](https://github.com/kirchDev/pinia-colada-plugin-laravel-echo/issues/new?template=bug_report.yml), with a minimal reproduction.
- **Features** → a [Feature request](https://github.com/kirchDev/pinia-colada-plugin-laravel-echo/issues/new?template=feature_request.yml).
- **Security vulnerabilities** → never a public issue; see [SECURITY.md](SECURITY.md).

## Setup

Node **24+**, pnpm **12**.

```bash
git clone https://github.com/kirchDev/pinia-colada-plugin-laravel-echo.git
cd pinia-colada-plugin-laravel-echo
pnpm install   # also wires the husky hooks
```

`pnpm check` is what CI runs — keep it green before you push. `pnpm check:fix` auto-fixes lint and format; the other scripts are in `package.json`. Tests mock Echo, no server needed.

## Branching & PRs

1. **Branch off `dev` and open the PR against `dev`** — never push to `main`.
2. **Conventional Commits**, enforced by commitlint (`feat: …`, `fix: …`; breaking: `feat!:` or a `BREAKING CHANGE:` footer).
3. **One concern per PR**, and update the README or `docs/` when you change behaviour or a default.

The pre-commit hook runs oxlint and oxfmt on staged files. If it fails, fix and commit again — no `--no-verify`.

## AI agents

Agent instructions live in [`AGENTS.md`](AGENTS.md). Claude Code (v2.1.277+) loads it on its own as long as no `CLAUDE.md` or `CLAUDE.local.md` sits in the working directory or above — so don't add one; a personal `CLAUDE.local.md` would shadow `AGENTS.md`.

## License

Contributions are licensed under the [MIT License](LICENSE).
