# Free backend setup

Use Cloudflare for the existing frontend, one **Render Free** web service for the API, **Neon Free PostgreSQL** for data, and **Cloudinary Free** for images. This configuration needs no paid disk, Render database, Redis or uptime-ping service. Free quotas are finite; a free month cannot be guaranteed for unlimited traffic. Keep each account on Free, monitor usage and do not enable paid upgrades. Domain registration is separate; included workers.dev/onrender.com addresses do not require purchasing a domain.

The screenshot's "$0/mo plus compute costs" is a workspace price, not a free compute guarantee. Choose **Free** on the actual web service. `render.yaml` explicitly uses `plan: free`, creates no disk/database and disables automatic deploys to reduce builds.

## Create the database and image account

Create a **Free Neon project**, near the chosen Render region. Copy its **pooled PostgreSQL connection string**, retaining `sslmode=require` and other supplied options. Store it privately in Render as `DATABASE_URL`, never in Git or chat. The API defaults to three database connections and 20-second connection/pool timeouts; explicit URL options override these defaults.

Use a new empty Neon database. The PostgreSQL migrations create the schema but **do not import existing SQLite records or historical uploads**. Back up local data first. If it contains real orders or inventory, migrate it separately before cutover. Production startup does not seed demo products.

Create/select a **Free Cloudinary** environment and copy its cloud name, API key and secret. Render startup requires all three, preventing accidental uploads to ephemeral disk. Historical `/uploads/` files are not automatically migrated. Product uploads use WebP quality 80, dimensions within 1600 × 2000, one Sharp processing thread and no Sharp cache.

## Render settings

Choose **New → Blueprint**, connect `Bilal175-gif/almost-formal`, branch `main`, and review the root `render.yaml`. Confirm it creates exactly one Free web service. Or manually create a Node Web Service:

```text
Branch: main
Root directory: leave blank (repository root)
Instance: Free
Build: npm ci --include=dev && npm run build:render
Start: npm run start:render
Health check: /api/health
Auto deploy: Off
```

Set private environment values:

```text
NODE_VERSION=22
NODE_ENV=production
DATABASE_URL=<Neon pooled PostgreSQL connection string>
APP_ORIGIN=https://<your-frontend>.workers.dev
CLOUDINARY_CLOUD_NAME=<cloud name>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>
ADMIN_EMAIL=<your email>
ADMIN_PASSWORD=<unique password, at least 12 characters>
STORAGE_MODE=cloudinary
TRUST_PROXY_HOPS=1
PUBLIC_CACHE_TTL_SECONDS=30
```

Use the exact `APP_ORIGIN`, with no trailing slash. Optional `ALLOWED_ORIGINS` accepts additional exact origins separated by commas. Render supplies `PORT`; startup binds `0.0.0.0`. Use `start:render`, not root `npm start` (the latter starts the local combined frontend/backend runner).

The build generates the PostgreSQL client and compiles only the API. Startup deploys migrations, inserts missing settings/categories, creates the first admin only if none exists, and starts the server. Existing settings/stock/passwords are not reset. After successful initial startup, remove `ADMIN_PASSWORD` from Render. Later password resets use `admin:create`.

Catalogue/settings reads have a bounded 30-second process cache (100 entries/4 MB). Writes invalidate it. Admin, orders, tracking, health and checkout are excluded. Checkout always checks current database stock and prices. Atomic PostgreSQL status transitions prevent duplicate stock restoration during concurrent cancellation. Browser/CDN API caching stays `private, no-store`.

Render/Neon are allowed to sleep. `/api/health` does not query or wake Neon. Do not add recurring uptime pings: they consume quotas. The first request after inactivity may be slow.

## Optional email

Render Free blocks standard SMTP ports. SMTP is disabled on Render; orders/contact messages still save. For HTTPS delivery, set:

```text
RESEND_API_KEY=<private key>
EMAIL_FROM=Almost Formal <orders@your-verified-domain>
STORE_NOTIFICATION_EMAIL=<your inbox>
```

Use a verified sender/domain and observe Resend's free quota. The default test sender has recipient restrictions. Test customer/admin delivery before relying on notifications. Email failures are logged; the app does not purchase credits or automatically retry failures. Local SMTP remains available outside Render. Email can stay disabled until sender setup is ready.

## Connect Cloudflare

After `https://<backend>.onrender.com/api/health` returns `service: almost-formal-api`, set frontend **build** variables and rebuild:

```text
CF_WORKERS=1
API_URL=https://<backend>.onrender.com
NEXT_PUBLIC_API_URL=https://<backend>.onrender.com
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=<cloud name>
```

Browser requests must stay on same-origin `/api` through the frontend Worker so admin cookies/CSRF work. Test admin login, upload/create a product, place/cancel a COD order, and verify one inventory restoration. Redeploy the API and confirm data/images persist. Back up PostgreSQL regularly (e.g. `pg_dump` via Neon's direct connection URL), keep a copy outside the provider and test restoration. Free provider restore history is limited.

## Development and verification

Local SQLite remains supported: `npm run db:generate`, `npm test`, `npm run typecheck`, `npm run lint`. Render uses separate PostgreSQL migrations in `apps/api/prisma-postgres/migrations`. The ignored PostgreSQL schema is generated from the canonical SQLite model file by `scripts/postgres-schema.mjs`. Future model changes require migrations for both providers; generation alone does not migrate data.

Set `TEST_DATABASE_URL` to a **disposable PostgreSQL database**, then run `npm run test:postgres`. It creates a randomly named schema, applies migrations, tests checkout/admin/stock behavior, drops only that test schema and restores the local SQLite client. Never use the live store for tests. GitHub Actions also runs PostgreSQL integration checks.

Official references: [Render Free](https://render.com/docs/free), [Render Blueprints](https://render.com/docs/blueprint-spec), [Neon plans](https://neon.com/docs/introduction/plans), [Resend API](https://resend.com/docs/api-reference/emails/send-email).

## Verified in this checkout

On 12 November 2026: 14 SQLite/API/deployment tests and 11 PostgreSQL integration tests passed against an isolated local PostgreSQL 18 server. The compiled Render startup test passed first-admin creation, secure login, zero demo products and restart without the initial password variable. API/frontend production builds, typecheck and lint passed (two pre-existing warnings in the untracked experimental `api-worker` folder). Real Neon connectivity, Cloudinary upload and email delivery still require account configuration and a staging check. No production account or service was changed by these tests.
