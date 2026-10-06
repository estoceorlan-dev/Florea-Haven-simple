# Plain HTML frontend migration

`Florea-Haven-project` now uses **18 standalone HTML documents**, plain CSS, and native JavaScript for live data/actions. The sibling `Florea-Haven-react` repository remains the original reference. [ADR 0005](decisions/0005-plain-html-pages.md) describes the current implementation. Superseded React/Express and intermediate frontend design records are available in Git history.

## Current structure

- `client/index.html`: home page.
- `client/pages/*.html`: catalog/product, login/register, account, cart/checkout, customer orders, confirmation, and missing-page documents.
- `client/admin/*.html`: dashboard, products, categories, users, and orders/detail documents.
- `client/css/styles.css`: imports ordinary CSS category files from `client/css/`, `core/`, and `components/` in their original order. Utility selectors, typography, responsive rules, animations, and both themes are preserved. No Tailwind directives/compiler.
- `client/js/*.js`: API methods, native form handlers, session display, availability checks, uploads, and dialog interactions. Page markup is entirely in HTML; JavaScript does not generate HTML strings.
- `client/public/`: early theme initialization and a fallback image.
- `backend/florea/frontend.py`: clean URL mapping to HTML documents.
- `scripts/build-frontend.mjs`: copies the website into `client/dist` without compilation, bundling, or minification.

The former `client/src` JavaScript pages/components, custom renderer, router, state stores, and request cache are removed. React and related packages were removed in the earlier migration. Vite is no longer application development/build tooling; Vitest may include it as a transitive test dependency. CSS and SVG licenses remain in `client/licenses`.

Native HTML `<template>` elements hold repeated product/cart/order rows and drawer/dialog markup. Normal links load documents, query strings retain filters, and native forms keep controls visible in source. Page redirects remain in JavaScript; real permissions are enforced by Flask. The [teammate guide](teammate-guide.md) maps every screen and explains editing/debugging.

## Running it

Run `npm install`, `npm run backend:setup`, and `npm run dev` with the existing `.env` and PostgreSQL available. Open **http://localhost:4000**. Flask serves editable sources directly in development. Save files and refresh the browser; no frontend rebuild is needed.

`npm run build` and `npm start` serve the release copy. HTML and unversioned assets are revalidated after deployments. API calls use the same origin, so `VITE_API_URL` is removed. Local `CLIENT_ORIGIN` must match the browser's origin.

## Compatibility and design

The clean URLs, Flask API routes, JSON envelopes, session cookies, SQL migrations, stock rules, checkout revisions, idempotent retries, and managed uploads remain in use. No database conversion is required. Backend changes concern document serving and the default local frontend origin.

The original styles and SVG shapes are retained. Palettes, fonts, spacing, responsive layouts, stock displays, and animations use the existing CSS. Select controls now use the browser's native interface, and navigation loads a new document.

## Verification

Tests use a separate temporary PostgreSQL database and isolated schemas. Application data is preserved.

- Frontend tests cover API errors/uploads, escaped text, template cloning, safe return paths, and themes.
- Backend tests cover authorization, compatibility, checkout/stock concurrency, uploads, and account management.
- Browser journeys cover registration/login/logout, guest purchase return paths, cart checkout, buy-now cart preservation, stock conflicts, retries after a committed response is lost, image uploads/removal, admin catalog/categories/users, fulfillment, filters/sorting, themes, and drawer/dialog focus on desktop/mobile.
- A JavaScript-disabled browser verifies real headings/forms before any page script runs.
- Layout capture covers five public and five administrator pages in both themes on desktop/mobile. Deterministic image responses support comparison with the original reference. Native selects are an intentional visual change.

Final counts are in [release status](release-status.md). To capture layouts, set `E2E_CAPTURE_DIR` and run `npm run test:e2e -- e2e/frontend.spec.js` with `TEST_DATABASE_URL` configured.

Cloudinary calls are stubbed in browser tests. Real delivery and hosted production checks retain their staging requirements in [the deployment runbook](render-deployment.md).
