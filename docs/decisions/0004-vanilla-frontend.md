# ADR 0004: HTML, CSS, and vanilla JavaScript frontend

Date: 2026-10-04

Status: Superseded by [ADR 0005](0005-plain-html-pages.md). The implementation below records the intermediate migration; its custom rendering layer, router, state/cache modules, and Vite tooling have been removed.

## Context

Keep the existing storefront and administrator appearance and functionality while removing React and Tailwind from this separate project. The original implementation remains in the sibling Florea-Haven-react repository.

## Decision

- Use HTML templates and native JavaScript ES modules for every existing page and shared UI element. There are no JSX files or frontend framework dependencies.
- Keep Vite as a development server and static asset bundler, and Vitest/Playwright as test tools. Production receives ordinary HTML, CSS, and JavaScript assets.
- Check the existing compiled styles into styles.css as ordinary CSS. Preserve the original selectors, custom properties, responsive rules, transitions, and light/dark palette; no Tailwind compiler or directives remain. Existing utility class names remain stable to preserve the design.
- Store the required Lucide SVG geometry locally with its ISC license. Icons require no runtime package.
- Use ui/dom.js for escaped HTML templates, native event listeners, named controller state, watcher cleanup, and incremental DOM updates. Updating existing DOM elements retains input focus, text selection, selected files, and open native dialogs.
- Use router.js with the History API for the existing routes, query strings, return paths, back/forward navigation, scroll restoration, and administrator/customer guards.
- Use state/ for session, cart, and appearance stores. Remove private cached requests when the authenticated owner changes.
- Use services/data.js and services/resources.js for deduplicated fetch requests, abort signals, bounded retries, cached results, polling, focus/reconnect refresh, stock sharing, and mutation invalidation.
- Keep Flask routes, database schema, session cookies, managed image uploads, checkout revisions, idempotency keys, and all backend business rules unchanged.

## Validation

Native DOM and request-cache tests cover escaping, input/file preservation, lifecycle cleanup, cancellation, cache ownership, navigation, and themes. PostgreSQL backend tests and desktop/mobile Playwright journeys verify the complete UI/API flows. The frontend screenshot checks capture all public and administrator layouts in light/dark themes using deterministic image responses.

See the current verification record in ../frontend-migration.md. Real Cloudinary delivery and hosted production checks retain their separate staging requirements.
