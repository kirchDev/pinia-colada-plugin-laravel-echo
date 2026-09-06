---
title: 'Concepts'
description: 'The two models the plugin is built on: connection-aware cache validity, and a subscription that follows the cache entry.'
---

# Concepts

The plugin has two responsibilities, and they are separate models with separate failure modes. The first page is the reason the package exists; the second is the machinery that makes it safe to use more than once.

- [Connection-aware caching](1.connection-aware-caching.md) — why a websocket's state belongs in the cache's notion of freshness.
- [Subscription lifecycle](2.subscription-lifecycle.md) — how a channel is tied to a cache entry rather than to a component.
