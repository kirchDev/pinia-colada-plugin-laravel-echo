---
title: 'pinia-colada-plugin-laravel-echo documentation'
description: 'How the plugin ties a Pinia Colada query cache to a Laravel Echo connection, and why it is built that way.'
---

A Pinia Colada plugin that keeps a query's cache current from Laravel Echo broadcasts, and treats the websocket connection itself as part of that cache's validity. These pages cover the model and the reasoning — what the plugin does, and the decisions behind how it does it.

## Sections

::page-cards
::

Install, first run and the full `echo` option table live in the [README](https://github.com/kirchDev/pinia-colada-plugin-laravel-echo/blob/main/README.md); the exported types ship with the package as `dist/index.d.mts` and are the reference for the API surface. Development workflow is in [CONTRIBUTING.md](https://github.com/kirchDev/pinia-colada-plugin-laravel-echo/blob/main/CONTRIBUTING.md).
