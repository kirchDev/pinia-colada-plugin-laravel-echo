# SETUP

Working brief for `@kirchdev/pinia-colada-plugin-laravel-echo`. It carries two things: **what** the
plugin does, and **how** it must be built so it matches the other kirchDev npm packages.

Delete this file once the package is released and its README carries the same information.

## The reference, and how binding it is

The closest sibling is checked out at:

```
/root/projects/comGithub/kirchDev/vite-plugin-iconify-bundle
```

It is the same shape of thing: a plugin for someone else's tool, published to npm, TypeScript, built
with `tsdown`, tested with `vitest`. **Read it rather than this file wherever the two disagree** —
every convention in Part 2 was lifted from it, not invented here. `coverage-report` and
`gitignore-sync` are secondary references for anything it does not answer.

---

# Part 1 — What the plugin does

Pinia Colada caches server state. Laravel Echo delivers real-time events. Tying them together is
per-call-site work today: subscribe on mount, mutate the cache in the handler, leave the channel on
unmount, and — the part everyone forgets — deal with the socket dropping.

The plugin makes that a query option.

```ts
useQuery({
  key: ['notifications', 'list'],
  query: () => $fetch(url),
  echo: {
    channel: () => `App.Models.User.${userId.value}`,
    visibility: 'private', // default
    listen: {
      '.NotificationBroadcasted': (payload, { setQueryData }) =>
        setQueryData((old) => prepend(old, payload))
    }
  }
});
```

## Two responsibilities, and the second is the reason it exists

**1. Subscription lifecycle.** Subscribe when a cache entry is created, unsubscribe when it is
removed. Straightforward, and the part a composable could also do.

**2. Connection-aware cache validity.** This is the part that gets skipped, and the reason the
plugin earns its place: **a websocket drops.** Tunnel, standby, a wifi handover — and from that
moment the client silently misses events. The cache then holds data that looks fresh and is not,
with nothing anywhere reporting it. A user watches a counter that stopped being true.

Echo exposes `ConnectionStatus`. The plugin turns it into one rule for every live query:

| Connection   | Behaviour                                                            |
| :----------- | :------------------------------------------------------------------- |
| connected    | events keep the cache current — no polling needed, staleness relaxed |
| disconnected | fall back to the query's normal refetch behaviour                    |
| reconnected  | invalidate once, to pick up whatever was missed while away           |

Written per call site, this is either repeated or forgotten. Written once, it is a property of every
query that opts in.

## What it must not do

- **No opinion about the payload.** The handler receives what Echo delivers and a cache handle; how
  a row is inserted, replaced or counted is the caller's business. Guessing the shape would make the
  plugin useless for the second consumer.
- **No transport knowledge.** Echo already abstracts Reverb, Pusher, Ably and Socket.io. The plugin
  talks to Echo and inherits all four — which is also why this package is named for `laravel-echo`
  and not for Reverb.
- **No `useEcho()`.** See the mechanics below: a plugin has no component lifecycle.

---

# Part 2 — How it is built

Everything here is copied from `vite-plugin-iconify-bundle`. When in doubt, open the file there.

## What this clone is not yet

The repository is a `TitusKirch/scaffold` clone: tooling, CI and the meta files are in place, the
package itself is not. Concretely still missing or wrong:

- `package.json` still identifies as `scaffold` version `0.4.1` — name, description, keywords,
  repository, exports, files, engines and peer dependencies all need writing.
- No `tsdown`, no `vitest`, no `tsdown.config.ts` / `vitest.config.ts`, no `src/`.
- No `build`, `test` or `prepublishOnly` script.

`check:policy` and `skills:update` come from the scaffold and stay — the reference package carries
them too.

## `package.json`

```jsonc
{
  "name": "@kirchdev/pinia-colada-plugin-laravel-echo",
  "version": "0.0.0", // release-please moves it
  "description": "…",
  "keywords": [
    "pinia-colada-plugin", // required for community discovery
    "pinia-colada",
    "laravel",
    "echo",
    "reverb",
    "websockets",
    "realtime",
    "vue",
    "kirchdev"
  ],
  "license": "MIT",
  "author": "Titus Kirch <titus.kirch@kirch.dev>",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/kirchDev/pinia-colada-plugin-laravel-echo.git"
  },
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
    "./package.json": "./package.json"
  },
  "files": ["dist"],
  "engines": { "node": ">=24" },
  "packageManager": "pnpm@12.3.4"
}
```

**`peerDependencies`** — the host libraries, never bundled:

```jsonc
{
  "@pinia/colada": "^1.4.0",
  "@laravel/echo-vue": "^2.4.0",
  "vue": "^3.5.0"
}
```

Which Echo peer is the right one is the one dependency question left open — see Part 4. The
reference pins its Vite peer as a range across majors (`^5 || ^6 || ^7 || ^8`); do the same wherever
the host's API is stable across them.

**Scripts** — same set and same bodies as the reference: `build` (`tsdown`), `test`, `test:watch`,
`test:coverage`, `lint`, `lint:fix`, `format`, `format:fix`, `typecheck`, `check`, `check:fix`,
`taze`, `taze:w`, `prepare` (`husky`), `prepublishOnly`.

## Layout

```
src/index.ts          the plugin factory and its types
src/index.spec.ts     tests next to the code, not in a tests/ directory
tsdown.config.ts
vitest.config.ts
```

`tsconfig.json`, `commitlint.config.ts`, `lint-staged.config.ts`, `taze.config.ts`,
`release-please-config.json` and the meta files are already here from the scaffold.

## Plugin mechanics — the part to get right

A Colada plugin is a factory returning a function over the plugin context:

```ts
import type { PiniaColadaPlugin } from '@pinia/colada';

export function PiniaColadaLaravelEcho(options?: Options): PiniaColadaPlugin {
  return ({ queryCache, scope }) => {
    queryCache.$onAction(({ name, args, after }) => {
      if (name === 'extend') {
        /* entry created — subscribe if it declares `echo` */
      }
      if (name === 'remove') {
        /* entry gone — leave the channel */
      }
    });
  };
}
```

The context carries `queryCache`, `pinia` and `scope` (a Vue `EffectScope`). Observable actions are
`extend`, `fetch`, `setEntryState` and `remove`.

Three things follow from that shape, and each is a trap:

1. **There is no component lifecycle.** `useEcho()` and `useChannel()` from `@laravel/echo-vue` are
   composables — they bind to `onUnmounted` and cannot run here. The plugin resolves the Echo
   instance itself and pairs `extend` with `remove` for cleanup.
2. **Reactive work belongs in `scope`.** A `watch` on the connection status is created inside it, so
   it is torn down with the plugin rather than leaking.
3. **The query option needs a module augmentation.** Colada learns about `echo` through
   `declare module '@pinia/colada'`, extending its query options interface — the same mechanism the
   upstream docs show for `UseQueryEntryExtensions`.

**Two entries may name the same channel.** Reference-count subscriptions rather than leaving a
channel the moment one entry is removed, or an unrelated query goes deaf.

## Tests

`vitest`, specs beside the source. Echo is mocked — the suite must never need a running server.
Cover at minimum:

- subscribe on `extend`, leave on `remove`
- two entries on one channel: removing one keeps the other subscribed
- the handler receives the payload and a working cache handle
- on reconnect the entry is invalidated exactly once
- while disconnected the query falls back to normal refetch behaviour
- a query without an `echo` option is untouched

---

# Part 3 — Order of work

1. `package.json` rewritten, `tsdown` and `vitest` added with their configs, `src/` created.
2. The plugin factory with `extend` / `remove` subscription handling, module augmentation, tests.
   That alone is already usable.
3. Connection awareness: watch `ConnectionStatus`, invalidate once on reconnect, relax staleness
   while connected.
4. README in the kirchDev house style, with the `useQuery` example from Part 1.
5. Publish, then a PR against
   [the Pinia Colada community plugins page](https://pinia-colada.esm.dev/plugins/community.html) —
   description, repo link, npm link, and which part of Colada it extends. That page currently lists
   a single plugin and nothing for websockets or connection state, so the slot is open.

Steps 1–2 make a releasable `0.1.0`. Step 3 is what makes it worth publishing rather than keeping in
an app.

# Part 4 — Still open

- **Which Echo peer.** `@laravel/echo-vue` gives `ConnectionStatus` and typed events but binds the
  package to the Vue wrapper; plain `laravel-echo` is more portable and less convenient. Decide
  before the first release — afterwards it is a breaking change.
- **How the Echo instance is resolved.** Passed into the factory as an option, or looked up from the
  app? The first is explicit and testable, the second is less to write at the call site.
- **Whether staleness should be touched at all** while connected, or whether `0.1.0` limits itself
  to reconnect invalidation. The conservative variant is easier to reason about and may be the
  better first release.

# Part 5 — The first consumer

`kirchDev/gildstone` needs it for its notification centre (ENG-162): a `useQuery` over
`/me/notifications` whose cache is fed by `.NotificationBroadcasted` on a private user channel, with
a sidebar badge reading `meta.unread_count`.

That issue is the reason this package exists, and the reason step 3 is not optional — a notification
counter that silently stops updating after a dropped connection is exactly the failure this prevents.
