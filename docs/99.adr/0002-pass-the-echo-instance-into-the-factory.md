---
title: 'Pass the Echo instance into the factory'
description: 'Take the Echo instance as an explicit plugin option rather than reading it from a global or the app.'
status: 'accepted'
date: '2026-09-06'
---

# ADR-0002 — Pass the Echo instance into the factory

## Context

The plugin has to reach the application's Echo instance, and it must be _that_ instance: a second one would open its own connection and receive its own events, so the queries would go quiet without anything failing.

Three routes were available. An explicit option on the plugin factory. A global, which Echo's own setup conventionally populates. Or a lookup through the application context, since the plugin is installed by a Vue plugin.

Two constraints narrowed it. The plugin's context carries the cache, the store and an effect scope — the application is not among them, so an app lookup would have required its own Vue-plugin layer purely to capture something the factory could have been handed. And rendering on a server produces no Echo instance at all, so whatever route is chosen has to have an answer for "there is none" that is not a crash.

## Decision

We will take the Echo instance as an option on the plugin factory, accepting either the instance itself or a getter returning it, and resolving a getter on first use rather than at install time.

A getter returning nothing means there is no Echo instance, and every query that declared the option is left untouched — no subscription, no error, and the query behaves as though the option were absent.

## Consequences

There is exactly one instance in play, and it is the one the application named. The class of bug where a plugin quietly talks to a different connection than the app cannot occur.

Server-side rendering is handled by the same mechanism as everything else rather than by a special case: the getter returns nothing there, and the plugin does nothing.

Deferring a getter until first use is what makes a lazily configured instance work, and it means an application that never runs a live query never forces Echo to be configured at all.

The test suite needs no module stubbing or global patching to substitute Echo, which is what allows the whole suite to run without a websocket server.

The call site carries one more argument than a global would need. That is the cost, and it is paid once per application.

## Alternatives considered

**Read a global.** The least to write, and Echo's conventional setup already populates one. It lost on being implicit — a global is invisible at the call site, awkward on a server, and impossible to substitute in a test without reaching outside the plugin.

**Resolve from the application context.** Attractive on the surface, since a Vue plugin installs this one. It lost because the plugin context does not carry the application, so this route would have meant adding a layer whose only job was to pass along something the caller already had.
