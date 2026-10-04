# ADR 0002: Python Flask backend

The current HTML frontend is described in [ADR 0005](0005-plain-html-pages.md). This record describes the retained Python backend and database compatibility requirements.

- Status: Accepted and implemented
- Date: 2026-09-28
- Replaces: the original Express runtime, JavaScript database adapter, in-memory fallback, and deployment assumptions

## Reason

The course requires Python in the application. A documented JSON API allows the backend and frontend to change independently while preserving the storefront, administrator interface, and persisted data.

## Decision

- Python Flask owns authentication, validation, catalog, cart, checkout, inventory, and order administration.
- Standalone HTML pages and native JavaScript communicate with the Flask API on the same origin.
- Psycopg executes parameterized SQL against PostgreSQL. No ORM or second backend is introduced.
- SQL migrations and the catalog seed live in `backend/`. Migration filenames and the `schema_migrations` ledger remain unchanged, allowing existing databases to continue without data conversion.
- PostgreSQL is required in development and tests. Tests create and remove their own random schema; they never truncate application tables.
- The API retains endpoint paths, success/error envelopes, numeric money values, UTC timestamps, cookie name, HS256 signing, and bcrypt password compatibility.
- `Decimal` is used for internal money calculations. Cart hashes and order fingerprints preserve the original JavaScript serialization for the supported inputs.
- A user's cart mutations and checkout acquire the same user-row lock. Checkout locks product rows in UUID order and commits order creation, stock reduction, snapshots, and cart clearing together.
- Cancellation locks the order, validates its transition, and restores stock in the same transaction. Repeated or concurrent cancellations cannot restore stock twice.
- Flask serves editable HTML, CSS, and JavaScript on port 4000 during development. Waitress serves the copied release website alongside `/api` in production.
- Production requires `APP_ENV=production`, a stable `JWT_SECRET`, the public HTTPS `CLIENT_ORIGIN`, and persistent PostgreSQL. Use a TLS-terminating host/reverse proxy. `DATABASE_SSL=true` enables certificate and hostname verification; supply the provider's trusted root when needed.
- Local development can use in-process rate limits. Render uses shared Redis limiter storage as configured in the deployment runbook.

## Migration boundaries

The Python backend owns the API business rules, including managed image uploads and user administration. Node/npm provide local commands and frontend checks; the running production application and all business logic use Python.

The retired Express source and original design records remain available in Git history. The original React project is preserved in the sibling repository.

## Verification

The Python suite covers catalog filtering and administration, sessions and permissions, cart ownership, checkout snapshots, stale carts, idempotency, status transitions, and stock restoration. Real PostgreSQL concurrency and injected-failure tests verify last-item purchases, duplicate checkout, concurrent cancellation, and rollback of partial writes.

Compatibility fixtures in `backend/tests/fixtures/express-compatibility.json` were generated using the previous backend's bcryptjs, jose, and JSON.stringify implementations. They verify existing hashes, tokens, cart revisions, and replay of pre-migration orders.

Vitest checks the native JavaScript helpers, while Playwright verifies customer and administrator journeys on desktop and mobile. Hosted deployment checks are described in the deployment runbook.

## References

- [Flask application factories](https://flask.palletsprojects.com/en/stable/patterns/appfactories/)
- [Flask deployment with Waitress](https://flask.palletsprojects.com/en/stable/deploying/waitress/)
- [Psycopg transaction management](https://www.psycopg.org/psycopg3/docs/basic/transactions.html)
