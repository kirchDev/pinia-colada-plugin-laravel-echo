---
title: 'Keep the event context free of the query data type'
description: 'Type the handler context without the query data type, so installing the plugin does not tighten the signatures Colada already had.'
status: 'accepted'
date: '2026-09-06'
---

# ADR-0003 — Keep the event context free of the query data type

## Context

The plugin's query option is added to Colada's own query options through a module augmentation. That is the supported mechanism, and it has a consequence that is easy to miss: whatever the augmentation adds becomes part of how those options are compared, for every query in the application, whether or not it uses the plugin.

The obvious design carried the query's data type into the handler's context, so a handler's cache handles would be typed by the query they belong to. Doing so places that type inside a function parameter, which is a position compared the other way round from the rest. The options type stops being freely widenable in that parameter — and so does the query entry that holds it.

That was measured rather than reasoned about. With the data type reachable from the context, an ordinary typed entry no longer satisfied the plain entry type that several of the cache's own methods take — invalidating, cancelling, tracking and removing an entry all stopped type-checking, for consumers who had done nothing but install the plugin. Two shapes intended to escape it were also measured: keeping the data type only in read positions did not, because the writing handle needs it too, and the method-bivariance form did not survive the indexed access it was expressed through.

## Decision

We will keep the handler's context free of the query's data type, and put the type parameter on the cache handles themselves, so it is named at the call: `setQueryData<Notification[]>(…)`.

A plugin must not make the library it extends stricter. Where a design of ours and a signature of Colada's cannot both hold, ours yields.

## Consequences

Installing the plugin changes nothing about how any other Colada type behaves. Code that never touches this package cannot be broken by its presence.

A handler that wants its data typed says so at the call, once per handle. That is the cost, and it falls on the code that opted into the option rather than on everyone else.

The property is guarded by a test that exercises the cache's own signatures against a typed entry, so a future change that reintroduces the coupling fails rather than shipping. Without it, the regression is invisible from inside this repository — it only appears in a consumer's code.

## Alternatives considered

**Carry the query's data type through the context.** The design that reads best at the call site, and the one this decision rejects. It lost on the measurement above: the cost is paid by consumers, in code unrelated to the plugin, and it is not discoverable from anything they can see.

**Express the handler through a method signature, to have its parameter compared loosely.** A known technique for exactly this problem. It was measured and did not apply through the indexed access the type was written as, so it did not restore the assignability it was reached for.

**Drop the typed handles entirely and hand out untyped ones.** Would have solved the variance and removed the ergonomics with it. Rejected because naming a type argument at the call recovers the ergonomics at a cost the caller chooses to pay.
