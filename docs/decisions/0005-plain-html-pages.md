# ADR 0005: Standalone HTML pages

Date: 2026-10-04

Status: Accepted and implemented. Supersedes ADR 0004's JavaScript templates, router, state stores, and Vite application tooling.

## Context

Removing React still left pages and UI defined in JavaScript component functions and a custom rendering layer. Teammates need to explain and debug the website by opening ordinary HTML files.

## Decision

- Store every screen in a complete HTML document under `client/index.html`, `client/pages/`, or `client/admin/`.
- Keep navigation as normal anchors and filters as regular URL query strings. Flask maps the existing clean URLs to the appropriate HTML document.
- Put repeated rows, navigation drawers, confirmation dialogs, and buy-now dialogs in native HTML `<template>` elements. The markup remains visible in each page's source.
- Use small native JavaScript modules for session restoration, API calls, form submission, uploads, availability refresh, and updating labeled fields. Use native DOM methods and escaped text; no JavaScript-generated HTML, custom renderer, or client router.
- Preserve the existing plain CSS, local SVG geometry, responsive layouts, animations, and light/dark palettes. Use native select controls.
- Serve the editable files directly through Flask in development at port 4000. The build copies files into `client/dist`; it compiles and bundles nothing. Vitest and Playwright remain test tools.
- Preserve all API business rules, SQL migrations, persisted data, cookies, and upload protocols. The backend changes only HTML file serving and its default local origin.

## Consequences

Each screen can be read in one HTML file and inspected before JavaScript runs. Browser debugging uses the source filenames directly. Navigating between screens loads a new document. Headers and footers are repeated, so shared markup changes must be applied to multiple files. Live catalog, login, cart, checkout, and admin actions still require JavaScript and the running backend.

The original React repository is preserved separately. See the [teammate guide](../teammate-guide.md) and [migration verification](../frontend-migration.md).
