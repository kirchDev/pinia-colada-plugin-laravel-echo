# Security Policy

## Scope

`@kirchdev/pinia-colada-plugin-laravel-echo` is a Pinia Colada plugin published to npm. It runs in the browser, inside the consuming application, and holds no credentials of its own — it subscribes to the channels the application names, on the Echo instance the application hands it.

The supported version is always the **latest release**. Fixes ship forward; there are no maintenance branches to back-port to.

## Reporting a Vulnerability

**Please do not file a public GitHub issue for security problems.**

In the context of this package, a "vulnerability" typically means:

- A query subscribing to a channel other than the one it declared, or one it should not be able to reach.
- A cache entry keeping a subscription alive after it was removed, so events reach a listener the application believes to be gone.
- An insecure default in a shipped workflow (e.g. overly broad `permissions`).
- A dependency in `package.json` that introduces a known CVE.

Use one of the following private channels:

1. **GitHub Private Vulnerability Reporting** (preferred): open a private advisory at <https://github.com/kirchDev/pinia-colada-plugin-laravel-echo/security/advisories/new>.
2. **Email**: [titus.kirch@kirch.dev](mailto:titus.kirch@kirch.dev). PGP available on request.

Please include:

- A description of the vulnerability and its impact on consuming applications.
- Steps to reproduce.
- Any suggested fix, if you have one.

### What to expect

| Stage                        | Target timeline                                   |
| :--------------------------- | :------------------------------------------------ |
| Acknowledgement of report    | within **3 business days**                        |
| Initial assessment & triage  | within **7 business days**                        |
| Patch released (if accepted) | depends on severity — critical issues prioritised |
| Public disclosure & advisory | coordinated with reporter after the patch ships   |

## Credit

Reporters who follow this process responsibly are credited in the [CHANGELOG](CHANGELOG.md) and the corresponding GitHub Security Advisory, unless they prefer to remain anonymous.

---

Maintained by [Titus Kirch](https://github.com/TitusKirch/) / [IT-Dienstleistungen Titus Kirch](https://kirch.dev).
