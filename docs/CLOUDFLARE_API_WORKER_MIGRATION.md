# Cloudflare API Worker migration preparation

This prepares a separate Cloudflare Worker backend. It does not deploy the Worker or alter the frontend's API URL. Keep the Render API online until a separately approved cutover.

## Worker environments

`apps/api-worker/wrangler.jsonc` keeps the existing staging binding and adds a distinct production Worker/D1 binding:

- Staging D1: `almost-formal-staging` (`e97a7f20-d072-41a1-8231-77c91cc807a8`)
- Production D1: `almost-formal-db` (`24bd6c7d-0cf3-408d-bd98-516d96018170`)

Both migrations `0001_init.sql` and `0002_worker_hardening.sql` have been applied to the production D1 database. No production custom domain or route is configured. No Worker is deployed.

Both environments use `migrations/`. Run migrations against local D1 for tests:

```bash
npx wrangler d1 migrations apply almost-formal-staging --local --env staging
```

For production, first create a separate empty D1 database and put its actual ID in the production binding. Only after migration review and approval should its D1 migrations be applied. Do not bind the production Worker to the staging database.

Production vars in Wrangler are `APP_ORIGIN`, `ALLOWED_ORIGINS`, and `EMAIL_FROM`. Configure these secrets separately after approval; do not put their values in Git:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
RESEND_API_KEY
STORE_NOTIFICATION_EMAIL
```

`EMAIL_FROM` must be a sender verified by Resend. The Worker sends order-created, contact-admin, shipped, delivered, and cancelled notifications through Resend HTTPS. Delivery errors are logged and do not roll back saved records. For local development, copy `.dev.vars.example` to `.dev.vars` and set test credentials there.

## PostgreSQL-to-D1 data export

The export script opens a PostgreSQL **read-only, repeatable-read** snapshot, reads the 21 application tables in dependency order, and writes:

- an `INSERT`-only D1 SQL file preserving IDs, foreign-key values, timestamps, booleans, and existing records;
- a separate SQL query comparing each source row count with the D1 destination and running `PRAGMA foreign_key_check`;
- a JSON source-count manifest.

It does not connect to D1 or execute the generated SQL. Set an explicitly read-only PostgreSQL connection and a new output path:

```bash
POSTGRES_SOURCE_URL='postgresql://<read-only-user>:<password>@<host>/<database>?sslmode=require' \
D1_MIGRATION_SQL_PATH=/secure/path/almost-formal-import.sql \
npm run db:export:d1
```

The SQL temporarily drops the D1 checkout-reservation trigger so historical order items do not decrement already-current stock a second time, then restores that trigger after import. It does not use upserts: import only into the dedicated, empty D1 database. Test the export and import on a disposable D1 database first, compare every count, inspect `PRAGMA foreign_key_check`, and verify stock totals and orders. A partial import must not be blindly retried; stop and inspect the destination before any recovery.

The export can contain customer addresses, emails, order access tokens, and Argon2id password hashes. Keep all generated files private, do not commit them, and securely remove them after the approved migration/verification process.

## Compatibility and cutover blockers

- The Worker verifies Express Argon2id hashes directly with bounded parameters; it does not rewrite or downgrade those hashes. Hashes outside its supported Worker limits must be identified before import.
- Existing sessions are not needed for cutover; administrators will sign in again.
- The read-only PostgreSQL source export contains 197 rows across 21 application tables. It has been imported into production D1, and both count validation and row-level verification passed with zero foreign-key violations.
- The source identity as the exact Render runtime database is not independently confirmed. Confirm `NEON_SOURCE_URL` is the Render production database before cutover.
- All 29 product-image references are Cloudinary URLs. 24 ranged GET checks returned 206 and 5 returned 404; restore or replace the missing image assets before cutover.
- Historical local `/uploads` assets are not in PostgreSQL. R2 is not enabled in the Cloudflare account; Cloudinary is the existing integration, but credentials are unavailable.
- Email credentials and a verified sender must be configured and tested.
- Configure the `api.almostformal.shop` hostname and Worker route before production traffic is switched.
- Resolve the live frontend/API 502 and `www.almostformal.shop` TLS 525 states only after the migration route is ready.
- Staging tests must cover login/CSRF, admin routes, image decoding/upload, checkout/idempotency, stock reservation, cancellation, concurrent status changes, Resend failure handling, and D1 migration counts.
- Only after approval should the frontend build's `API_URL` be changed to the production API Worker URL. This preparation does not change it.
