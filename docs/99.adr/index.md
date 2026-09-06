---
title: 'Architecture decisions'
description: 'The decision log — every architecture decision recorded for this project.'
---

# Architecture decisions

A decision earns an ADR when it constrains work that comes later and its reasoning would otherwise be lost: a choice between real alternatives, a convention every part of the project has to follow, a trade-off that looks like a mistake until the reason is known. Records are append-only — a reversed decision is written as a new ADR that supersedes the old one, never as an edit to it.

For a published plugin that mostly means the shape of its public surface: a peer dependency, an option's signature, a type that consumers inherit. Each of those is breaking to change once released, which is exactly when the reasoning has stopped being obvious.

| ADR                                                                    | Decision                                           | Status   | Date       |
| :--------------------------------------------------------------------- | :------------------------------------------------- | :------- | :--------- |
| [ADR-0001](0001-peer-on-laravel-echo-not-the-vue-wrapper.md)           | Peer on laravel-echo, not the Vue wrapper          | accepted | 2026-09-06 |
| [ADR-0002](0002-pass-the-echo-instance-into-the-factory.md)            | Pass the Echo instance into the factory            | accepted | 2026-09-06 |
| [ADR-0003](0003-keep-the-event-context-free-of-the-query-data-type.md) | Keep the event context free of the query data type | accepted | 2026-09-06 |
