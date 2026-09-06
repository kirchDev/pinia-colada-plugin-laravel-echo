---
title: 'Peer on laravel-echo, not the Vue wrapper'
description: 'Depend on Echo itself rather than on its Vue bindings, so the plugin serves every Echo consumer.'
status: 'accepted'
date: '2026-09-06'
---

# ADR-0001 — Peer on laravel-echo, not the Vue wrapper

## Context

The plugin needs an Echo instance, and Laravel publishes Echo in two shapes: the library itself, and a Vue wrapper around it. Both were plausible peers, and the choice binds every consumer — a package can only be installed alongside what its peers allow, so changing this later breaks installs rather than code.

The wrapper's apparent advantage was convenience and typed event names. Measured against what a plugin can actually reach, it was not one. Everything this plugin uses to observe and react to the connection lived in the library, and the wrapper only re-exported it. What the wrapper added on top were composables, which bind to a component's unmount hook — and a Colada plugin runs at install time with no component in scope, so it cannot call them at all. The typed event names lived inside one of those composables.

## Decision

We will take `laravel-echo` as the peer dependency, and not depend on `@laravel/echo-vue` in any form.

The plugin talks to the Echo interface and nothing below it, which is also why the package is named for Echo rather than for a broadcaster.

## Consequences

The plugin serves every Echo consumer, not only the ones on the Vue wrapper — including applications on the plain library, and any future binding for another framework.

An application using the Vue wrapper has to have `laravel-echo` resolvable for the peer to be satisfied. Its instance is passed in like any other, so nothing about that application's own usage changes.

Nothing is gained in event-name typing, and no claim to it is made. A consumer who wants typed event names gets them from the wrapper's own composables, in the components where those work, and the plugin's handlers stay typed by hand.

Talking only to the Echo interface means the plugin inherits every broadcaster Echo supports, and learns about none of them. A feature specific to one broadcaster cannot be reached from here — that is the price of the same abstraction that makes the package broadcaster-agnostic.

## Alternatives considered

**Peer on `@laravel/echo-vue`.** One peer for the typical Laravel-plus-Vue consumer, and a convenient lazily-configured getter. It lost because it excluded plain-Echo consumers while giving the plugin no capability it could actually use, and because the convenience it offered is a call-site concern the factory option already covers ([ADR-0002](0002-pass-the-echo-instance-into-the-factory.md)).

**Peer on the library and additionally on the wrapper, optionally.** Rejected as surface without purpose: an optional peer earns its place when the code imports from it under a condition, and there is no such import here.
