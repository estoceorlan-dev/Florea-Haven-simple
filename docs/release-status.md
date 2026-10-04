# Release readiness — 2026-10-04

Status: **The plain HTML website is implemented and verified locally. Render configuration is prepared; hosted deployment remains pending.**

## Current implementation

The storefront and administrator interface use 18 standalone HTML documents, plain CSS, and native JavaScript for live data and actions. Page/UI markup is in HTML, including forms and reusable templates; the custom JavaScript renderer/router and Vite application tooling are removed. Flask and PostgreSQL provide authentication, persistent carts, checkout, inventory, fulfillment, user management, and managed image uploads. See the [teammate guide](teammate-guide.md), [README](../README.md), [API contract](api-contract.md), and [frontend migration](frontend-migration.md).

Production configuration includes CSP, secure cookies, origin checks, upload/body limits, shared rate limits, static caching, request IDs, a Docker image, Render Blueprint, CI checks, and a disposable production smoke stack. The [deployment runbook](render-deployment.md) describes hosting, backups, migrations, image cleanup, and rollback.

## Current local verification

- Lint, formatting, production build, and credential scan pass.
- Native frontend tests: 8 passed.
- PostgreSQL backend tests: 137 passed.
- Desktop/mobile browser journeys: 25 passed; one duplicate mobile viewport matrix intentionally skipped.
- Static checks validate all 18 HTML documents, unique IDs, labels, landmarks, and local script/style references. JavaScript-disabled browser checks verify headings and forms already exist in the HTML response.
- Forty storefront/administrator screenshots cover both themes and desktop/mobile layouts. Representative catalog/admin layouts were visually compared with the React reference. Native controls and differing test data account for visible differences; this rewrite does not claim pixel identity.
- Browser checks cover catalog accessibility and responsive widths, drawer focus, authentication, customer purchases, stock conflicts, retry idempotency after a committed order's response is lost, uploads, inventory, fulfillment, categories, and user access management.

See [migration validation](frontend-migration.md) for details and test boundaries. Tests use isolated PostgreSQL schemas; Cloudinary network calls are stubbed. The production Docker/Render configuration predates the frontend migration and requires another hosted smoke check with the current build before release.

## Before accepting production traffic

Follow the [Render deployment runbook](render-deployment.md).

1. Create the Render resources and supply server-only Cloudinary credentials. Review the paid plans in the Blueprint before provisioning. Configure the canonical HTTPS origin if using a custom domain.
2. Create the initial administrator securely. Add real categories/products; do not run the demo seed in production. No demo administrator credentials are deployed.
3. Verify real Cloudinary uploads, replacement, removal, and responsive image delivery in staging. Automated tests stub Cloudinary's network calls, so account configuration and live delivery remain unverified.
4. Schedule daily `cleanup-images`, enable monitoring, configure backups/retention, and rehearse restore into a separate database.
5. Repeat the documented smoke/customer/admin checks on staging and production, including HTTPS and the chosen domain, then record/tag the deployed commit.
6. Complete broader assistive-technology, zoom, network-throttling, and Figma visual review if required by your design acceptance process. Automated accessibility checks cover the catalog and drawer, not every screen or assistive technology.

The established MVP remains Cash on Delivery. Online payments, password-reset email, notifications, delivery integrations, reviews, and advanced analytics are not included in this release.
