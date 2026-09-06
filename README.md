<div align="center">

# 📡 @kirchdev/pinia-colada-plugin-laravel-echo

**Pinia Colada queries fed by Laravel Echo — and invalidated when the websocket drops and comes back**

[![npm Version](https://img.shields.io/npm/v/@kirchdev/pinia-colada-plugin-laravel-echo.svg?style=flat-square&color=4f46e5)](https://www.npmjs.com/package/@kirchdev/pinia-colada-plugin-laravel-echo)
[![Downloads](https://img.shields.io/npm/dm/@kirchdev/pinia-colada-plugin-laravel-echo.svg?style=flat-square&color=4f46e5)](https://www.npmjs.com/package/@kirchdev/pinia-colada-plugin-laravel-echo)
[![Tests](https://img.shields.io/github/actions/workflow/status/kirchDev/pinia-colada-plugin-laravel-echo/ci.yml?branch=main&style=flat-square&label=tests)](https://github.com/kirchDev/pinia-colada-plugin-laravel-echo/actions/workflows/ci.yml)
[![Node Version](https://img.shields.io/node/v/@kirchdev/pinia-colada-plugin-laravel-echo.svg?style=flat-square&color=8993be)](https://www.npmjs.com/package/@kirchdev/pinia-colada-plugin-laravel-echo)
[![License: MIT](https://img.shields.io/npm/l/@kirchdev/pinia-colada-plugin-laravel-echo.svg?style=flat-square&color=10b981)](LICENSE)

</div>

---

```ts
useQuery({
  key: ['notifications', 'list'],
  query: () => $fetch('/me/notifications'),
  echo: {
    channel: () => `App.Models.User.${userId.value}`,
    listen: {
      '.NotificationBroadcasted': (payload, { setQueryData }) =>
        setQueryData<Notification[]>((old) => [payload, ...(old ?? [])])
    }
  }
});
```

That's it. The channel is subscribed while the cache entry lives, left when it is removed — and the connection itself becomes part of the cache's validity.

## 🤔 Why

Tying Colada and Echo together is per-call-site work today: subscribe on mount, mutate the cache in the handler, leave the channel on unmount, and — the part everyone forgets — deal with the socket dropping.

**A websocket drops.** A tunnel, standby, a wifi handover. From that moment the client silently misses events, while the cache holds data that looks fresh and is not, with nothing anywhere reporting it. A user watches a counter that stopped being true.

Echo exposes `ConnectionStatus`. This plugin turns it into one rule for every query that opts in:

| Connection   | Behaviour                                                              |
| :----------- | :--------------------------------------------------------------------- |
| connected    | events keep the cache current — `echo.staleTime` relaxes refetching     |
| disconnected | the query's own `staleTime` is restored: normal refetch behaviour again |
| reconnected  | the entry is invalidated once, to pick up whatever was missed           |

Written per call site, that is either repeated or forgotten. Written once, it is a property of every query that opts in.

## 📦 Install & run

```bash
pnpm add @kirchdev/pinia-colada-plugin-laravel-echo
```

`@pinia/colada`, `laravel-echo` and `vue` are peers — you already have them.

```ts
// main.ts
import { PiniaColada } from '@pinia/colada';
import { PiniaColadaLaravelEcho } from '@kirchdev/pinia-colada-plugin-laravel-echo';

app.use(createPinia());
app.use(PiniaColada, {
  plugins: [PiniaColadaLaravelEcho({ echo: myEchoInstance })]
});
```

Using [`@laravel/echo-vue`](https://github.com/laravel/echo), whose instance is configured lazily, pass its getter instead — the plugin resolves it the first time a query needs it:

```ts
import { echo } from '@laravel/echo-vue';

PiniaColadaLaravelEcho({ echo: () => echo() });
```

> [!TIP]
> Under SSR there is no Echo instance. Return `null` from the getter there and every `echo` query is simply left alone — no subscription, no error, the query behaves exactly as if the option were absent.

## ✨ Features

- **📡 Subscription follows the cache** — a channel is joined when the entry is created and left when it is removed, with no component lifecycle involved.
- **🔌 Connection-aware validity** — the reason this is a plugin and not a composable. A dropped connection restores normal refetching; a restored one invalidates exactly once.
- **🔢 Reference-counted channels** — two queries on one channel keep it open until both are gone, so removing one never makes the other go deaf.
- **🚚 No opinion about the payload** — the handler gets what Echo delivered and a cache handle. How a row is inserted, replaced or counted is yours.
- **🔀 Every transport** — Echo already abstracts Reverb, Pusher, Ably and Socket.io, and this plugin talks only to Echo. That is why the package is named for `laravel-echo` and not for Reverb.

## ⚙️ The `echo` query option

| Key                     | Default     | What it controls                                                                       |
| :---------------------- | :---------- | :------------------------------------------------------------------------------------- |
| `channel`               | —           | Channel name **without** the visibility prefix, or a getter for it.                     |
| `visibility`            | `'private'` | `'public'`, `'private'`, `'encryptedPrivate'` or `'presence'`.                           |
| `listen`                | —           | Event name → handler. A name starting with `.` skips Laravel's namespace, as ever.      |
| `staleTime`             | unset       | `staleTime` to use **while the connection is up**. Left unset, staleness is untouched.   |
| `invalidateOnReconnect` | `true`      | Invalidate this entry once when the connection comes back.                               |

Each handler is called with the broadcast payload and a context bound to the entry that declared it: `event`, `key`, `entry`, `queryCache`, `setQueryData`, `getQueryData` and `invalidate`.

> [!IMPORTANT]
> `channel` is resolved **once**, when the cache entry is created. Anything the name depends on therefore belongs in the query `key` too — otherwise a changed user id produces a query that is still listening on the old channel.

### Relaxing staleness while connected

Events keep the cache current as long as they arrive, so a live query often needs no refetch on mount or on focus at all. `staleTime: Infinity` says exactly that — and the moment the connection drops it is dropped, because from then on nothing is keeping the query current:

```ts
useQuery({
  key: ['notifications', 'list'],
  query: () => $fetch('/me/notifications'),
  staleTime: 30_000, // what applies whenever the socket is down
  echo: {
    channel: () => `App.Models.User.${userId.value}`,
    staleTime: Number.POSITIVE_INFINITY, // what applies while it is up
    listen: { '.NotificationBroadcasted': onNotification }
  }
});
```

## 📘 TypeScript

Importing the package augments `@pinia/colada`, so `echo` is a typed option on `useQuery()` with no further setup.

The cache handles carry their own type parameter — `setQueryData<Notification[]>(…)` — rather than inheriting the query's. That is deliberate: reaching the query's data type from inside a handler would put it in a contravariant position of `UseQueryOptions`, and merely installing this plugin would then stop a typed `UseQueryEntry` from fitting the plain one that `queryCache.invalidate()`, `cancel()`, `track()` and `remove()` all take. A plugin has no business making the library it extends stricter.

## 🤝 Contributing

PRs welcome. Conventional Commits required (enforced via commitlint). Husky runs the project's linters/formatters on `git commit`.

```bash
pnpm test    # the suite — Echo is mocked, no server needed
pnpm check   # lint, format, typecheck, test, policy parity — the CI gate
```

> [!TIP]
> Run `pnpm check:fix` before pushing — CI will catch what husky missed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## 🛣️ Versioning

[Semantic Versioning](https://semver.org/) via [release-please](https://github.com/googleapis/release-please) — see [CHANGELOG.md](CHANGELOG.md).

## 📄 License

[MIT](LICENSE) © [Titus Kirch](https://github.com/TitusKirch/) / [IT-Dienstleistungen Titus Kirch](https://kirch.dev)
